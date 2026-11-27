/**
 * A pretend bad line, for tuning the games against a far-away server while sitting next to it.
 *
 * `?lag=125&jitter=20&stall=300` holds every message, in both directions, for 125 ms plus up to
 * 20 ms, and every few seconds holds everything for 300 ms and then lets it all go at once, which
 * is what TCP does when it loses a packet. Order is always kept, as it is on a real socket.
 */

export type LagSettings = { lag: number; jitter: number; stall: number };

/** The settings in the page's address, or null when none are asked for. */
export function lagSettings(search: string): LagSettings | null {
  const q = new URLSearchParams(search);
  const num = (key: string): number => {
    const n = Number(q.get(key));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : 0;
  };
  const s = { lag: num('lag'), jitter: num('jitter'), stall: num('stall') };
  return s.lag || s.jitter || s.stall ? s : null;
}

export type LagLineOptions<T> = {
  lag: number;
  jitter: number;
  deliver: (item: T) => void;
  now?: () => number;
  random?: () => number;
};

/** One direction of the line: things pushed in come out later, in the order they went in. */
export class LagLine<T> {
  private queue: { at: number; item: T }[] = [];
  private lastAt = 0;
  private stalledUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly opts: LagLineOptions<T>) {
    this.now = opts.now ?? (() => performance.now());
    this.random = opts.random ?? Math.random;
  }

  push(item: T): void {
    const at = Math.max(this.lastAt, this.now() + this.opts.lag + this.random() * this.opts.jitter);
    this.lastAt = at;
    this.queue.push({ at, item });
    this.arm();
  }

  /** Nothing comes out for `ms`; whatever fell due in the meantime then comes out together. */
  stall(ms: number): void {
    this.stalledUntil = Math.max(this.stalledUntil, this.now() + ms);
    this.arm();
  }

  /** Drop what is still on the line (the socket closed under it). */
  clear(): void {
    this.queue = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const head = this.queue[0];
    if (!head) return;
    const wait = Math.max(head.at, this.stalledUntil) - this.now();
    this.timer = setTimeout(() => this.flush(), Math.max(0, wait));
  }

  private flush(): void {
    this.timer = null;
    const now = this.now();
    if (now >= this.stalledUntil) {
      while (this.queue.length && this.queue[0].at <= now) this.opts.deliver(this.queue.shift()!.item);
    }
    this.arm();
  }
}
