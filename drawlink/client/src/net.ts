import type { ClientMessage, ServerMessage } from '../../shared/src/protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'full' | 'booted';

type LocationLike = Pick<Location, 'protocol' | 'hostname' | 'host' | 'port' | 'search' | 'pathname'>;

/**
 * Where the game server lives:
 * - `?ws=ws://host:port` overrides everything
 * - the Vite dev server (port 5176) talks to the game server on :8093
 * - otherwise the page was served by the game server itself → same origin, and the same
 *   directory, so the game also works behind a proxy that mounts it under a path
 */
export function defaultWsUrl(loc: LocationLike): string {
  const override = new URLSearchParams(loc.search).get('ws');
  if (override) return override;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  if (loc.port === '5176') return `${proto}://${loc.hostname}:8093`;
  const dir = loc.pathname.replace(/[^/]*$/, '');
  return `${proto}://${loc.host || 'localhost:8093'}${dir === '/' ? '' : dir}`;
}

export type GameClientOptions = {
  name: string;
  /** Seat token from an earlier welcome, if any. */
  token: () => string | undefined;
  url?: string;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
};

/** WebSocket wrapper: auto-reconnects with backoff and re-joins with the seat token. */
export class GameClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly opts: GameClientOptions) {
    this.url = opts.url ?? defaultWsUrl(window.location);
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.disposed) return;
    this.opts.onStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.opts.onStatus('connected');
      this.send({ type: 'join', name: this.opts.name, token: this.opts.token() });
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'full' || msg.type === 'booted') {
        this.disposed = true;
        this.opts.onStatus(msg.type);
        ws.close();
        return;
      }
      this.opts.onMessage(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.disposed) return;
      this.opts.onStatus('disconnected');
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

  send(msg: ClientMessage): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(4000, 300 * Math.pow(2, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
