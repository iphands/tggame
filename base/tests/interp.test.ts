import { describe, expect, it } from 'vitest';
import { INTERP_DELAY_MS, MAX_EXTRAP_MS, SnapshotBuffer, lerp } from '../src/platformer/interp.js';

type Snap = { simTimeMs: number; x: number };

/** Feed snapshots every 33 ms of sim time, each arriving `late(i)` ms after an even line would bring it. */
function feed(buf: SnapshotBuffer<Snap>, count: number, late: (i: number) => number = () => 0, from = 0): number {
  let local = 0;
  for (let i = from; i < from + count; i++) {
    local = 1000 + i * 33 + late(i);
    buf.renderTime(local); // a frame is drawn about as often as a snapshot comes
    buf.push({ simTimeMs: i * 33, x: i * 33 }, local);
  }
  return local;
}

describe('SnapshotBuffer', () => {
  it('on a steady line draws INTERP_DELAY_MS behind, exactly as it always did', () => {
    const buf = new SnapshotBuffer<Snap>();
    const local = feed(buf, 200);
    expect(buf.delayMs).toBe(INTERP_DELAY_MS);
    expect(buf.renderTime(local)).toBeCloseTo(local - 1000 - INTERP_DELAY_MS);
    expect(buf.underruns).toBe(0);
  });

  it('holds snapshots longer on an uneven line, and comes back when it steadies', () => {
    const buf = new SnapshotBuffer<Snap>();
    feed(buf, 300, (i) => (i % 2 ? 40 : 0));
    expect(buf.jitterMs).toBeGreaterThan(30);
    expect(buf.delayMs).toBeGreaterThan(INTERP_DELAY_MS + 40);
    expect(buf.delayMs).toBeLessThanOrEqual(250);
    feed(buf, 400, () => 0, 300);
    expect(buf.delayMs).toBe(INTERP_DELAY_MS);
  });

  it('changes the delay slowly, never in a jump', () => {
    const buf = new SnapshotBuffer<Snap>();
    feed(buf, 100);
    const before = buf.delayMs;
    feed(buf, 4, () => 60, 100);
    expect(buf.delayMs - before).toBeLessThan(10);
  });

  it('when it runs dry, carries on along the last heading for a moment, then holds', () => {
    const buf = new SnapshotBuffer<Snap>();
    const local = feed(buf, 60);
    const newest = 59 * 33;
    // 50 ms past the newest snapshot: still moving
    const soon = buf.bracket(local + INTERP_DELAY_MS + 50)!;
    expect(soon.alpha).toBeGreaterThan(1);
    expect(lerp(soon.a.x, soon.b.x, soon.alpha)).toBeCloseTo(newest + 50, 0);
    // a second past it: no further than the cap
    const late = buf.bracket(local + INTERP_DELAY_MS + 1000)!;
    expect(lerp(late.a.x, late.b.x, late.alpha)).toBeCloseTo(newest + MAX_EXTRAP_MS, 0);
    expect(buf.underruns).toBe(1);
  });
});
