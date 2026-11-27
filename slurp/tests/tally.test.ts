import { describe, expect, it } from 'vitest';
import { CLEARED_MS, COUNTDOWN_MS, COURSES, LAST_BITE_BONUS, TICK_MS, TIERS } from '../shared/src/constants';
import type { PlayerStats } from '../shared/src/types';
import { GONE } from '../server/src/world';
import { run, runUntil, started, table } from './helpers';

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

describe('last course only', () => {
  it('is the host\'s choice in the lobby and starts the run on the last table', () => {
    const { g, ids } = table(2);
    g.configure(ids[1], undefined, true);
    expect(g.settings.finale).toBe(false);
    g.configure(ids[0], undefined, true);
    expect(g.viewFor(ids[1]).settings.finale).toBe(true);
    g.start(ids[0]);
    expect(g.course).toBe(COURSES);
    expect(g.viewFor(ids[0]).course).toMatchObject({ no: COURSES, of: COURSES });
    expect(g.world!.foods.some((f) => f.tier === TIERS.length - 1)).toBe(true);
  });

  it('clearing that one table wins the run', () => {
    const { g, ids } = table(1);
    g.configure(ids[0], undefined, true);
    g.start(ids[0]);
    runUntil(g, () => g.phase === 'play', COUNTDOWN_MS + 1000);
    clearTable(g);
    expect(g.phase).toBe('finale');
    const r = g.viewFor(ids[0]).result!;
    expect(r).toMatchObject({ won: true, cleared: 1 });
    expect(r.courses.map((c) => c.no)).toEqual([COURSES]);
  });

  it('can be switched back off, and the pace is left alone', () => {
    const { g, ids } = table(1);
    g.configure(ids[0], 'spicy', true);
    g.configure(ids[0], undefined, false);
    expect(g.settings).toEqual({ difficulty: 'spicy', finale: false });
    g.start(ids[0]);
    expect(g.course).toBe(1);
  });
});

describe('the last piece on a table', () => {
  /** Leave one berry on the table and park `id`'s hole on it. */
  function lastBerryFor(g: G, id: string): void {
    const w = g.world!;
    const berry = w.foods.find((f) => f.tier === 0)!;
    for (const f of w.foods) if (f !== berry && f.tier < TIERS.length) f.state = GONE;
    w.left = 1;
    const hole = w.hole(id)!;
    hole.x = hole.ax = berry.x;
    hole.y = hole.ay = berry.y;
    runUntil(g, () => g.phase !== 'play', 2000);
  }

  it('earns whoever eats it bonus bites, on top of the piece itself', () => {
    const { g, ids } = started(3);
    runUntil(g, () => g.phase === 'play', COUNTDOWN_MS + 1000);
    ate(g, ids[0], 4);
    lastBerryFor(g, ids[2]);
    expect(g.phase).toBe('cleared');
    const c = g.viewFor(ids[0]).cleared!;
    expect(c.lastBy).toBe(ids[2]);
    expect(c.bites).toEqual([
      { id: ids[2], eaten: 1 + LAST_BITE_BONUS },
      { id: ids[0], eaten: 4 },
      { id: ids[1], eaten: 0 },
    ]);
  });

  it('is counted for the finale: finished tables, and the bonus in the totals', () => {
    const { g, ids } = table(2);
    g.configure(ids[0], undefined, true);
    g.start(ids[0]);
    runUntil(g, () => g.phase === 'play', COUNTDOWN_MS + 1000);
    lastBerryFor(g, ids[1]);
    const r = g.viewFor(ids[0]).result!;
    expect(r.won).toBe(true);
    expect(r.courses[0].lastBy).toBe(ids[1]);
    expect(r.stats.find((s) => s.id === ids[1])).toMatchObject({ eaten: 1 + LAST_BITE_BONUS, lasts: 1 });
    expect(r.stats.find((s) => s.id === ids[0])).toMatchObject({ eaten: 0, lasts: 0 });
  });

  it('is nobody\'s when the clock runs out', () => {
    const { g, ids } = started(2);
    runUntil(g, () => g.phase === 'finale', 10 * 60_000);
    const r = g.viewFor(ids[0]).result!;
    expect(r.courses[0].lastBy).toBe('');
    expect(r.stats.every((s) => s.lasts === 0)).toBe(true);
  });
});
