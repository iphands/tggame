/**
 * The server's clock and the round trip to it, estimated from ping/pong pairs on the game socket.
 *
 * One sample is `rtt` (how long the pair took) and `offset` (server clock minus ours, assuming the
 * two legs took equally long). A sample that sat in a queue has a long round trip and a wrong
 * offset, so the estimate comes from the quickest pair in a short window, and the clock the games
 * read slews toward it instead of jumping: a timer never runs backwards or skips.
 */

const WINDOW = 12;
/** A change this large is a different clock (a sleeping laptop, a new server), not drift. */
const RESET_MS = 500;
/** How fast the published offset closes on the estimate: 50 ms per second. */
const SLEW = 0.05;

export type ClockSample = { rtt: number; offset: number };

export class ClockSync {
  private samples: ClockSample[] = [];
  private target = 0;
  private current = 0;
  private slewedAt = 0;
  private smoothedRtt = 0;
  private smoothedJitter = 0;
  /** True once at least one pair has come back. */
  synced = false;

  /** Feed one ping/pong pair; `now` is the local clock the offset will later be read against. */
  add(sample: ClockSample, now: number): void {
    if (!(sample.rtt >= 0) || !Number.isFinite(sample.offset)) return;
    this.offset(now); // settle the slew up to this moment before the target moves
    this.samples.push(sample);
    if (this.samples.length > WINDOW) this.samples.shift();
    let best = this.samples[0];
    for (const s of this.samples) if (s.rtt < best.rtt) best = s;
    if (!this.synced || Math.abs(sample.offset - this.target) > RESET_MS) {
      // first word from the server, or the clocks moved apart: believe the newest pair alone
      this.samples = [sample];
      this.target = this.current = sample.offset;
      this.smoothedRtt = sample.rtt;
      this.smoothedJitter = 0;
      this.synced = true;
      return;
    }
    this.target = best.offset;
    this.smoothedJitter += (Math.abs(sample.rtt - this.smoothedRtt) - this.smoothedJitter) * 0.2;
    this.smoothedRtt += (sample.rtt - this.smoothedRtt) * 0.2;
  }

  /**
   * A rough first guess (the server's clock as read from its welcome, round trip unknown), used
   * only until a real pair comes back.
   */
  seed(serverNowMs: number, now: number): void {
    if (this.synced) return;
    this.target = this.current = serverNowMs - now;
    this.slewedAt = now;
  }

  /** Forget everything: the next pair is taken at its word (after a hidden tab, a reconnect). */
  reset(): void {
    this.samples = [];
    this.synced = false; // the offset itself stays as the best guess until the next pair
  }

  /** Server clock minus the local one, at local time `now`. */
  offset(now: number): number {
    const step = Math.max(0, now - this.slewedAt) * SLEW;
    this.slewedAt = now;
    const gap = this.target - this.current;
    this.current += Math.abs(gap) <= step ? gap : Math.sign(gap) * step;
    return this.current;
  }

  /** Round trip in ms, smoothed. */
  get rtt(): number {
    return this.smoothedRtt;
  }

  /** The quickest round trip in the window: the wire itself, without the queues. */
  get minRtt(): number {
    let min = Infinity;
    for (const s of this.samples) min = Math.min(min, s.rtt);
    return Number.isFinite(min) ? min : 0;
  }

  /** How much the round trip wanders, in ms. */
  get jitter(): number {
    return this.smoothedJitter;
  }
}

/** The page's one clock: every game socket feeds it, every timer reads it. */
export const clock = new ClockSync();

/** The server's idea of now (epoch ms). Before the first pong this is simply our own clock. */
export const serverNow = (): number => {
  const now = Date.now();
  return now + clock.offset(now);
};
