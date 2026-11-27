/**
 * The whole game as a pure state machine: no sockets, no timers, no wall clock. `index.ts` feeds
 * it player actions and elapsed time, and asks it what to send.
 */
import { randomBytes } from 'node:crypto';
import {
  BOT_NAMES,
  CLEARED_MS,
  COUNTDOWN_MS,
  DEFAULT_LENGTH,
  DEFAULT_PACE,
  FAST_FINISH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  ROUND_END_MS,
  SHRINK_AFTER_MS,
  TARGETS,
  TICK_HZ,
  TICK_MS,
} from '../../shared/src/constants.js';
import { makeArena } from '../../shared/src/arenas.js';
import type { ArenaMessage, SnapMessage } from '../../shared/src/protocol.js';
import type { ClearedView, Exit, Phase, PlayerStats, PlayerView, ResultView, Settings, StateView } from '../../shared/src/types.js';
import { sanitizeName } from '@tggame/base/shared/text';
import { Roster } from '@tggame/base/party/roster';
import { pilot, type Rng } from './bots.js';
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
  /** Only ever watches: never seated, whatever the phase. */
  watcher: boolean;
};

export type JoinResult = { id: string; token: string; resumed: boolean } | 'full';

const freshStats = (id: string): PlayerStats => ({ id, score: 0, wins: 0, cuts: 0, own: 0, walls: 0, firsts: 0, cells: 0, shaves: 0 });

export class Game extends Roster<Player> {
  phase: Phase = 'lobby';
  /** Bumped each time a match starts. */
  gameNo = 0;
  settings: Settings = { pace: DEFAULT_PACE, length: DEFAULT_LENGTH, boost: true, bust: true, slip: true, erase: true };
  /** 1-based round number; 0 in the lobby. */
  round = 0;
  /** Bumped each time a floor is laid. */
  roundSeq = 0;
  /** The round being ridden, or the last one. */
  world: World | null = null;
  /** Fixed ticks run so far, and the time they add up to. Never reset, so snapshots stay in order. */
  tick = 0;
  simTimeMs = 0;
  /** Bumped whenever something in `viewFor` changed without a player asking for it (a score, a phase). */
  rev = 0;

  private acc = 0;
  /** Left of the countdown, of the pause after the last crash, or of the result screen. */
  private phaseLeftMs = 0;
  /** The round is decided and the last crash is playing out. */
  private decided = false;
  private cleared: ClearedView | null = null;
  private result: ResultView | null = null;
  private stats = new Map<string, PlayerStats>();

  constructor(rng: Rng = Math.random) {
    super(rng, MAX_PLAYERS, PLAYER_COLORS);
  }

  // ---- joining and leaving

  join(rawName: unknown, token: string | undefined, watch = false): JoinResult {
    if (token) {
      for (const p of this.players.values()) {
        if (!p.bot && p.token === token) {
          p.connected = true;
          // whatever the autopilot was doing with their bike, they take over with hands off the boost
          this.world?.boost(p.id, false);
          this.watch(p.id, watch);
          return { id: p.id, token: p.token, resumed: true };
        }
      }
    }
    if (this.players.size >= MAX_PEOPLE) return 'full';
    this.bumpBot(watch);
    const player: Player = {
      id: `p${this.nextId++}`,
      name: this.uniqueName(sanitizeName(rawName) || 'Rider'),
      color: this.freeColor(),
      bot: false,
      token: randomBytes(16).toString('hex'),
      connected: true,
      // mid-match arrivals watch until the next round
      spectator: this.unseated(watch, this.phase === 'lobby'),
      watcher: watch,
    };
    this.players.set(player.id, player);
    return { id: player.id, token: player.token, resumed: false };
  }

  /** Socket closed. A bike in a running match is kept for a reconnect (and rides itself meanwhile). */
  drop(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || this.phase === 'finale' || p.spectator) this.remove(id);
    else {
      p.connected = false;
      this.world?.boost(id, false);
    }
  }

  /** The player chose to go: the seat is given up for good. */
  leave(id: string): void {
    this.remove(id);
  }

  addBot(by: string): void {
    if (!this.canAddBot(by)) return;
    const id = `b${this.nextId++}`;
    this.players.set(id, { id, name: this.botName(BOT_NAMES, 'Bikebot'), color: this.freeColor(), bot: true, token: '', connected: true, spectator: false, watcher: false });
  }

  /** Nobody is left: clear the table (bots included) so the next visitor finds an open lobby. */
  reset(): void {
    this.players.clear();
    this.toLobby();
  }

  // ---- game flow

  configure(by: string, change: Partial<Settings>): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    for (const key of ['pace', 'length', 'boost', 'bust', 'slip', 'erase'] as const) {
      if (change[key] !== undefined) (this.settings as Record<string, unknown>)[key] = change[key];
    }
  }

  start(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (this.participants().length < MIN_PLAYERS) return;
    this.gameNo++;
    this.round = 0;
    this.result = null;
    this.stats.clear();
    this.layRound();
  }

  turn(id: string, d: number, at?: number): void {
    if (this.phase === 'countdown' || this.phase === 'play') this.world?.turn(id, d, at);
  }

  boost(id: string, on: boolean): void {
    if (this.phase === 'countdown' || this.phase === 'play') this.world?.boost(id, on);
  }

  bust(id: string): void {
    if (this.phase === 'play' && !this.decided) this.world?.bust(id);
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
    const before = this.phase;
    if (this.phase === 'countdown') {
      this.phaseLeftMs -= TICK_MS;
      if (this.phaseLeftMs <= 0) this.phase = 'play';
    } else if (this.phase === 'play' && world) {
      if (!this.decided) this.ride(world);
      else if ((this.phaseLeftMs -= TICK_MS) <= 0) this.closeRound(world);
    } else if (this.phase === 'cleared') {
      this.phaseLeftMs -= TICK_MS;
      if (this.phaseLeftMs <= 0) {
        if (this.cleared?.last) this.finish();
        else this.layRound();
      }
    }
    if (this.phase !== before) this.rev++;
  }

  /** One tick of riding; several when only bots are left to watch. */
  private ride(world: World): void {
    const steps = this.humansRiding(world) ? 1 : FAST_FINISH;
    for (let i = 0; i < steps && !this.decided; i++) {
      this.autopilot(world);
      const out = world.out.length;
      world.step();
      if (world.out.length !== out) this.rev++;
      if (world.alive <= 1) {
        this.decided = true;
        this.phaseLeftMs = ROUND_END_MS;
        world.stop();
      }
    }
  }

  private humansRiding(world: World): boolean {
    return world.bikes.some((b) => {
      const p = this.players.get(b.id);
      return b.alive && !!p && !p.bot && p.connected;
    });
  }

  /** Bots, and the bikes of humans who dropped off, steer themselves just before each cell. */
  private autopilot(world: World): void {
    for (const b of world.bikes) {
      if (!b.alive) continue;
      const p = this.players.get(b.id);
      if (p && !p.bot && p.connected) continue;
      // decide while the next cell is still a tick or two off
      if (b.speed === 0 || b.p + (b.speed * 2) / TICK_HZ >= 1) pilot(world, b, this.rng);
    }
  }

  private layRound(): void {
    // whoever has been watching gets a bike now
    this.promote();
    const ids = this.participants().map((p) => p.id);
    if (ids.length < MIN_PLAYERS) return this.finish();
    for (const id of ids) if (!this.stats.has(id)) this.stats.set(id, freshStats(id));
    this.round++;
    this.roundSeq++;
    // the first round is always on the open floor; after that the floors take turns
    this.world = new World(makeArena(this.round - 1, ids.length), ids, this.settings, this.stats, this.rng);
    this.cleared = null;
    this.decided = false;
    this.phase = 'countdown';
    this.phaseLeftMs = COUNTDOWN_MS;
  }

  private closeRound(world: World): void {
    const survivor = world.bikes.find((b) => b.alive);
    const order = [...(survivor ? [{ id: survivor.id, by: '', how: '' as const }] : []), ...[...world.out].reverse()];
    const exits: Exit[] = order.map((o, i) => ({ id: o.id, by: o.by, how: o.how, place: i + 1, gained: world.gained.get(o.id) ?? 0 }));
    if (survivor) this.stats.get(survivor.id)!.wins++;
    this.cleared = { no: this.round, winner: survivor?.id ?? '', exits, last: this.leader() !== '' };
    this.phase = 'cleared';
    this.phaseLeftMs = CLEARED_MS;
  }

  /** Whoever has reached the target and leads alone, or ''. */
  private leader(): string {
    const ranked = [...this.stats.values()].filter((s) => this.players.has(s.id)).sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (!top || top.score < TARGETS[this.settings.length]) return '';
    return ranked[1]?.score === top.score ? '' : top.id;
  }

  private finish(): void {
    const stats = [...this.stats.values()].filter((s) => this.players.has(s.id)).map((s) => ({ ...s }));
    const best = Math.max(0, ...stats.map((s) => s.score));
    const top = stats.filter((s) => s.score === best);
    this.phase = 'finale';
    this.result = { winner: top.length === 1 ? top[0].id : '', rounds: this.round, stats };
  }

  private remove(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.spectator || this.phase === 'lobby' || this.phase === 'finale') return;
    this.world?.retire(id);
    if (this.participants().length === 0) this.toLobby();
  }

  protected toLobby(): void {
    this.phase = 'lobby';
    this.round = 0;
    this.world = null;
    this.cleared = null;
    this.result = null;
    this.decided = false;
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    this.reseat();
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
      watcher: p.watcher,
      score: this.stats.get(p.id)?.score ?? 0,
    }));
    return {
      game: this.gameNo,
      phase: this.phase,
      selfId: id,
      hostId: this.hostId(),
      players,
      settings: { ...this.settings },
      round: this.round && this.world ? { no: this.round, arena: this.world.arena.name, target: TARGETS[this.settings.length] } : null,
      cleared: this.cleared,
      result: this.result,
    };
  }

  /** The floor as it stands, for everyone when it is laid and for anyone who joins part-way. */
  arenaMessage(): ArenaMessage | null {
    const world = this.world;
    if (!world) return null;
    const { name, w, h, blocks } = world.arena;
    return { type: 'arena', seq: this.roundSeq, name, w, h, blocks, ring: world.ring, trails: world.trails() };
  }

  /** True while there is something to send snapshots about. */
  get live(): boolean {
    return !!this.world && (this.phase === 'countdown' || this.phase === 'play');
  }

  /** Positions and what just happened. Drains the events: call once per broadcast. */
  snapshot(): SnapMessage | null {
    const world = this.world;
    if (!world) return null;
    return {
      type: 'snap',
      simTimeMs: Math.round(this.simTimeMs),
      cd: this.phase === 'countdown' ? Math.max(0, Math.round(this.phaseLeftMs)) : 0,
      calm: Math.max(0, Math.round(SHRINK_AFTER_MS - world.ageMs)),
      bikes: world.bikeList(),
      fx: world.drainFx(),
    };
  }
}
