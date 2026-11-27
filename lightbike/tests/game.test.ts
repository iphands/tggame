import { describe, expect, it } from 'vitest';
import { CLEARED_MS, COUNTDOWN_MS, MAX_PLAYERS, ROUND_END_MS, TARGETS, TICK_MS } from '../shared/src/constants';
import { ARENA_NAMES } from '../shared/src/arenas';
import { join, run, runUntil, started, table } from './helpers';

describe('the lobby', () => {
  it('seats players with their own colours and unique names', () => {
    const { g } = table(3);
    join(g, 'P1');
    const v = g.viewFor('p1');
    expect(v.players.map((p) => p.name)).toEqual(['P1', 'P2', 'P3', 'P1 2']);
    expect(new Set(v.players.map((p) => p.color)).size).toBe(4);
    expect(v.hostId).toBe('p1');
    expect(v.round).toBeNull();
  });

  it('only the host starts, configures and adds bots', () => {
    const { g, ids } = table(2);
    g.start(ids[1]);
    g.configure(ids[1], { pace: 'silly' });
    g.addBot(ids[1]);
    expect(g.phase).toBe('lobby');
    expect(g.settings.pace).toBe('normal');
    expect(g.players.size).toBe(2);
    g.configure(ids[0], { pace: 'silly', length: 'short', slip: false });
    g.addBot(ids[0]);
    expect(g.settings).toMatchObject({ pace: 'silly', length: 'short', slip: false, boost: true });
    expect(g.botCount()).toBe(1);
    g.start(ids[0]);
    expect(g.phase).toBe('countdown');
    g.configure(ids[0], { pace: 'chill' });
    expect(g.settings.pace).toBe('silly');
  });

  it('needs two riders, and a bot counts', () => {
    const { g, ids } = table(1);
    g.start(ids[0]);
    expect(g.phase).toBe('lobby');
    g.addBot(ids[0]);
    g.start(ids[0]);
    expect(g.phase).toBe('countdown');
  });

  it('a human takes a bot\'s seat when the floor is full', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < MAX_PLAYERS; i++) g.addBot(ids[0]);
    expect(g.players.size).toBe(MAX_PLAYERS);
    const late = join(g, 'Late');
    expect(g.players.size).toBe(MAX_PLAYERS);
    expect(g.botCount()).toBe(MAX_PLAYERS - 2);
    expect(g.viewFor(late.id).players.find((p) => p.id === late.id)!.spectator).toBe(false);
  });
});

describe('a round', () => {
  it('counts down with the bikes standing, then rides', () => {
    const { g, ids } = table(2);
    g.start(ids[0]);
    const before = g.world!.bikes.map((b) => [b.x, b.y]);
    run(g, COUNTDOWN_MS - 100);
    expect(g.phase).toBe('countdown');
    expect(g.world!.bikes.map((b) => [b.x, b.y])).toEqual(before);
    expect(g.snapshot()!.cd).toBeGreaterThan(0);
    expect(g.snapshot()!.bikes.every((b) => b[5] === 0)).toBe(true);
    run(g, 200);
    expect(g.phase).toBe('play');
    expect(g.snapshot()!.cd).toBe(0);
    expect(g.viewFor(ids[0]).round).toEqual({ no: 1, arena: 'Open Floor', target: TARGETS.normal });
  });

  it('ends when one rider is left: result, points, and on to the next floor', () => {
    const { g, ids } = started(2);
    // nobody steers: both ride into the far wall, one of them first
    const [a, b] = g.world!.bikes;
    const revBefore = g.rev;
    runUntil(g, () => g.world!.alive <= 1, 20_000);
    expect(g.phase).toBe('play');
    expect(g.rev).toBeGreaterThan(revBefore);
    expect(g.snapshot()!.bikes.every((bk) => bk[5] === 0)).toBe(true);
    run(g, ROUND_END_MS + TICK_MS * 2);
    expect(g.phase).toBe('cleared');
    const c = g.viewFor(ids[0]).cleared!;
    const winner = a.alive ? a : b;
    expect(c).toMatchObject({ no: 1, winner: winner.id, last: false });
    expect(c.exits.map((e) => [e.place, e.gained])).toEqual([[1, 1], [2, 0]]);
    expect(g.viewFor(ids[0]).players.find((p) => p.id === winner.id)!.score).toBe(1);
    expect(g.live).toBe(false);
    run(g, CLEARED_MS + TICK_MS * 2);
    expect(g.phase).toBe('countdown');
    expect(g.roundSeq).toBe(2);
    expect(g.viewFor(ids[0]).round).toMatchObject({ no: 2, arena: ARENA_NAMES[1] });
  });

  it('takes steering only from riders, only while it is on', () => {
    const { g, ids } = table(2);
    g.turn(ids[0], 1);
    g.start(ids[0]);
    const bike = g.world!.bike(ids[0])!;
    const d = (bike.dir + 1) % 4;
    g.turn(ids[0], d);
    g.turn('nobody', d);
    expect(bike.queue.map((t) => t.d)).toEqual([d]);
    g.bust(ids[0]); // not during the countdown
    expect(bike.energy).toBe(1);
    run(g, COUNTDOWN_MS + 200);
    expect(bike.dir).toBe(d);
    g.bust(ids[0]);
    expect(bike.energy).toBe(0.5);
  });

  it('runs fast once only bots are riding', () => {
    const { g, ids } = table(1);
    g.addBot(ids[0]);
    g.addBot(ids[0]);
    g.start(ids[0]);
    run(g, COUNTDOWN_MS + TICK_MS);
    const world = g.world!;
    const [t0, g0] = [world.tick, g.tick];
    run(g, TICK_MS * 10);
    expect(world.tick - t0).toBe(g.tick - g0);
    world.retire(ids[0]); // the human is out
    const t1 = world.tick;
    g.step(TICK_MS);
    expect(world.tick - t1).toBe(4);
  });
});

describe('a match', () => {
  it('ends after the round in which somebody reaches the target and leads alone', () => {
    const { g, ids } = table(1, 7);
    g.addBot(ids[0]);
    g.addBot(ids[0]);
    g.addBot(ids[0]);
    g.configure(ids[0], { length: 'short' });
    g.start(ids[0]);
    g.drop(ids[0]); // the human's bike rides itself too
    const ms = runUntil(g, () => g.phase === 'finale', 40 * 60_000);
    const r = g.viewFor(ids[0]).result!;
    const scores = r.stats.map((s) => s.score).sort((x, y) => y - x);
    expect(scores[0]).toBeGreaterThanOrEqual(TARGETS.short);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(r.winner).toBe(r.stats.find((s) => s.score === scores[0])!.id);
    expect(r.rounds).toBeGreaterThan(1);
    expect(r.stats.reduce((n, s) => n + s.wins, 0)).toBeLessThanOrEqual(r.rounds);
    console.log(`a short match of four bots: ${r.rounds} rounds in ${(ms / 1000).toFixed(0)} s of game time`);
  });

  it('the host can go again, and nobody else', () => {
    const { g, ids } = started(2);
    g.again(ids[0]);
    expect(g.phase).toBe('play');
    g.abort(ids[1]);
    expect(g.phase).toBe('play');
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(g.world).toBeNull();
  });
});

describe('coming and going', () => {
  it('a dropped rider keeps their seat, rides on autopilot, and gets it back with their token', () => {
    const { g, ids } = table(3);
    const tokens = [...g.players.values()].map((p) => p.token);
    g.start(ids[0]);
    run(g, COUNTDOWN_MS + TICK_MS);
    g.drop(ids[1]);
    expect(g.players.get(ids[1])!.connected).toBe(false);
    expect(g.world!.bike(ids[1])!.alive).toBe(true);
    g.world!.bike(ids[1])!.boosting = true; // the autopilot likes its boost
    const back = join(g, 'whoever', tokens[1]);
    expect(back).toMatchObject({ id: ids[1], resumed: true });
    expect(g.world!.bike(ids[1])!.boosting).toBe(false);
    expect(g.players.get(ids[1])!.connected).toBe(true);
  });

  it('a dropped host hands hosting on', () => {
    const { g, ids } = started(3);
    g.drop(ids[0]);
    expect(g.hostId()).toBe(ids[1]);
  });

  it('somebody arriving mid-match watches, and rides from the next round', () => {
    const { g, ids } = started(2);
    const late = join(g, 'Late');
    expect(g.viewFor(late.id).players.find((p) => p.id === late.id)!.spectator).toBe(true);
    expect(g.world!.bike(late.id)).toBeUndefined();
    runUntil(g, () => g.phase === 'cleared', 30_000);
    runUntil(g, () => g.phase === 'countdown', CLEARED_MS + 1000);
    expect(g.world!.bike(late.id)).toBeDefined();
    expect(g.world!.bikes.length).toBe(3);
    expect(g.viewFor(ids[0]).players.find((p) => p.id === late.id)!.spectator).toBe(false);
  });

  it('a rider who leaves is gone for good; with one rider left the match is called', () => {
    const { g, ids } = started(2);
    g.leave(ids[1]);
    expect(g.players.has(ids[1])).toBe(false);
    expect(g.world!.bike(ids[1])!.alive).toBe(false);
    runUntil(g, () => g.phase === 'cleared', 5000);
    expect(g.viewFor(ids[0]).cleared!.winner).toBe(ids[0]);
    runUntil(g, () => g.phase === 'finale', CLEARED_MS + 1000);
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: ids[0], rounds: 1 });
  });

  it('everybody leaving a running match empties the floor', () => {
    const { g, ids } = started(2);
    g.leave(ids[0]);
    g.leave(ids[1]);
    expect(g.phase).toBe('lobby');
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
