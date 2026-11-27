/**
 * Our own runner, and the scrolling screen, carried forward from the newest snapshot through the
 * commands sent since.
 *
 * A snapshot shows the server one trip ago, and a button pressed now is done there one trip from
 * now: drawn from snapshots alone, our own fighter answers a whole round trip (and the
 * interpolation delay) late. Instead every command is stamped with the server tick it is for, a
 * little further ahead than the round trip, and done on that tick both here and there, with the
 * same `stepPlayer`. When a snapshot comes in, the fighter starts again from the server's word
 * and the commands it has not got to yet are replayed on top.
 *
 * The screen is carried forward with us (`scrollX`): its left edge is what catches a straggler, and
 * the edge on screen has to be the one the server will judge us by, not the one of a trip ago.
 * Other runners are only known as of the snapshot; they are assumed to keep their speed, which
 * matters when one of them is the leader the screen is chasing.
 *
 * What cannot be predicted (a hit, a shove, a respawn) arrives as a correction: the simulation
 * takes it at once and only the drawing eases across (`errX`, `errY`, `errScroll`).
 *
 * Pure: no DOM, no clocks of its own. Unit-tested against a real `Game` a trip away.
 */
import { TICK_MS } from '../../shared/src/constants';
import { LEVELS, levelAt, platformPos, type LevelDef } from '../../shared/src/levels';
import type { SelfState, SnapshotMessage, Stamp } from '../../shared/src/protocol';
import type { Fx } from '../../shared/src/types';
import { createPlayer, type Input, type Player, type World } from '../../shared/src/sim/model';
import { applyInput, resolveSolids, stepPlayer, tryDrop } from '../../shared/src/sim/physics';
import { buildPlats, solidIndices } from '../../shared/src/sim/platforms';
import { updateScroll } from '../../shared/src/sim/scroll';

/** A stamped command not yet known to be done: held buttons, or (null) a drop. */
type Cmd = Stamp & { input: Input | null };

/** Never carry the fighter forward by more than this: beyond it the line is too poor to guess across. */
const MAX_AHEAD_TICKS = 45;
/**
 * A correction this large is cut, not slid. It is generous: a hard hit learned of a round trip
 * late puts us hundreds of pixels off, and sliding there reads as being launched, which we were.
 * (A respawn never gets here: while not alive nothing is predicted, and the error starts at zero.)
 */
const SNAP_PX = 600;
/** How fast a drawn correction fades, per second (about 100 ms to mostly gone). */
const ERR_DECAY = 14;
/** The server should find our commands waiting this many ticks before they are due. */
const WANT_SLACK = 1.5;
/** A command this many ticks late was held up by a stall, not by the line being slower. */
const SPIKE_TICKS = 5;
const MIN_LEAD_MS = TICK_MS;
const MAX_LEAD_MS = 500;

export type Predicted = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  grounded: boolean;
  airJumps: number;
  /** The platform stood on, or -1. */
  platIdx: number;
  /** What is left of the last correction, to add to the drawing only. */
  errX: number;
  errY: number;
  /** The screen's left edge at the moment the runner is drawn at. */
  scrollX: number;
  /** What is left of the last correction to the scroll, to add to the drawing only. */
  errScroll: number;
};

export class Predictor {
  private pending: Cmd[] = [];
  private seq = 0;
  private lastTick = 0;
  /** How far ahead of the server (as seen from here) commands are stamped, in ms. */
  leadMs = 100;
  /** How much the round trip wanders, in ms (from the socket's clock); more wander, more to spare. */
  jitterMs = 0;
  /** Commands the server got too late to do on their tick, for the net graph. */
  late = 0;
  private spikes = 0;
  /** Corrections larger than a pixel since the start, for the net graph. */
  corrections = 0;
  /** The size of the last correction, in px. */
  lastCorrection = 0;

  private base: SnapshotMessage | null = null;
  private rebase = false;
  private levelIndex = -1;
  private round = -1;
  private others: Player[] = [];
  private prevScroll = 0;
  private errScroll = 0;
  private readonly p: Player = createPlayer('self', '', '', false);
  private readonly w: World;
  /** The tick the scratch fighter is at; -1 when not predicting. */
  private simTick = -1;
  private baseTick = 0;
  private startTick = -1;
  private nextCmd = 0;
  private prevX = 0;
  private prevY = 0;
  private fxTick = 0;
  private errX = 0;
  private errY = 0;
  private lastNow = 0;
  private frac = 1;

  /** `onFx` is told each effect our own fighter causes, once, the moment it is predicted. */
  constructor(
    private readonly onFx: (fx: Fx) => void = () => {},
    private readonly levels: LevelDef[] = LEVELS,
  ) {
    this.w = { t: 0, level: levelAt(0, levels), plats: [], solids: [], fx: [], players: new Map(), scrollX: 0, gateIdx: 0, gateHp: 0, gateMax: 0, roundStartT: 0 } as unknown as World;
    this.p.finishMs = -1;
  }

  /** Forget everything (a new connection, a new identity). */
  reset(): void {
    this.pending = [];
    this.base = null;
    this.simTick = -1;
    this.errX = this.errY = this.errScroll = 0;
    this.fxTick = 0;
  }

  /** Start from a lead that fits the line (round trip, its wander, and a couple of ticks). */
  seedLead(rttMs: number, jitterMs: number): void {
    this.jitterMs = jitterMs;
    this.leadMs = clamp(rttMs + 2 * jitterMs + 2 * TICK_MS, MIN_LEAD_MS, MAX_LEAD_MS);
  }

  /** Are we predicting right now (as of the last `advance`)? */
  get active(): boolean {
    return this.simTick >= 0;
  }

  /**
   * Stamp a command made now. `simEdge` is the sim time of a snapshot that would be arriving this
   * instant (`SnapshotBuffer.simTime`). Returns the stamp to send with it.
   */
  command(input: Input | null, simEdge: number): Stamp {
    const stamp = this.stamp(simEdge);
    this.pending.push({ ...stamp, input: input ? { ...input } : null });
    return stamp;
  }

  /**
   * A stamp for something that does not move us by itself (pulling the trigger): the server does
   * it on the tick we are drawn at, but there is nothing to replay here.
   */
  stamp(simEdge: number): Stamp {
    // the next tick the prediction has yet to run: that is where this button lands, here and there
    const tick = Math.max(this.lastTick, this.simTick + 1, Math.floor((simEdge + this.leadMs) / TICK_MS) + 1);
    this.lastTick = tick;
    return { seq: ++this.seq, tick };
  }

  /** The newest snapshot is the new ground truth. After a stall only the last one need be given. */
  onSnapshot(snap: SnapshotMessage): void {
    this.base = snap;
    this.rebase = true;
    const you = snap.you;
    if (!you) return;
    this.pending = this.pending.filter((c) => c.seq > you.ack && c.tick > snap.tick - 120);
    if (you.slack !== null) this.steer(you.slack);
  }

  /**
   * Lead by more or less, on how many ticks our commands had to spare when they arrived. The
   * aim is a tick and a half plus twice the line's wander: late commands are what get corrected.
   */
  private steer(slack: number): void {
    const want = WANT_SLACK + Math.min(6, (2 * this.jitterMs) / TICK_MS);
    if (slack < 0) this.late++;
    if (slack < -SPIKE_TICKS && ++this.spikes < 3) return; // one stall is not a slower line
    if (slack >= -SPIKE_TICKS) this.spikes = 0;
    // late or nearly so: lead by more at once. Comfortably early: come back in slowly.
    if (slack < 1) this.leadMs += Math.min(100, (want - slack) * TICK_MS);
    else if (slack < want - 1) this.leadMs += 2;
    else if (slack > want + 1.5) this.leadMs -= 1;
    this.leadMs = clamp(this.leadMs, MIN_LEAD_MS, MAX_LEAD_MS);
  }

  /**
   * Carry the fighter forward to now. `now` is any steady local clock in ms (for fading
   * corrections). Returns null when there is nothing to predict (lobby, not alive).
   */
  advance(simEdge: number, now: number): Predicted | null {
    const dt = Math.min(250, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    const fade = Math.exp((-ERR_DECAY * dt) / 1000);
    this.errX *= fade;
    this.errY *= fade;
    this.errScroll *= fade;

    const base = this.base;
    const you = base?.you;
    const me = base?.players.find((q) => q.id === base.selfId);
    if (!base || !you || !me || me.life !== 'alive' || base.phase === 'lobby') {
      this.simTick = -1;
      this.errX = this.errY = this.errScroll = 0;
      return null;
    }

    const target = (simEdge + this.leadMs) / TICK_MS;
    let goal = clamp(Math.floor(target), base.tick, base.tick + MAX_AHEAD_TICKS);

    if (this.rebase) {
      this.rebase = false;
      const sameRound = base.round === this.round;
      const was = this.simTick >= 0 && sameRound ? { tick: this.simTick, x: this.p.x, y: this.p.y, scroll: this.w.scrollX } : null;
      this.load(base, you);
      if (was && was.tick >= this.baseTick) {
        // where the new truth puts us at the tick we had already drawn
        this.runTo(Math.min(was.tick, this.baseTick + MAX_AHEAD_TICKS));
        const dx = was.x - this.p.x;
        const dy = was.y - this.p.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          this.corrections++;
          this.lastCorrection = d;
        }
        if (d > SNAP_PX) this.errX = this.errY = 0;
        else if (d > 0.01) {
          this.errX += dx;
          this.errY += dy;
        }
        const ds = was.scroll - this.w.scrollX;
        if (Math.abs(ds) > SNAP_PX) this.errScroll = 0;
        else this.errScroll += ds;
      } else {
        this.errX = this.errY = this.errScroll = 0;
      }
    }
    goal = Math.max(goal, this.simTick); // a tick once run is never taken back
    this.runTo(goal);
    this.frac = clamp(target - goal, 0, 1);

    const p = this.p;
    const far = Math.abs(p.x - this.prevX) > 220 || Math.abs(p.y - this.prevY) > 220;
    const f = far ? 1 : this.frac;
    return {
      x: this.prevX + (p.x - this.prevX) * f,
      y: this.prevY + (p.y - this.prevY) * f,
      vx: p.vx,
      vy: p.vy,
      face: p.face,
      grounded: p.grounded,
      airJumps: p.airJumpsLeft,
      platIdx: p.platIdx,
      errX: this.errX,
      errY: this.errY,
      scrollX: this.prevScroll + (this.w.scrollX - this.prevScroll) * this.frac,
      errScroll: this.errScroll,
    };
  }

  /** Where platform `i` is at the moment the fighter is drawn at (it rides ahead of the snapshots). */
  platAt(i: number): { x: number; y: number } | null {
    const pl = this.w.plats[i];
    if (!pl) return null;
    return { x: pl.prevX + (pl.x - pl.prevX) * this.frac, y: pl.prevY + (pl.y - pl.prevY) * this.frac };
  }

  // ---------------------------------------------------------------- the replay

  private load(base: SnapshotMessage, you: SelfState): void {
    const w = this.w;
    if (base.level !== this.levelIndex || base.round !== this.round) {
      this.levelIndex = base.level;
      this.round = base.round;
      w.level = levelAt(base.level, this.levels);
      w.plats = buildPlats(w.level, you.t);
      w.solids = solidIndices(w.plats);
    }
    w.t = you.t;
    for (const pl of w.plats) {
      const pos = pl.box ? pl : platformPos(pl.def, you.t);
      pl.x = pl.prevX = pos.x;
      pl.y = pl.prevY = pos.y;
      pl.state = 'solid';
      pl.timer = 0;
    }
    for (const [i, state] of base.crumble) if (w.plats[i]) w.plats[i].state = state;
    // a box is a plat after the course's own; one with no health left is gone
    const firstBox = w.level.platforms.length;
    for (const [idx, hp] of base.boxes) if (hp <= 0 && w.plats[firstBox + idx]) w.plats[firstBox + idx].state = 'gone';
    w.gateIdx = base.gate ? base.gate.i : w.level.gates.length;
    w.gateHp = base.gate?.hp ?? 0;
    w.gateMax = base.gate?.max ?? 0;
    w.scrollX = this.prevScroll = you.scrollX;
    w.roundStartT = you.roundStartT;
    // the others, as far as the screen's chase of the leader needs them
    w.players.clear();
    this.others = [];
    for (const q of base.players) {
      if (q.id === base.selfId || q.life !== 'alive') continue;
      const o = createPlayer(q.id, '', '', false);
      o.x = q.x;
      o.y = q.y;
      o.vx = q.vx;
      o.finishMs = -1;
      this.others.push(o);
      w.players.set(o.id, o);
    }
    w.players.set(this.p.id, this.p);
    const p = this.p;
    p.x = this.prevX = you.x;
    p.y = this.prevY = you.y;
    p.vx = you.vx;
    p.vy = you.vy;
    p.face = you.face;
    p.grounded = you.grounded;
    p.platIdx = you.platIdx;
    p.coyoteMs = you.coyoteMs;
    p.jumpBufferMs = you.jumpBufferMs;
    p.prevJump = you.prevJump;
    p.cuttable = you.cuttable;
    p.airJumpsLeft = you.airJumpsLeft;
    p.dropFrom = you.dropFrom;
    p.dropUntil = you.dropUntil;
    p.prevBottom = you.prevBottom;
    p.launchUntil = you.launchUntil;
    p.boostUntil = you.boostUntil;
    p.input = { ...you.input };
    p.speedMul = you.speedMul;
    p.life = 'alive';
    this.baseTick = this.simTick = base.tick;
    if (base.tick < this.fxTick - 600) this.fxTick = base.tick; // the server started over
    this.nextCmd = 0;
    // during the countdown nobody moves; the first tick of play is the one after it runs out
    this.startTick = base.phase === 'starting' ? base.tick + Math.max(0, Math.ceil((base.countdownMs ?? 0) / TICK_MS - 1e-6)) : -1;
  }

  private runTo(tick: number): void {
    const w = this.w;
    const p = this.p;
    while (this.simTick < tick) {
      const k = this.simTick + 1;
      w.t += TICK_MS;
      const playing = k > this.startTick;
      // in the server's order: commands due, then the platforms move, then the fighter
      while (this.nextCmd < this.pending.length && this.pending[this.nextCmd].tick <= k) {
        const c = this.pending[this.nextCmd++];
        if (c.input) applyInput(p, c.input);
        else if (playing) tryDrop(w, p);
      }
      for (const pl of w.plats) {
        if (pl.box) continue; // boxes never move
        pl.prevX = pl.x;
        pl.prevY = pl.y;
        const pos = platformPos(pl.def, w.t);
        pl.x = pos.x;
        pl.y = pos.y;
      }
      this.prevX = p.x;
      this.prevY = p.y;
      if (k === this.startTick) p.jumpBufferMs = 0;
      if (playing) {
        w.fx = [];
        stepPlayer(w, p, TICK_MS);
        if (k > this.fxTick) {
          this.fxTick = k;
          for (const fx of w.fx) this.onFx({ ...fx, id: this.base!.selfId } as Fx);
        }
        resolveSolids(w, [p]);
      }
      this.prevScroll = w.scrollX;
      if (playing && this.base!.phase === 'playing') {
        // the others are assumed to run on as they were; then the screen chases the leader
        for (const o of this.others) o.x += (o.vx * TICK_MS) / 1000;
        updateScroll(w, TICK_MS);
      }
      this.simTick = k;
    }
  }
}

/** The effects a fighter causes by moving: ours are played from the prediction, not the server. */
export function isMoveFx(fx: Fx): boolean {
  return fx.k === 'jump' || fx.k === 'airjump' || fx.k === 'land' || fx.k === 'bounce';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
