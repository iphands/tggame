import { describe, expect, it } from 'vitest';
import { GONE, ON, FALLEN } from '../server/src/world';
import { RESPAWN_MS, SPILL_PENALTY_MS, SWALLOW_MS, TEAM_SHARE, TIERS } from '../shared/src/constants';
import { canEat, holeRadius, massForTier, moveHole, tiersEdible } from '../shared/src/sim';
import { place, steps, world } from './helpers';

describe('shared rules', () => {
  it('a new hole eats berries and nothing bigger', () => {
    expect(tiersEdible(holeRadius(0))).toBe(1);
  });
  it('massForTier is exactly where a tier becomes edible', () => {
    for (let t = 1; t < TIERS.length; t++) {
      const m = massForTier(t);
      expect(canEat(holeRadius(m + 0.01), TIERS[t].r)).toBe(true);
      expect(canEat(holeRadius(m - 0.01), TIERS[t].r)).toBe(false);
    }
  });
  it('a hole reaches its aim and stays on the table', () => {
    const m = { x: 10, y: 10, ax: -500, ay: 2000 };
    for (let i = 0; i < 600; i++) moveHole(m, 300, 200, 1 / 60);
    expect(m.x).toBe(0);
    expect(m.y).toBe(200);
  });
});

describe('eating', () => {
  it('swallows food it sits on, once, and grows', () => {
    const { w, stats } = world([{ tier: 0, x: 500, y: 350 }]);
    place(w, 'a', 500, 350);
    steps(w, SWALLOW_MS + 50);
    expect(w.foods[0].state).toBe(GONE);
    expect(w.left).toBe(0);
    expect(w.hole('a')!.mass).toBe(TIERS[0].value);
    expect(stats.get('a')!.eaten).toBe(1);
    expect(w.drainFx().filter((f) => f[0] === 'e')).toEqual([['e', 0, 'a']]);
    steps(w, 500);
    expect(stats.get('a')!.eaten).toBe(1);
    expect(w.left).toBe(0);
  });

  it('draws in edible food that is near the rim', () => {
    const { w } = world([{ tier: 0, x: 525, y: 350 }]);
    place(w, 'a', 500, 350);
    steps(w, 1500);
    expect(w.foods[0].state).toBe(GONE);
  });

  it('gives every other hole the team share', () => {
    const { w } = world([{ tier: 0, x: 200, y: 200 }], ['a', 'b']);
    place(w, 'a', 200, 200);
    place(w, 'b', 800, 500);
    steps(w, SWALLOW_MS + 50);
    expect(w.hole('a')!.mass).toBe(1);
    expect(w.hole('b')!.mass).toBe(TEAM_SHARE);
  });

  it('shoves food that is too big instead of eating it', () => {
    const { w } = world([{ tier: 2, x: 540, y: 350 }]);
    place(w, 'a', 500, 350);
    w.setAim('a', 700, 350);
    steps(w, 1000);
    const f = w.foods[0];
    expect(f.state).toBe(ON);
    expect(f.x).toBeGreaterThan(700);
    expect(f.x - w.hole('a')!.x).toBeGreaterThanOrEqual(f.r + w.hole('a')!.r - 0.01);
    expect(w.drainMoves().length).toBe(1);
    expect(w.drainMoves().length).toBe(0);
  });

  it('eats the same food once it has grown enough', () => {
    const { w } = world([{ tier: 2, x: 500, y: 350 }]);
    place(w, 'a', 500, 350, massForTier(2) + 1);
    steps(w, SWALLOW_MS + 50);
    expect(w.foods[0].state).toBe(GONE);
  });

  it('moving food pushes other food', () => {
    const { w } = world([
      { tier: 2, x: 540, y: 350 },
      { tier: 1, x: 600, y: 350 },
    ]);
    place(w, 'a', 500, 350);
    w.setAim('a', 620, 350);
    steps(w, 1500);
    const [big, small] = w.foods;
    expect(small.x).toBeGreaterThan(600);
    expect(Math.hypot(small.x - big.x, small.y - big.y)).toBeGreaterThanOrEqual(big.r + small.r - 0.5);
  });

  it('credits a herder when a teammate eats what they pushed in', () => {
    const { w, stats } = world([{ tier: 1, x: 430, y: 350 }], ['small', 'big']);
    place(w, 'small', 380, 350);
    place(w, 'big', 600, 350, massForTier(1) + 5);
    w.setAim('small', 560, 350);
    steps(w, 2500);
    expect(w.foods[0].state).toBe(GONE);
    expect(stats.get('big')!.eaten).toBe(1);
    expect(stats.get('small')!.herds).toBe(1);
  });
});

describe('spills', () => {
  it('food shoved off the table costs time and comes back', () => {
    const { w, stats } = world([{ tier: 2, x: 950, y: 350 }]);
    place(w, 'a', 900, 350);
    w.setAim('a', 1000, 350);
    steps(w, 1500);
    const f = w.foods[0];
    expect(f.state).toBe(FALLEN);
    expect(w.spills).toBe(1);
    expect(w.penaltyMs).toBe(SPILL_PENALTY_MS);
    expect(stats.get('a')!.spills).toBe(1);
    expect(w.left).toBe(1);
    expect(w.drainFx()).toEqual([['s', 0, 'a']]);
    steps(w, RESPAWN_MS);
    expect(f.state).toBe(ON);
    expect(f.x).toBeGreaterThan(f.r);
    expect(f.x).toBeLessThan(w.w - f.r);
    const back = w.drainFx();
    expect(back).toEqual([['r', 0, f.x, f.y, 2]]);
  });

  it('a hole that leaves hands its growth to the biggest one left', () => {
    const { w } = world([], ['a', 'b', 'c']);
    place(w, 'a', 100, 100, 50);
    place(w, 'b', 300, 100, 10);
    place(w, 'c', 500, 100, 20);
    w.removeHole('a');
    expect(w.holes.map((h) => h.id)).toEqual(['b', 'c']);
    expect(w.hole('c')!.mass).toBe(70);
    expect(w.hole('c')!.r).toBeCloseTo(holeRadius(70));
  });
});
