import type { ClientMessage, ServerMessage, SnapshotMessage } from '../../shared/src/protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'full';

type LocationLike = Pick<Location, 'protocol' | 'hostname' | 'host' | 'port' | 'search' | 'pathname'>;

/**
 * Where the game server lives:
 * - `?ws=ws://host:port` overrides everything
 * - the Vite dev server (port 5173) talks to the game server on :8090
 * - otherwise the page was served by the game server itself → same origin, and the same
 *   directory, so the game also works behind a proxy that mounts it under a path
 */
export function defaultWsUrl(loc: LocationLike): string {
  const override = new URLSearchParams(loc.search).get('ws');
  if (override) return override;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  if (loc.port === '5173') return `${proto}://${loc.hostname}:8090`;
  const dir = loc.pathname.replace(/[^/]*$/, '');
  return `${proto}://${loc.host || 'localhost:8090'}${dir === '/' ? '' : dir}`;
}

export type GameClientOptions = {
  name: string;
  url?: string;
  onWelcome?: (selfId: string) => void;
  onSnapshot?: (snap: SnapshotMessage) => void;
  onStatus?: (status: ConnectionStatus) => void;
};

/** WebSocket wrapper: auto-reconnects with backoff and re-joins under the same name. */
export class GameClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastInput = '';
  private lastInputAt = 0;

  constructor(private readonly opts: GameClientOptions) {
    this.url = opts.url ?? defaultWsUrl(window.location);
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.disposed) return;
    this.opts.onStatus?.('connecting');
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
      this.lastInput = '';
      this.opts.onStatus?.('connected');
      this.send({ type: 'join', name: this.opts.name });
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'snapshot') this.opts.onSnapshot?.(msg);
      else if (msg.type === 'welcome') this.opts.onWelcome?.(msg.selfId);
      else if (msg.type === 'full') {
        this.opts.onStatus?.('full');
        this.disposed = true;
        ws.close();
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.disposed) return;
      this.opts.onStatus?.('disconnected');
      this.scheduleReconnect();
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

  /**
   * Send held-button state when it changes, plus a heartbeat every 400 ms so
   * a held key survives server-side resets (new round) and dropped messages.
   */
  sendInput(input: { left: boolean; right: boolean; jump: boolean }): void {
    const key = `${+input.left}${+input.right}${+input.jump}`;
    const now = performance.now();
    if (key === this.lastInput && now - this.lastInputAt < 400) return;
    this.lastInput = key;
    this.lastInputAt = now;
    this.send({ type: 'input', ...input });
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(4000, 300 * Math.pow(2, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
