/**
 * Course definitions shared by the server (simulation) and the client
 * (themed rendering + lobby previews). Platforms are one-way: you can jump
 * up through them and land on their top surface. `y` is the TOP surface.
 * Boxes and gates are solid on every side.
 */
import { COURSES } from './courses.js';

import { platformPos, type PlatformDef, type ThemeId } from '@tggame/base/platformer/levels';

export { platformPos };
export type { PlatformKind, PlatformMove, PlatformDef, ThemeId } from '@tggame/base/platformer/levels';

export type LevelDef = {
  id: string;
  name: string;
  tagline: string;
  theme: ThemeId;
  /** Multiplier on gravity for this course. */
  gravityScale: number;
  /** Total course width in px. The screen stops scrolling at `length - ARENA.width`. */
  length: number;
  /** Crossing this x finishes the run. */
  finishX: number;
  /** platforms[0] is the start pad. */
  platforms: PlatformDef[];
  boxes: BoxDef[];
  /** Co-op chokepoints, sorted by x. */
  gates: GateDef[];
  /** Start positions: feet position (x center, y = platform top). Static platforms only. */
  spawns: { x: number; y: number }[];
};

/**
 * A solid block. With `hp` it can be shot apart; without, it's a permanent obstacle.
 * `arms` marks a blue weapon box: breaking it hands every runner the same weapon.
 */
export type BoxDef = { x: number; y: number; w: number; h: number; hp?: number; arms?: true };

/** A wall across the whole screen height with one pooled health bar: everyone shoots it down together. */
export type GateDef = { x: number; w: number };

export const LEVELS: LevelDef[] = COURSES;


export function levelAt(index: number, levels: LevelDef[] = LEVELS): LevelDef {
  const n = levels.length;
  return levels[((index % n) + n) % n];
}

/**
 * Safe places to drop a runner back in: feet positions along static, plain
 * platforms that no box sits on, sorted left to right.
 */
export function safeSpots(level: LevelDef): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  for (const pl of level.platforms) {
    const kind = pl.kind ?? 'normal';
    if (pl.move || kind === 'crumble' || kind === 'bounce' || pl.w < 110) continue;
    const n = Math.max(1, Math.floor((pl.w - 80) / 70));
    for (let i = 0; i < n; i++) {
      const x = pl.x + 40 + ((pl.w - 80) * (i + 0.5)) / n;
      const blocked =
        level.boxes.some((b) => x + 40 > b.x && x - 40 < b.x + b.w && b.y < pl.y && b.y + b.h > pl.y - 60) ||
        level.gates.some((g) => x + 60 > g.x && x - 60 < g.x + g.w);
      if (!blocked) spots.push({ x, y: pl.y });
    }
  }
  return spots.sort((a, b) => a.x - b.x);
}
