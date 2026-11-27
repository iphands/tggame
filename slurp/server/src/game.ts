/**
 * The whole game as a pure state machine: no sockets, no timers, no wall clock. `index.ts` feeds
 * it player actions and elapsed time, and asks it what to send.
 */
import { randomBytes } from 'node:crypto';
import {
  BOT_THINK_MS,
  CARRY_MAX_MS,
  CARRY_SHARE,
  CLEARED_MS,
  CLOCK_FACTOR,
  COUNTDOWN_MS,
  COURSES,
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  STAR_2,
  STAR_3,
  TICK_MS,
  courseTimeMs,
} from '../../shared/src/constants.js';
import type { CourseMessage, SnapMessage } from '../../shared/src/protocol.js';
import type { ClearedView, Difficulty, Phase, PlayerStats, PlayerView, ResultView, Settings, StateView } from '../../shared/src/types.js';
import { sanitizeName } from '@tggame/base/shared/text';
import { Roster } from '@tggame/base/party/roster';
import { BOT_NAMES, botAim, type Rng } from './bots.js';
import { makeCourse } from './course.js';
import { World } from './world.js';

/** Players plus spectators a server will hold on to. */
const MAX_PEOPLE = 30;
/** After a stall (a sleeping laptop) the simulation catches up by at most this much. */
const MAX_CATCH_UP_MS = 250;

type Player = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  /** Secret that lets a reconnecting client reclaim this seat. */
  token: string;
  connected: boolean;
  spectator: boolean;
};

export type JoinResult = { id: string; token: string; resumed: boolean } | 'full';

export class Game extends Roster<Player> {
  phase: Phase = 'lobby';
  /** Bumped each time a run starts. */
  gameNo = 0;
  settings: Settings = { difficulty: DEFAULT_DIFFICULTY };
  /** 1-based course number; 0 in the lobby. */
  course = 0;
  /** Bumped each time a table is laid. */
  courseSeq = 0;
  /** The table being played, or the last one played. */
  world: World | null = null;
  /** Fixed ticks run so far, and the time they add up to. Never reset, so snapshots stay in order. */
  tick = 0;
  simTimeMs = 0;

  private acc = 0;
  /** Clock left on the course. */
  private clockMs = 0;
  /** The clock the course started with. */
  private courseClockMs = 0;
  /** Left of the countdown, or of the pause after a cleared course. */
  private phaseLeftMs = 0;
  private carryMs = 0;
  private tiers = 0;
  private botThinkMs = 0;
  private stars: number[] = [];
  private cleared: ClearedView | null = null;
  private result: ResultView | null = null;
  private stats = new Map<string, PlayerStats>();

  constructor(rng: Rng = Math.random) {
    super(rng, MAX_PLAYERS, PLAYER_COLORS);
  }

  // ---- joining and leaving

  join(rawName: unknown, token: string | undefined): JoinResult {
    if (token) {
      for (const p of this.players.values()) {
        if (!p.bot && p.token === token) {
          p.connected = true;
          return { id: p.id, token: p.token, resumed: true };
        }
      }
    }
    if (this.players.size >= MAX_PEOPLE) return 'full';
    if (this.phase === 'lobby' && this.participants().length >= MAX_PLAYERS) {
      // a human always beats a bot to a seat
      const bot = [...this.players.values()].reverse().find((p) => p.bot);
      if (bot) this.players.delete(bot.id);
    }
    const player: Player = {
      id: `p${this.nextId++}`,
      name: this.uniqueName(sanitizeName(rawName) || 'Slurper'),
      color: this.freeColor(),
      bot: false,
      token: randomBytes(16).toString('hex'),
      connected: true,
      // mid-run arrivals watch until the next course is laid
      spectator: this.phase !== 'lobby' || this.participants().length >= MAX_PLAYERS,
    };
    this.players.set(player.id, player);
    return { id: player.id, token: player.token, resumed: false };
  }

  /** Socket closed. A hole on a running table is kept for a reconnect (and steered automatically meanwhile). */
  drop(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || this.phase === 'finale' || p.spectator) this.remove(id);
    else p.connected = false;
  }

  /** The player chose to go: the seat is given up for good. */
  leave(id: string): void {
    this.remove(id);
  }

  addBot(by: string): void {
    if (!this.canAddBot(by)) return;
    const id = `b${this.nextId++}`;
    this.players.set(id, {
      id,
      name: this.botName(BOT_NAMES, 'Slurpbot'),
      color: this.freeColor(),
      bot: true,
      token: '',
      connected: true,
      spectator: false,
    });
  }

  /** Nobody is left: clear the table (bots included) so the next visitor finds an open lobby. */
  reset(): void {
    this.players.clear();
    this.toLobby();
  }

  // ---- game flow

  configure(by: string, difficulty?: Difficulty): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (difficulty !== undefined && DIFFICULTIES.includes(difficulty)) this.settings.difficulty = difficulty;
  }

  start(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (this.participants().length < MIN_PLAYERS) return;
    this.gameNo++;
    this.stars = [];
    this.result = null;
    this.carryMs = 0;
    this.stats.clear();
    this.layCourse(1);
  }

  /** Where this player's hole should head. */
  aim(id: string, x: number, y: number): void {
    if (this.phase !== 'countdown' && this.phase !== 'play') return;
    this.world?.setAim(id, x, y);
  }

  /** Advance by real elapsed time, in fixed ticks. */
  step(dtMs: number): void {
    this.acc += Math.min(dtMs, MAX_CATCH_UP_MS);
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.tickOnce();
    }
  }

  private tickOnce(): void {
    this.tick++;
    this.simTimeMs += TICK_MS;
    const world = this.world;
    if (this.phase === 'countdown' && world) {
      world.moveHoles();
      this.phaseLeftMs -= TICK_MS;
      if (this.phaseLeftMs <= 0) this.phase = 'play';
    } else if (this.phase === 'play' && world) {
      this.autopilot(world);
      world.step(this.rng);
      this.clockMs -= TICK_MS + world.penaltyMs;
      world.penaltyMs = 0;
      if (world.left === 0) this.clearCourse(world);
      else if (this.clockMs <= 0) this.finish(false);
    } else if (this.phase === 'cleared') {
      this.phaseLeftMs -= TICK_MS;
      if (this.phaseLeftMs <= 0) this.layCourse(this.course + 1);
    }
  }

  /** Bots, and the holes of humans who dropped off, steer themselves. */
  private autopilot(world: World): void {
    this.botThinkMs -= TICK_MS;
    if (this.botThinkMs > 0) return;
    this.botThinkMs = BOT_THINK_MS;
    for (const hole of world.holes) {
      const p = this.players.get(hole.id);
      if (p && (p.bot || !p.connected)) botAim(world, hole, this.rng);
    }
  }

  private layCourse(no: number): void {
    // whoever has been watching gets a hole now
    let seated = this.participants().length;
    for (const p of this.players.values()) {
      if (seated >= MAX_PLAYERS) break;
      if (p.spectator) {
        p.spectator = false;
        seated++;
      }
    }
    const ids = this.participants().map((p) => p.id);
    for (const id of ids) if (!this.stats.has(id)) this.stats.set(id, { id, eaten: 0, biggest: -1, spills: 0, herds: 0 });
    const course = makeCourse(no, ids.length, this.rng);
    this.course = no;
    this.courseSeq++;
    this.tiers = course.tiers;
    this.world = new World(course, ids, this.stats);
    this.cleared = null;
    this.courseClockMs = this.clockMs = Math.round(courseTimeMs(no) * CLOCK_FACTOR[this.settings.difficulty]) + this.carryMs;
    this.phase = 'countdown';
    this.phaseLeftMs = COUNTDOWN_MS;
    this.botThinkMs = 0;
  }

  private clearCourse(world: World): void {
    const leftMs = Math.max(0, Math.round(this.clockMs));
    const share = leftMs / this.courseClockMs;
    const tidy = world.spills <= world.holes.length;
    const stars = share >= STAR_3 && tidy ? 3 : share >= STAR_2 ? 2 : 1;
    this.stars.push(stars);
    this.carryMs = Math.min(CARRY_MAX_MS, Math.round(leftMs * CARRY_SHARE));
    this.cleared = { no: this.course, stars, leftMs, spills: world.spills, carryMs: this.carryMs };
    if (this.course >= COURSES) return this.finish(true);
    this.phase = 'cleared';
    this.phaseLeftMs = CLEARED_MS;
  }

  private finish(won: boolean): void {
    this.phase = 'finale';
    this.result = {
      won,
      cleared: this.stars.length,
      failedOn: won ? 0 : this.course,
      leftOver: this.world?.left ?? 0,
      stats: [...this.stats.values()].filter((s) => this.players.has(s.id)).map((s) => ({ ...s })),
    };
  }

  private remove(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.spectator || this.phase === 'lobby' || this.phase === 'finale') return;
    this.world?.removeHole(id);
    // a table with no holes left cannot be cleared
    if (this.participants().length === 0) this.toLobby();
  }

  protected toLobby(): void {
    this.phase = 'lobby';
    this.course = 0;
    this.world = null;
    this.cleared = null;
    this.result = null;
    this.stars = [];
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    let n = 0;
    for (const p of this.players.values()) p.spectator = ++n > MAX_PLAYERS;
  }

  // ---- what goes over the wire

  viewFor(id: string): StateView {
    const players: PlayerView[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      bot: p.bot,
      connected: p.connected,
      spectator: p.spectator,
    }));
    return {
      game: this.gameNo,
      phase: this.phase,
      selfId: id,
      hostId: this.hostId(),
      players,
      settings: { ...this.settings },
      course: this.course ? { no: this.course, of: COURSES, timeMs: this.courseClockMs, tiers: this.tiers } : null,
      cleared: this.cleared,
      stars: [...this.stars],
      result: this.result,
    };
  }

  /** The table as it stands, for everyone when it is laid and for anyone who joins part-way. */
  courseMessage(): CourseMessage | null {
    const world = this.world;
    if (!world) return null;
    return { type: 'course', seq: this.courseSeq, no: this.course, w: world.w, h: world.h, foods: world.foodList() };
  }

  /** True while there is something to send snapshots about. */
  get live(): boolean {
    return !!this.world && (this.phase === 'countdown' || this.phase === 'play' || this.world.fx.length > 0);
  }

  /** Positions and what just happened. Drains the moved-food list and the events: call once per broadcast. */
  snapshot(): SnapMessage | null {
    const world = this.world;
    if (!world) return null;
    return {
      type: 'snap',
      simTimeMs: Math.round(this.simTimeMs),
      cd: this.phase === 'countdown' ? Math.max(0, Math.round(this.phaseLeftMs)) : 0,
      left: Math.max(0, Math.round(this.clockMs)),
      n: world.left,
      holes: world.holeList(),
      foods: world.drainMoves(),
      fx: world.drainFx(),
    };
  }
}
