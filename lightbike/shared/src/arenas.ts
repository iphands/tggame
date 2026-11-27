/** The floors: how big, where the blocks are, and where everybody starts. */
import { DX, DY } from './sim.js';

/** `[x, y, w, h]` in cells. */
export type Rect = [number, number, number, number];
/** `[x, y, dir]` */
export type Spawn = [number, number, number];

export type Arena = {
  /** Index into `ARENA_NAMES`. */
  no: number;
  name: string;
  w: number;
  h: number;
  blocks: Rect[];
};

type Plan = { name: string; blocks: (w: number, h: number) => Rect[] };

/** A rect given as shares of the floor, snapped to whole cells. */
const part = (w: number, h: number, x: number, y: number, bw: number, bh: number): Rect => [
  Math.round(w * x),
  Math.round(h * y),
  Math.max(2, Math.round(w * bw)),
  Math.max(2, Math.round(h * bh)),
];

const PLANS: Plan[] = [
  { name: 'Open Floor', blocks: () => [] },
  {
    name: 'Pillars',
    blocks: (w, h) => [0.22, 0.47, 0.72].flatMap((x) => [0.24, 0.66].map((y) => part(w, h, x, y, 0.06, 0.1))),
  },
  { name: 'The Donut', blocks: (w, h) => [part(w, h, 0.36, 0.34, 0.28, 0.32)] },
  {
    name: 'Four Rooms',
    // a cross of walls with a doorway in each arm, and the middle left open
    blocks: (w, h) => {
      const cx = Math.round(w / 2) - 1;
      const cy = Math.round(h / 2) - 1;
      return [
        [cx, 0, 2, Math.round(h * 0.16)],
        [cx, Math.round(h * 0.3), 2, Math.round(h * 0.1)],
        [cx, Math.round(h * 0.6), 2, Math.round(h * 0.1)],
        [cx, h - Math.round(h * 0.16), 2, Math.round(h * 0.16)],
        [0, cy, Math.round(w * 0.16), 2],
        [Math.round(w * 0.3), cy, Math.round(w * 0.1), 2],
        [Math.round(w * 0.6), cy, Math.round(w * 0.1), 2],
        [w - Math.round(w * 0.16), cy, Math.round(w * 0.16), 2],
      ];
    },
  },
  {
    name: 'Pinch Point',
    blocks: (w, h) => [part(w, h, 0.42, 0, 0.16, 0.36), part(w, h, 0.42, 0.64, 0.16, 0.36)],
  },
];

export const ARENA_NAMES = PLANS.map((p) => p.name);

/** The floor grows with the number of riders. */
export function makeArena(no: number, riders: number): Arena {
  const plan = PLANS[((no % PLANS.length) + PLANS.length) % PLANS.length];
  const w = 56 + 8 * Math.max(2, riders);
  const h = Math.round(w * 0.625);
  return { no: PLANS.indexOf(plan), name: plan.name, w, h, blocks: plan.blocks(w, h) };
}

/** A grid with 1 wherever a block stands. */
export function solidGrid(a: Arena): Uint8Array {
  const grid = new Uint8Array(a.w * a.h);
  for (const [bx, by, bw, bh] of a.blocks) {
    for (let y = Math.max(0, by); y < Math.min(a.h, by + bh); y++) grid.fill(1, y * a.w + Math.max(0, bx), y * a.w + Math.min(a.w, bx + bw));
  }
  return grid;
}

/** Free cells straight ahead of (x, y), up to `cap`. */
function clearAhead(a: Arena, solid: Uint8Array, x: number, y: number, dir: number, cap: number): number {
  let n = 0;
  for (; n < cap; n++) {
    x += DX[dir];
    y += DY[dir];
    if (x < 0 || y < 0 || x >= a.w || y >= a.h || solid[y * a.w + x]) break;
  }
  return n;
}

/**
 * Starting places for `n` riders: evenly round an oval, each pointing wherever it has the longest
 * clear run (which is across the floor, never at the nearest wall).
 */
export function spawns(a: Arena, n: number): Spawn[] {
  const solid = solidGrid(a);
  const out: Spawn[] = [];
  for (let i = 0; i < n; i++) {
    const angle = ((i + 0.25) / n) * Math.PI * 2;
    let x = Math.round(a.w / 2 + Math.cos(angle) * a.w * 0.38);
    let y = Math.round(a.h / 2 + Math.sin(angle) * a.h * 0.36);
    // a block in the way: step toward the rim until clear of it
    while (solid[y * a.w + x] && x > 2 && x < a.w - 3) x += x < a.w / 2 ? -1 : 1;
    let best = 0;
    let run = -1;
    for (let d = 0; d < 4; d++) {
      const clear = clearAhead(a, solid, x, y, d, a.w);
      if (clear > run) [run, best] = [clear, d];
    }
    out.push([x, y, best]);
  }
  return out;
}
