/**
 * The whole game as a pure state machine: no sockets, no timers, no clock of
 * its own. `index.ts` feeds it player actions and the current time, and asks
 * it what each player is allowed to see.
 */
import { randomBytes } from 'node:crypto';
import {
  BETWEEN_MS,
  BOT_EUREKA,
  BOT_GUESS_MS,
  CHAT_GAP_MS,
  CHAT_KEEP,
  DEFAULT_ROUNDS,
  DRAWER_GRACE_MS,
  DRAW_LIMITS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  ROUND_MS,
  ROUND_OPTIONS,
} from '../../shared/src/constants.js';
import { givesAway, hasInk, sameWord, sanitizeChat, sanitizeName, sanitizeStroke } from '../../shared/src/drawing.js';
import { awardAt, hintAt } from '../../shared/src/round.js';
import { WORDS } from '../../shared/src/words.js';
import type { InkEvent } from '../../shared/src/protocol.js';
import type { ChatLine, Drawing, Phase, PlayerView, ResultView, Settings, StateView, Task } from '../../shared/src/types.js';
import { BOT_NAMES, botGuess, type Rng } from './bots.js';

/** Players plus spectators a server will hold on to. */
const MAX_PEOPLE = 40;

type Player = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  /** Secret that lets a reconnecting client reclaim this seat. */
  token: string;
  connected: boolean;
  spectator: boolean;
  score: number;
  /** When the connection went away (only meaningful while `connected` is false). */
  goneAt: number;
  lastChatAt: number;
};

/** A chat line plus who may read it (everyone when `only` is absent). */
type StoredLine = ChatLine & { only?: string[] };

export type JoinResult = { id: string; token: string; resumed: boolean } | 'full' | 'booted';

export class Game {
  /** Everyone at the table, in arrival order; that is also the drawing order. */
  readonly players = new Map<string, Player>();
  phase: Phase = 'lobby';
  /** Bumped each time a game starts. */
  gameNo = 0;
  settings: Settings = { rounds: DEFAULT_ROUNDS, hints: true };
  /** 1-based round number; a pass does not advance it. */
  round = 0;
  /** Bumped every time a drawer gets a word. Never reset, so it identifies a canvas. */
  turnNo = 0;
  drawerId: string | null = null;
  /** The canvas of the current turn. */
  strokes: Drawing = [];

  private word = '';
  private startedAt = 0;
  private points = 0;
  private result: ResultView | null = null;
  private betweenUntil = 0;
  private deck: string[] = [];
  /** Who draws next when the drawer was removed before their turn ended. */
  private heir: string | null = null;
  /** Target id → ids of the players who want them gone. */
  private boots = new Map<string, Set<string>>();
  /** Seat tokens that were voted out; they do not get back in until the table is cleared. */
  private banned = new Set<string>();
  private lines: StoredLine[] = [];
  private seq = 0;
  private ink: InkEvent[] = [];
  private kicked: string[] = [];
  private resync = false;
  /** Per bot: when it speaks next, and when (if ever) it works the answer out this turn. */
  private plans = new Map<string, { nextAt: number; eurekaAt: number | null }>();
  /** The time of the last action or tick; views are computed as of this moment. */
  private clock = 0;
  private nextId = 1;

  constructor(private readonly rng: Rng = Math.random) {}

  // ---- joining and leaving

  join(rawName: unknown, token: string | undefined, now: number): JoinResult {
    this.tick(now);
    if (token) {
      if (this.banned.has(token)) return 'booted';
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
      name: this.uniqueName(sanitizeName(rawName) || 'Doodler'),
      color: this.freeColor(),
      bot: false,
      token: randomBytes(16).toString('hex'),
      connected: true,
      // mid-game arrivals sit straight down while there is a free seat
      spectator: this.participants().length >= MAX_PLAYERS,
      score: 0,
      goneAt: 0,
      lastChatAt: 0,
    };
    this.players.set(player.id, player);
    this.info(`${player.name} ${player.spectator ? 'is watching' : 'sat down'}.`);
    return { id: player.id, token: player.token, resumed: false };
  }

  /** Socket closed. A seat in a running game is kept for a reconnect. */
  drop(id: string, now: number): void {
    this.tick(now);
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || p.spectator) this.remove(id, now);
    else {
      p.connected = false;
      p.goneAt = now;
    }
  }

  /** The player chose to go: the seat is given up for good. */
  leave(id: string, now: number): void {
    this.tick(now);
    const p = this.players.get(id);
    if (!p) return;
    this.info(`${p.name} left.`);
    this.remove(id, now);
  }

  addBot(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId() || this.participants().length >= MAX_PLAYERS) return;
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const free = BOT_NAMES.filter((n) => !taken.has(n));
    const base = free.length ? free[Math.floor(this.rng() * free.length)] : 'Guessbot';
    const id = `b${this.nextId++}`;
    this.players.set(id, {
      id,
      name: this.uniqueName(base),
      color: this.freeColor(),
      bot: true,
      token: '',
      connected: true,
      spectator: false,
      score: 0,
      goneAt: 0,
      lastChatAt: 0,
    });
  }

  removeBot(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    const bot = [...this.players.values()].reverse().find((p) => p.bot);
    if (bot) this.players.delete(bot.id);
  }

  /** The first connected human: seated players first, then anyone. Null when nobody is here. */
  hostId(): string | null {
    const humans = [...this.players.values()].filter((p) => !p.bot && p.connected);
    return (humans.find((p) => !p.spectator) ?? humans[0])?.id ?? null;
  }

  // ---- game flow

  configure(by: string, rounds?: number, hints?: boolean): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (rounds !== undefined && (ROUND_OPTIONS as readonly number[]).includes(rounds)) this.settings.rounds = rounds;
    if (hints !== undefined) this.settings.hints = hints;
  }

  start(by: string, now: number): void {
    this.tick(now);
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (this.participants().length < MIN_PLAYERS) return;
    const first = this.nextDrawer(null);
    if (!first) return;
    this.gameNo++;
    for (const p of this.players.values()) p.score = 0;
    this.deck = [];
    this.boots.clear();
    this.round = 1;
    this.info(`Game on: ${this.settings.rounds} rounds.`);
    this.beginTurn(first, now);
  }

  /** The drawer swaps their word for a fresh one, handing the pen on. The round number stays. */
  pass(id: string, now: number): void {
    this.tick(now);
    if (this.phase !== 'draw' || id !== this.drawerId) return;
    const next = this.nextDrawer(id);
    if (!next) return;
    this.info(`${this.nameOf(id)} passed on “${this.word}”.`);
    this.beginTurn(next, now);
  }

  /** Back to the lobby after the finale. */
  again(by: string): void {
    if (this.phase === 'finale' && by === this.hostId()) this.toLobby();
  }

  /** Host bails out of a running game. */
  abort(by: string): void {
    if (this.phase !== 'lobby' && by === this.hostId()) this.toLobby();
  }

  /** Nobody is left: clear the table (bots and bans included) so the next visitor finds an open lobby. */
  reset(): void {
    this.players.clear();
    this.banned.clear();
    this.lines = [];
    this.toLobby();
  }

  /** Advance the clock: time-outs, the pause between rounds, absent drawers, bots. */
  tick(now: number): void {
    this.clock = now;
    if (this.phase === 'between') {
      if (now < this.betweenUntil) return;
      if (this.round >= this.settings.rounds) return this.finish();
      const next = this.nextDrawer(this.drawerId);
      if (!next || this.participants().length < 2) return this.finish();
      this.round++;
      this.beginTurn(next, now);
      return;
    }
    if (this.phase !== 'draw') return;
    if (now - this.startedAt >= ROUND_MS) {
      this.info(`Time's up! It was “${this.word}”.`);
      this.endRound(null, 0, now);
      return;
    }
    const drawer = this.players.get(this.drawerId!);
    if (drawer && !drawer.connected && now - drawer.goneAt >= DRAWER_GRACE_MS) {
      const next = this.nextDrawer(drawer.id);
      // only worth passing to somebody who is actually here
      if (next && next !== drawer.id && this.players.get(next)!.connected) {
        this.info(`${drawer.name} wandered off. It was “${this.word}”.`);
        this.beginTurn(next, now);
        return;
      }
    }
    if (this.humansConnected() === 0) return; // nobody to play for
    for (const [id, plan] of this.plans) {
      if (plan.eurekaAt !== null && now >= plan.eurekaAt && hasInk(this.strokes)) {
        this.say(id, this.word, undefined, now);
        return; // the round is over
      }
      if (now >= plan.nextAt) {
        plan.nextAt = now + this.between(BOT_GUESS_MS.min, BOT_GUESS_MS.max);
        const guess = botGuess(this.rng);
        if (!sameWord(guess, this.word)) this.say(id, guess, undefined, now);
      }
    }
  }

  // ---- the canvas (drawer only)

  /** Append points to stroke `i`: the last stroke, or a new one right after it. */
  inkAdd(id: string, i: number, c: number, w: number, p: unknown): void {
    if (this.phase !== 'draw' || id !== this.drawerId) return;
    const s = sanitizeStroke({ c, w, p });
    const n = s ? s.p.length / 2 : 0;
    const last = this.strokes[this.strokes.length - 1];
    if (!s || this.points + n > DRAW_LIMITS.maxPoints) return this.outOfSync();
    if (i === this.strokes.length && i < DRAW_LIMITS.maxStrokes) {
      // the stored stroke keeps growing; the event must not grow with it
      this.strokes.push({ ...s, p: s.p.slice() });
    } else if (last && i === this.strokes.length - 1 && last.p.length / 2 + n <= DRAW_LIMITS.maxPointsPerStroke) {
      for (const v of s.p) last.p.push(v);
    } else {
      return this.outOfSync();
    }
    this.points += n;
    const stroke = this.strokes[i];
    this.ink.push({ type: 'ink', turn: this.turnNo, i, c: stroke.c, w: stroke.w, p: s.p });
  }

  inkUndo(id: string): void {
    if (this.phase !== 'draw' || id !== this.drawerId) return;
    const s = this.strokes.pop();
    if (!s) return;
    this.points -= s.p.length / 2;
    this.ink.push({ type: 'undo', turn: this.turnNo });
  }

  inkClear(id: string): void {
    if (this.phase !== 'draw' || id !== this.drawerId || !this.strokes.length) return;
    this.strokes = [];
    this.points = 0;
    this.ink.push({ type: 'clear', turn: this.turnNo });
  }

  /** Canvas changes since the last call, for everyone but the drawer (who made them). */
  takeInk(): InkEvent[] {
    const out = this.ink;
    this.ink = [];
    return out;
  }

  /** True once after the drawer sent ink that did not fit: they need the canvas sent again. */
  takeResync(): boolean {
    const r = this.resync;
    this.resync = false;
    return r;
  }

  // ---- chat, guesses, whispers

  /** One line from a player. During a round a seated non-drawer's line is a guess first and chat second. */
  chat(id: string, rawText: unknown, to: string | undefined, now: number): void {
    this.tick(now);
    const p = this.players.get(id);
    const text = sanitizeChat(rawText);
    if (!p || !text || now - p.lastChatAt < CHAT_GAP_MS) return;
    p.lastChatAt = now;
    this.say(id, text, to, now);
  }

  private say(id: string, text: string, to: string | undefined, now: number): void {
    const p = this.players.get(id);
    if (!p) return;
    const live = this.phase === 'draw';
    if (live && id === this.drawerId && givesAway(text, this.word)) {
      this.info('No spelling it out! Draw it.', [id]);
      return;
    }
    if (to !== undefined) {
      const target = this.players.get(to);
      if (!target || target.bot || to === id) return;
      this.push({ kind: 'whisper', text, fromId: id, from: p.name, color: p.color, toId: to, to: target.name }, [id, to]);
      return;
    }
    if (live && !p.spectator && id !== this.drawerId && sameWord(text, this.word)) {
      const award = awardAt(now - this.startedAt);
      const drawer = this.players.get(this.drawerId!);
      p.score += award;
      if (drawer) drawer.score += award;
      this.push({
        kind: 'win',
        text: `${p.name} got it: “${this.word}”! +${award} for ${p.name}${drawer ? ` and ${drawer.name}` : ''}.`,
        fromId: id,
        from: p.name,
        color: p.color,
      });
      this.endRound(id, award, now);
      return;
    }
    this.push({ kind: 'say', text, fromId: id, from: p.name, color: p.color });
  }

  /** Lines `id` may read that are newer than `after`. */
  chatFor(id: string, after: number): ChatLine[] {
    const out: ChatLine[] = [];
    for (const { only, ...line } of this.lines) {
      if (line.seq > after && (!only || only.includes(id))) out.push(line);
    }
    return out;
  }

  // ---- voting someone out

  /** Toggle `by`'s vote to boot `target`. More than half of the seated humans who are here carries it. */
  boot(by: string, target: string, now: number): void {
    this.tick(now);
    const voter = this.players.get(by);
    const t = this.players.get(target);
    if (!voter || !t || by === target || voter.bot || voter.spectator || !voter.connected) return;
    const set = this.boots.get(target) ?? new Set<string>();
    if (!set.delete(by)) set.add(by);
    if (set.size) this.boots.set(target, set);
    else this.boots.delete(target);
    if (set.size < this.bootNeed()) return;
    if (!t.bot) {
      this.banned.add(t.token);
      this.kicked.push(target);
    }
    this.info(`${t.name} was voted out.`);
    this.remove(target, now);
  }

  /** Ids voted out since the last call; their sockets must be told and let go. */
  takeKicked(): string[] {
    const out = this.kicked;
    this.kicked = [];
    return out;
  }

  humansConnected(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot && p.connected) n++;
    return n;
  }

  botCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.bot) n++;
    return n;
  }

  // ---- what a player may see

  viewFor(id: string): StateView {
    const playing = this.phase === 'draw' || this.phase === 'between';
    const players: PlayerView[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      bot: p.bot,
      connected: p.connected,
      spectator: p.spectator,
      score: p.score,
      boots: this.boots.get(p.id)?.size ?? 0,
    }));
    const myBoots: string[] = [];
    for (const [target, set] of this.boots) if (set.has(id)) myBoots.push(target);
    return {
      game: this.gameNo,
      phase: this.phase,
      selfId: id,
      hostId: this.hostId(),
      players,
      settings: { ...this.settings },
      round:
        playing && this.drawerId
          ? {
              round: this.round,
              rounds: this.settings.rounds,
              turn: this.turnNo,
              drawerId: this.drawerId,
              startedAt: this.startedAt,
              hint: this.phase === 'draw' && this.settings.hints ? hintAt(this.word, this.clock - this.startedAt) : null,
            }
          : null,
      result: this.phase === 'between' || this.phase === 'finale' ? this.result : null,
      myBoots,
      bootNeed: this.bootNeed(),
    };
  }

  /** The word, for the drawer of a running round. Null for everybody else. */
  taskFor(id: string): Task | null {
    return this.phase === 'draw' && id === this.drawerId ? { word: this.word } : null;
  }

  // ---- internals

  private participants(): Player[] {
    return [...this.players.values()].filter((p) => !p.spectator);
  }

  private nameOf(id: string | null): string {
    return (id && this.players.get(id)?.name) || 'someone';
  }

  private between(lo: number, hi: number): number {
    return lo + this.rng() * (hi - lo);
  }

  private bootNeed(): number {
    const voters = this.participants().filter((p) => !p.bot && p.connected).length;
    return Math.floor(voters / 2) + 1;
  }

  private outOfSync(): void {
    this.resync = true;
  }

  /**
   * Who draws after `afterId` (null: from the top). Bots never draw. Someone who
   * is connected is preferred; failing that any seated human, `afterId` included.
   */
  private nextDrawer(afterId: string | null): string | null {
    const seats = this.participants();
    if (this.heir && seats.some((p) => p.id === this.heir && p.connected)) return this.heir;
    const from = seats.findIndex((p) => p.id === afterId);
    const order = seats.map((_, k) => seats[(from + 1 + k) % seats.length]).filter((p) => !p.bot);
    return (order.find((p) => p.connected) ?? order[0])?.id ?? null;
  }

  private beginTurn(drawerId: string, now: number): void {
    if (!this.deck.length) this.deck = shuffle([...WORDS], this.rng);
    this.heir = null;
    this.drawerId = drawerId;
    this.word = this.deck.pop()!;
    this.startedAt = now;
    this.strokes = [];
    this.points = 0;
    this.ink = [];
    this.result = null;
    this.turnNo++;
    this.phase = 'draw';
    this.plans.clear();
    for (const p of this.participants()) {
      if (!p.bot) continue;
      this.plans.set(p.id, {
        nextAt: now + this.between(BOT_GUESS_MS.min, BOT_GUESS_MS.max),
        eurekaAt: this.rng() < BOT_EUREKA.chance ? now + this.between(BOT_EUREKA.min, BOT_EUREKA.max) : null,
      });
    }
  }

  private endRound(winnerId: string | null, award: number, now: number): void {
    this.result = { word: this.word, drawerId: this.drawerId!, winnerId, award };
    this.phase = 'between';
    this.betweenUntil = now + BETWEEN_MS;
    this.plans.clear();
  }

  private finish(): void {
    // cut short mid-round: there is no result to show, and the word stays secret
    if (this.phase === 'draw') this.result = null;
    this.phase = 'finale';
    this.plans.clear();
    this.info('Game over!');
  }

  /** Take a player out for good, keeping a running game on its feet. */
  private remove(id: string, now: number): void {
    if (!this.players.has(id)) return;
    const wasDrawer = this.phase !== 'lobby' && id === this.drawerId;
    if (wasDrawer) {
      const next = this.nextDrawer(id);
      this.heir = next === id ? null : next;
    }
    this.players.delete(id);
    this.plans.delete(id);
    this.boots.delete(id);
    for (const [target, set] of this.boots) {
      set.delete(id);
      if (!set.size) this.boots.delete(target);
    }
    this.promoteSpectators();
    if (this.phase === 'lobby') {
      // bots do not wait around in an empty lobby
      if (this.humansConnected() === 0) this.players.clear();
      return;
    }
    if (this.phase !== 'draw') return;
    const next = wasDrawer ? this.nextDrawer(null) : this.drawerId;
    if (!next || this.participants().length < 2) return this.finish();
    if (wasDrawer) {
      this.info(`The word was “${this.word}”.`);
      this.beginTurn(next, now);
    }
  }

  private toLobby(): void {
    this.phase = 'lobby';
    this.round = 0;
    this.drawerId = null;
    this.heir = null;
    this.word = '';
    this.strokes = [];
    this.points = 0;
    this.ink = [];
    this.result = null;
    this.plans.clear();
    this.boots.clear();
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    let n = 0;
    for (const p of this.players.values()) p.spectator = ++n > MAX_PLAYERS;
  }

  /** A freed seat goes to whoever has been watching longest. */
  private promoteSpectators(): void {
    let n = this.participants().length;
    for (const p of this.players.values()) {
      if (n >= MAX_PLAYERS) break;
      if (p.spectator) {
        p.spectator = false;
        n++;
      }
    }
  }

  private info(text: string, only?: string[]): void {
    this.push({ kind: 'info', text }, only);
  }

  private push(line: Omit<ChatLine, 'seq'>, only?: string[]): void {
    this.lines.push({ ...line, seq: ++this.seq, ...(only ? { only } : {}) });
    if (this.lines.length > CHAT_KEEP) this.lines.splice(0, this.lines.length - CHAT_KEEP);
  }

  private uniqueName(base: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private freeColor(): string {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
  }
}

function shuffle<T>(list: T[], rng: Rng): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
