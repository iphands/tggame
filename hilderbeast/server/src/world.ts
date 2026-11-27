/**
 * One round in the house: bodies, boosts, pills, lunges and catches, Beast doors, chores and
 * exits. Pure: time comes from `step()`, chance from the RNG handed in.
 */
import {
  BEAST_BOOST_COOLDOWN_MS,
  BEAST_BOOST_MS,
  CATCH_COOLDOWN_MS,
  CATCH_R,
  CONVERT_MS,
  DREAD_FULL_R,
  DREAD_R,
  DREAD_STEPS,
  ENERGY_DRAIN_PER_S,
  ENERGY_MAX,
  ENERGY_START,
  ENERGY_TO_START,
  ESCAPE_HOLD_MS,
  EXIT_R,
  F_BEAST,
  F_BOOST,
  F_CONVERT,
  F_DASH,
  F_HELD,
  F_MISS,
  F_OUT,
  F_PORTAL,
  F_WINDUP,
  F_WORK,
  HEAD_START_MS,
  HELP_RATE,
  LUNGE_DASH_MS,
  LUNGE_MISS_MS,
  LUNGE_WINDUP_MS,
  NOISE_BLUR,
  NOISE_EVERY_MS,
  PILL_BACK_MS,
  PILL_ENERGY,
  PILL_R,
  PORTAL_COOLDOWN_MS,
  PORTAL_R,
  PORTAL_TRANSIT_MS,
  TASK_R,
  TASK_WORK_MS,
  TICK_MS,
} from '../../shared/src/constants.js';
import { MAP, type GameMap, type Spot } from '../../shared/src/map.js';
import { moveBody, sees, speedOf, unit } from '../../shared/src/sim.js';
import type { Catch, Fx, Mode, Role } from '../../shared/src/types.js';

export type Rng = () => number;

/** Where a Beast is in its lunge. */
export enum Lunge {
  None,
  Windup,
  Dash,
  Miss,
}

export type Body = {
  id: string;
  role: Role;
  x: number;
  y: number;
  /** The way it faces: the last way it moved. A lunge goes this way. */
  fx: number;
  fy: number;
  /** The controls as last heard: stick, boost button, action button. */
  ix: number;
  iy: number;
  boostHeld: boolean;
  actHeld: boolean;
  /** The buttons as they were on the last tick, so a press is seen once. */
  boostWas: boolean;
  actWas: boolean;
  /** A Cousin's energy. */
  energy: number;
  /** True while a boost is on (either role). */
  boosting: boolean;
  /** A Beast's burst: time left of it, and time until the next one. */
  boostMs: number;
  boostWaitMs: number;
  lunge: Lunge;
  /** Time left of the current lunge stage. */
  lungeMs: number;
  /** Time until this Beast may lunge again. */
  lungeWaitMs: number;
  /** Time left frozen while turning into a Beast. */
  convertMs: number;
  /** Time left out of sight between two Beast doors, and until the next trip. */
  portalMs: number;
  portalWaitMs: number;
  /** Time left held in the den. */
  heldMs: number;
  /** The chore (index into the round's list) or exit being worked at. */
  working: boolean;
  /** How long this Cousin has held the action at an open exit. */
  escapeMs: number;
  /** Got out: no longer in the house. */
  out: boolean;
};

export type Pill = Spot & { on: boolean; backMs: number };
export type Task = Spot & {
  /** Its index among the map's chore spots. */
  spot: number;
  /** 0 to 1. */
  progress: number;
  workers: number;
  /** Time until the Beasts next hear it; they hear it at once when work starts after a quiet spell. */
  noiseMs: number;
};

export class World {
  readonly bodies: Body[] = [];
  readonly pills: Pill[];
  readonly tasks: Task[];
  exitsOpen = false;
  /** Everything that happened since the last `drainFx()`. */
  fx: Fx[] = [];
  readonly catches: Catch[] = [];
  readonly escaped: string[] = [];
  /** Time played, countdown not included. */
  timeMs = 0;
  /** Bumped whenever somebody changes side, so the game knows to tell everyone. */
  sidesRev = 0;

  constructor(
    readonly mode: Mode,
    ids: string[],
    readonly firstBeast: string,
    /** Indices into the map's chore spots; ignored outside Escape. */
    taskSpots: number[],
    readonly map: GameMap = MAP,
  ) {
    let seat = 0;
    for (const id of ids) {
      const beast = id === firstBeast;
      const at = beast || !map.cousinStarts.length ? map.den : map.cousinStarts[seat++ % map.cousinStarts.length];
      this.bodies.push({
        id,
        role: beast ? 'beast' : 'cousin',
        x: at.x,
        y: at.y,
        fx: 0,
        fy: 1,
        ix: 0,
        iy: 0,
        boostHeld: false,
        actHeld: false,
        boostWas: false,
        actWas: false,
        energy: ENERGY_START,
        boosting: false,
        boostMs: 0,
        boostWaitMs: 0,
        lunge: Lunge.None,
        lungeMs: 0,
        lungeWaitMs: 0,
        convertMs: 0,
        portalMs: 0,
        portalWaitMs: 0,
        heldMs: beast ? HEAD_START_MS : 0,
        working: false,
        escapeMs: 0,
        out: false,
      });
    }
    this.pills = map.pills.map((p) => ({ ...p, on: true, backMs: 0 }));
    this.tasks = mode === 'escape' ? taskSpots.map((spot) => ({ ...map.tasks[spot], spot, progress: 0, workers: 0, noiseMs: 0 })) : [];
  }

  body(id: string): Body | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  /** Cousins still in the house. */
  cousins(): Body[] {
    return this.bodies.filter((b) => b.role === 'cousin' && !b.out);
  }

  beasts(): Body[] {
    return this.bodies.filter((b) => b.role === 'beast');
  }

  /** The controls of one player, as last heard. The stick is cut down to length 1. */
  setInput(id: string, x: number, y: number, boost: boolean, act: boolean): void {
    const b = this.body(id);
    if (!b) return;
    const u = unit(x, y);
    b.ix = u.x;
    b.iy = u.y;
    b.boostHeld = boost;
    b.actHeld = act;
  }

  /** A player left for good. If that was the last Beast, a Cousin takes its place. */
  remove(id: string, rng: Rng): void {
    const i = this.bodies.findIndex((b) => b.id === id);
    if (i < 0) return;
    this.bodies.splice(i, 1);
    this.sidesRev++;
    if (this.beasts().length === 0) {
      const left = this.cousins();
      if (left.length > 1) this.convert(left[Math.floor(rng() * left.length)], '');
    }
  }

  // ---- one tick

  step(rng: Rng): void {
    this.timeMs += TICK_MS;
    for (const b of this.bodies) this.stepBody(b);
    this.catchCousins();
    this.stepPills();
    if (this.mode === 'escape') {
      this.stepTasks(rng);
      this.stepExits();
    }
    for (const b of this.bodies) {
      b.boostWas = b.boostHeld;
      b.actWas = b.actHeld;
    }
  }

  /** May this body act on its own right now? */
  private free(b: Body): boolean {
    return !b.out && b.convertMs <= 0 && b.portalMs <= 0 && b.heldMs <= 0;
  }

  private stepBody(b: Body): void {
    if (b.out) return;
    const dtS = TICK_MS / 1000;
    if (b.heldMs > 0) b.heldMs -= TICK_MS;
    if (b.boostWaitMs > 0) b.boostWaitMs -= TICK_MS;
    if (b.lungeWaitMs > 0) b.lungeWaitMs -= TICK_MS;
    if (b.portalWaitMs > 0) b.portalWaitMs -= TICK_MS;
    if (b.convertMs > 0) {
      b.convertMs -= TICK_MS;
      if (b.convertMs <= 0) this.fx.push(['b', b.id]);
      return;
    }
    if (b.portalMs > 0) {
      b.portalMs -= TICK_MS;
      if (b.portalMs <= 0) b.portalWaitMs = PORTAL_COOLDOWN_MS;
      return;
    }
    if (b.heldMs > 0) return;

    if (b.role === 'beast') this.stepBeast(b);
    else this.stepCousinBoost(b, dtS);

    const moving = b.ix !== 0 || b.iy !== 0;
    if (moving && b.lunge !== Lunge.Dash && b.lunge !== Lunge.Windup) {
      const d = Math.hypot(b.ix, b.iy);
      b.fx = b.ix / d;
      b.fy = b.iy / d;
    }
    const speed = speedOf(this.flags(b));
    if (b.lunge === Lunge.Dash) moveBody(b, b.fx * speed * dtS, b.fy * speed * dtS, this.map);
    else if (moving && speed > 0) moveBody(b, b.ix * speed * dtS, b.iy * speed * dtS, this.map);

    if (b.role === 'beast' && b.lunge === Lunge.None) this.enterPortal(b);
  }

  private stepCousinBoost(b: Body, dtS: number): void {
    const moving = b.ix !== 0 || b.iy !== 0;
    if (b.boosting) {
      if (!b.boostHeld || b.energy <= 0) b.boosting = false;
    } else if (b.boostHeld && b.energy >= ENERGY_TO_START) {
      b.boosting = true;
    }
    // standing still with the button down costs nothing
    if (b.boosting && moving) b.energy = Math.max(0, b.energy - ENERGY_DRAIN_PER_S * dtS);
  }

  private stepBeast(b: Body): void {
    // the burst
    if (b.boostMs > 0) {
      b.boostMs -= TICK_MS;
      if (b.boostMs <= 0) b.boosting = false;
    } else if (b.boostHeld && !b.boostWas && b.boostWaitMs <= 0 && b.lunge === Lunge.None) {
      b.boosting = true;
      b.boostMs = BEAST_BOOST_MS;
      b.boostWaitMs = BEAST_BOOST_COOLDOWN_MS;
    }
    // the lunge
    if (b.lunge !== Lunge.None) {
      b.lungeMs -= TICK_MS;
      if (b.lungeMs <= 0) {
        if (b.lunge === Lunge.Windup) {
          b.lunge = Lunge.Dash;
          b.lungeMs = LUNGE_DASH_MS;
        } else if (b.lunge === Lunge.Dash) {
          // nobody caught
          b.lunge = Lunge.Miss;
          b.lungeMs = LUNGE_MISS_MS;
        } else {
          b.lunge = Lunge.None;
        }
      }
    } else if (b.actHeld && !b.actWas && b.lungeWaitMs <= 0) {
      b.lunge = Lunge.Windup;
      b.lungeMs = LUNGE_WINDUP_MS;
      b.boosting = false;
      b.boostMs = 0;
      this.fx.push(['l', b.id]);
    }
  }

  /** Every dashing Beast catches the nearest Cousin in reach with no wall between. One each. */
  private catchCousins(): void {
    for (const beast of this.bodies) {
      if (beast.role !== 'beast' || beast.lunge !== Lunge.Dash) continue;
      let best: Body | null = null;
      let bestD = CATCH_R;
      // `<` keeps the earlier seat on a tie, so the outcome never depends on chance
      for (const c of this.bodies) {
        if (c.role !== 'cousin' || c.out) continue;
        const d = Math.hypot(c.x - beast.x, c.y - beast.y);
        if (d < bestD && sees(this.map, beast.x, beast.y, c.x, c.y)) {
          best = c;
          bestD = d;
        }
      }
      if (!best) continue;
      beast.lunge = Lunge.None;
      beast.lungeMs = 0;
      beast.lungeWaitMs = CATCH_COOLDOWN_MS;
      this.convert(best, beast.id);
    }
  }

  /** A Cousin becomes a Beast: frozen for a moment, then hunting. */
  private convert(c: Body, by: string): void {
    if (c.role !== 'cousin') return;
    c.role = 'beast';
    c.convertMs = CONVERT_MS;
    c.boosting = false;
    c.boostMs = 0;
    c.boostWaitMs = 0;
    c.lungeWaitMs = 0;
    c.working = false;
    c.escapeMs = 0;
    this.sidesRev++;
    this.catches.push({ by, who: c.id, atMs: Math.round(this.timeMs) });
    this.fx.push(['c', by, c.id, Math.round(c.x), Math.round(c.y)]);
  }

  private enterPortal(b: Body): void {
    if (b.portalWaitMs > 0) return;
    const ends = this.map.portals;
    for (let i = 0; i < ends.length; i++) {
      if (Math.hypot(ends[i].x - b.x, ends[i].y - b.y) > PORTAL_R) continue;
      const to = i ^ 1;
      b.x = ends[to].x;
      b.y = ends[to].y;
      b.portalMs = PORTAL_TRANSIT_MS;
      b.boosting = false;
      b.boostMs = 0;
      this.fx.push(['t', b.id, i, to]);
      return;
    }
  }

  private stepPills(): void {
    this.pills.forEach((pill, i) => {
      if (!pill.on) {
        pill.backMs -= TICK_MS;
        if (pill.backMs <= 0) pill.on = true;
        return;
      }
      // the first Cousin in seat order takes it; a full Cousin leaves it for someone else
      for (const b of this.bodies) {
        if (b.role !== 'cousin' || b.out || b.energy >= ENERGY_MAX) continue;
        if (Math.hypot(pill.x - b.x, pill.y - b.y) > PILL_R) continue;
        b.energy = Math.min(ENERGY_MAX, b.energy + PILL_ENERGY);
        pill.on = false;
        pill.backMs = PILL_BACK_MS;
        this.fx.push(['p', i, b.id]);
        return;
      }
    });
  }

  /** A Cousin works by standing still with the action held. */
  private atWork(b: Body, spot: Spot, r: number): boolean {
    return b.role === 'cousin' && this.free(b) && b.actHeld && b.ix === 0 && b.iy === 0 && Math.hypot(spot.x - b.x, spot.y - b.y) <= r;
  }

  private stepTasks(rng: Rng): void {
    for (const b of this.bodies) b.working = false;
    this.tasks.forEach((task, i) => {
      if (task.progress >= 1) return;
      const workers = this.bodies.filter((b) => this.atWork(b, task, TASK_R));
      task.workers = workers.length;
      if (task.noiseMs > 0) task.noiseMs -= TICK_MS;
      if (!workers.length) return;
      for (const b of workers) b.working = true;
      task.progress = Math.min(1, task.progress + (TICK_MS / TASK_WORK_MS) * (1 + HELP_RATE * (workers.length - 1)));
      if (task.noiseMs <= 0) {
        task.noiseMs = NOISE_EVERY_MS;
        const a = rng() * Math.PI * 2;
        const d = rng() * NOISE_BLUR;
        this.fx.push(['n', Math.round(task.x + Math.cos(a) * d), Math.round(task.y + Math.sin(a) * d), workers.length]);
      }
      if (task.progress >= 1) {
        task.workers = 0;
        this.fx.push(['d', i]);
        if (this.tasks.every((t) => t.progress >= 1)) {
          this.exitsOpen = true;
          this.fx.push(['o']);
        }
      }
    });
  }

  private stepExits(): void {
    if (!this.exitsOpen) return;
    for (const b of this.bodies) {
      if (b.role !== 'cousin' || b.out) continue;
      if (this.map.exits.some((e) => this.atWork(b, e, EXIT_R))) {
        b.working = true;
        b.escapeMs += TICK_MS;
        if (b.escapeMs >= ESCAPE_HOLD_MS) {
          b.out = true;
          b.working = false;
          this.escaped.push(b.id);
          this.sidesRev++;
          this.fx.push(['x', b.id]);
        }
      } else {
        b.escapeMs = 0;
      }
    }
  }

  // ---- what others may know

  flags(b: Body): number {
    let f = 0;
    if (b.role === 'beast') f |= F_BEAST;
    if (b.boosting && (b.role === 'beast' || b.ix !== 0 || b.iy !== 0)) f |= F_BOOST;
    if (b.lunge === Lunge.Windup) f |= F_WINDUP;
    else if (b.lunge === Lunge.Dash) f |= F_DASH;
    else if (b.lunge === Lunge.Miss) f |= F_MISS;
    if (b.convertMs > 0) f |= F_CONVERT;
    if (b.portalMs > 0) f |= F_PORTAL;
    if (b.working) f |= F_WORK;
    if (b.heldMs > 0) f |= F_HELD;
    if (b.out) f |= F_OUT;
    return f;
  }

  /**
   * How near the nearest Beast is to this Cousin, 0 (none within `DREAD_R`) to `DREAD_STEPS`
   * (on top of them). Walls do not matter: this is a feeling, not a sighting. A Beast still in
   * its den or still turning is no threat yet and does not count.
   */
  dread(b: Body): number {
    if (b.role !== 'cousin' || b.out) return 0;
    let near = DREAD_R;
    for (const o of this.bodies) {
      if (o.role !== 'beast' || o.heldMs > 0 || o.convertMs > 0) continue;
      near = Math.min(near, Math.hypot(o.x - b.x, o.y - b.y));
    }
    const k = (DREAD_R - near) / (DREAD_R - DREAD_FULL_R);
    return Math.round(Math.min(1, Math.max(0, k)) * DREAD_STEPS);
  }

  /** Bit `i` set while pill `i` is there. */
  pillBits(): number {
    let bits = 0;
    this.pills.forEach((p, i) => {
      if (p.on) bits |= 1 << i;
    });
    return bits;
  }

  drainFx(): Fx[] {
    const fx = this.fx;
    this.fx = [];
    return fx;
  }
}
