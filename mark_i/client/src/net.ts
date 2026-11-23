import type { ServerMessage } from '../../shared/src/protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type Snapshot = Extract<ServerMessage, { type: 'snapshot' }>;

const DEFAULT_PORT = 8080;

export function defaultWsUrl(): string {
  const host = window.location.hostname || 'localhost';
  const port = DEFAULT_PORT;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${host}:${port}`;
}

export type GameClientOptions = {
  name: string;
  url?: string;
  onWelcome?: (selfId: string, capacity: number) => void;
  onSnapshot?: (snap: Snapshot) => void;
  onStatus?: (status: ConnectionStatus) => void;
};

/**
 * Thin WebSocket wrapper. Sends the latest player input only; drops in flights.
 * Auto-reconnects with backoff and re-joins with the same name.
 */
export class GameClient {
  private ws: WebSocket | null = null;
  private name: string;
  private url: string;
  private selfId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private inputQueue: { left: boolean; right: boolean; jump: boolean } | null = null;

  constructor(private opts: GameClientOptions) {
    this.name = opts.name;
    this.url = opts.url ?? defaultWsUrl();
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get self(): string | null {
    return this.selfId;
  }

  connect(): void {
    if (this.disposed) return;
    this.emitStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emitStatus('connected');
      this.send({ type: 'join', name: this.name });
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        this.handleMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    this.ws.onclose = () => {
      this.selfId = null;
      this.emitStatus('disconnected');
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
    };
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  sendInput(input: { left: boolean; right: boolean; jump: boolean }): void {
    this.inputQueue = input;
    this.flush();
  }

  /** Ask the server to force-restart the current level. */
  sendRestart(): void {
    this.send({ type: 'restart' });
  }

  /** Fire the pistol once (server enforces the cooldown). */
  sendShoot(): void {
    this.send({ type: 'shoot' });
  }

  setName(name: string): void {
    this.name = name;
  }

  private send(msg: unknown): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  private flush(): void {
    if (this.inputQueue && this.connected) {
      this.send({ type: 'input', ...this.inputQueue });
      this.inputQueue = null;
    }
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'welcome') {
      this.selfId = msg.selfId;
      this.opts.onWelcome?.(msg.selfId, msg.capacity);
    } else if (msg.type === 'snapshot') {
      this.opts.onSnapshot?.(msg);
    }
  }

  private emitStatus(status: ConnectionStatus): void {
    this.opts.onStatus?.(status);
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(4000, 400 * Math.pow(2, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
