/** The rules both sides must agree on: the server runs them, the client predicts its own body with them. */
import { BASE_SPEED, BODY_R, F_BEAST, F_BOOST, F_CONVERT, DASH_SPEED, F_DASH, F_FLUNG, F_GHOST, F_HELD, F_HURT, F_SLOW, GHOST_SPEED, GOO_SPEED, HURT_SPEED, F_OUT, F_PORTAL, ROLE, TILE } from './constants.js';
import type { GameMap } from './map.js';

export type Point = { x: number; y: number };

/** A stick pushed to `(x, y)` as a direction no longer than 1, so a diagonal is never faster. */
export function unit(x: number, y: number): Point {
  const d = Math.hypot(x, y);
  if (d < 1e-6) return { x: 0, y: 0 };
  return d > 1 ? { x: x / d, y: y / d } : { x, y };
}

/**
 * World units a second for a body with these snapshot flags. Zero while it cannot steer itself.
 * `pace` is the round's speed setting (`SPEEDS[n].x`).
 */
export function speedOf(flags: number, pace = 1): number {
  return pace * unpaced(flags);
}

/** `speedOf` at the default speed setting. */
function unpaced(flags: number): number {
  if (flags & (F_CONVERT | F_PORTAL | F_HELD | F_OUT | F_FLUNG)) return 0;
  if (flags & F_GHOST) return BASE_SPEED * GHOST_SPEED;
  const role = flags & F_BEAST ? ROLE.beast : ROLE.cousin;
  if (flags & F_DASH) return BASE_SPEED * role.speed * DASH_SPEED;
  // goo and a limp: a limping Cousin has no boost
  const drag = (flags & F_SLOW ? GOO_SPEED : 1) * (flags & F_HURT ? HURT_SPEED : 1);
  if (flags & F_HURT) return BASE_SPEED * role.speed * drag;
  return BASE_SPEED * role.speed * (flags & F_BOOST ? role.boost : 1) * drag;
}

/** No single step moves a body further than this, so it cannot skip through a wall on a slow frame. */
const MAX_STEP = BODY_R * 0.5;

/**
 * Move `p` by `(dx, dy)` world units through the house. Walls push a body back out along the
 * shortest way, so it slides along them and rounds corners instead of sticking. A ghost goes
 * `through` them, and is only kept inside the house.
 */
export function moveBody(p: Point, dx: number, dy: number, map: GameMap, through = false): void {
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return;
  if (through) {
    p.x = Math.min(map.w - TILE, Math.max(TILE, p.x + dx));
    p.y = Math.min(map.h - TILE, Math.max(TILE, p.y + dy));
    return;
  }
  const n = Math.ceil(dist / MAX_STEP);
  for (let i = 0; i < n; i++) {
    p.x += dx / n;
    p.y += dy / n;
    pushOut(p, map);
  }
}

/** The solid parts of the square at column `c`, row `r`. Off the map there is nothing: the outer wall keeps everyone in. */
function wallsAt(map: GameMap, c: number, r: number): number[][] {
  return c < 0 || r < 0 || c >= map.cols || r >= map.lines ? NONE : map.walls[r * map.cols + c];
}
const NONE: number[][] = [];

/**
 * Put a body that overlaps a wall back on the floor. Pieces of wall it meets face on are settled
 * before pieces it only touches by a corner: otherwise the seam between two pieces of one
 * straight wall would count as a corner and nudge a body sliding along it.
 */
function pushOut(p: Point, map: GameMap): void {
  for (let pass = 0; pass < 2; pass++) {
    const corners = pass === 1;
    const c0 = Math.floor((p.x - BODY_R) / TILE);
    const c1 = Math.floor((p.x + BODY_R) / TILE);
    const r0 = Math.floor((p.y - BODY_R) / TILE);
    const r1 = Math.floor((p.y + BODY_R) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const [x0, y0, x1, y1] of wallsAt(map, c, r)) {
          // the point of this piece nearest the body's centre
          const nx = Math.min(x1, Math.max(x0, p.x));
          const ny = Math.min(y1, Math.max(y0, p.y));
          const ox = p.x - nx;
          const oy = p.y - ny;
          if ((ox !== 0 && oy !== 0) !== corners) continue;
          const d = Math.hypot(ox, oy);
          if (d >= BODY_R) continue;
          if (d > 1e-6) {
            p.x = nx + (ox / d) * BODY_R;
            p.y = ny + (oy / d) * BODY_R;
          } else if (!corners) {
            // right inside a piece of wall: leave by the nearest side
            const left = p.x - x0;
            const right = x1 - p.x;
            const up = p.y - y0;
            const down = y1 - p.y;
            const m = Math.min(left, right, up, down);
            if (m === left) p.x = x0 - BODY_R;
            else if (m === right) p.x = x1 + BODY_R;
            else if (m === up) p.y = y0 - BODY_R;
            else p.y = y1 + BODY_R;
          }
        }
      }
    }
  }
}

/**
 * How far a ray from `(x, y)` along the unit direction `(dx, dy)` travels before it meets a wall,
 * capped at `max`. Walks the squares the ray crosses, one at a time, and in each tries the
 * pieces of wall that stand in it.
 */
export function rayDist(map: GameMap, x: number, y: number, dx: number, dy: number, max: number): number {
  let c = Math.floor(x / TILE);
  let r = Math.floor(y / TILE);
  const stepC = dx > 0 ? 1 : -1;
  const stepR = dy > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const tDeltaR = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tC = dx !== 0 ? ((dx > 0 ? (c + 1) * TILE - x : x - c * TILE) / Math.abs(dx)) : Infinity;
  let tR = dy !== 0 ? ((dy > 0 ? (r + 1) * TILE - y : y - r * TILE) / Math.abs(dy)) : Infinity;
  for (;;) {
    // where, if anywhere, the ray first enters a piece of wall in this square
    let hit = Infinity;
    for (const [x0, y0, x1, y1] of wallsAt(map, c, r)) {
      let near = 0;
      let far = Infinity;
      if (dx !== 0) {
        const a = (x0 - x) / dx;
        const b = (x1 - x) / dx;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      } else if (x < x0 || x > x1) continue;
      if (dy !== 0) {
        const a = (y0 - y) / dy;
        const b = (y1 - y) / dy;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      } else if (y < y0 || y > y1) continue;
      if (near <= far && near < hit) hit = near;
    }
    if (hit < Infinity) return Math.min(hit, max);
    const t = Math.min(tC, tR);
    if (t >= max) return max;
    if (tC < tR) {
      c += stepC;
      tC += tDeltaC;
    } else {
      r += stepR;
      tR += tDeltaR;
    }
    // off the map: nothing more to meet
    if (c < 0 || r < 0 || c >= map.cols || r >= map.lines) return max;
  }
}

/** Is there a clear line from `a` to `b`, no further apart than `range`? */
export function sees(map: GameMap, ax: number, ay: number, bx: number, by: number, range = Infinity): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d < 1e-6) return true;
  return rayDist(map, ax, ay, dx / d, dy / d, d) >= d;
}
