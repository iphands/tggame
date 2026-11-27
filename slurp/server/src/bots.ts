/** Hungry helpers: a bot heads for the nearest thing it can swallow. Also steers a human's hole while they are away. */
import { PRIZE, ROTTEN } from '../../shared/src/constants.js';
import { canEat } from '../../shared/src/sim.js';
import { ON, type Hole, type World } from './world.js';

export type Rng = () => number;

export const BOT_NAMES = ['Gulp', 'Nibbles', 'Crumb', 'Munch', 'Chomp', 'Snackers', 'Guzzle', 'Morsel', 'Scoff', 'Noodle', 'Pudding', 'Biscuit'];

/** Bots never aim further ahead than this, which keeps them a little slower than a keen human. */
const REACH = 150;

/** Point `hole` at its next bite; with nothing it can eat yet, it drifts about the middle of the table. */
export function botAim(world: World, hole: Hole, rng: Rng): void {
  let best = Infinity;
  let tx = 0;
  let ty = 0;
  for (const f of world.foods) {
    // a bot never goes for a rotten fish, and wants a prize box only while its hands are empty
    if (f.state !== ON || !canEat(hole.r, f.r) || f.tier === ROTTEN || (f.tier === PRIZE && hole.held)) continue;
    const d = Math.hypot(f.x - hole.x, f.y - hole.y);
    // other holes are after the same food: go for what is nearer to you than to them
    let score = d;
    for (const other of world.holes) {
      if (other !== hole && Math.hypot(f.x - other.x, f.y - other.y) < d) score += 120;
    }
    if (score < best) {
      best = score;
      tx = f.x;
      ty = f.y;
    }
  }
  if (best === Infinity) {
    if (Math.hypot(hole.ax - hole.x, hole.ay - hole.y) > 20) return; // still drifting
    tx = world.w * (0.3 + rng() * 0.4);
    ty = world.h * (0.3 + rng() * 0.4);
  }
  const dx = tx - hole.x;
  const dy = ty - hole.y;
  const d = Math.hypot(dx, dy);
  const k = d > REACH ? REACH / d : 1;
  world.setAim(hole.id, hole.x + dx * k, hole.y + dy * k);
}
