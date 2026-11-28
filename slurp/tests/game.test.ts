import { describe, expect, it } from 'vitest';
import { CARRY_MAX_MS, CLEARED_MS, CLOCK_FACTOR, COUNTDOWN_MS, COURSES, MAX_PLAYERS, TICK_MS, TIERS, courseTimeMs, tableSize } from '../shared/src/constants';
import { GONE, ON } from '../server/src/world';
import { join, run, runUntil, started, table } from './helpers';

/** Eat everything on the table at once: the course is cleared on the next tick. */
function devour(g: ReturnType<typeof table>['g']): void {
  const w = g.world!;
  for (const f of w.foods) f.state = GONE;
  w.left = 0;
}

describe('lobby', () => {
  it('only the host starts, configures and adds bots', () => {
    const { g, ids } = table(2);
    g.start(ids[1]);
    g.configure(ids[1], 'spicy');
    g.addBot(ids[1]);
    expect(g.phase).toBe('lobby');
    expect(g.settings.difficulty).toBe('normal');
    expect(g.players.size).toBe(2);
    g.configure(ids[0], 'spicy');
    g.configure(ids[0], 'nonsense' as never);
    g.addBot(ids[0]);
    expect(g.settings.difficulty).toBe('spicy');
    expect(g.botCount()).toBe(1);
    g.start(ids[0]);
    expect(g.phase).toBe('countdown');
  });

  it('one player is enough', () => {
    const { g, ids } = table(1);
    g.start(ids[0]);
    expect(g.phase).toBe('countdown');
    expect(g.world!.holes.length).toBe(1);
  });

  it('seats at most sixteen; a human takes a bot seat', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < MAX_PLAYERS + 5; i++) g.addBot(ids[0]);
    expect(g.players.size).toBe(MAX_PLAYERS);
    expect(new Set([...g.players.values()].map((p) => p.color)).size).toBe(MAX_PLAYERS);
    expect(new Set([...g.players.values()].map((p) => p.name)).size).toBe(MAX_PLAYERS);
    const j = join(g, 'Late');
    expect(g.players.size).toBe(MAX_PLAYERS);
    expect(g.players.get(j.id)!.spectator).toBe(false);
  });
});

describe('a course', () => {
  it('the table matches the number of players', () => {
    for (const n of [1, 3, 8]) {
      const { g } = started(n);
      expect({ w: g.world!.w, h: g.world!.h }).toEqual(tableSize(n, 1));
      expect(g.world!.holes.length).toBe(n);
    }
  });

  it('nothing is eaten and no clock runs during the countdown', () => {
    const { g, ids } = table(1);
    g.start(ids[0]);
    const f = g.world!.foods[0];
    g.aim(ids[0], f.x, f.y);
    run(g, COUNTDOWN_MS - 100);
    expect(g.phase).toBe('countdown');
    expect(g.world!.left).toBe(g.world!.foods.filter((x) => x.tier < TIERS.length).length);
    expect(g.snapshot()!.left).toBe(courseTimeMs(1));
    expect(g.snapshot()!.cd).toBeGreaterThan(0);
    run(g, 200);
    expect(g.phase).toBe('play');
  });

  it('aim steers only your own hole, and only onto the table', () => {
    const { g, ids } = started(2);
    g.aim(ids[0], -999, 99999);
    g.aim('nobody', 1, 1);
    const [a, b] = g.world!.holes;
    expect([a.ax, a.ay]).toEqual([0, g.world!.h]);
    expect([b.ax, b.ay]).toEqual([b.x, b.y]);
  });

  it('the clock runs out: the run is over', () => {
    const { g } = started(2);
    run(g, courseTimeMs(1) + 100);
    expect(g.phase).toBe('finale');
    const r = g.viewFor('p1').result!;
    expect(r.won).toBe(false);
    expect(r.cleared).toBe(0);
    expect(r.failedOn).toBe(1);
    expect(r.leftOver).toBeGreaterThan(0);
    expect(r.stats.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it('difficulty scales the clock', () => {
    const { g, ids } = table(1);
    g.configure(ids[0], 'chill');
    g.start(ids[0]);
    expect(g.viewFor(ids[0]).course!.timeMs).toBe(Math.round(courseTimeMs(1) * CLOCK_FACTOR.chill));
  });

  it('clearing it gives stars, carries time and lays a bigger table', () => {
    const { g } = started(2);
    run(g, 5000);
    devour(g);
    run(g, TICK_MS);
    expect(g.phase).toBe('cleared');
    const v = g.viewFor('p1');
    expect(v.cleared).toMatchObject({ no: 1, stars: 3, spills: 0, carryMs: CARRY_MAX_MS });
    expect(v.stars).toEqual([3]);
    const seq = g.courseSeq;
    run(g, CLEARED_MS + TICK_MS);
    expect(g.phase).toBe('countdown');
    expect(g.course).toBe(2);
    expect(g.courseSeq).toBe(seq + 1);
    expect(g.viewFor('p1').course!.timeMs).toBe(courseTimeMs(2) + CARRY_MAX_MS);
    expect(g.world!.w).toBe(tableSize(2, 2).w);
    expect(g.world!.holes.every((h) => h.mass === 0)).toBe(true);
  });

  it('a slow or messy clear earns fewer stars', () => {
    const { g } = started(1);
    g.world!.spills = 5;
    devour(g);
    run(g, TICK_MS);
    expect(g.viewFor('p1').cleared!.stars).toBe(2);
    const slow = started(1).g;
    run(slow, courseTimeMs(1) * 0.95);
    devour(slow);
    run(slow, TICK_MS);
    expect(slow.viewFor('p1').cleared!.stars).toBe(1);
  });

  it('spills come off the clock', () => {
    const { g } = started(1);
    const before = g.snapshot()!.left;
    g.world!.penaltyMs = 3000;
    run(g, TICK_MS);
    expect(before - g.snapshot()!.left).toBeGreaterThanOrEqual(3000);
  });

  it('clearing the last course wins the run', () => {
    const { g, ids } = started(1);
    for (let no = 1; no <= COURSES; no++) {
      runUntil(g, () => g.phase === 'play', CLEARED_MS + COUNTDOWN_MS + 1000);
      expect(g.course).toBe(no);
      devour(g);
      run(g, TICK_MS);
    }
    expect(g.phase).toBe('finale');
    expect(g.viewFor(ids[0]).result).toMatchObject({ won: true, cleared: COURSES, failedOn: 0, leftOver: 0 });
    g.again(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(g.viewFor(ids[0]).stars).toEqual([]);
  });
});

describe('coming and going', () => {
  it('a late arrival watches, then gets a hole on the next course', () => {
    const { g } = started(1);
    const late = join(g, 'Late');
    expect(g.players.get(late.id)!.spectator).toBe(true);
    expect(g.world!.holes.length).toBe(1);
    devour(g);
    run(g, CLEARED_MS + 2 * TICK_MS);
    expect(g.players.get(late.id)!.spectator).toBe(false);
    expect(g.world!.holes.map((h) => h.id)).toEqual(['p1', late.id]);
    expect(g.world!.w).toBe(tableSize(2, 2).w);
  });

  it('a dropped player keeps the seat, is steered meanwhile, and can come back', () => {
    const { g, ids, tokens } = started(2);
    g.drop(ids[1]);
    expect(g.players.get(ids[1])!.connected).toBe(false);
    expect(g.hostId()).toBe(ids[0]);
    run(g, 4000);
    expect(g.world!.hole(ids[1])!.mass).toBeGreaterThan(0);
    const back = join(g, 'P2', tokens[1]);
    expect(back).toMatchObject({ id: ids[1], resumed: true });
    expect(g.players.get(ids[1])!.connected).toBe(true);
  });

  it('leaving removes the hole; the last one out ends the run', () => {
    const { g, ids } = started(2);
    g.leave(ids[0]);
    expect(g.world!.holes.map((h) => h.id)).toEqual([ids[1]]);
    expect(g.phase).toBe('play');
    g.leave(ids[1]);
    expect(g.phase).toBe('lobby');
  });

  it('the host can end the run', () => {
    const { g, ids } = started(2);
    g.abort(ids[1]);
    expect(g.phase).toBe('play');
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(g.world).toBeNull();
  });
});

describe('the wire', () => {
  it('the course message lists what is on the table; snapshots carry only what moved', () => {
    const { g, ids } = started(1);
    const c = g.courseMessage()!;
    expect(c.foods.length).toBe(g.world!.foods.length);
    g.snapshot();
    run(g, 100);
    const quiet = g.snapshot()!;
    expect(quiet.foods).toEqual([]);
    expect(quiet.holes).toEqual([[ids[0], g.world!.w / 2, g.world!.h / 2, 18, 0, 0]]);
    const big = g.world!.foods.find((f) => f.tier === 1)!;
    const hole = g.world!.hole(ids[0])!;
    hole.x = big.x - big.r - hole.r + 4;
    hole.y = big.y;
    g.aim(ids[0], hole.x, hole.y);
    run(g, 50);
    expect(g.snapshot()!.foods.some((m) => m[0] === big.id)).toBe(true);
    expect(g.world!.foods.filter((f) => f.state === ON).length).toBe(g.courseMessage()!.foods.length);
  });

  it('views never leak a seat token', () => {
    const { g, ids, tokens } = started(2);
    const text = JSON.stringify([g.viewFor(ids[0]), g.courseMessage(), g.snapshot()]);
    for (const t of tokens) expect(text).not.toContain(t);
  });

  it('simulated time only moves forward, across runs', () => {
    const { g, ids } = started(1);
    const t1 = g.snapshot()!.simTimeMs;
    g.abort(ids[0]);
    g.start(ids[0]);
    run(g, 100);
    expect(g.snapshot()!.simTimeMs).toBeGreaterThan(t1);
  });
});

describe('only watching', () => {
  it('a screen that joins to watch has no seat, costs no bot theirs, and is never dealt in', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < 20; i++) g.addBot(ids[0]);
    const tv = g.join('TV', undefined, true) as { id: string };
    expect(g.players.size).toBe(MAX_PLAYERS + 1);
    const me = () => g.viewFor(tv.id).players.find((p) => p.id === tv.id)!;
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    g.start(ids[0]);
    expect(g.phase).not.toBe('lobby');
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    // still only watching in the next lobby, and the host is still a player
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    expect(g.hostId()).toBe(ids[0]);
    // a seat comes back when asked for, once there is one
    g.watch(tv.id, false);
    expect(me()).toMatchObject({ spectator: true, watcher: false });
    g.watch(tv.id, true);
    g.removeBot(ids[0]);
    g.watch(tv.id, false);
    expect(me()).toMatchObject({ spectator: false, watcher: false });
  });
  it('is said again by a screen that comes back with its token', () => {
    const { g } = table(2);
    const a = g.join('Mo', undefined) as { id: string; token: string };
    g.join('Mo', a.token, true);
    expect(g.viewFor(a.id).players.find((p) => p.id === a.id)).toMatchObject({ spectator: true, watcher: true });
  });
});
