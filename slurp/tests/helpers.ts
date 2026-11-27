import { seeded } from '@tggame/base/testing/seeded';
import { Game } from '../server/src/game';
import { World } from '../server/src/world';
import type { Course, Placed } from '../server/src/course';
import { COUNTDOWN_MS, TICK_MS } from '../shared/src/constants';
import type { PlayerStats } from '../shared/src/types';

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

/** A run of `n` humans with the first course just under way. */
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

/** A hand-laid table for physics tests: `w` by `h`, the given food, one hole per id. */
export function world(foods: Placed[], ids = ['a'], w = 1000, h = 700): { w: World; stats: Map<string, PlayerStats> } {
  const stats = new Map<string, PlayerStats>(ids.map((id) => [id, { id, eaten: 0, biggest: -1, spills: 0, herds: 0, lasts: 0 }]));
  const course: Course = { no: 1, w, h, tiers: 5, foods };
  return { w: new World(course, ids, stats), stats };
}

/** Put a hole somewhere, at rest. */
export function place(w: World, id: string, x: number, y: number, mass = 0): void {
  const hole = w.hole(id)!;
  hole.x = hole.ax = x;
  hole.y = hole.ay = y;
  hole.mass = 0;
  // grow through the world so the radius follows
  (w as unknown as { grow(h: unknown, by: number): void }).grow(hole, mass);
}

export function steps(w: World, ms: number, rng = seeded(9)): void {
  for (let t = 0; t < ms; t += TICK_MS) w.step(rng);
}

export { seeded };
