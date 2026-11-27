/** How a bike rides when nobody is steering it: a bot's, or a human's who dropped off. */
import { BOT_BLUNDER, BOT_LOOK_CELLS, BOT_WHIM, BUST_COST } from '../../shared/src/constants.js';
import { DX, DY } from '../../shared/src/sim.js';
import type { Rng } from '@tggame/base/party/roster';
import type { Bike, World } from './world.js';

export type { Rng };

// scratch for the flood fill, grown to fit the biggest floor seen
let seen = new Uint32Array(0);
let queue = new Int32Array(0);
let stamp = 0;

/** How many free cells can be reached from (x, y), counting up to `cap`. `block` is a cell to treat as taken. */
export function room(world: World, x: number, y: number, block: number, cap = BOT_LOOK_CELLS): number {
  const { w, h, occ } = world;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const start = y * w + x;
  if (occ[start] || start === block) return 0;
  if (seen.length < occ.length) {
    seen = new Uint32Array(occ.length);
    queue = new Int32Array(occ.length);
  }
  stamp++;
  seen[start] = stamp;
  if (block >= 0) seen[block] = stamp;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail && tail < cap) {
    const c = queue[head++];
    const cx = c % w;
    if (cx > 0 && !occ[c - 1] && seen[c - 1] !== stamp) (seen[c - 1] = stamp), (queue[tail++] = c - 1);
    if (cx < w - 1 && !occ[c + 1] && seen[c + 1] !== stamp) (seen[c + 1] = stamp), (queue[tail++] = c + 1);
    if (c >= w && !occ[c - w] && seen[c - w] !== stamp) (seen[c - w] = stamp), (queue[tail++] = c - w);
    if (c < occ.length - w && !occ[c + w] && seen[c + w] !== stamp) (seen[c + w] = stamp), (queue[tail++] = c + w);
  }
  return tail;
}

/** Free cells in a straight line from (x, y), not counting it. */
function runAhead(world: World, x: number, y: number, dir: number, cap: number): number {
  let n = 0;
  while (n < cap && !world.at(x + DX[dir] * (n + 1), y + DY[dir] * (n + 1))) n++;
  return n;
}

/** A cell marked, while a bot thinks, as about to be ridden into by somebody else. */
const SOON = 254;

/** The best of straight on, left and right out of the cell at (nx, ny), and how good it is (-1: all blocked). */
function choose(world: World, b: Bike, nx: number, ny: number, next: number, tx: number, ty: number, whim: boolean, rng: Rng): [number, number] {
  let best = b.dir;
  let bestScore = -1;
  for (const turn of [0, 3, 1]) {
    const d = (b.dir + turn) % 4;
    const fx = nx + DX[d];
    const fy = ny + DY[d];
    let score = room(world, fx, fy, next);
    if (score === 0) continue;
    // a cell next to another bike is a coin toss
    for (const o of world.bikes) if (o !== b && o.alive && Math.abs(o.x - fx) + Math.abs(o.y - fy) <= 1) score *= 0.5;
    // straight on unless turning is clearly better (or, now and then, on a whim)
    if (turn === 0 && !whim) score *= 1.1;
    // a forced choice goes whichever way closes in on the rival
    if (tx >= 0) score *= 1 + 0.04 * Math.sign(Math.abs(tx - nx) + Math.abs(ty - ny) - (Math.abs(tx - fx) + Math.abs(ty - fy)));
    score *= 1 + rng() * 0.03;
    if (score > bestScore) [bestScore, best] = [score, d];
  }
  return [best, bestScore];
}

/**
 * Decide what this bike does in the cell it is about to reach: carry on, or turn to wherever
 * there is most room. With room to spare it leans toward cutting across the nearest rival.
 */
export function pilot(world: World, b: Bike, rng: Rng): void {
  const nx = b.x + DX[b.dir];
  const ny = b.y + DY[b.dir];
  const next = ny * world.w + nx;
  if (b.thought === next) return;
  b.thought = next;
  b.queue.length = 0;

  const ahead = world.at(nx, ny);
  if (ahead) {
    // about to hit something: the buster is the only way out, and only through a line
    if (ahead !== 255) world.bust(b.id);
    return;
  }
  const run = runAhead(world, nx, ny, b.dir, 14);
  world.boost(b.id, run >= 12 && b.energy > (b.boosting ? 0.15 : 0.6));
  if (rng() < BOT_BLUNDER) return; // not looking

  // the nearest rival, and the spot a few cells in front of them
  let tx = -1;
  let ty = -1;
  let near = 26;
  for (const o of world.bikes) {
    if (o === b || !o.alive) continue;
    const d = Math.abs(o.x - nx) + Math.abs(o.y - ny);
    if (d < near) {
      near = d;
      tx = o.x + DX[o.dir] * 5;
      ty = o.y + DY[o.dir] * 5;
    }
  }

  const whim = rng() < BOT_WHIM;
  // where the others will be in a moment is as good as taken
  const held: number[] = [];
  for (const o of world.bikes) {
    if (o === b || !o.alive) continue;
    for (let k = 1; k <= 2; k++) {
      const cx = o.x + DX[o.dir] * k;
      const cy = o.y + DY[o.dir] * k;
      if (world.at(cx, cy)) break;
      world.occ[cy * world.w + cx] = SOON;
      held.push(cy * world.w + cx);
    }
  }
  let [best, bestScore] = choose(world, b, nx, ny, next, tx, ty, whim, rng);
  for (const c of held) world.occ[c] = 0;
  // nothing but those: better a cell somebody might take than a wall
  if (bestScore < 0 && held.length) [best, bestScore] = choose(world, b, nx, ny, next, tx, ty, whim, rng);
  if (bestScore < 0) {
    // boxed in on every side: go through a line if there is one to go through
    if (b.energy >= BUST_COST) world.bust(b.id);
    return;
  }
  if (best !== b.dir) b.queue.push({ d: best, at: 0 });
}
