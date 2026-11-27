import { describe, expect, it } from 'vitest';
import { ARENA_NAMES, makeArena, solidGrid, spawns } from '../shared/src/arenas';
import { MAX_PLAYERS } from '../shared/src/constants';
import { DX, DY } from '../shared/src/sim';
import { room } from '../server/src/bots';
import { World } from '../server/src/world';
import { PLAIN, seeded, stat } from './helpers';

describe('every floor, for every number of riders', () => {
  for (let no = 0; no < ARENA_NAMES.length; no++) {
    for (let n = 2; n <= MAX_PLAYERS; n++) {
      it(`${ARENA_NAMES[no]} for ${n}`, () => {
        const a = makeArena(no, n);
        expect(a.name).toBe(ARENA_NAMES[no]);
        const solid = solidGrid(a);
        for (const [x, y, w, h] of a.blocks) {
          expect(x >= 0 && y >= 0 && x + w <= a.w && y + h <= a.h, `block ${[x, y, w, h]} on a ${a.w}x${a.h} floor`).toBe(true);
        }
        const places = spawns(a, n);
        expect(new Set(places.map(([x, y]) => `${x},${y}`)).size).toBe(n);
        for (const [x, y, dir] of places) {
          // on the floor, with a good run ahead before anything needs doing
          for (let k = 0; k <= 10; k++) {
            const cx = x + DX[dir] * k;
            const cy = y + DY[dir] * k;
            expect(cx >= 0 && cy >= 0 && cx < a.w && cy < a.h && !solid[cy * a.w + cx], `spawn ${[x, y, dir]} blocked ${k} cells on`).toBe(true);
          }
        }
        // nobody starts on top of, or pointing straight down, another rider's first stretch
        for (const [x, y] of places) for (const [ox, oy] of places) if (x !== ox || y !== oy) expect(Math.abs(x - ox) + Math.abs(y - oy)).toBeGreaterThan(6);

        // no part of the floor is walled off from the rest
        const ids = Array.from({ length: n }, (_, i) => `p${i}`);
        const world = new World(a, ids, PLAIN, new Map(ids.map((id) => [id, stat(id)])), seeded(1));
        for (const b of world.bikes) world.occ[b.y * world.w + b.x] = 0;
        const free = solid.reduce((sum, s) => sum + (s ? 0 : 1), 0);
        expect(room(world, places[0][0], places[0][1], -1, Infinity)).toBe(free);
      });
    }
  }

  it('grow with the table', () => {
    expect(makeArena(0, 8).w).toBeGreaterThan(makeArena(0, 2).w);
    expect(makeArena(ARENA_NAMES.length, 4).name).toBe(ARENA_NAMES[0]);
  });
});
