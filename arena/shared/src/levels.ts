/**
 * Arena definitions shared by the server (simulation) and the client
 * (themed rendering + lobby previews). All platforms are one-way: you can jump
 * up through them and land on their top surface. `y` is the TOP surface.
 */

import { platformPos, type PlatformDef, type ThemeId } from '@tggame/base/platformer/levels';

export { platformPos };
export type { PlatformKind, PlatformMove, PlatformDef, ThemeId } from '@tggame/base/platformer/levels';

export type LevelDef = {
  id: string;
  name: string;
  tagline: string;
  theme: ThemeId;
  /** Multiplier on gravity for this arena. */
  gravityScale: number;
  platforms: PlatformDef[];
  /** Spawn points: feet position (x center, y = platform top). Static platforms only. */
  spawns: { x: number; y: number }[];
};

export const LEVELS: LevelDef[] = [
  {
    id: 'sky',
    name: 'Sky Isles',
    tagline: 'Floating meadows and lazy lifts. A classic brawl.',
    theme: 'sky',
    gravityScale: 1,
    platforms: [
      { x: 440, y: 440, w: 400, h: 30 }, // 0 main island
      { x: 90, y: 390, w: 230, h: 28 }, // 1 left island
      { x: 960, y: 390, w: 230, h: 28 }, // 2 right island
      { x: 540, y: 590, w: 200, h: 24 }, // 3 low center
      { x: 150, y: 230, w: 150, h: 22 }, // 4 upper left
      { x: 980, y: 230, w: 150, h: 22 }, // 5 upper right
      { x: 560, y: 205, w: 160, h: 22 }, // 6 top
      { x: 335, y: 310, w: 110, h: 20, move: { ay: 60, periodMs: 2800 } },
      { x: 835, y: 310, w: 110, h: 20, move: { ay: 60, periodMs: 2800, phase: 0.5 } },
    ],
    spawns: [
      { x: 640, y: 440 },
      { x: 205, y: 390 },
      { x: 1075, y: 390 },
      { x: 225, y: 230 },
      { x: 1055, y: 230 },
      { x: 640, y: 205 },
      { x: 520, y: 440 },
      { x: 760, y: 440 },
    ],
  },
  {
    id: 'frost',
    name: 'Frostbite Peaks',
    tagline: 'Slick ice floes under the aurora. Mind your footing.',
    theme: 'frost',
    gravityScale: 1,
    platforms: [
      { x: 400, y: 470, w: 480, h: 30, kind: 'ice' }, // 0 big floe
      { x: 60, y: 360, w: 200, h: 26 }, // 1 left ledge
      { x: 1020, y: 360, w: 200, h: 26 }, // 2 right ledge
      { x: 565, y: 300, w: 150, h: 20, move: { ax: 250, periodMs: 5200 } }, // 3 glider
      { x: 220, y: 205, w: 170, h: 22, kind: 'ice' }, // 4 upper left
      { x: 890, y: 205, w: 170, h: 22, kind: 'ice' }, // 5 upper right
      { x: 170, y: 600, w: 150, h: 22 }, // 6 low left
      { x: 960, y: 600, w: 150, h: 22 }, // 7 low right
    ],
    spawns: [
      { x: 640, y: 470 },
      { x: 160, y: 360 },
      { x: 1120, y: 360 },
      { x: 305, y: 205 },
      { x: 975, y: 205 },
      { x: 500, y: 470 },
      { x: 780, y: 470 },
      { x: 245, y: 600 },
    ],
  },
  {
    id: 'temple',
    name: 'Crumbling Temple',
    tagline: 'Ancient stones give way underfoot. Keep moving!',
    theme: 'temple',
    gravityScale: 1,
    platforms: [
      { x: 470, y: 500, w: 340, h: 32 }, // 0 altar
      { x: 250, y: 430, w: 120, h: 22, kind: 'crumble' },
      { x: 910, y: 430, w: 120, h: 22, kind: 'crumble' },
      { x: 80, y: 360, w: 150, h: 26 }, // 3 left pillar
      { x: 1050, y: 360, w: 150, h: 26 }, // 4 right pillar
      { x: 420, y: 330, w: 110, h: 20, kind: 'crumble' },
      { x: 585, y: 330, w: 110, h: 20, kind: 'crumble' },
      { x: 750, y: 330, w: 110, h: 20, kind: 'crumble' },
      { x: 540, y: 185, w: 200, h: 24 }, // 8 shrine
      { x: 560, y: 640, w: 160, h: 20, kind: 'crumble' },
    ],
    spawns: [
      { x: 640, y: 500 },
      { x: 520, y: 500 },
      { x: 760, y: 500 },
      { x: 155, y: 360 },
      { x: 1125, y: 360 },
      { x: 590, y: 185 },
      { x: 690, y: 185 },
    ],
  },
  {
    id: 'forge',
    name: 'Magma Forge',
    tagline: 'Springs, shuttles and a lake of fire below.',
    theme: 'forge',
    gravityScale: 1,
    platforms: [
      { x: 500, y: 470, w: 280, h: 28 }, // 0 center grate
      { x: 295, y: 600, w: 90, h: 18, kind: 'bounce' },
      { x: 895, y: 600, w: 90, h: 18, kind: 'bounce' },
      { x: 70, y: 420, w: 200, h: 26 }, // 3 left
      { x: 1010, y: 420, w: 200, h: 26 }, // 4 right
      { x: 300, y: 285, w: 130, h: 20, move: { ax: 110, periodMs: 3200 } },
      { x: 850, y: 285, w: 130, h: 20, move: { ax: 110, periodMs: 3200, phase: 0.5 } },
      { x: 560, y: 165, w: 160, h: 22 }, // 7 top
      { x: 160, y: 215, w: 120, h: 20 }, // 8 upper left
      { x: 1000, y: 215, w: 120, h: 20 }, // 9 upper right
    ],
    spawns: [
      { x: 640, y: 470 },
      { x: 560, y: 470 },
      { x: 720, y: 470 },
      { x: 170, y: 420 },
      { x: 1110, y: 420 },
      { x: 640, y: 165 },
      { x: 220, y: 215 },
      { x: 1060, y: 215 },
    ],
  },
  {
    id: 'neon',
    name: 'Neon Void',
    tagline: 'Low gravity, orbiting platforms, big air.',
    theme: 'neon',
    gravityScale: 0.72,
    platforms: [
      { x: 490, y: 460, w: 300, h: 24 }, // 0 center
      { x: 215, y: 330, w: 130, h: 20, move: { ax: 70, ay: 70, periodMs: 4200, circle: true } },
      { x: 935, y: 330, w: 130, h: 20, move: { ax: 70, ay: 70, periodMs: 4200, phase: 0.5, circle: true } },
      { x: 120, y: 545, w: 170, h: 22 }, // 3 low left
      { x: 990, y: 545, w: 170, h: 22 }, // 4 low right
      { x: 380, y: 200, w: 140, h: 20 }, // 5 top left
      { x: 760, y: 200, w: 140, h: 20 }, // 6 top right
      { x: 600, y: 640, w: 80, h: 18, kind: 'bounce' },
    ],
    spawns: [
      { x: 640, y: 460 },
      { x: 560, y: 460 },
      { x: 720, y: 460 },
      { x: 205, y: 545 },
      { x: 1075, y: 545 },
      { x: 450, y: 200 },
      { x: 830, y: 200 },
    ],
  },
];

export function levelAt(index: number): LevelDef {
  const n = LEVELS.length;
  return LEVELS[((index % n) + n) % n];
}
