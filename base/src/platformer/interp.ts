/**
 * Snapshot buffer + clock sync. Rendering runs a little behind the server
 * and interpolates between the two snapshots that bracket the render time,
 * using the server's sim clock rather than arrival times so network jitter
 * doesn't cause stutter. Pure logic: no DOM, unit-tested.
 *
 * How far behind follows the line: INTERP_DELAY_MS on a steady one, more when
 * snapshots arrive unevenly (they are then held a little longer, so there is
 * always a pair to draw between). The delay is slewed, never jumped. When the
 * buffer still runs dry, motion carries on along its last heading for a
 * moment (MAX_EXTRAP_MS) instead of freezing.
 */
/** The parts of a snapshot and of a player this module reads. */
type Timed = { simTimeMs: number };
type Body = { x: number; y: number; life: string };

/** The delay on a steady line, and the least it ever is. */
export const INTERP_DELAY_MS = 75;
/** The most it grows to on a rough line. */
const MAX_DELAY_MS = 250;
/** With no newer snapshot, things carry on as they were going for at most this long. */
export const MAX_EXTRAP_MS = 100;
/** The delay closes on what the line needs at this rate: 50 ms per second. */
const DELAY_SLEW = 0.05;
const MAX_SNAPS = 24;

export type Bracket<S> = { a: S; b: S; alpha: number };

export class SnapshotBuffer<S extends Timed> {
  private snaps: S[] = [];
  /** Estimated localMs - simMs. Tracks the fastest-arriving packets. */
  private offset: number | null = null;
  private lastArrival = 0;
  /** How unevenly snapshots arrive, in ms (smoothed). */
  private jitter = 0;
  /** Snapshot spacing in sim ms (smoothed). */
  private interval = 33;
  private delay = INTERP_DELAY_MS;
  private delayAt = 0;
  private dry = false;
  /** Times the buffer ran dry and motion had to be carried on by guesswork. */
  underruns = 0;

  /** How far behind the server the world is being drawn right now, in ms. */
  get delayMs(): number {
    return this.delay;
  }

  /** How unevenly snapshots arrive, in ms. */
  get jitterMs(): number {
    return this.jitter;
  }

  get latest(): S | null {
    return this.snaps.length ? this.snaps[this.snaps.length - 1] : null;
  }

  clear(): void {
    this.snaps = [];
    this.offset = null;
    this.jitter = 0;
    this.delay = INTERP_DELAY_MS;
    this.dry = false;
  }

  push(s: S, localNow: number): void {
    const last = this.latest;
    if (last && s.simTimeMs <= last.simTimeMs) {
      if (s.simTimeMs < last.simTimeMs - 1000) this.clear(); // server restarted
      else return; // duplicate / out of order
    }
    if (last) {
      const simGap = s.simTimeMs - last.simTimeMs;
      // how far this one's arrival was from the even spacing it was sent with
      this.jitter += (Math.abs(localNow - this.lastArrival - simGap) - this.jitter) * 0.1;
      if (simGap < 500) this.interval += (simGap - this.interval) * 0.1;
    }
    this.lastArrival = localNow;
    const sample = localNow - s.simTimeMs;
    if (this.offset === null || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.02; // drift slowly toward later arrivals
    this.snaps.push(s);
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
  }

  /**
   * The sim time of a snapshot that would be arriving right at `localNow`: the server's clock as
   * seen from here, one trip old. null before the first snapshot.
   */
  simTime(localNow: number): number | null {
    return this.offset === null ? null : localNow - this.offset;
  }

  /** Server sim time we should be drawing at `localNow`. */
  renderTime(localNow: number): number {
    if (this.offset === null) return 0;
    // a snapshot and a half in hand, and room for the unevenness of the line
    const want = Math.min(MAX_DELAY_MS, Math.max(INTERP_DELAY_MS, 1.5 * this.interval + 3 * this.jitter));
    const step = Math.min(100, Math.max(0, localNow - this.delayAt)) * DELAY_SLEW;
    this.delayAt = localNow;
    this.delay += Math.min(step, Math.max(-step, want - this.delay));
    return localNow - this.offset - this.delay;
  }

  bracket(localNow: number): Bracket<S> | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    const t = this.renderTime(localNow);
    if (n === 1 || t <= this.snaps[0].simTimeMs) {
      const s = this.snaps[0];
      return { a: s, b: s, alpha: 1 };
    }
    for (let i = n - 2; i >= 0; i--) {
      const a = this.snaps[i];
      const b = this.snaps[i + 1];
      if (t >= a.simTimeMs) {
        const span = Math.max(1, b.simTimeMs - a.simTimeMs);
        const over = t - b.simTimeMs;
        if (over <= 0) {
          this.dry = false;
          return { a, b, alpha: (t - a.simTimeMs) / span };
        }
        // nothing newer has come: carry on along the last heading for a moment (alpha > 1)
        if (!this.dry) this.underruns++;
        this.dry = true;
        return { a, b, alpha: 1 + Math.min(over, MAX_EXTRAP_MS) / span };
      }
    }
    const s = this.snaps[n - 1];
    return { a: s, b: s, alpha: 1 };
  }
}

/** Interpolated copy of player `b` (from the newer snapshot) toward its state in `a`. */
export function lerpPlayer<P extends Body>(a: P | undefined, b: P, alpha: number): P {
  if (!a || a.life !== 'alive' || b.life !== 'alive') return b;
  // (alpha may pass 1 for a moment when the buffer runs dry: the body carries on as it was going)
  // big jumps are teleports (respawns): don't smear them across the screen
  if (Math.abs(a.x - b.x) > 220 || Math.abs(a.y - b.y) > 220) return b;
  return { ...b, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

/**
 * Interpolated screen scroll. It only ever moves right within a round, so a
 * decrease (new round) or a big jump is a cut, not a pan.
 */
export function lerpScroll(a: number, b: number, alpha: number): number {
  if (b < a || b - a > 220) return b;
  return a + (b - a) * alpha;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
