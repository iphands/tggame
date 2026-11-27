import { seeded } from '@tggame/base/testing/seeded';
import { Game } from '../server/src/game';
import { World, type Body } from '../server/src/world';
import { COUNTDOWN_MS, TICK_MS } from '../shared/src/constants';
import { parseMap, type GameMap } from '../shared/src/map';
import { MAP } from '../shared/src/maps';
import type { Mode } from '../shared/src/types';

type Joined = { id: string; token: string; resumed: boolean };

export function join(g: Game, name: string, token?: string): Joined {
  const j = g.join(name, token);
  if (typeof j === 'string') throw new Error(`join refused: ${j}`);
  return j;
}

/** A lobby with `n` humans named P1..Pn; returns their ids in seat order. */
export function table(n: number, seed = 1): { g: Game; ids: string[]; tokens: string[] } {
  const g = new Game(seeded(seed));
  // the rules are tested on the Old House, where the tests know their way about
  g.settings.map = 0;
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

/** A round of `n` humans, just past the countdown. */
export function started(n: number, mode: Mode = 'last', seed = 1): { g: Game; ids: string[]; tokens: string[]; w: World } {
  const t = table(n, seed);
  t.g.configure(t.ids[0], mode);
  t.g.start(t.ids[0]);
  run(t.g, COUNTDOWN_MS + TICK_MS);
  return { ...t, w: t.g.world! };
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

/** A bare round for rules tests: `ids[0]` is the Beast, already out of its den. */
export function world(ids = ['beast', 'a'], mode: Mode = 'last', map: GameMap = MAP, tasks: number[] = [0, 1]): World {
  const w = new World(mode, ids, ids[0], tasks, map);
  w.body(ids[0])!.heldMs = 0;
  return w;
}

/** Put a body somewhere, at rest. */
export function place(w: World, id: string, x: number, y: number): Body {
  const b = w.body(id)!;
  b.x = x;
  b.y = y;
  return b;
}

export function steps(w: World, ms: number, rng = seeded(9)): void {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) w.step(rng);
}

/** A small walled yard with one wall down the middle, a gap at the bottom. */
export const YARD = parseMap([
  '###########',
  '#....#....#',
  '#....#....#',
  '#....#....#',
  '#.........#',
  '###########',
]);

export { seeded };
