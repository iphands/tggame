/** Finding a way through the house, for the bots: steps from one square to every other. */
import { TILE } from '../../shared/src/constants.js';
import { wallAt, type GameMap } from '../../shared/src/map.js';

/** Marks a square that cannot be reached. */
export const FAR = 0xffff;

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export const tileOf = (v: number): number => Math.floor(v / TILE);

/** Steps (up, down, left, right) from the square holding `(x, y)` to every square of the map. */
export function stepsFrom(map: GameMap, x: number, y: number): Uint16Array {
  const dist = new Uint16Array(map.cols * map.lines).fill(FAR);
  const c0 = tileOf(x);
  const r0 = tileOf(y);
  if (wallAt(map, c0, r0)) return dist;
  const queue = new Int32Array(map.cols * map.lines);
  let head = 0;
  let tail = 0;
  queue[tail++] = r0 * map.cols + c0;
  dist[r0 * map.cols + c0] = 0;
  while (head < tail) {
    const at = queue[head++];
    const c = at % map.cols;
    const r = (at - c) / map.cols;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (wallAt(map, nc, nr)) continue;
      const next = nr * map.cols + nc;
      if (dist[next] !== FAR) continue;
      dist[next] = dist[at] + 1;
      queue[tail++] = next;
    }
  }
  return dist;
}

/** How many steps `field` says the square holding `(x, y)` is from its source. */
export function stepsAt(map: GameMap, field: Uint16Array, x: number, y: number): number {
  const c = tileOf(x);
  const r = tileOf(y);
  return wallAt(map, c, r) ? FAR : field[r * map.cols + c];
}

/**
 * The way to push the stick from `(x, y)` to get one square nearer the source of `field`
 * (or straight at `(tx, ty)` once in its square). Zero when there is no way.
 */
export function towards(map: GameMap, field: Uint16Array, x: number, y: number, tx: number, ty: number): { x: number; y: number } {
  const c = tileOf(x);
  const r = tileOf(y);
  const here = stepsAt(map, field, x, y);
  if (here === FAR) return { x: 0, y: 0 };
  let gx = tx;
  let gy = ty;
  if (here > 0) {
    let best = here;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (wallAt(map, nc, nr)) continue;
      const d = field[nr * map.cols + nc];
      if (d < best) {
        best = d;
        gx = (nc + 0.5) * TILE;
        gy = (nr + 0.5) * TILE;
      }
    }
  }
  const dx = gx - x;
  const dy = gy - y;
  const d = Math.hypot(dx, dy);
  return d < 2 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
}
