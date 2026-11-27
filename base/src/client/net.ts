/** The browser's connection to a game server: where it lives, and a socket that keeps itself alive. */

import { clock } from './clock.js';
import { LagLine, lagSettings, type LagSettings } from './lag.js';
import { netMeterEnabled, reportRtt, showLineBadge, startNetMeter, type NetStats } from './netMeter.js';

/** Pings sent quickly when the socket opens (or the tab comes back), to settle the clock at once. */
const PING_BURST = 5;
const PING_BURST_MS = 150;
const PING_EVERY_MS = 2000;
/** With `?stall=`, how often the pretend line seizes up. */
const STALL_EVERY_MS = 5000;

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
  /** The name a reconnect joins under. */
  private name: string;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pingsLeft = 0;
  /** The pretend bad line (`?lag=`), one queue per direction; null on an honest connection. */
  private readonly lag: LagSettings | null;
  private readonly inLine: LagLine<{ ws: WebSocket; data: string }> | null = null;
  private readonly outLine: LagLine<{ ws: WebSocket; data: string }> | null = null;
  private counts = { bytesIn: 0, bytesOut: 0, msgsIn: 0, msgsOut: 0, since: 0 };

  constructor(private readonly opts: SocketClientOptions<S>) {
    this.name = opts.name;
    const search = typeof location === 'undefined' ? '' : location.search;
    this.lag = lagSettings(search);
    if (this.lag) {
      const { lag, jitter, stall } = this.lag;
      this.inLine = new LagLine({ lag, jitter, deliver: (m) => this.receive(m.ws, m.data) });
      this.outLine = new LagLine({
        lag,
        jitter,
        deliver: (m) => {
          if (m.ws === this.ws && m.ws.readyState === WebSocket.OPEN) m.ws.send(m.data);
        },
      });
      if (stall) {
        setInterval(() => {
          this.inLine?.stall(stall);
          this.outLine?.stall(stall);
        }, STALL_EVERY_MS);
      }
    }
    if (this.lag || netMeterEnabled(search)) {
      const l = this.lag;
      startNetMeter(() => this.stats(), l ? `pretend line: ${l.lag}±${l.jitter} ms${l.stall ? `, stalls ${l.stall}` : ''}` : '');
    }
    if (typeof document !== 'undefined') {
      // a hidden tab's timers crawl and its clock estimate goes stale: start over when it returns
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !this.connected) return;
        clock.reset();
        this.startPings();
      });
    }
  }

  /** Round trip to the server in ms, smoothed; 0 until the first pong. */
  get rtt(): number {
    return clock.rtt;
  }

  /** Traffic since the last call, per second, with the clock's view of the line. */
  private stats(): NetStats {
    const now = performance.now();
    const secs = Math.max(0.001, (now - this.counts.since) / 1000);
    const c = this.counts;
    const out = {
      rtt: clock.rtt,
      jitter: clock.jitter,
      bytesIn: c.bytesIn / secs,
      bytesOut: c.bytesOut / secs,
      msgsIn: Math.round(c.msgsIn / secs),
      msgsOut: Math.round(c.msgsOut / secs),
    };
    this.counts = { bytesIn: 0, bytesOut: 0, msgsIn: 0, msgsOut: 0, since: now };
    return out;
  }

  /** The player changed their name: later reconnects join under the new one. */
  setName(name: string): void {
    this.name = name;
  }

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
      this.send({ type: 'join', name: this.name, token: this.opts.token?.() } as unknown as C);
      clock.reset();
      this.startPings();
    };
    ws.onmessage = (ev) => {
      const data = String(ev.data);
      if (this.inLine) this.inLine.push({ ws, data });
      else this.receive(ws, data);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPings();
      this.inLine?.clear();
      this.outLine?.clear();
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
    this.stopPings();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: C): void {
    if (this.connected) this.sendRaw(JSON.stringify(msg));
  }

  private sendRaw(data: string): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    this.counts.bytesOut += data.length;
    this.counts.msgsOut++;
    if (this.outLine) this.outLine.push({ ws, data });
    else ws.send(data);
  }

  private receive(ws: WebSocket, data: string): void {
    if (this.ws !== ws) return; // a message from a socket we have already let go of
    this.counts.bytesIn += data.length;
    this.counts.msgsIn++;
    let msg: S;
    try {
      msg = JSON.parse(data) as S;
    } catch {
      return;
    }
    if (msg.type === 'pong') {
      this.pong(msg as unknown as { t?: unknown; now?: unknown });
      return;
    }
    if (msg.type === 'full' || msg.type === 'booted') {
      this.disposed = true;
      this.opts.onStatus?.(msg.type);
      ws.close();
      return;
    }
    this.opts.onMessage(msg);
  }

  /**
   * Ping/pong lives below the games: the shared server answers a `ping` itself (`server/http.ts`)
   * and no game ever sees a `pong`. Each pair gives the round trip and the server's clock.
   */
  private startPings(): void {
    this.stopPings();
    this.pingsLeft = PING_BURST;
    const beat = (): void => {
      this.sendRaw(JSON.stringify({ type: 'ping', t: performance.now(), rtt: Math.round(clock.rtt) }));
      if (this.pingsLeft > 0) this.pingsLeft--;
      this.pingTimer = setTimeout(beat, this.pingsLeft > 0 ? PING_BURST_MS : PING_EVERY_MS);
    };
    beat();
  }

  private stopPings(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.pingTimer = null;
  }

  private pong(msg: { t?: unknown; now?: unknown }): void {
    if (typeof msg.t !== 'number' || typeof msg.now !== 'number') return;
    const rtt = performance.now() - msg.t;
    if (rtt < 0 || rtt > 10_000) return;
    const now = Date.now();
    clock.add({ rtt, offset: msg.now + rtt / 2 - now }, now);
    reportRtt(rtt);
    showLineBadge(clock.rtt);
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
