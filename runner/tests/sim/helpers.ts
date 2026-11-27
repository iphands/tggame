import { Game } from '../../server/src/sim/game.js';
import type { Player } from '../../shared/src/sim/model.js';
import { LEVELS, type LevelDef } from '../../shared/src/levels.js';
import { ARENAS } from '../fixtures/arenas.js';
import { MATCH, PHYS, TICK_MS } from '../../shared/src/constants.js';

export { TICK_MS };

/** A game on one of the static single-screen test arenas (no scrolling, no finish line). */
export function newGame(levelId = 'sky', seed = 1): Game {
  return gameOn(ARENAS, levelId, seed);
}

/** A game on one of the real courses. */
export function newRun(levelId = 'sky', seed = 1): Game {
  return gameOn(LEVELS, levelId, seed);
}

/** A game on a custom world built for one test. */
export function newCustom(level: LevelDef, seed = 1): Game {
  return gameOn([level], level.id, seed);
}

function gameOn(levels: LevelDef[], levelId: string, seed: number): Game {
  const g = new Game({ seed, levels });
  const idx = levels.findIndex((l) => l.id === levelId);
  if (idx < 0) throw new Error(`no level ${levelId}`);
  g.nextLevelIndex = idx;
  return g;
}

/** A flat test world: one long floor at y=540 from x=0, plus whatever the test adds. */
export function flatWorld(over: Partial<LevelDef> = {}): LevelDef {
  const length = over.length ?? 4000;
  const platforms = [];
  for (let x = 0; x < length; x += 640) platforms.push({ x, y: 540, w: Math.min(640, length - x), h: 40 });
  return {
    id: 'flat',
    name: 'Flat',
    tagline: '',
    theme: 'sky',
    gravityScale: 1,
    length,
    finishX: length - 700,
    platforms,
    boxes: [],
    gates: [],
    spawns: [
      { x: 200, y: 540 },
      { x: 260, y: 540 },
      { x: 320, y: 540 },
      { x: 380, y: 540 },
    ],
    ...over,
  };
}

/** Advance the sim by roughly `ms` of game time. */
export function run(g: Game, ms: number): void {
  const n = Math.max(1, Math.round(ms / TICK_MS));
  for (let i = 0; i < n; i++) g.step(TICK_MS);
}

/** Run until the round is over (or `maxMs` of game time has passed). */
export function runToEnd(g: Game, maxMs: number): void {
  for (let t = 0; t < maxMs && g.phase === 'playing'; t += 100) run(g, 100);
}

/** Join players, force a round, and run through the countdown. Crates are disabled. */
export function startMatch(g: Game, names: string[] = ['Alice', 'Bob']): string[] {
  const ids = names.map((n) => g.join(n)!.id);
  g.restart();
  run(g, MATCH.countdownMs + 20);
  if (g.phase !== 'playing') throw new Error(`expected playing, got ${g.phase}`);
  g.w.nextCrateAt = Infinity;
  return ids;
}

export function P(g: Game, id: string): Player {
  const p = g.players.get(id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

/** Put a player's feet at (cx, feetY), at rest and airborne (lands next tick if on a platform). */
export function place(g: Game, id: string, cx: number, feetY: number): Player {
  const p = P(g, id);
  p.x = cx - PHYS.playerW / 2;
  p.y = feetY - PHYS.playerH;
  p.vx = 0;
  p.vy = 0;
  p.grounded = false;
  p.platIdx = -1;
  p.invulnUntil = 0;
  p.launchUntil = 0;
  p.boostUntil = 0;
  return p;
}

const PARKING: Record<string, [number, number]> = {
  sky: [140, 390],
  frost: [140, 360],
  temple: [130, 360],
  forge: [130, 420],
  neon: [180, 545],
};

/** Park a player somewhere out of the way (the far-left platform of the current arena). */
export function park(g: Game, id: string): Player {
  const [cx, feet] = PARKING[g.w.level.id];
  return place(g, id, cx, feet);
}

export function hold(g: Game, id: string, input: Partial<{ left: boolean; right: boolean; jump: boolean }>): void {
  g.setInput(id, { left: false, right: false, jump: false, ...input });
}
