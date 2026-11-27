/**
 * One round in the house: bodies, boosts, pills, catches by touch, Beast doors, chores and
 * exits. Pure: time comes from `step()`, chance from the RNG handed in.
 */
import {
  BEAST_BOOST_COOLDOWN_MS,
  BEAST_BOOST_MS,
  CATCH_COOLDOWN_MS,
  CONVERT_MS,
  CREAK_EVERY_MS,
  DASH_COOLDOWN_MS,
  DASH_MS,
  DREAD_FULL_R,
  DREAD_R,
  DREAD_STEPS,
  ENERGY_DRAIN_PER_S,
  ENERGY_MAX,
  ENERGY_START,
  ENERGY_TO_START,
  EXIT_R,
  F_BEAST,
  F_BOOST,
  F_CONVERT,
  F_DASH,
  F_GHOST,
  F_HELD,
  F_HURT,
  F_OUT,
  F_PORTAL,
  F_SCARE_SHIFT,
  F_SLOW,
  F_WORK,
  HEAD_START_MS,
  HELP_RATE,
  HURT_MS,
  NOISE_BLUR,
  NOISE_EVERY_MS,
  PILL_BACK_MS,
  PILL_ENERGY,
  PILL_R,
  PORTALS_ON,
  PORTAL_COOLDOWN_MS,
  PORTAL_R,
  PORTAL_TRANSIT_MS,
  SCARE_MAX,
  SPIKE_ENERGY,
  TASK_R,
  TASK_WORK_MS,
  TICK_MS,
  TILE,
  TOUCH_R,
} from '../../shared/src/constants.js';
import { SPIKES_UP, T_CREAK, T_GOO, T_SPIKE, kindAt, spikesAt, type GameMap, type Spot } from '../../shared/src/map.js';
import { moveBody, sees, speedOf, unit } from '../../shared/src/sim.js';
import type { Catch, Fx, Mode, Role } from '../../shared/src/types.js';

export type Rng = () => number;

export type Body = {
  id: string;
  role: Role;
  x: number;
  y: number;
  /** The way it faces: the last way it moved. */
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
  /** A Beast's dash: time left of it, and time until the next one. */
  dashMs: number;
  dashWaitMs: number;
  /** Time until this Beast's touch catches again. */
  catchWaitMs: number;
  /** Time left frozen while turning into a Beast. */
  convertMs: number;
  /** Time left out of sight between two Beast doors, and until the next trip. */
  portalMs: number;
  portalWaitMs: number;
  /** Time left held in the den. */
  heldMs: number;
  /** Working at a chore right now. */
  working: boolean;
  /** A Cousin in goo right now. */
  slow: boolean;
  /** Time left limping after the spikes; while it lasts they cannot hurt again. */
  hurtMs: number;
  /** Time until this Cousin can set off another creaky board. */
  creakMs: number;
  /** Got out: no longer in the house. */
  out: boolean;
  /** Caught in Escape: still a Cousin by side, but a ghost. Roams through walls, touches nothing, and only watches. */
  ghost: boolean;
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
  /** The one way out (Escape). */
  readonly exit: Spot;
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
    readonly map: GameMap,
    /** Where the first Beast starts. */
    beastAt: Spot = map.den,
    /** Which of the map's exit spots is the way out this round. There is only ever the one. */
    exitNo = 0,
  ) {
    let seat = 0;
    for (const id of ids) {
      const beast = id === firstBeast;
      const at = beast || !map.cousinStarts.length ? beastAt : map.cousinStarts[seat++ % map.cousinStarts.length];
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
        dashMs: 0,
        dashWaitMs: 0,
        catchWaitMs: 0,
        convertMs: 0,
        portalMs: 0,
        portalWaitMs: 0,
        heldMs: beast ? HEAD_START_MS : 0,
        working: false,
        slow: false,
        hurtMs: 0,
        creakMs: 0,
        out: false,
        ghost: false,
      });
    }
    this.exit = map.exits[exitNo % Math.max(1, map.exits.length)] ?? map.den;
    this.pills = map.pills.map((p) => ({ ...p, on: true, backMs: 0 }));
    this.tasks = mode === 'escape' ? taskSpots.map((spot) => ({ ...map.tasks[spot], spot, progress: 0, workers: 0, noiseMs: 0 })) : [];
  }

  body(id: string): Body | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  /** Cousins still in the house. */
  cousins(): Body[] {
    return this.bodies.filter((b) => b.role === 'cousin' && !b.out && !b.ghost);
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
      // whatever the mode, somebody has to be the Beast
      if (left.length > 1) this.turn(left[Math.floor(rng() * left.length)], '');
    }
  }

  // ---- one tick

  step(rng: Rng): void {
    this.timeMs += TICK_MS;
    for (const b of this.bodies) this.stepBody(b);
    this.stepTraps();
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
    if (b.dashWaitMs > 0) b.dashWaitMs -= TICK_MS;
    if (b.catchWaitMs > 0) b.catchWaitMs -= TICK_MS;
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

    if (b.ghost) {
      // a ghost only drifts: no boosts, no doors, and walls are nothing to it
      if (b.ix !== 0 || b.iy !== 0) {
        const speed = speedOf(F_GHOST);
        moveBody(b, b.ix * speed * dtS, b.iy * speed * dtS, this.map, true);
      }
      return;
    }

    if (b.role === 'beast') this.stepBeast(b);
    else this.stepCousinBoost(b, dtS);

    const moving = b.ix !== 0 || b.iy !== 0;
    if (moving) {
      const d = Math.hypot(b.ix, b.iy);
      b.fx = b.ix / d;
      b.fy = b.iy / d;
    }
    const speed = speedOf(this.flags(b));
    if (moving && speed > 0) moveBody(b, b.ix * speed * dtS, b.iy * speed * dtS, this.map);

    if (b.role === 'beast') this.enterPortal(b);
  }

  private stepCousinBoost(b: Body, dtS: number): void {
    const moving = b.ix !== 0 || b.iy !== 0;
    if (b.boosting) {
      if (!b.boostHeld || b.energy <= 0 || b.hurtMs > 0) b.boosting = false;
    } else if (b.boostHeld && b.energy >= ENERGY_TO_START && b.hurtMs <= 0) {
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
    } else if (b.boostHeld && !b.boostWas && b.boostWaitMs <= 0) {
      b.boosting = true;
      b.boostMs = BEAST_BOOST_MS;
      b.boostWaitMs = BEAST_BOOST_COOLDOWN_MS;
    }
    // the dash: the smaller boost, on the action button
    if (b.dashMs > 0) b.dashMs -= TICK_MS;
    else if (b.actHeld && !b.actWas && b.dashWaitMs <= 0) {
      b.dashMs = DASH_MS;
      b.dashWaitMs = DASH_COOLDOWN_MS;
      this.fx.push(['l', b.id]);
    }
  }

  /** A Beast that touches a Cousin, with no wall between, has caught them. One each per tick. */
  private catchCousins(): void {
    for (const beast of this.bodies) {
      if (beast.role !== 'beast' || beast.catchWaitMs > 0 || !this.free(beast)) continue;
      let best: Body | null = null;
      let bestD = TOUCH_R;
      // `<` keeps the earlier seat on a tie, so the outcome never depends on chance
      for (const c of this.bodies) {
        if (c.role !== 'cousin' || c.out || c.ghost) continue;
        const d = Math.hypot(c.x - beast.x, c.y - beast.y);
        if (d < bestD && sees(this.map, beast.x, beast.y, c.x, c.y)) {
          best = c;
          bestD = d;
        }
      }
      if (!best) continue;
      beast.catchWaitMs = CATCH_COOLDOWN_MS;
      this.convert(best, beast.id);
    }
  }

  /**
   * A Cousin has been caught. In Last Cousin Standing they become a Beast; in Escape there is only
   * ever the one Beast, and they become a ghost.
   */
  private convert(c: Body, by: string): void {
    if (c.role !== 'cousin' || c.out || c.ghost) return;
    if (this.mode !== 'escape') return this.turn(c, by);
    c.ghost = true;
    c.boosting = false;
    c.working = false;
    this.sidesRev++;
    this.catches.push({ by, who: c.id, atMs: Math.round(this.timeMs) });
    this.fx.push(['c', by, c.id, Math.round(c.x), Math.round(c.y)]);
  }

  /** A Cousin becomes a Beast: frozen for a moment, then hunting. */
  private turn(c: Body, by: string): void {
    if (c.role !== 'cousin') return;
    c.role = 'beast';
    c.convertMs = CONVERT_MS;
    c.boosting = false;
    c.boostMs = 0;
    c.boostWaitMs = 0;
    c.dashMs = 0;
    c.dashWaitMs = 0;
    c.catchWaitMs = 0;
    c.working = false;
    this.sidesRev++;
    this.catches.push({ by, who: c.id, atMs: Math.round(this.timeMs) });
    this.fx.push(['c', by, c.id, Math.round(c.x), Math.round(c.y)]);
  }

  private enterPortal(b: Body): void {
    if (!PORTALS_ON || b.portalWaitMs > 0) return;
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

  /** Goo, spikes and creaky boards: what the floor does to a Cousin standing on it. Beasts and ghosts are spared. */
  private stepTraps(): void {
    for (const b of this.bodies) {
      if (b.hurtMs > 0) b.hurtMs -= TICK_MS;
      if (b.creakMs > 0) b.creakMs -= TICK_MS;
      if (b.role !== 'cousin' || b.ghost || !this.free(b)) {
        b.slow = false;
        continue;
      }
      const kind = kindAt(this.map, b.x, b.y);
      b.slow = kind === T_GOO;
      if (kind === T_SPIKE && b.hurtMs <= 0 && spikesAt(this.timeMs, Math.floor(b.x / TILE), Math.floor(b.y / TILE)) === SPIKES_UP) {
        b.hurtMs = HURT_MS;
        b.energy = Math.max(0, b.energy - SPIKE_ENERGY);
        b.boosting = false;
        this.fx.push(['s', b.id, Math.round(b.x), Math.round(b.y)]);
      } else if (kind === T_CREAK && b.creakMs <= 0 && (b.ix !== 0 || b.iy !== 0)) {
        // the Beasts hear a creak just as they hear a chore
        b.creakMs = CREAK_EVERY_MS;
        // strength 0: a creak, not a chore
        this.fx.push(['n', Math.round(b.x), Math.round(b.y), 0]);
      }
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
        if (b.role !== 'cousin' || b.out || b.ghost || b.energy >= ENERGY_MAX) continue;
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
    return b.role === 'cousin' && !b.ghost && this.free(b) && b.actHeld && b.ix === 0 && b.iy === 0 && Math.hypot(spot.x - b.x, spot.y - b.y) <= r;
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

  /** A Cousin who touches an open exit is out, there and then. */
  private stepExits(): void {
    if (!this.exitsOpen) return;
    for (const b of this.bodies) {
      if (b.role !== 'cousin' || b.out || b.ghost) continue;
      if (Math.hypot(this.exit.x - b.x, this.exit.y - b.y) > EXIT_R) continue;
      b.out = true;
      b.working = false;
      b.boosting = false;
      this.escaped.push(b.id);
      this.sidesRev++;
      this.fx.push(['x', b.id]);
    }
  }

  // ---- what others may know

  flags(b: Body): number {
    let f = 0;
    if (b.role === 'beast') f |= F_BEAST;
    if (b.boosting && (b.role === 'beast' || b.ix !== 0 || b.iy !== 0)) f |= F_BOOST;
    if (b.dashMs > 0) f |= F_DASH;
    if (b.convertMs > 0) f |= F_CONVERT;
    if (b.portalMs > 0) f |= F_PORTAL;
    if (b.working) f |= F_WORK;
    if (b.heldMs > 0) f |= F_HELD;
    if (b.out) f |= F_OUT;
    if (b.ghost) f |= F_GHOST;
    if (b.slow) f |= F_SLOW;
    if (b.hurtMs > 0 && b.role === 'cousin' && !b.ghost) f |= F_HURT;
    // how scared: anyone who can see this Cousin can see them shiver
    f |= Math.ceil((this.dread(b) * SCARE_MAX) / DREAD_STEPS) << F_SCARE_SHIFT;
    return f;
  }

  /**
   * How near the nearest Beast is to this Cousin, 0 (none within `DREAD_R`) to `DREAD_STEPS`
   * (on top of them). Walls do not matter: this is a feeling, not a sighting. A Beast still in
   * its den or still turning is no threat yet and does not count.
   */
  dread(b: Body): number {
    if (b.role !== 'cousin' || b.out || b.ghost) return 0;
    let near = DREAD_R;
    for (const o of this.bodies) {
      if (o.role !== 'beast' || o.heldMs > 0 || o.convertMs > 0) continue;
      near = Math.min(near, Math.hypot(o.x - b.x, o.y - b.y));
    }
    const k = (DREAD_R - near) / (DREAD_R - DREAD_FULL_R);
    return Math.round(Math.min(1, Math.max(0, k)) * DREAD_STEPS);
  }

  /** Time left until every Beast held at the start is loose. */
  heldLeft(): number {
    let ms = 0;
    for (const b of this.bodies) if (b.role === 'beast' && b.heldMs > ms) ms = b.heldMs;
    return ms;
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
