import { describe, expect, it } from 'vitest';
import { CLEARED_MS, COUNTDOWN_MS, TICK_MS } from '../shared/src/constants';
import type { PlayerStats } from '../shared/src/types';
import { GONE } from '../server/src/world';
import { run, runUntil, started } from './helpers';

type G = ReturnType<typeof started>['g'];

/** Credit `id` with `n` bites, as the world does when their hole swallows something. */
function ate(g: G, id: string, n: number): void {
  (g as unknown as { stats: Map<string, PlayerStats> }).stats.get(id)!.eaten += n;
}

function clearTable(g: G): void {
  const w = g.world!;
  for (const f of w.foods) f.state = GONE;
  w.left = 0;
  run(g, TICK_MS);
}

describe('who ate the most on each course', () => {
  it('is shown when a course is cleared, hungriest first, counting that course only', () => {
    const { g, ids } = started(3);
    runUntil(g, () => g.phase === 'play', COUNTDOWN_MS + 1000);
    ate(g, ids[0], 4);
    ate(g, ids[1], 9);
    ate(g, ids[2], 1);
    clearTable(g);
    expect(g.viewFor(ids[0]).cleared!.bites).toEqual([
      { id: ids[1], eaten: 9 },
      { id: ids[0], eaten: 4 },
      { id: ids[2], eaten: 1 },
    ]);

    // the next course starts from nought for everybody
    runUntil(g, () => g.phase === 'play', CLEARED_MS + COUNTDOWN_MS + 1000);
    ate(g, ids[2], 7);
    clearTable(g);
    expect(g.viewFor(ids[0]).cleared!.bites[0]).toEqual({ id: ids[2], eaten: 7 });
    expect(g.viewFor(ids[0]).cleared!.bites.find((b) => b.id === ids[1])!.eaten).toBe(0);
  });

  it('is listed for every course in the finale, the unfinished one included', () => {
    const { g, ids } = started(2);
    runUntil(g, () => g.phase === 'play', COUNTDOWN_MS + 1000);
    ate(g, ids[0], 5);
    clearTable(g);
    runUntil(g, () => g.phase === 'play', CLEARED_MS + COUNTDOWN_MS + 1000);
    ate(g, ids[1], 3);
    runUntil(g, () => g.phase === 'finale', 10 * 60_000);
    const r = g.viewFor(ids[0]).result!;
    expect(r.won).toBe(false);
    expect(r.courses.map((c) => [c.no, c.cleared, c.bites[0].id])).toEqual([
      [1, true, ids[0]],
      [2, false, ids[1]],
    ]);
    // the run's totals still add up to the courses
    for (const id of ids) {
      const total = r.courses.reduce((n, c) => n + (c.bites.find((b) => b.id === id)?.eaten ?? 0), 0);
      expect(r.stats.find((s) => s.id === id)!.eaten).toBe(total);
    }
  });

  it('starts afresh with every run', () => {
    const { g, ids } = started(2);
    runUntil(g, () => g.phase === 'finale', 10 * 60_000);
    expect(g.viewFor(ids[0]).result!.courses).toHaveLength(1);
    g.again(ids[0]);
    g.start(ids[0]);
    runUntil(g, () => g.phase === 'finale', 10 * 60_000);
    expect(g.viewFor(ids[0]).result!.courses).toHaveLength(1);
  });
});
