/**
 * Snapshot buffer + clock sync. Rendering runs a little behind the server
 * (INTERP_DELAY_MS) and interpolates between the two snapshots that bracket
 * the render time, using the server's sim clock rather than arrival times so
 * network jitter doesn't cause stutter. Pure logic: no DOM, unit-tested.
 */
import type { SnapshotMessage } from '../../shared/src/protocol';
import type { PlayerState } from '../../shared/src/types';

export const INTERP_DELAY_MS = 75;
const MAX_SNAPS = 24;

export type Bracket = { a: SnapshotMessage; b: SnapshotMessage; alpha: number };

export class SnapshotBuffer {
  private snaps: SnapshotMessage[] = [];
  /** Estimated localMs - simMs. Tracks the fastest-arriving packets. */
  private offset: number | null = null;

  get latest(): SnapshotMessage | null {
    return this.snaps.length ? this.snaps[this.snaps.length - 1] : null;
  }

  clear(): void {
    this.snaps = [];
    this.offset = null;
  }

  push(s: SnapshotMessage, localNow: number): void {
    const last = this.latest;
    if (last && s.simTimeMs <= last.simTimeMs) {
      if (s.simTimeMs < last.simTimeMs - 1000) this.clear(); // server restarted
      else return; // duplicate / out of order
    }
    const sample = localNow - s.simTimeMs;
    if (this.offset === null || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.02; // drift slowly toward later arrivals
    this.snaps.push(s);
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
  }

  /** Server sim time we should be drawing at `localNow`. */
  renderTime(localNow: number): number {
    if (this.offset === null) return 0;
    return localNow - this.offset - INTERP_DELAY_MS;
  }

  bracket(localNow: number): Bracket | null {
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
        return { a, b, alpha: Math.min(1, (t - a.simTimeMs) / span) };
      }
    }
    const s = this.snaps[n - 1];
    return { a: s, b: s, alpha: 1 };
  }
}

/** Interpolated copy of player `b` (from the newer snapshot) toward its state in `a`. */
export function lerpPlayer(a: PlayerState | undefined, b: PlayerState, alpha: number): PlayerState {
  if (!a || a.life !== 'alive' || b.life !== 'alive') return b;
  // big jumps are teleports (respawns): don't smear them across the screen
  if (Math.abs(a.x - b.x) > 220 || Math.abs(a.y - b.y) > 220) return b;
  return { ...b, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
