/** The rules both sides must agree on: the server runs them, the client predicts its own hole with them. */
import { EAT_RATIO, GROW_K, HOLE_FOLLOW, HOLE_R0, HOLE_SPEED, TIERS } from './constants.js';

export function holeRadius(mass: number): number {
  return HOLE_R0 * Math.sqrt(1 + mass / GROW_K);
}

/** The mass at which a hole's radius reaches `r`. */
export function massForRadius(r: number): number {
  return Math.max(0, ((r / HOLE_R0) ** 2 - 1) * GROW_K);
}

export function canEat(holeR: number, foodR: number): boolean {
  return foodR <= holeR * EAT_RATIO;
}

/** The mass a hole needs before it can eat `tier`. */
export function massForTier(tier: number): number {
  return massForRadius(TIERS[tier].r / EAT_RATIO);
}

/** How many tiers (counted from the smallest) a hole of radius `holeR` can eat. */
export function tiersEdible(holeR: number): number {
  let n = 0;
  while (n < TIERS.length && canEat(holeR, TIERS[n].r)) n++;
  return n;
}

export type Mover = { x: number; y: number; ax: number; ay: number };

/** Move a hole toward its aim point for `dtS` seconds, staying on a `w` by `h` table. `speed` scales its top speed. */
export function moveHole(m: Mover, w: number, h: number, dtS: number, speed = 1): void {
  const dx = m.ax - m.x;
  const dy = m.ay - m.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.01) {
    const step = Math.min(d, Math.min(HOLE_SPEED * speed, d * HOLE_FOLLOW) * dtS);
    m.x += (dx / d) * step;
    m.y += (dy / d) * step;
  }
  m.x = Math.min(w, Math.max(0, m.x));
  m.y = Math.min(h, Math.max(0, m.y));
}

/** Where player `i` of `n` starts: a ring round the middle of the table. */
export function holeStart(i: number, n: number, w: number, h: number): { x: number; y: number } {
  if (n === 1) return { x: w / 2, y: h / 2 };
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  const ring = startRing(n);
  return { x: w / 2 + Math.cos(a) * ring, y: h / 2 + Math.sin(a) * ring };
}

export const startRing = (n: number): number => (n === 1 ? 0 : 40 + 14 * n);
