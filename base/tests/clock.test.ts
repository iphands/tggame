import { describe, expect, it } from 'vitest';
import { ClockSync } from '../src/client/clock.js';

describe('ClockSync', () => {
  it('takes the first pair at its word', () => {
    const c = new ClockSync();
    expect(c.synced).toBe(false);
    c.add({ rtt: 250, offset: 1000 }, 0);
    expect(c.synced).toBe(true);
    expect(c.offset(0)).toBe(1000);
    expect(c.rtt).toBe(250);
  });

  it('believes the quickest pair, not a queued one', () => {
    const c = new ClockSync();
    c.add({ rtt: 250, offset: 1000 }, 0);
    // a pair that sat behind a stall: long round trip, offset wrong by half the wait
    c.add({ rtt: 650, offset: 1200 }, 1000);
    expect(c.offset(60_000)).toBe(1000);
    // a quicker pair wins the window
    c.add({ rtt: 240, offset: 990 }, 61_000);
    expect(c.offset(120_000)).toBe(990);
    expect(c.minRtt).toBe(240);
  });

  it('slews toward a new estimate instead of jumping', () => {
    const c = new ClockSync();
    c.add({ rtt: 250, offset: 1000 }, 0);
    c.add({ rtt: 200, offset: 1040 }, 1000);
    expect(c.offset(1000)).toBe(1000);
    expect(c.offset(1200)).toBeCloseTo(1010); // 50 ms per second
    expect(c.offset(5000)).toBe(1040);
  });

  it('starts over when the clocks move apart, and after a reset', () => {
    const c = new ClockSync();
    c.add({ rtt: 250, offset: 1000 }, 0);
    c.add({ rtt: 300, offset: 9000 }, 1000);
    expect(c.offset(1000)).toBe(9000);
    c.reset();
    c.add({ rtt: 900, offset: 9100 }, 2000);
    expect(c.offset(2000)).toBe(9100);
  });

  it('tracks how much the round trip wanders', () => {
    const c = new ClockSync();
    for (let i = 0; i < 30; i++) c.add({ rtt: i % 2 ? 270 : 230, offset: 0 }, i * 100);
    expect(c.rtt).toBeGreaterThan(235);
    expect(c.rtt).toBeLessThan(265);
    expect(c.jitter).toBeGreaterThan(10);
  });

  it('ignores nonsense', () => {
    const c = new ClockSync();
    c.add({ rtt: -5, offset: 3 }, 0);
    c.add({ rtt: 5, offset: NaN }, 0);
    expect(c.synced).toBe(false);
  });
});
