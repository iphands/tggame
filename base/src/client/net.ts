/** The browser's connection to a game server: where it lives, and a socket that keeps itself alive. */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'full' | 'booted';

type LocationLike = Pick<Location, 'protocol' | 'hostname' | 'host' | 'port' | 'search' | 'pathname'>;

/**
 * Where the game server lives:
 * - `?ws=ws://host:port` overrides everything
 * - the Vite dev server (port `devPort`) talks to the game server on `serverPort`
 * - otherwise the page was served by the game server itself → same origin, and the same
 *   directory, so the game also works behind a proxy that mounts it under a path
 */
export function wsUrl(loc: LocationLike, devPort: string, serverPort: number): string {
  const override = new URLSearchParams(loc.search).get('ws');
  if (override) return override;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  if (loc.port === devPort) return `${proto}://${loc.hostname}:${serverPort}`;
  const dir = loc.pathname.replace(/[^/]*$/, '');
  return `${proto}://${loc.host || `localhost:${serverPort}`}${dir === '/' ? '' : dir}`;
}

export type SocketClientOptions<S> = {
  url: string;
  name: string;
  /** Seat token from an earlier welcome, for games that hand them out. */
  token?: () => string | undefined;
  onMessage: (msg: S) => void;
  onStatus?: (status: ConnectionStatus) => void;
};

/**
 * WebSocket wrapper: auto-reconnects with backoff and re-joins under the same name (and seat
 * token, if any). A `full` or `booted` reply, or the seat being taken over by another tab, ends it.
 */
export class SocketClient<C extends { type: string }, S extends { type: string }> {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** The client build the server was handing out when this page first connected. */
  private build: string | null = null;

  constructor(private readonly opts: SocketClientOptions<S>) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.disposed) return;
    this.opts.onStatus?.('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
      void this.checkBuild();
      this.opened();
      this.opts.onStatus?.('connected');
      // an absent token is left out of the JSON, so games without tokens see a plain join
      this.send({ type: 'join', name: this.opts.name, token: this.opts.token?.() } as unknown as C);
    };
    ws.onmessage = (ev) => {
      let msg: S;
      try {
        msg = JSON.parse(String(ev.data)) as S;
      } catch {
        return;
      }
      if (msg.type === 'full' || msg.type === 'booted') {
        this.disposed = true;
        this.opts.onStatus?.(msg.type);
        ws.close();
        return;
      }
      this.opts.onMessage(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.disposed) return;
      this.opts.onStatus?.('disconnected');
      // 4000: this seat was opened in another tab, which now owns it
      if (ev.code === 4000) this.disposed = true;
      else this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    };
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: C): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  /**
   * A page left open across a server update is running the old client against the new server,
   * and the two may no longer agree on the rules. Each time the socket opens, ask the server
   * which client it is handing out; if that has changed since this page first asked, reload.
   */
  private async checkBuild(): Promise<void> {
    try {
      const res = await fetch('health', { cache: 'no-store' });
      const build: unknown = ((await res.json()) as { build?: unknown }).build;
      if (typeof build !== 'string') return;
      if (this.build === null) this.build = build;
      else if (build !== this.build) location.reload();
    } catch {
      /* the dev server, or no network: nothing to compare */
    }
  }

  /** Called each time the socket opens, before the join is sent. */
  protected opened(): void {}

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(4000, 300 * Math.pow(2, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
