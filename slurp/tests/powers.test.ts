import { describe, expect, it } from 'vitest';
import {
  FEAST_MASS,
  FLAG_GRAVITY,
  FLAG_SLOW,
  FLAG_TURBO,
  GRAVITY_MS,
  HOLE_SPEED,
  POWERS,
  PRIZE,
  PRIZE_RESPAWN_MS,
  ROTTEN,
  ROTTEN_RESPAWN_MS,
  SLOW_MS,
  SLOW_SPEED,
  TEAM_SHARE,
  TICK_MS,
  TURBO_MS,
  TURBO_SPEED,
} from '../shared/src/constants';
import { isClientMessage } from '../shared/src/protocol';
import { botAim } from '../server/src/bots';
import { FALLEN, ON } from '../server/src/world';
import { place, seeded, started, world, runUntil } from './helpers';

const rng = seeded(3);
const ticks = (w: ReturnType<typeof world>['w'], ms: number): void => {
  for (let t = 0; t < ms; t += TICK_MS) w.step(rng);
};
const power = (name: (typeof POWERS)[number]): number => 1 + POWERS.indexOf(name);

/** How far a hole gets in one second heading right from x = 100. */
function sprint(w: ReturnType<typeof world>['w']): number {
  const hole = w.hole('a')!;
  place(w, 'a', 100, 350);
  for (let t = 0; t < 1000; t += TICK_MS) {
    w.setAim('a', hole.x + 200, 350);
    w.step(rng);
  }
  return hole.x - 100;
}

describe('prize boxes', () => {
  it('go down any hole, hand it a power and do not count as food', () => {
    const { w, stats } = world([{ tier: PRIZE, x: 500, y: 350 }, { tier: 0, x: 900, y: 600 }]);
    expect(w.left).toBe(1);
    place(w, 'a', 500, 350);
    ticks(w, 400);
    const hole = w.hole('a')!;
    expect(hole.held).toBeGreaterThan(0);
    expect(hole.held).toBeLessThanOrEqual(POWERS.length);
    expect(w.left).toBe(1);
    expect(hole.mass).toBe(0);
    expect(stats.get('a')!.eaten).toBe(0);
    expect(w.holeList()[0][5]).toBe(hole.held);
  });

  it('turn up again somewhere else later', () => {
    const { w } = world([{ tier: PRIZE, x: 500, y: 350 }, { tier: 0, x: 900, y: 600 }]);
    place(w, 'a', 500, 350);
    ticks(w, 400);
    expect(w.foods[0].state).toBe(FALLEN);
    place(w, 'a', 60, 60);
    ticks(w, PRIZE_RESPAWN_MS);
    expect(w.foods[0].state).toBe(ON);
  });
});

describe('using a power', () => {
  it('does nothing with empty hands', () => {
    const { w } = world([{ tier: 0, x: 900, y: 600 }]);
    expect(w.usePower('a')).toBe(false);
    expect(w.drainFx()).toEqual([]);
  });

  it('can only be done once per box, and everyone is told', () => {
    const { w } = world([{ tier: 0, x: 900, y: 600 }]);
    w.hole('a')!.held = power('turbo');
    expect(w.usePower('a')).toBe(true);
    expect(w.hole('a')!.held).toBe(0);
    expect(w.drainFx()).toEqual([['p', 'a', POWERS.indexOf('turbo')]]);
    expect(w.usePower('a')).toBe(false);
  });

  it('Turbo makes the hole faster for a while', () => {
    const { w } = world([{ tier: 0, x: 900, y: 650 }]);
    const normal = sprint(w);
    expect(normal).toBeCloseTo(Math.min(HOLE_SPEED, 2000) * 1, -2);
    w.hole('a')!.held = power('turbo');
    w.usePower('a');
    expect(w.flagsOf(w.hole('a')!) & FLAG_TURBO).toBeTruthy();
    expect(sprint(w) / normal).toBeCloseTo(TURBO_SPEED, 1);
    ticks(w, TURBO_MS);
    expect(w.flagsOf(w.hole('a')!) & FLAG_TURBO).toBe(0);
    expect(sprint(w)).toBeCloseTo(normal, 0);
  });

  it('Super Gravity draws in food from far beyond the usual reach', () => {
    const far = { tier: 0, x: 580, y: 350 }; // 80 away: a new hole normally pulls from about 40
    const plain = world([far, { tier: 0, x: 950, y: 650 }]);
    place(plain.w, 'a', 500, 350);
    ticks(plain.w, 1500);
    expect(plain.stats.get('a')!.eaten).toBe(0);

    const strong = world([far, { tier: 0, x: 950, y: 650 }]);
    place(strong.w, 'a', 500, 350);
    strong.w.hole('a')!.held = power('gravity');
    strong.w.usePower('a');
    expect(strong.w.flagsOf(strong.w.hole('a')!) & FLAG_GRAVITY).toBeTruthy();
    ticks(strong.w, 1500);
    expect(strong.stats.get('a')!.eaten).toBe(1);
    ticks(strong.w, GRAVITY_MS);
    expect(strong.w.flagsOf(strong.w.hole('a')!) & FLAG_GRAVITY).toBe(0);
  });

  it('Feast grows the hole at once, and the team a little', () => {
    const { w } = world([{ tier: 0, x: 900, y: 600 }], ['a', 'b']);
    w.hole('a')!.held = power('feast');
    w.usePower('a');
    expect(w.hole('a')!.mass).toBe(FEAST_MASS);
    expect(w.hole('b')!.mass).toBe(FEAST_MASS * TEAM_SHARE);
  });
});

describe('rotten fish', () => {
  it('slows the hole that swallows it, then wears off', () => {
    const { w } = world([{ tier: ROTTEN, x: 500, y: 350 }, { tier: 0, x: 950, y: 650 }]);
    const normal = sprint(w);
    place(w, 'a', 500, 350);
    ticks(w, 400);
    const hole = w.hole('a')!;
    expect(w.flagsOf(hole) & FLAG_SLOW).toBeTruthy();
    expect(w.holeList()[0][4] & FLAG_SLOW).toBeTruthy();
    expect(hole.mass).toBe(0);
    expect(w.left).toBe(1);
    expect(sprint(w) / normal).toBeCloseTo(SLOW_SPEED, 1);
    ticks(w, SLOW_MS);
    expect(w.flagsOf(hole) & FLAG_SLOW).toBe(0);
  });

  it('is never drawn in, not even by Super Gravity: you have to run over it', () => {
    const { w } = world([{ tier: ROTTEN, x: 536, y: 350 }, { tier: 0, x: 950, y: 650 }]);
    place(w, 'a', 500, 350);
    w.hole('a')!.held = power('gravity');
    w.usePower('a');
    ticks(w, 2000);
    expect(w.foods[0].state).toBe(ON);
    expect(w.foods[0].x).toBe(536);
    expect(w.flagsOf(w.hole('a')!) & FLAG_SLOW).toBe(0);
  });

  it('comes back later', () => {
    const { w } = world([{ tier: ROTTEN, x: 500, y: 350 }, { tier: 0, x: 950, y: 650 }]);
    place(w, 'a', 500, 350);
    ticks(w, 400);
    place(w, 'a', 60, 60);
    ticks(w, ROTTEN_RESPAWN_MS);
    expect(w.foods[0].state).toBe(ON);
  });
});

describe('bots and the table', () => {
  it('a bot heads for food and boxes, never for a rotten fish', () => {
    const { w } = world([{ tier: ROTTEN, x: 520, y: 350 }, { tier: 0, x: 800, y: 350 }]);
    place(w, 'a', 500, 350);
    botAim(w, w.hole('a')!, rng);
    expect(w.hole('a')!.ax).toBeGreaterThan(560);
  });

  it('a table with only boxes and fish left is cleared', () => {
    const { g, ids } = started(1);
    runUntil(g, () => g.phase === 'play', 5000);
    const w = g.world!;
    expect(w.foods.some((f) => f.tier === PRIZE)).toBe(true);
    expect(w.foods.some((f) => f.tier === ROTTEN)).toBe(true);
    for (const f of w.foods) if (f.tier < PRIZE) f.state = 3;
    w.left = 0;
    g.step(TICK_MS);
    expect(g.phase).toBe('cleared');
    expect(ids).toHaveLength(1);
  });

  it('use is a message, and only works for a hole that carries something', () => {
    expect(isClientMessage({ type: 'use' })).toBe(true);
    const { g, ids } = started(1);
    runUntil(g, () => g.phase === 'play', 5000);
    g.use(ids[0]);
    expect(g.snapshot()!.fx.filter((f) => f[0] === 'p')).toEqual([]);
    g.world!.hole(ids[0])!.held = power('feast');
    g.use(ids[0]);
    expect(g.snapshot()!.fx.filter((f) => f[0] === 'p')).toEqual([['p', ids[0], POWERS.indexOf('feast')]]);
  });
});
