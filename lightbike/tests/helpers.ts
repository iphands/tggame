import { seeded } from '@tggame/base/testing/seeded';
import { Game } from '../server/src/game';
import { World, type Bike } from '../server/src/world';
import type { Arena } from '../shared/src/arenas';
import { COUNTDOWN_MS, TICK_MS } from '../shared/src/constants';
import type { PlayerStats, Settings } from '../shared/src/types';

type Joined = { id: string; token: string; resumed: boolean };

export function join(g: Game, name: string, token?: string): Joined {
  const j = g.join(name, token);
  if (typeof j === 'string') throw new Error(`join refused: ${j}`);
  return j;
}

/** A lobby with `n` humans named P1..Pn; returns their ids in seat order. */
export function table(n: number, seed = 1): { g: Game; ids: string[]; tokens: string[] } {
  const g = new Game(seeded(seed));
  const ids: string[] = [];
  const tokens: string[] = [];
  for (let i = 1; i <= n; i++) {
    const j = join(g, `P${i}`);
    ids.push(j.id);
    tokens.push(j.token);
  }
  return { g, ids, tokens };
}

/** Run the game for `ms` of simulated time, one tick at a time. */
export function run(g: Game, ms: number): void {
  for (let t = 0; t < ms; t += TICK_MS) g.step(TICK_MS);
}

/** A match of `n` humans with the first round just under way. */
export function started(n: number, seed = 1): { g: Game; ids: string[] } {
  const t = table(n, seed);
  t.g.start(t.ids[0]);
  run(t.g, COUNTDOWN_MS + TICK_MS);
  return t;
}

/** Run until `done` says so; fails after `capMs`. Returns the simulated time it took. */
export function runUntil(g: Game, done: () => boolean, capMs: number): number {
  let t = 0;
  for (; !done(); t += TICK_MS) {
    if (t > capMs) throw new Error(`still not done after ${capMs} ms`);
    g.step(TICK_MS);
  }
  return t;
}

export const ALL_ON: Settings = { pace: 'normal', length: 'normal', boost: true, bust: true, slip: true, erase: true };
export const PLAIN: Settings = { pace: 'normal', length: 'normal', boost: false, bust: false, slip: false, erase: false };

export const stat = (id: string): PlayerStats => ({ id, score: 0, wins: 0, cuts: 0, own: 0, walls: 0, firsts: 0, cells: 0, shaves: 0 });

/** A bare floor of `w` by `h` with one bike per id, for the rules of riding. Bikes are then put where a test wants them. */
export function floor(ids = ['a', 'b'], settings: Settings = PLAIN, w = 40, h = 30): { w: World; stats: Map<string, PlayerStats> } {
  const stats = new Map(ids.map((id) => [id, stat(id)]));
  const arena: Arena = { no: 0, name: 'Test', w, h, blocks: [] };
  const world = new World(arena, ids, settings, stats, seeded(5));
  // off the floor until placed, so starting spots never get in a test's way
  for (const b of world.bikes) world.occ[b.y * world.w + b.x] = 0;
  return { w: world, stats };
}

/** Put a bike in a cell, facing `dir`, with its line starting there. */
export function place(w: World, id: string, x: number, y: number, dir: number): Bike {
  const b = w.bike(id)!;
  Object.assign(b, { x, y, dir, p: 0, odo: 0, queue: [], pts: [x, y] });
  w.occ[y * w.w + x] = b.idx + 1;
  return b;
}

/** Lay a stretch of somebody's line by hand. */
export function line(w: World, id: string, x0: number, y0: number, x1: number, y1: number): void {
  const b = w.bike(id)!;
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) w.occ[y * w.w + x] = b.idx + 1;
}

export function steps(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.step();
}

/** Step until the bike has arrived in `cells` more cells (or is out). */
export function ride(w: World, id: string, cells: number): void {
  const b = w.bike(id)!;
  const until = b.arrivedAt;
  let seen = 0;
  let last = until;
  for (let i = 0; i < 10_000 && seen < cells && b.alive; i++) {
    w.step();
    if (b.arrivedAt !== last) {
      last = b.arrivedAt;
      seen++;
    }
  }
}

export { seeded };
