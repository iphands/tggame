import { describe, expect, it } from 'vitest';
import { ARENA_NAMES, makeArena } from '../shared/src/arenas';
import { TICK_HZ } from '../shared/src/constants';
import { pilot, room } from '../server/src/bots';
import { World } from '../server/src/world';
import { ALL_ON, PLAIN, floor, line, place, seeded, stat } from './helpers';

/** A floor of bots, ridden until one is left or `seconds` are up. Returns how long each lasted, in seconds. */
function botsOnly(no: number, n: number, seed: number, seconds: number): { world: World; lasted: number[] } {
  const ids = Array.from({ length: n }, (_, i) => `b${i}`);
  const rng = seeded(seed);
  const world = new World(makeArena(no, n), ids, ALL_ON, new Map(ids.map((id) => [id, stat(id)])), rng);
  const lasted = ids.map(() => seconds);
  for (let t = 0; t < seconds * TICK_HZ && world.alive > 1; t++) {
    for (const b of world.bikes) if (b.alive) pilot(world, b, rng);
    world.step();
    world.bikes.forEach((b, i) => {
      if (!b.alive && lasted[i] === seconds) lasted[i] = t / TICK_HZ;
    });
  }
  return { world, lasted };
}

describe('room', () => {
  it('counts the free cells a bike could reach', () => {
    const { w } = floor(['a', 'b'], PLAIN, 10, 10);
    expect(room(w, 0, 0, -1, Infinity)).toBe(100);
    line(w, 'a', 4, 0, 4, 9);
    expect(room(w, 0, 0, -1, Infinity)).toBe(40);
    expect(room(w, 9, 9, -1, Infinity)).toBe(50);
    expect(room(w, 4, 4, -1)).toBe(0);
    expect(room(w, -1, 0, -1)).toBe(0);
    expect(room(w, 0, 0, 1, Infinity)).toBe(39);
    expect(room(w, 9, 9, -1, 12)).toBeGreaterThanOrEqual(12);
  });
});

describe('a bot', () => {
  it('turns away from a wall, toward the open side', () => {
    const { w } = floor(['a', 'b'], PLAIN);
    const a = place(w, 'a', 37, 2, 0);
    place(w, 'b', 2, 28, 0);
    const rng = seeded(3);
    for (let t = 0; t < TICK_HZ * 2; t++) {
      pilot(w, a, rng);
      w.step();
    }
    expect(a.alive).toBe(true);
    expect(a.turns).toBeGreaterThan(0);
  });

  it('does not ride into a dead end when there is a way round', () => {
    const { w } = floor(['a', 'b'], PLAIN);
    // a pocket straight ahead, open floor below
    line(w, 'b', 10, 3, 20, 3);
    line(w, 'b', 10, 7, 20, 7);
    line(w, 'b', 20, 3, 20, 7);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 2, 28, 0);
    const rng = seeded(4);
    for (let t = 0; t < TICK_HZ * 3; t++) {
      pilot(w, a, rng);
      w.step();
    }
    expect(a.alive).toBe(true);
  });

  it('busts through a line when that is the only way on', () => {
    const { w } = floor(['a', 'b'], ALL_ON);
    line(w, 'b', 4, 3, 12, 3);
    line(w, 'b', 4, 7, 12, 7);
    line(w, 'b', 12, 3, 12, 7);
    line(w, 'b', 4, 3, 4, 7);
    const a = place(w, 'a', 6, 5, 0);
    place(w, 'b', 2, 28, 0);
    const rng = seeded(4);
    for (let t = 0; t < TICK_HZ * 4 && a.alive && a.x < 14 && a.y > 2 && a.y < 8; t++) {
      pilot(w, a, rng);
      w.step();
    }
    expect(a.alive).toBe(true);
    expect(a.energy).toBeLessThan(1);
  });
});

describe('a floor of bots', () => {
  for (let no = 0; no < ARENA_NAMES.length; no++) {
    it(`rides ${ARENA_NAMES[no]} without anybody crashing straight away`, () => {
      const all: number[] = [];
      for (let seed = 1; seed <= 6; seed++) {
        const n = 2 + (seed % 4) * 2;
        const { lasted } = botsOnly(no, n, seed, 30);
        all.push(...lasted);
        // the two who lasted longest had a proper duel
        expect([...lasted].sort((x, y) => y - x)[1], `seed ${seed}, ${n} bots: ${lasted.map((s) => s.toFixed(1))}`).toBeGreaterThan(4);
      }
      const early = all.filter((s) => s < 3).length;
      expect(early / all.length, `${early} of ${all.length} out within 3 s`).toBeLessThan(0.15);
    });
  }

  it('rides a full floor of sixteen, on every floor, down to one', () => {
    for (let no = 0; no < ARENA_NAMES.length; no++) {
      const { lasted, world } = botsOnly(no, 16, no + 1, 240);
      expect(lasted).toHaveLength(16);
      expect(lasted.filter((s) => s < 3).length, `${ARENA_NAMES[no]}: ${lasted.map((s) => s.toFixed(1))}`).toBeLessThan(5);
      expect(world.alive, ARENA_NAMES[no]).toBeLessThanOrEqual(1);
    }
  });

  it('always comes down to one, before or as the rim closes in', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { world } = botsOnly(seed, 4, seed, 240);
      expect(world.alive, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });
});
