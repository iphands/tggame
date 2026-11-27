import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../shared/src/constants';
import { moveHole } from '../shared/src/sim';
import { noteAim, predictHole, type SentAim } from '../client/src/predict';

const W = 2000;
const H = 2000;

/**
 * A server a one-way trip of `lag` ms away: it moves the hole every tick toward the newest aim
 * that has reached it, and its snapshots take as long to come back.
 */
function line(lag: number, script: (t: number) => { x: number; y: number }, endMs: number) {
  const hole = { x: 1000, y: 1000, ax: 1000, ay: 1000 };
  const aims: SentAim[] = [];
  const snaps: { at: number; x: number; y: number }[] = []; // `at` = when it reaches the client
  let sentAt = -Infinity;
  for (let t = 0; t <= endMs; t += TICK_MS) {
    if (t - sentAt >= 33) {
      noteAim(aims, { at: t, ...script(t) });
      sentAt = t;
    }
    for (const a of aims) if (a.at + lag <= t) (hole.ax = a.x), (hole.ay = a.y);
    moveHole(hole, W, H, TICK_MS / 1000);
    snaps.push({ at: t + lag, x: hole.x, y: hole.y });
  }
  return { aims, snaps, hole };
}

describe('carrying our hole forward from a snapshot', () => {
  it('with nothing sent, the hole is where the snapshot has it', () => {
    expect(predictHole({ x: 5, y: 6 }, 100, 250, [], 200, W, H, 1)).toMatchObject({ x: 5, y: 6 });
  });

  it('lands where the server ends up, a quarter of a second of line away', () => {
    const lag = 125;
    // a finger sweeping in a circle: the aim never rests
    const script = (t: number) => ({ x: 1000 + 600 * Math.cos(t / 400), y: 1000 + 600 * Math.sin(t / 400) });
    const now = 3000;
    const { aims, snaps } = line(lag, script, now + lag + 100);
    const seen = snaps.filter((s) => s.at <= now).pop()!;
    const guess = predictHole(seen, seen.at, 2 * lag, aims.filter((a) => a.at <= now), now, W, H, 1);
    // the truth: the server's hole once everything sent by `now` has arrived
    const truth = snaps.find((s) => s.at - lag >= now + lag)!;
    expect(Math.hypot(guess.x - truth.x, guess.y - truth.y)).toBeLessThan(12);
    // the stale snapshot itself is far behind that
    expect(Math.hypot(seen.x - truth.x, seen.y - truth.y)).toBeGreaterThan(60);
  });

  it('does not run away on a hopeless line', () => {
    const aims: SentAim[] = [{ at: 0, x: 2000, y: 1000 }];
    const p = predictHole({ x: 0, y: 1000 }, 100_000, 90_000, aims, 100_000, W, H, 1);
    expect(p.x).toBeLessThan(480 * 0.6 + 1);
  });

  it('keeps the aim still in force when forgetting old ones', () => {
    const aims: SentAim[] = [];
    noteAim(aims, { at: 0, x: 1, y: 1 });
    noteAim(aims, { at: 5000, x: 2, y: 2 });
    noteAim(aims, { at: 5033, x: 3, y: 3 });
    expect(aims.map((a) => a.x)).toEqual([1, 2, 3].slice(-aims.length));
    expect(aims.length).toBeLessThanOrEqual(3);
    noteAim(aims, { at: 9000, x: 4, y: 4 });
    expect(aims[0].x).toBe(3);
  });
});
