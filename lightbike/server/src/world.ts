/**
 * One round on one floor: where the lines are, who is still riding, who hit what. Pure: time
 * comes from `step()` being called once per tick, chance from the injected RNG.
 */
import {
  BOOST_GAIN,
  BOOST_SECONDS,
  BUST_COST,
  BUST_MS,
  ENERGY_REFILL_SECONDS,
  EXTRA_DECAY,
  EXTRA_MAX,
  FLAG_BOOST,
  FLAG_BUST,
  FLAG_DEAD,
  FLAG_SLIP,
  PACE_SPEED,
  POINTS_CUT_OFF,
  POINTS_OUTLIVE,
  SHRINK_AFTER_MS,
  SHRINK_EVERY_MS,
  SLIP_GAIN,
  SLIP_REACH,
  TICK_HZ,
  TICK_MS,
} from '../../shared/src/constants.js';
import { solidGrid, spawns, type Arena } from '../../shared/src/arenas.js';
import { DX, DY, queueTurn, turnHere, type Rider } from '../../shared/src/sim.js';
import type { BikeSnap, Fx, PlayerStats, Settings, TrailInit } from '../../shared/src/types.js';
import { shuffle, type Rng } from '@tggame/base/party/roster';

/** What a cell holds: 0 for nothing, `WALL`, or 1 + the index of the bike whose line runs through it. */
export const WALL = 255;

export type Bike = Rider & {
  id: string;
  idx: number;
  alive: boolean;
  /** Turns made this round. */
  turns: number;
  energy: number;
  /** Speed above the pace, as a share of it. */
  extra: number;
  /** Cells per second right now; 0 while standing. */
  speed: number;
  boosting: boolean;
  /** Left of the buster. */
  bustMs: number;
  slipping: boolean;
  /** The line: x, y pairs from the start through every corner. */
  pts: number[];
  /** Line erased (or the rider left). */
  gone: boolean;
  /** The tick it last arrived in a cell. */
  arrivedAt: number;
  /** The cell a bot last made its mind up in. */
  thought: number;
};

export class World {
  readonly w: number;
  readonly h: number;
  /** What every cell holds. */
  readonly occ: Uint8Array;
  readonly bikes: Bike[] = [];
  /** How far the rim has moved in. */
  ring = 0;
  ageMs = 0;
  tick = 0;
  /** Who is out, in the order they went: `by` is whose line it was, their own id, or '' for a wall or a head-on. */
  readonly out: { id: string; by: string }[] = [];
  /** Points earned this round. */
  readonly gained = new Map<string, number>();
  fx: Fx[] = [];

  private readonly byId = new Map<string, Bike>();
  private readonly base: number;

  constructor(
    readonly arena: Arena,
    ids: string[],
    private readonly settings: Settings,
    private readonly stats: Map<string, PlayerStats>,
    rng: Rng,
  ) {
    this.w = arena.w;
    this.h = arena.h;
    this.occ = solidGrid(arena);
    for (let i = 0; i < this.occ.length; i++) if (this.occ[i]) this.occ[i] = WALL;
    this.base = PACE_SPEED[settings.pace];
    const places = shuffle(spawns(arena, ids.length), rng);
    ids.forEach((id, idx) => {
      const [x, y, dir] = places[idx];
      const bike: Bike = {
        id, idx, x, y, dir, p: 0, queue: [], alive: true, turns: 0, energy: 1, extra: 0, speed: 0,
        boosting: false, bustMs: 0, slipping: false, pts: [x, y], gone: false, arrivedAt: 0, thought: -1,
      };
      this.bikes.push(bike);
      this.byId.set(id, bike);
      this.occ[y * this.w + x] = idx + 1;
      this.gained.set(id, 0);
    });
  }

  bike(id: string): Bike | undefined {
    return this.byId.get(id);
  }

  get alive(): number {
    let n = 0;
    for (const b of this.bikes) if (b.alive) n++;
    return n;
  }

  /** What is in a cell; everything beyond the floor is wall. */
  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? WALL : this.occ[y * this.w + x];
  }

  // ---- what riders ask for

  turn(id: string, d: number): void {
    const b = this.byId.get(id);
    if (b?.alive) queueTurn(b, d);
  }

  boost(id: string, on: boolean): void {
    const b = this.byId.get(id);
    if (b) b.boosting = on && this.settings.boost;
  }

  bust(id: string): void {
    const b = this.byId.get(id);
    if (!b?.alive || !this.settings.bust || b.bustMs > 0 || b.energy < BUST_COST) return;
    b.energy -= BUST_COST;
    b.bustMs = BUST_MS;
    this.fx.push(['b', id]);
  }

  /** A rider left the game mid-round: bike and line vanish, and nobody scores for it. */
  retire(id: string): void {
    const b = this.byId.get(id);
    if (!b || b.gone) return;
    if (b.alive) {
      b.alive = false;
      b.speed = 0;
      this.fx.push(['x', id, '', b.x, b.y]);
    }
    this.erase(b);
  }

  /** The round is decided: everything stands still. */
  stop(): void {
    for (const b of this.bikes) b.speed = 0;
  }

  // ---- one tick

  step(): void {
    this.tick++;
    this.ageMs += TICK_MS;
    this.shrink();
    const dt = 1 / TICK_HZ;
    for (const b of this.bikes) {
      if (!b.alive) continue;
      let gain = 0;
      if (b.boosting && b.energy > 0) {
        b.energy = Math.max(0, b.energy - dt / BOOST_SECONDS);
        gain += BOOST_GAIN;
      } else if (!b.boosting) b.energy = Math.min(1, b.energy + dt / ENERGY_REFILL_SECONDS);
      b.slipping = this.settings.slip && this.besideALine(b);
      if (b.slipping) {
        gain += SLIP_GAIN;
        this.stats.get(b.id)!.shaves++;
      }
      b.extra = gain > 0 ? Math.min(EXTRA_MAX, b.extra + gain * dt) : Math.max(0, b.extra - EXTRA_DECAY * dt);
      b.speed = this.base * (1 + b.extra);
      if (b.bustMs > 0) b.bustMs -= TICK_MS;
      b.p += b.speed * dt;
      while (b.alive && b.p >= 1) {
        b.p -= 1;
        this.arrive(b);
      }
    }
  }

  /** The bike reaches the next cell: crash, or claim it and take any waiting turn. */
  private arrive(b: Bike): void {
    const nx = b.x + DX[b.dir];
    const ny = b.y + DY[b.dir];
    const what = this.at(nx, ny);
    if (what === WALL) return this.crash(b, '');
    if (what && b.bustMs <= 0) {
      const other = this.bikes[what - 1];
      // two bikes into one cell, nose to nose or in the same instant: both go, and nobody gets the credit
      const headOn = other !== b && other.alive && other.x === nx && other.y === ny && (other.arrivedAt === this.tick || (other.dir + 2) % 4 === b.dir);
      if (headOn) {
        this.crash(other, '');
        return this.crash(b, '');
      }
      return this.crash(b, other.id);
    }
    b.x = nx;
    b.y = ny;
    b.arrivedAt = this.tick;
    if (!what) {
      this.occ[ny * this.w + nx] = b.idx + 1;
      this.stats.get(b.id)!.cells++;
    }
    if (turnHere(b)) {
      b.turns++;
      b.pts.push(nx, ny);
      this.fx.push(['c', b.id, nx, ny]);
    }
  }

  private crash(b: Bike, by: string): void {
    if (!b.alive) return;
    b.alive = false;
    b.speed = 0;
    b.p = 0;
    b.pts.push(b.x, b.y);
    this.fx.push(['x', b.id, by, b.x, b.y]);
    const st = this.stats.get(b.id)!;
    if (by === b.id) st.own++;
    else if (by === '') st.walls++;
    else this.score(by, POINTS_CUT_OFF, (s) => s.cuts++);
    if (this.out.length === 0) st.firsts++;
    this.out.push({ id: b.id, by });
    for (const o of this.bikes) if (o.alive) this.score(o.id, POINTS_OUTLIVE);
    if (this.settings.erase) this.erase(b);
  }

  private score(id: string, points: number, also?: (s: PlayerStats) => void): void {
    const st = this.stats.get(id);
    if (!st) return;
    st.score += points;
    also?.(st);
    this.gained.set(id, (this.gained.get(id) ?? 0) + points);
  }

  private erase(b: Bike): void {
    b.gone = true;
    const mine = b.idx + 1;
    for (let i = 0; i < this.occ.length; i++) if (this.occ[i] === mine) this.occ[i] = 0;
    this.fx.push(['e', b.id]);
  }

  /** Somebody else's line within reach on either side. A wall, or the rider's own line, blocks the view. */
  private besideALine(b: Bike): boolean {
    for (const side of [1, 3]) {
      const d = (b.dir + side) % 4;
      for (let k = 1; k <= SLIP_REACH; k++) {
        const what = this.at(b.x + DX[d] * k, b.y + DY[d] * k);
        if (!what) continue;
        if (what !== WALL && what !== b.idx + 1) return true;
        break;
      }
    }
    return false;
  }

  /** Late in a round the rim moves in, so no round lasts for ever. */
  private shrink(): void {
    const due = Math.floor((this.ageMs - SHRINK_AFTER_MS) / SHRINK_EVERY_MS) + 1;
    if (due <= this.ring || this.ring >= Math.floor(Math.min(this.w, this.h) / 2)) return;
    const k = this.ring++;
    for (let x = k; x < this.w - k; x++) {
      this.occ[k * this.w + x] = WALL;
      this.occ[(this.h - 1 - k) * this.w + x] = WALL;
    }
    for (let y = k; y < this.h - k; y++) {
      this.occ[y * this.w + k] = WALL;
      this.occ[y * this.w + this.w - 1 - k] = WALL;
    }
    this.fx.push(['s', this.ring]);
    for (const b of this.bikes) if (b.alive && this.occ[b.y * this.w + b.x] === WALL) this.crash(b, '');
  }

  // ---- what goes over the wire

  bikeList(): BikeSnap[] {
    return this.bikes
      .filter((b) => b.alive || !b.gone)
      .map((b) => [
        b.id,
        b.x,
        b.y,
        b.dir,
        Math.round(b.p * 100),
        Math.round(b.speed * 10),
        (b.alive ? 0 : FLAG_DEAD) | (b.alive && b.boosting && b.energy > 0 ? FLAG_BOOST : 0) | (b.bustMs > 0 ? FLAG_BUST : 0) | (b.slipping ? FLAG_SLIP : 0),
        Math.round(b.energy * 100),
        b.turns,
      ]);
  }

  trails(): TrailInit[] {
    return this.bikes.filter((b) => !b.gone).map((b) => [b.id, b.alive ? 0 : 1, [...b.pts]]);
  }

  drainFx(): Fx[] {
    const fx = this.fx;
    this.fx = [];
    return fx;
  }
}
