/**
 * One laid table and the holes on it: movement, suction, swallowing, shoving and spills.
 * Pure and deterministic: time comes from `step`, chance from the RNG it is given.
 */
import {
  BOUNCE,
  EAT_INSET,
  FEAST_MASS,
  FLAG_GRAVITY,
  FLAG_SLOW,
  FLAG_TURBO,
  FRICTION,
  GRAVITY_ACCEL,
  GRAVITY_MS,
  GRAVITY_REACH,
  MAX_FOOD_R,
  MAX_FOOD_SPEED,
  POWERS,
  PRIZE,
  PRIZE_RESPAWN_MS,
  PULL_ACCEL,
  PULL_REACH,
  PUSH_KEEP,
  PUSH_MEMORY_MS,
  RESPAWN_MS,
  ROTTEN,
  ROTTEN_RESPAWN_MS,
  SLEEP_SPEED,
  SLOW_MS,
  SPILL_PENALTY_MS,
  SWALLOW_MS,
  TEAM_SHARE,
  TICK_MS,
  TIERS,
  TURBO_MS,
  itemRadius,
  speedFactor,
} from '../../shared/src/constants.js';
import { canEat, holeRadius, holeStart, moveHole } from '../../shared/src/sim.js';
import type { FoodInit, FoodMove, Fx, HoleSnap, PlayerStats } from '../../shared/src/types.js';
import type { Course, Rng } from './course.js';

export const ON = 0;
export const CAPTURED = 1;
export const FALLEN = 2;
export const GONE = 3;

export type Food = {
  id: number;
  tier: number;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: number;
  /** Still moving; sleeping food is skipped by the physics. */
  awake: boolean;
  /** Moved since the last snapshot. */
  dirty: boolean;
  /** Index of the hole swallowing it. */
  captor: number;
  capMs: number;
  /** Who last shoved it (directly or through other food), and when. */
  pusher: string;
  pushedAt: number;
  respawnAt: number;
};

export type Hole = {
  id: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  mass: number;
  r: number;
  /** 0, or 1 + the index in `POWERS` of the power it is carrying. */
  held: number;
  /** World time until which each effect lasts. */
  slowUntil: number;
  turboUntil: number;
  gravityUntil: number;
};

const CELL = 128;
const DT_S = TICK_MS / 1000;
const DAMP = Math.exp(-FRICTION * DT_S);
const round1 = (n: number): number => Math.round(n * 10) / 10;

export class World {
  readonly w: number;
  readonly h: number;
  readonly holes: Hole[] = [];
  readonly foods: Food[] = [];
  /** Milliseconds simulated on this table. */
  t = 0;
  /** Food not yet eaten (food that fell off still counts). */
  left: number;
  spills = 0;
  /** Clock time lost to spills and not yet charged. */
  penaltyMs = 0;
  fx: Fx[] = [];

  private readonly cols: number;
  private readonly rows: number;
  /** Spatial grid as linked lists: first food in each cell, next food in the same cell. */
  private readonly cellHead: Int32Array;
  private readonly cellNext: Int32Array;
  private turn = 0;

  constructor(
    course: Course,
    playerIds: readonly string[],
    private readonly stats: Map<string, PlayerStats>,
  ) {
    this.w = course.w;
    this.h = course.h;
    playerIds.forEach((id, i) => {
      const p = holeStart(i, playerIds.length, this.w, this.h);
      this.holes.push({ id, x: p.x, y: p.y, ax: p.x, ay: p.y, mass: 0, r: holeRadius(0), held: 0, slowUntil: 0, turboUntil: 0, gravityUntil: 0 });
    });
    course.foods.forEach((f, id) => {
      this.foods.push({
        id,
        tier: f.tier,
        r: itemRadius(f.tier),
        x: f.x,
        y: f.y,
        vx: 0,
        vy: 0,
        state: ON,
        awake: false,
        dirty: false,
        captor: -1,
        capMs: 0,
        pusher: '',
        pushedAt: -Infinity,
        respawnAt: 0,
      });
    });
    this.left = this.foods.filter((f) => f.tier < TIERS.length).length;
    this.cols = Math.ceil(this.w / CELL) + 1;
    this.rows = Math.ceil(this.h / CELL) + 1;
    this.cellHead = new Int32Array(this.cols * this.rows);
    this.cellNext = new Int32Array(this.foods.length);
  }

  hole(id: string): Hole | undefined {
    return this.holes.find((h) => h.id === id);
  }

  setAim(id: string, x: number, y: number): void {
    const hole = this.hole(id);
    if (!hole) return;
    hole.ax = Math.min(this.w, Math.max(0, x));
    hole.ay = Math.min(this.h, Math.max(0, y));
  }

  /** Someone left for good. What they ate goes to the biggest hole left, so the table stays clearable. */
  removeHole(id: string): void {
    const i = this.holes.findIndex((h) => h.id === id);
    if (i < 0) return;
    const [gone] = this.holes.splice(i, 1);
    for (const f of this.foods) {
      if (f.state !== CAPTURED) continue;
      if (f.captor === i) {
        f.state = ON;
        f.captor = -1;
        f.dirty = true;
      } else if (f.captor > i) f.captor--;
    }
    const heir = this.holes.reduce<Hole | null>((best, h) => (!best || h.mass > best.mass ? h : best), null);
    if (heir) this.grow(heir, gone.mass);
  }

  /** The `FLAG_…` bits for what is acting on a hole right now. */
  flagsOf(hole: Hole): number {
    return (hole.slowUntil > this.t ? FLAG_SLOW : 0) | (hole.turboUntil > this.t ? FLAG_TURBO : 0) | (hole.gravityUntil > this.t ? FLAG_GRAVITY : 0);
  }

  /** Set off the power a hole is carrying. Returns false when it has none. */
  usePower(id: string): boolean {
    const hole = this.hole(id);
    if (!hole || !hole.held) return false;
    const power = hole.held - 1;
    hole.held = 0;
    switch (POWERS[power]) {
      case 'gravity':
        hole.gravityUntil = this.t + GRAVITY_MS;
        break;
      case 'turbo':
        hole.turboUntil = this.t + TURBO_MS;
        break;
      case 'feast':
        for (const other of this.holes) this.grow(other, other === hole ? FEAST_MASS : FEAST_MASS * TEAM_SHARE);
        break;
    }
    this.fx.push(['p', hole.id, power]);
    return true;
  }

  /** Holes glide to their aim points; nothing else happens (the countdown). */
  moveHoles(): void {
    for (const hole of this.holes) moveHole(hole, this.w, this.h, DT_S, speedFactor(this.flagsOf(hole)));
  }

  /** One tick of play. */
  step(rng: Rng): void {
    this.t += TICK_MS;
    this.moveHoles();
    this.buildGrid();
    this.holesMeetFood();
    this.swallow(rng);
    this.moveFood();
    this.spillAndRespawn(rng);
  }

  // ---- the tick, in order

  private cellOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * this.cols + cx;
  }

  private buildGrid(): void {
    this.cellHead.fill(-1);
    for (let i = 0; i < this.foods.length; i++) {
      const f = this.foods[i];
      if (f.state !== ON) continue;
      const c = this.cellOf(f.x, f.y);
      this.cellNext[i] = this.cellHead[c];
      this.cellHead[c] = i;
    }
  }

  /** Calls `visit` with the index of every food on the table whose cell touches the box round (x, y). */
  private near(x: number, y: number, reach: number, visit: (i: number) => void): void {
    const x0 = Math.max(0, Math.floor((x - reach) / CELL));
    const x1 = Math.min(this.cols - 1, Math.floor((x + reach) / CELL));
    const y0 = Math.max(0, Math.floor((y - reach) / CELL));
    const y1 = Math.min(this.rows - 1, Math.floor((y + reach) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.cellHead[cy * this.cols + cx]; i >= 0; i = this.cellNext[i]) visit(i);
      }
    }
  }

  private holesMeetFood(): void {
    const n = this.holes.length;
    // a different hole gets first go each tick, so a tie over one berry is not always won by the same player
    this.turn++;
    for (let k = 0; k < n; k++) {
      const hi = (k + this.turn) % n;
      const hole = this.holes[hi];
      // Super Gravity: the same pull, from much further off and harder
      const strong = hole.gravityUntil > this.t;
      const pull = hole.r * PULL_REACH * (strong ? GRAVITY_REACH : 1);
      const accel = PULL_ACCEL * (strong ? GRAVITY_ACCEL : 1);
      this.near(hole.x, hole.y, hole.r + pull + MAX_FOOD_R, (i) => {
        const f = this.foods[i];
        if (f.state !== ON) return;
        const dx = f.x - hole.x;
        const dy = f.y - hole.y;
        const d = Math.hypot(dx, dy);
        if (canEat(hole.r, f.r)) {
          if (d <= hole.r - f.r * EAT_INSET) {
            f.state = CAPTURED;
            f.captor = hi;
            f.capMs = 0;
            f.vx = f.vy = 0;
            this.fx.push(['e', f.id, hole.id]);
          } else if (f.tier !== ROTTEN && d < hole.r + f.r + pull) {
            // (a rotten fish is never drawn in: it only goes down a hole that runs over it)
            const a = (accel * DT_S) / d;
            f.vx -= dx * a;
            f.vy -= dy * a;
            f.awake = true;
          }
          return;
        }
        // too big to fall in: the rim shoves it along
        const over = hole.r + f.r - d;
        if (over <= 0) return;
        const nx = d > 0.001 ? dx / d : 1;
        const ny = d > 0.001 ? dy / d : 0;
        f.x += nx * over;
        f.y += ny * over;
        const vn = f.vx * nx + f.vy * ny;
        const want = Math.min(MAX_FOOD_SPEED, (over / DT_S) * PUSH_KEEP);
        if (vn < want) {
          f.vx += (want - vn) * nx;
          f.vy += (want - vn) * ny;
        }
        f.awake = f.dirty = true;
        f.pusher = hole.id;
        f.pushedAt = this.t;
      });
    }
  }

  private swallow(rng: Rng): void {
    for (const f of this.foods) {
      if (f.state !== CAPTURED) continue;
      const hole = this.holes[f.captor];
      f.capMs += TICK_MS;
      if (f.capMs < SWALLOW_MS) continue;
      if (f.tier >= TIERS.length) {
        // not food: it does its thing to the hole and turns up again somewhere else later
        f.state = FALLEN;
        f.pusher = '';
        if (f.tier === PRIZE) {
          hole.held = 1 + Math.floor(rng() * POWERS.length);
          f.respawnAt = this.t + PRIZE_RESPAWN_MS;
        } else {
          hole.slowUntil = this.t + SLOW_MS;
          f.respawnAt = this.t + ROTTEN_RESPAWN_MS;
        }
        continue;
      }
      f.state = GONE;
      this.left--;
      const value = TIERS[f.tier].value;
      for (const other of this.holes) this.grow(other, other === hole ? value : value * TEAM_SHARE);
      const eater = this.stats.get(hole.id);
      if (eater) {
        eater.eaten++;
        eater.biggest = Math.max(eater.biggest, f.tier);
      }
      if (f.pusher && f.pusher !== hole.id && this.t - f.pushedAt <= PUSH_MEMORY_MS) {
        const herder = this.stats.get(f.pusher);
        if (herder) herder.herds++;
      }
    }
  }

  private grow(hole: Hole, by: number): void {
    hole.mass += by;
    hole.r = holeRadius(hole.mass);
  }

  private moveFood(): void {
    for (let i = 0; i < this.foods.length; i++) {
      const f = this.foods[i];
      if (f.state !== ON || !f.awake) continue;
      let speed = Math.hypot(f.vx, f.vy);
      if (speed > MAX_FOOD_SPEED) {
        f.vx *= MAX_FOOD_SPEED / speed;
        f.vy *= MAX_FOOD_SPEED / speed;
        speed = MAX_FOOD_SPEED;
      }
      if (speed < SLEEP_SPEED) {
        f.vx = f.vy = 0;
        f.awake = false;
        continue;
      }
      f.x += f.vx * DT_S;
      f.y += f.vy * DT_S;
      f.vx *= DAMP;
      f.vy *= DAMP;
      f.dirty = true;
      this.near(f.x, f.y, f.r + MAX_FOOD_R, (j) => {
        if (j !== i) this.collide(f, this.foods[j]);
      });
    }
  }

  /** Two pieces of food overlapping: push them apart by weight and pass some speed on. */
  private collide(a: Food, b: Food): void {
    if (b.state !== ON) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2);
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    const ma = a.r * a.r;
    const mb = b.r * b.r;
    const over = min - d;
    a.x -= nx * over * (mb / (ma + mb));
    a.y -= ny * over * (mb / (ma + mb));
    b.x += nx * over * (ma / (ma + mb));
    b.y += ny * over * (ma / (ma + mb));
    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing < 0) {
      const j = (-(1 + BOUNCE) * closing) / (1 / ma + 1 / mb);
      a.vx -= (j / ma) * nx;
      a.vy -= (j / ma) * ny;
      b.vx += (j / mb) * nx;
      b.vy += (j / mb) * ny;
    }
    b.awake = b.dirty = a.dirty = true;
    if (a.pushedAt > b.pushedAt) {
      b.pusher = a.pusher;
      b.pushedAt = a.pushedAt;
    }
  }

  private spillAndRespawn(rng: Rng): void {
    for (const f of this.foods) {
      if (f.state === ON) {
        if (f.x >= 0 && f.y >= 0 && f.x <= this.w && f.y <= this.h) continue;
        f.state = FALLEN;
        f.vx = f.vy = 0;
        f.awake = false;
        f.respawnAt = this.t + RESPAWN_MS;
        const by = this.t - f.pushedAt <= PUSH_MEMORY_MS ? f.pusher : '';
        f.pusher = '';
        f.pushedAt = -Infinity;
        if (f.tier >= TIERS.length) {
          // a box or a fish knocked off by other food is nobody's loss: it just comes back
          this.fx.push(['s', f.id, '']);
          continue;
        }
        this.spills++;
        this.penaltyMs += SPILL_PENALTY_MS;
        const clumsy = this.stats.get(by);
        if (clumsy) clumsy.spills++;
        this.fx.push(['s', f.id, by]);
      } else if (f.state === FALLEN && this.t >= f.respawnAt) {
        const spot = this.freeSpot(f.r, rng);
        f.x = spot.x;
        f.y = spot.y;
        f.state = ON;
        f.dirty = false;
        this.fx.push(['r', f.id, f.x, f.y, f.tier]);
      }
    }
  }

  /** Somewhere on the table clear of the edge, the holes and the other food (or the best found). */
  private freeSpot(r: number, rng: Rng): { x: number; y: number } {
    const inset = r + 60;
    let spot = { x: this.w / 2, y: this.h / 2 };
    for (let attempt = 0; attempt < 30; attempt++) {
      spot = { x: round1(inset + rng() * (this.w - 2 * inset)), y: round1(inset + rng() * (this.h - 2 * inset)) };
      const { x, y } = spot;
      if (this.holes.some((h) => Math.hypot(h.x - x, h.y - y) < h.r + r + 40)) continue;
      if (this.foods.some((f) => f.state === ON && Math.hypot(f.x - x, f.y - y) < f.r + r + 3)) continue;
      break;
    }
    return spot;
  }

  // ---- what goes over the wire

  /** The table as it stands: every piece of food still on it. */
  foodList(): FoodInit[] {
    const list: FoodInit[] = [];
    for (const f of this.foods) if (f.state === ON) list.push([f.id, f.tier, round1(f.x), round1(f.y)]);
    return list;
  }

  holeList(): HoleSnap[] {
    return this.holes.map((h) => [h.id, round1(h.x), round1(h.y), round1(h.r), this.flagsOf(h), h.held]);
  }

  /** Food that moved since this was last called. */
  drainMoves(): FoodMove[] {
    const list: FoodMove[] = [];
    for (const f of this.foods) {
      if (!f.dirty) continue;
      f.dirty = false;
      if (f.state === ON) list.push([f.id, round1(f.x), round1(f.y)]);
    }
    return list;
  }

  drainFx(): Fx[] {
    const fx = this.fx;
    this.fx = [];
    return fx;
  }
}
