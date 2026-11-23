import { WORLD } from '../../shared/src/constants.js';

export type PlatformDef = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical oscillation (moving platforms). */
  move?: { amplitude: number; periodMs: number; phase: number };
};

export type SpawnPoint = { x: number; y: number };

/**
 * Hand-crafted arena: floating one-way platforms over a pit.
 * y values are the platform TOP surface.
 */
export const PLATFORMS: PlatformDef[] = [
  // main center island
  { x: 470, y: 420, w: 340, h: 26 },
  // left island
  { x: 70, y: 380, w: 220, h: 26 },
  // right island
  { x: 990, y: 380, w: 220, h: 26 },
  // low center (danger)
  { x: 520, y: 560, w: 240, h: 24 },
  // upper-left small
  { x: 100, y: 210, w: 150, h: 22 },
  // upper-right small
  { x: 1030, y: 210, w: 150, h: 22 },
  // top center
  { x: 560, y: 190, w: 160, h: 22 },
  // moving side platforms
  { x: 300, y: 320, w: 130, h: 22, move: { amplitude: 55, periodMs: 2600, phase: 0 } },
  { x: 850, y: 320, w: 130, h: 22, move: { amplitude: 55, periodMs: 2600, phase: 0.5 } },
];

/** Pre-arranged spawn points, ordered so early joiners spread across the arena. */
export const SPAWNS: SpawnPoint[] = [
  { x: 630, y: 420 }, // center
  { x: 175, y: 380 }, // left
  { x: 1095, y: 380 }, // right
  { x: 615, y: 560 }, // low center
  { x: 175, y: 210 }, // upper-left
  { x: 1103, y: 210 }, // upper-right
  { x: 640, y: 190 }, // top center
  { x: 365, y: 320 }, // moving-left
  { x: 915, y: 320 }, // moving-right
  { x: 505, y: 420 }, // center-left
  { x: 770, y: 420 }, // center-right
  { x: 110, y: 380 }, // left-edge
  { x: 1150, y: 380 }, // right-edge
  { x: 330, y: 560 }, // low-left
  { x: 950, y: 560 }, // low-right
  { x: 640, y: 190 }, // top-center duplicate offset
];

/** Horizontal margin from the world edges so players can't hide behind the rim. */
export const EDGE_MARGIN = 8;

export const KILL_Y = WORLD.killY;
