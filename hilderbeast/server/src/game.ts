/**
 * The whole game as a pure state machine: no sockets, no timers, no wall clock. `index.ts` feeds
 * it player actions and elapsed time, and asks it what to send.
 */
import { randomBytes } from 'node:crypto';
import {
  BOT_THINK_MS,
  COUNTDOWN_MS,
  CUTSCENE_MS,
  DEFAULT_MODE,
  ESCAPE_CLOCK_MS,
  LAST_CLOCK_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  PLAYER_COLORS,
  SIGHT_R,
  TICK_MS,
  tasksFor,
} from '../../shared/src/constants.js';
import { MAPS } from '../../shared/src/maps.js';
import type { SnapMessage } from '../../shared/src/protocol.js';
import { sees } from '../../shared/src/sim.js';
import type { BodySnap, Fx, Mode, Phase, PlayerView, ResultView, Settings, Side, StateView } from '../../shared/src/types.js';
import { sanitizeName } from '@tggame/base/shared/text';
import { Roster, shuffle } from '@tggame/base/party/roster';
import { BOT_NAMES, Bots } from './bots.js';
import { World, type Body, type Rng } from './world.js';

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
  /** Only ever watches: never seated, whatever the phase. */
  watcher: boolean;
};

export type JoinResult = { id: string; token: string; resumed: boolean } | 'full';

/** One broadcast's worth of the round, worked out once and then cut down for each player. */
export type Frame = { fx: Fx[]; noisy: boolean };

export class Game extends Roster<Player> {
  phase: Phase = 'lobby';
  /** Bumped each time a round starts. */
  gameNo = 0;
  settings: Settings = { mode: DEFAULT_MODE, map: -1 };
  /** The map of the round being played, or of the last one. */
  private mapNo = -1;
  /** The round being played, or the last one played. */
  world: World | null = null;
  /** Fixed ticks run so far, and the time they add up to. Never reset, so snapshots stay in order. */
  tick = 0;
  simTimeMs = 0;

  private acc = 0;
  /** Clock left on the round, and what it started with. */
  private clockMs = 0;
  private roundClockMs = 0;
  /** Left of the countdown. */
  private phaseLeftMs = 0;
  private botThinkMs = 0;
  /** Left of the pause while a catch is shown, and how many catches have been shown. */
  private holdMs = 0;
  private shown = 0;
  private bots = new Bots();
  /** Cousins the round started with. */
  private cousinsAtStart = 0;
  private result: ResultView | null = null;
  /** How often each player has started a round as the Beast, so it goes round. */
  private beastTurns = new Map<string, number>();

  constructor(rng: Rng = Math.random) {
    super(rng, MAX_PLAYERS, PLAYER_COLORS);
  }

  /** Changes whenever the state the players are sent may have changed without a message from them. */
  get rev(): string {
    return `${this.phase}:${this.gameNo}:${this.world?.sidesRev ?? 0}`;
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
      name: this.uniqueName(sanitizeName(rawName) || 'Cousin'),
      color: this.freeColor(),
      bot: false,
      token: randomBytes(16).toString('hex'),
      connected: true,
      watcher: false,
      // arrivals during a round watch it, and are in the next one
      spectator: this.phase !== 'lobby' || this.participants().length >= MAX_PLAYERS,
    };
    this.players.set(player.id, player);
    return { id: player.id, token: player.token, resumed: false };
  }

  /** Socket closed. A body in a running round is kept for a reconnect (and driven by a bot meanwhile). */
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

  /**
   * A player chooses to only watch (a TV in the room), or to play again. A watcher has no seat and
   * no body, and so is sent the whole house. Giving up a body mid-round is the same as leaving it;
   * asking for a seat back takes effect in the lobby.
   */
  watch(id: string, on: boolean): void {
    const p = this.players.get(id);
    if (!p || p.bot || p.watcher === on) return;
    p.watcher = on;
    if (on) {
      const playing = !p.spectator && this.phase !== 'lobby' && this.phase !== 'finale';
      p.spectator = true;
      if (playing) this.leaveRound(id);
    } else if (this.phase === 'lobby') {
      p.spectator = this.participants().length >= MAX_PLAYERS;
    }
  }

  addBot(by: string): void {
    if (!this.canAddBot(by)) return;
    const id = `b${this.nextId++}`;
    this.players.set(id, { id, name: this.botName(BOT_NAMES, 'Cousin'), color: this.freeColor(), bot: true, token: '', connected: true, spectator: false, watcher: false });
  }

  /** Nobody is left: clear the table (bots included) so the next visitor finds an open lobby. */
  reset(): void {
    this.players.clear();
    this.beastTurns.clear();
    this.toLobby();
  }

  // ---- game flow

  configure(by: string, mode?: Mode, map?: number): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (mode !== undefined && MODES.includes(mode)) this.settings.mode = mode;
    if (map !== undefined && Number.isInteger(map) && map >= -1 && map < MAPS.length) this.settings.map = map;
  }

  start(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (this.participants().length < MIN_PLAYERS) return;
    this.gameNo++;
    this.result = null;
    const ids = this.participants().map((p) => p.id);
    // the Beast is whoever has had the fewest turns, by lot among them
    const fewest = Math.min(...ids.map((id) => this.beastTurns.get(id) ?? 0));
    const pool = ids.filter((id) => (this.beastTurns.get(id) ?? 0) === fewest);
    const beast = pool[Math.floor(this.rng() * pool.length)];
    this.beastTurns.set(beast, fewest + 1);
    this.cousinsAtStart = ids.length - 1;
    const mode = this.settings.mode;
    // by lot, never the same map twice running
    let mapNo = this.settings.map;
    while (mapNo < 0 || (this.settings.map < 0 && mapNo === this.mapNo && MAPS.length > 1)) mapNo = Math.floor(this.rng() * MAPS.length);
    this.mapNo = mapNo;
    const map = MAPS[mapNo];
    const spots = shuffle(
      map.tasks.map((_, i) => i),
      this.rng,
    ).slice(0, tasksFor(this.cousinsAtStart));
    // seats in the hall are dealt by lot too
    this.world = new World(mode, [beast, ...shuffle(ids.filter((id) => id !== beast), this.rng)], beast, spots.sort((a, b) => a - b), map);
    this.bots = new Bots();
    this.roundClockMs = this.clockMs = mode === 'escape' ? ESCAPE_CLOCK_MS : LAST_CLOCK_MS;
    this.phase = 'countdown';
    this.phaseLeftMs = COUNTDOWN_MS;
    this.holdMs = 0;
    this.shown = 0;
    this.botThinkMs = 0;
  }

  /** A player's controls. Whatever they claim, the stick is cut to length 1 and the server does the moving. */
  input(id: string, x: number, y: number, boost: boolean, act: boolean): void {
    if (this.phase !== 'countdown' && this.phase !== 'play') return;
    this.world?.setInput(id, x, y, boost, act);
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
    if (!world) return;
    if (this.phase === 'countdown') {
      this.phaseLeftMs -= TICK_MS;
      if (this.phaseLeftMs <= 0) this.phase = 'play';
    } else if (this.phase === 'play') {
      // a catch is being shown: the whole round stands still, clock and all, and is judged after
      if (this.holdMs > 0) {
        this.holdMs -= TICK_MS;
        if (this.holdMs <= 0) this.judge(world);
        return;
      }
      this.autopilot(world);
      world.step(this.rng);
      this.clockMs -= TICK_MS;
      // a catch by a Beast (not a Cousin turned because the Beast walked out) stops everything
      const caught = world.catches.slice(this.shown).some((c) => c.by !== '');
      this.shown = world.catches.length;
      if (caught) this.holdMs = CUTSCENE_MS;
      else this.judge(world);
    }
  }

  /** Bots, and the bodies of humans who dropped off, play by themselves. */
  private autopilot(world: World): void {
    for (const e of world.fx) if (e[0] === 'n') this.bots.hear(e[1], e[2]);
    this.botThinkMs -= TICK_MS;
    if (this.botThinkMs > 0) return;
    this.botThinkMs = BOT_THINK_MS;
    for (const b of world.bodies) {
      const p = this.players.get(b.id);
      if (p && (p.bot || !p.connected)) this.bots.think(world, b, this.rng, BOT_THINK_MS);
    }
  }

  /** Is the round over? */
  private judge(world: World): void {
    const free = world.cousins().length;
    // Escape goes on until nobody is left in the house to catch: everyone still free must get out
    const out = world.escaped.length > 0;
    if (free === 0) return out ? this.finish(world, 'cousins', 'escaped') : this.finish(world, 'beasts', 'caught');
    // every Beast walked out: nothing left to run from
    if (world.beasts().length === 0) return this.finish(world, 'cousins', 'last');
    if (world.mode === 'last' && free === 1 && this.cousinsAtStart > 1) return this.finish(world, 'cousins', 'last');
    if (this.clockMs <= 0) {
      if (world.mode === 'last') return this.finish(world, 'cousins', 'clock');
      // whoever got out got out, even if others ran out of time
      return out ? this.finish(world, 'cousins', 'escaped') : this.finish(world, 'beasts', 'clock');
    }
  }

  private finish(world: World, winner: ResultView['winner'], why: ResultView['why']): void {
    this.phase = 'finale';
    this.result = {
      mode: world.mode,
      winner,
      why,
      survivors: world.cousins().map((b) => b.id),
      escaped: [...world.escaped],
      firstBeast: world.firstBeast,
      catches: [...world.catches],
      tookMs: Math.round(world.timeMs),
    };
  }

  private remove(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.beastTurns.delete(id);
    if (p.spectator || this.phase === 'lobby' || this.phase === 'finale') return;
    this.leaveRound(id);
  }

  /** Take a body out of the round that is on, and see whether the round can go on without it. */
  private leaveRound(id: string): void {
    const world = this.world;
    if (!world) return;
    world.remove(id, this.rng);
    // a round needs somebody on each side
    if (world.bodies.length < 2) this.toLobby();
    else if (this.phase === 'play') this.judge(world);
  }

  protected toLobby(): void {
    this.phase = 'lobby';
    this.world = null;
    this.result = null;
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    let n = 0;
    for (const p of this.players.values()) p.spectator = p.watcher || ++n > MAX_PLAYERS;
  }

  // ---- what goes over the wire

  viewFor(id: string): StateView {
    const players: PlayerView[] = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, connected: p.connected, spectator: p.spectator, watcher: p.watcher }));
    const world = this.world;
    const sides: Record<string, Side> = {};
    if (world) for (const b of world.bodies) sides[b.id] = b.out ? 'x' : b.ghost ? 'g' : b.role === 'beast' ? 'b' : 'c';
    return {
      game: this.gameNo,
      phase: this.phase,
      selfId: id,
      hostId: this.hostId(),
      players,
      settings: { ...this.settings },
      round: world ? { seq: this.gameNo, mode: world.mode, map: this.mapNo, clockMs: this.roundClockMs, tasks: world.tasks.map((t) => t.spot), sides, firstBeast: world.firstBeast } : null,
      result: this.result,
    };
  }

  /** True while there is something to send snapshots about. */
  get live(): boolean {
    return !!this.world && (this.phase === 'countdown' || this.phase === 'play' || this.world.fx.length > 0);
  }

  /** Drains the events: call once per broadcast, then `snapFor` for each player. */
  frame(): Frame | null {
    if (!this.world) return null;
    const fx = this.world.drainFx();
    return { fx, noisy: fx.some((e) => e[0] === 'n') };
  }

  /** May `viewer` see `b`? Their own side always; the other side only in sight, with no wall between. */
  private visible(world: World, viewer: Body | undefined, b: Body): boolean {
    if (b.out) return false;
    // the dead see everything; the living never see the dead
    if (!viewer || viewer.out || viewer.ghost || this.phase === 'finale') return true;
    if (b.ghost) return false;
    if (viewer.role === b.role) return true;
    return b.portalMs <= 0 && sees(world.map, viewer.x, viewer.y, b.x, b.y, SIGHT_R);
  }

  /** What one player is told: the bodies they can see and the events they would know of. */
  snapFor(id: string, frame: Frame): SnapMessage | null {
    const world = this.world;
    if (!world) return null;
    const me = world.body(id);
    const seen = new Set<string>();
    const bodies: BodySnap[] = [];
    for (const b of world.bodies) {
      if (!this.visible(world, me, b)) continue;
      seen.add(b.id);
      bodies.push([b.id, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, world.flags(b), Math.round(Math.atan2(b.fy, b.fx) * 100)]);
    }
    const all = !me || me.out || me.ghost;
    const near = (i: number): boolean => !!me && sees(world.map, me.x, me.y, world.map.portals[i].x, world.map.portals[i].y, SIGHT_R);
    const fx: Fx[] = [];
    for (const e of frame.fx) {
      if (e[0] === 'l' || e[0] === 's') {
        if (seen.has(e[1])) fx.push(e);
      } else if (e[0] === 't') {
        if (all || me.role === 'beast' || near(e[2]) || near(e[3])) fx.push(e);
      } else if (e[0] === 'n') {
        if (me?.role === 'beast') fx.push(e);
      } else {
        fx.push(e);
      }
    }
    if (frame.noisy && me?.working) fx.push(['h']);
    return {
      type: 'snap',
      simTimeMs: Math.round(this.simTimeMs),
      cd: this.phase === 'countdown' ? Math.max(0, Math.round(this.phaseLeftMs)) : 0,
      left: Math.max(0, Math.round(this.clockMs)),
      hold: Math.max(0, Math.round(this.holdMs)),
      bodies,
      me: me ? [Math.round(me.energy), Math.max(0, Math.round(me.boostWaitMs)), Math.max(0, Math.round(me.dashWaitMs)), Math.max(0, Math.round(me.portalWaitMs)), world.dread(me)] : null,
      pl: world.pillBits(),
      tk: world.tasks.map((t) => (t.progress >= 1 ? 100 : Math.floor(t.progress * 100))),
      fx,
    };
  }
}
