/**
 * Bots for both sides. A bot knows only what a player in its place could see: it chases or runs
 * from bodies in its line of sight, and otherwise goes by the map. Also drives a human's body
 * while they are disconnected.
 */
import { ENERGY_MAX, PORTAL_R, SIGHT_R, TASK_R, TILE } from '../../shared/src/constants.js';
import type { Spot } from '../../shared/src/map.js';
import { sees } from '../../shared/src/sim.js';
import { FAR, stepsAt, stepsFrom, towards } from './path.js';
import { type Body, type Rng, type World } from './world.js';

export const BOT_NAMES = ['Agnes', 'Barnaby', 'Clementine', 'Dudley', 'Edith', 'Fergus', 'Gertie', 'Horace', 'Ida', 'Jasper', 'Mabel', 'Ned', 'Olive', 'Percy'];

/** A Beast bot dashes when a Cousin is this near. */
const DASH_AT = 130;
/** A Cousin bot runs from a Beast it can see within this distance. */
const DANGER = 360;
/** How long a Cousin bot keeps running after it loses sight of the Beast. */
const KEEP_RUNNING_MS = 3000;
/** How long a Beast bot heads for the place it last saw a Cousin. */
const REMEMBER_MS = 2500;

type Mind = {
  /** Where it is heading when it has nothing better to do. */
  goal: Spot | null;
  /** Where a Beast bot last saw a Cousin, and how long ago. */
  seen: Spot | null;
  seenMs: number;
  /** Where a Beast bot heard a chore being worked on. */
  heard: Spot | null;
  /** Where a Cousin bot is running to, and for how much longer it keeps running once the Beast is out of sight. */
  flee: Spot | null;
  fleeMs: number;
};

export class Bots {
  private minds = new Map<string, Mind>();

  /** Beast bots hear what Beasts hear. Call with each noise event. */
  hear(x: number, y: number): void {
    for (const m of this.minds.values()) m.heard = { x, y };
  }

  /** Decide what `b` does until the next think, `dtMs` after the last one. */
  think(world: World, b: Body, rng: Rng, dtMs: number): void {
    let mind = this.minds.get(b.id);
    if (!mind) this.minds.set(b.id, (mind = { goal: null, seen: null, seenMs: 0, heard: null, flee: null, fleeMs: 0 }));
    if (b.out) return;
    if (b.ghost) return this.haunt(world, b, mind, rng);
    if (b.role === 'beast') this.beast(world, b, mind, rng, dtMs);
    else this.cousin(world, b, mind, rng, dtMs);
  }

  /** A ghost bot drifts from room to room, straight through the walls. */
  private haunt(world: World, b: Body, mind: Mind, rng: Rng): void {
    if (!mind.goal || Math.hypot(mind.goal.x - b.x, mind.goal.y - b.y) < TILE) {
      const spots = [...world.map.pills, ...world.map.tasks];
      mind.goal = spots[Math.floor(rng() * spots.length)];
    }
    const d = Math.hypot(mind.goal.x - b.x, mind.goal.y - b.y) || 1;
    world.setInput(b.id, ((mind.goal.x - b.x) / d) * 0.6, ((mind.goal.y - b.y) / d) * 0.6, false, false);
  }

  private go(world: World, b: Body, to: Spot, boost = false, act = false): void {
    const field = stepsFrom(world.map, to.x, to.y);
    const dir = towards(world.map, field, b.x, b.y, to.x, to.y);
    world.setInput(b.id, dir.x, dir.y, boost, act);
  }

  private beast(world: World, b: Body, mind: Mind, rng: Rng, dtMs: number): void {
    const map = world.map;
    let prey: Body | null = null;
    let near = Infinity;
    for (const c of world.cousins()) {
      const d = Math.hypot(c.x - b.x, c.y - b.y);
      if (d < near && sees(map, b.x, b.y, c.x, c.y, SIGHT_R)) {
        prey = c;
        near = d;
      }
    }
    mind.seenMs += dtMs;
    if (prey) {
      mind.seen = { x: prey.x, y: prey.y };
      mind.seenMs = 0;
      mind.heard = null;
      // straight at it: there is no wall between
      const dx = (prey.x - b.x) / near;
      const dy = (prey.y - b.y) / near;
      const dash = near < DASH_AT && b.dashWaitMs <= 0;
      // the button must come up between dashes for the next press to count
      world.setInput(b.id, dx, dy, near > 140 && near < 340, dash && !b.actHeld);
      return;
    }
    if (mind.seen && mind.seenMs < REMEMBER_MS && Math.hypot(mind.seen.x - b.x, mind.seen.y - b.y) > TILE) {
      this.go(world, b, mind.seen);
      return;
    }
    mind.seen = null;
    if (mind.heard) {
      if (Math.hypot(mind.heard.x - b.x, mind.heard.y - b.y) > TILE * 2) return this.go(world, b, mind.heard);
      mind.heard = null;
    }
    // patrol: the places Cousins want to be
    if (!mind.goal || Math.hypot(mind.goal.x - b.x, mind.goal.y - b.y) < TILE) {
      const spots = [...map.pills, ...world.tasks.filter((t) => t.progress < 1), ...(world.exitsOpen ? map.exits : [])];
      mind.goal = spots[Math.floor(rng() * spots.length)];
    }
    this.go(world, b, mind.goal);
  }

  private cousin(world: World, b: Body, mind: Mind, rng: Rng, dtMs: number): void {
    const map = world.map;
    let threat: Body | null = null;
    let near = DANGER;
    for (const beast of world.beasts()) {
      if (beast.portalMs > 0) continue;
      const d = Math.hypot(beast.x - b.x, beast.y - b.y);
      if (d < near && sees(map, b.x, b.y, beast.x, beast.y, SIGHT_R)) {
        threat = beast;
        near = d;
      }
    }
    if (threat) {
      // run for the spot that is furthest from the Beast for what it costs to get there
      const fromBeast = stepsFrom(map, threat.x, threat.y);
      const fromMe = stepsFrom(map, b.x, b.y);
      let best: Spot | null = null;
      let bestScore = -Infinity;
      for (const s of [...map.pills, ...map.cousinStarts, ...map.tasks, ...map.exits]) {
        const mine = stepsAt(map, fromMe, s.x, s.y);
        const theirs = stepsAt(map, fromBeast, s.x, s.y);
        // never run to a spot the Beast reaches first
        if (mine === FAR || theirs <= mine) continue;
        const score = theirs - mine * 0.6;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      mind.goal = null;
      mind.flee = best;
      mind.fleeMs = KEEP_RUNNING_MS;
      if (best) return this.go(world, b, best, near < 190);
      // cornered: straight away from it
      world.setInput(b.id, (b.x - threat.x) / near, (b.y - threat.y) / near, true, false);
      return;
    }

    // out of sight is not out of danger: keep going a while rather than walk straight back
    if (mind.flee && mind.fleeMs > 0) {
      mind.fleeMs -= dtMs;
      if (Math.hypot(mind.flee.x - b.x, mind.flee.y - b.y) > TILE) return this.go(world, b, mind.flee);
    }
    mind.flee = null;

    const nearest = (spots: Spot[]): Spot | null => {
      const field = stepsFrom(map, b.x, b.y);
      let best: Spot | null = null;
      let bestD = FAR;
      for (const s of spots) {
        const d = stepsAt(map, field, s.x, s.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    };

    if (world.mode === 'escape') {
      if (world.exitsOpen) {
        const exit = nearest(map.exits);
        if (exit) return this.go(world, b, exit, true);
      }
      if (b.energy >= 40 || !world.pills.some((p) => p.on)) {
        const task = nearest(world.tasks.filter((t) => t.progress < 1));
        if (task) return this.work(world, b, task, TASK_R);
      }
    }
    // top up, or just keep moving
    if (b.energy < ENERGY_MAX) {
      const pill = nearest(world.pills.filter((p) => p.on));
      if (pill) return this.go(world, b, pill);
    }
    if (!mind.goal || Math.hypot(mind.goal.x - b.x, mind.goal.y - b.y) < TILE) {
      const spots = [...map.pills, ...map.cousinStarts];
      mind.goal = spots[Math.floor(rng() * spots.length)];
    }
    this.go(world, b, mind.goal);
  }

  /** Walk to a chore, then stand and hold the action. */
  private work(world: World, b: Body, at: Spot, r: number): void {
    if (Math.hypot(at.x - b.x, at.y - b.y) <= r - PORTAL_R) world.setInput(b.id, 0, 0, false, true);
    else this.go(world, b, at);
  }
}
