/**
 * The whole game as a pure state machine: no sockets, no timers, no clock of
 * its own. `index.ts` feeds it player actions and the current time, and asks
 * it what each player is allowed to see.
 */
import { randomBytes } from 'node:crypto';
import { fourOfAKind, fullDeck, type Card } from '../../shared/src/cards.js';
import {
  BOT_FOOLED,
  BOT_GRAB_MS,
  BOT_PASS_MS,
  BOT_REACT_MS,
  DEAL_MS,
  DEFAULT_ROUNDS,
  FALSE_GRAB_LOCK_MS,
  GRAB_CAP_MS,
  HAND_SIZE,
  HECKLE_BUTTON_MIN_MS,
  HECKLE_COOLDOWN_MS,
  HECKLE_MAX_LEVEL,
  HECKLE_STEP_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  REVEAL_MS,
  ROUND_OPTIONS,
} from '../../shared/src/constants.js';
import { pickFumble, pickHeckle } from '../../shared/src/heckles.js';
import { sanitizeName } from '../../shared/src/names.js';
import type { Phase, PlayerView, ResultView, Settings, Shout, StateView, Task } from '../../shared/src/types.js';
import { BOT_NAMES, botPass, type Rng } from './bots.js';

/** Players plus spectators a server will hold on to. */
const MAX_PEOPLE = 30;

type Player = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  /** Secret that lets a reconnecting client reclaim this seat. */
  token: string;
  connected: boolean;
  spectator: boolean;
  losses: number;
  fumbles: number;
  slowMs: number;
  lastHeckleAt: number;
};

/** One player's place in the running round. */
type Seat = {
  hand: Card[];
  /** The fifth card; while it is here the player owes the table a pass. */
  drawn: Card | null;
  heldSince: number;
  /** Cards passed to this player and not picked up yet, oldest first. */
  inbox: Card[];
  spoonAt: number | null;
  lockedUntil: number;
  /** Time spent holding the table up this round. */
  stallMs: number;
  /** Heckle steps already shouted for the card being held. */
  heckled: number;
  /** When whoever plays this seat automatically passes next. */
  autoPassAt: number;
  /** When a bot reaches for a spoon; null while it has no reason to. */
  autoGrabAt: number | null;
};

export type JoinResult = { id: string; token: string; resumed: boolean } | 'full';

export class Game {
  /** Everyone at the table, in arrival order; that is also the passing order. */
  readonly players = new Map<string, Player>();
  phase: Phase = 'lobby';
  /** Bumped each time a game starts. */
  gameNo = 0;
  settings: Settings = { rounds: DEFAULT_ROUNDS };
  /** 1-based round number. */
  round = 0;

  private seats = new Map<string, Seat>();
  /** Seated players in passing order for this round. */
  private order: string[] = [];
  private dealerId = '';
  /** Advances every round so the deal moves round the table. */
  private dealerTurn = 0;
  private deck: Card[] = [];
  private discard: Card[] = [];
  private startsAt = 0;
  private spoons = 0;
  private spoonsLeft = 0;
  private firstGrabAt: number | null = null;
  private winnerId: string | null = null;
  private winningCards: Card[] = [];
  private grabs: { id: string; ms: number }[] = [];
  private fumblerIds: string[] = [];
  private result: ResultView | null = null;
  private revealUntil = 0;
  private shout: Shout | null = null;
  private shoutSeq = 0;
  /** The time of the last action or tick. */
  private clock = 0;
  private nextId = 1;

  constructor(private readonly rng: Rng = Math.random) {}

  // ---- joining and leaving

  join(rawName: unknown, token: string | undefined, now: number): JoinResult {
    this.tick(now);
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
      name: this.uniqueName(sanitizeName(rawName) || 'Spooner'),
      color: this.freeColor(),
      bot: false,
      token: randomBytes(16).toString('hex'),
      connected: true,
      // mid-game arrivals watch until the next deal
      spectator: this.phase !== 'lobby' || this.participants().length >= MAX_PLAYERS,
      losses: 0,
      fumbles: 0,
      slowMs: 0,
      lastHeckleAt: -Infinity,
    };
    this.players.set(player.id, player);
    return { id: player.id, token: player.token, resumed: false };
  }

  /** Socket closed. A seat in a running game is kept for a reconnect (and played automatically meanwhile). */
  drop(id: string, now: number): void {
    this.tick(now);
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || p.spectator) this.remove(id, now);
    else {
      p.connected = false;
      const seat = this.seats.get(id);
      if (seat?.drawn) seat.autoPassAt = now + this.between(BOT_PASS_MS.min, BOT_PASS_MS.max);
    }
  }

  /** The player chose to go: the seat is given up for good. */
  leave(id: string, now: number): void {
    this.tick(now);
    this.remove(id, now);
  }

  addBot(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId() || this.participants().length >= MAX_PLAYERS) return;
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const free = BOT_NAMES.filter((n) => !taken.has(n));
    const base = free.length ? free[Math.floor(this.rng() * free.length)] : 'Spoonbot';
    const id = `b${this.nextId++}`;
    this.players.set(id, {
      id,
      name: this.uniqueName(base),
      color: this.freeColor(),
      bot: true,
      token: '',
      connected: true,
      spectator: false,
      losses: 0,
      fumbles: 0,
      slowMs: 0,
      lastHeckleAt: -Infinity,
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

  configure(by: string, rounds?: number): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (rounds !== undefined && (ROUND_OPTIONS as readonly number[]).includes(rounds)) this.settings.rounds = rounds;
  }

  start(by: string, now: number): void {
    this.tick(now);
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    if (this.participants().length < MIN_PLAYERS) return;
    this.gameNo++;
    for (const p of this.players.values()) {
      p.losses = p.fumbles = p.slowMs = 0;
      p.lastHeckleAt = -Infinity;
    }
    this.round = 1;
    this.dealerTurn = 0;
    this.deal(now);
  }

  /** Host: stop showing the result and get on with it. */
  skip(by: string, now: number): void {
    this.tick(now);
    if (this.phase !== 'reveal' || by !== this.hostId()) return;
    this.revealUntil = now;
    this.tick(now);
  }

  /** Back to the lobby after the finale. */
  again(by: string): void {
    if (this.phase === 'finale' && by === this.hostId()) this.toLobby();
  }

  /** Host bails out of a running game. */
  abort(by: string): void {
    if (this.phase !== 'lobby' && by === this.hostId()) this.toLobby();
  }

  /** Nobody is left: clear the table (bots included) so the next visitor finds an open lobby. */
  reset(): void {
    this.players.clear();
    this.toLobby();
  }

  /** Advance the clock: the deal, the pause between rounds, automatic seats, heckles. */
  tick(now: number): void {
    this.clock = now;
    if (this.phase === 'reveal') {
      if (now < this.revealUntil) return;
      if (this.round >= this.settings.rounds) return this.finish();
      this.round++;
      this.deal(now);
      return;
    }
    if (this.phase !== 'play' || now < this.startsAt) return;
    this.settle(now);
    if (this.firstGrabAt !== null && now - this.firstGrabAt >= GRAB_CAP_MS) return this.endRound(now);
    this.autoplay(now);
    if (this.phase === 'play') this.pester(now);
  }

  // ---- a player's moves

  /** Pass one of your five cards to the player on your left. */
  pass(id: string, card: Card, now: number): void {
    this.tick(now);
    this.doPass(id, card, now);
  }

  /** Reach for a spoon. Fine with four of a kind or once a spoon is gone; a fumble otherwise. */
  grab(id: string, now: number): void {
    this.tick(now);
    this.doGrab(id, now);
  }

  /** The Heckle button: shout at whoever has sat on a card longest. */
  heckle(by: string, now: number): void {
    this.tick(now);
    const p = this.players.get(by);
    if (!p || p.spectator || this.phase !== 'play' || this.firstGrabAt !== null) return;
    if (now - p.lastHeckleAt < HECKLE_COOLDOWN_MS) return;
    const target = this.slowest(now);
    if (!target || target.id === by || target.heldMs < HECKLE_BUTTON_MIN_MS) return;
    p.lastHeckleAt = now;
    this.shoutHeckle(target.id, Math.max(1, Math.floor(target.heldMs / HECKLE_STEP_MS)), by, now);
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
    const playing = this.phase === 'play';
    const players: PlayerView[] = [...this.players.values()].map((p) => {
      const seat = playing ? this.seats.get(p.id) : undefined;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot,
        connected: p.connected,
        spectator: p.spectator,
        losses: p.losses,
        fumbles: p.fumbles,
        slowMs: p.slowMs,
        waiting: seat && p.id !== this.dealerId ? seat.inbox.length : 0,
        heldSince: seat?.drawn ? seat.heldSince : null,
        hasSpoon: !!seat && seat.spoonAt !== null,
        lockedUntil: seat?.lockedUntil ?? 0,
      };
    });
    return {
      game: this.gameNo,
      phase: this.phase,
      selfId: id,
      hostId: this.hostId(),
      players,
      settings: { ...this.settings },
      round:
        this.phase === 'play' || this.phase === 'reveal'
          ? {
              round: this.round,
              rounds: this.settings.rounds,
              dealerId: this.dealerId,
              order: [...this.order],
              startsAt: this.startsAt,
              spoons: this.spoons,
              spoonsLeft: this.spoonsLeft,
            }
          : null,
      result: this.phase === 'reveal' ? this.result : null,
      shout: playing ? this.shout : null,
    };
  }

  /** A seated player's own cards while a round runs. Null for everybody else. */
  taskFor(id: string): Task | null {
    const seat = this.phase === 'play' ? this.seats.get(id) : undefined;
    if (!seat) return null;
    return { hand: [...seat.hand], drawn: seat.drawn, quad: !!fourOfAKind(cardsOf(seat)) };
  }

  // ---- the round

  private deal(now: number): void {
    this.promoteSpectators();
    const seated = this.participants();
    if (seated.length < 2) return this.finish();
    this.order = seated.map((p) => p.id);
    this.dealerId = this.order[this.dealerTurn++ % this.order.length];
    // the passing order starts at the dealer, so the last seat feeds the discard pile
    const at = this.order.indexOf(this.dealerId);
    this.order = [...this.order.slice(at), ...this.order.slice(0, at)];
    this.deck = shuffle(fullDeck(), this.rng);
    this.discard = [];
    this.seats.clear();
    for (const id of this.order) {
      this.seats.set(id, {
        hand: this.deck.splice(0, HAND_SIZE),
        drawn: null,
        heldSince: 0,
        inbox: [],
        spoonAt: null,
        lockedUntil: 0,
        stallMs: 0,
        heckled: 0,
        autoPassAt: 0,
        autoGrabAt: null,
      });
    }
    this.startsAt = now + DEAL_MS;
    this.spoons = this.spoonsLeft = this.order.length - 1;
    this.firstGrabAt = null;
    this.winnerId = null;
    this.winningCards = [];
    this.grabs = [];
    this.fumblerIds = [];
    this.result = null;
    this.shout = null;
    this.phase = 'play';
  }

  /** Everyone with a free hand and a card waiting picks it up. */
  private settle(now: number): void {
    for (const id of this.order) {
      const seat = this.seats.get(id)!;
      if (seat.drawn) continue;
      let card: Card | undefined;
      if (id === this.dealerId) {
        if (!this.deck.length && this.discard.length) {
          this.deck = shuffle(this.discard, this.rng);
          this.discard = [];
        }
        card = this.deck.shift();
      } else card = seat.inbox.shift();
      if (!card) continue;
      seat.drawn = card;
      seat.heldSince = now;
      seat.heckled = 0;
      seat.autoPassAt = now + this.between(BOT_PASS_MS.min, BOT_PASS_MS.max);
    }
  }

  private doPass(id: string, card: Card, now: number): void {
    const seat = this.seats.get(id);
    if (this.phase !== 'play' || !seat || !seat.drawn) return;
    if (card !== seat.drawn) {
      const at = seat.hand.indexOf(card);
      if (at < 0) return;
      // the new card takes the place of the one that left, so a hand never reshuffles under a thumb
      seat.hand[at] = seat.drawn;
    }
    if (this.firstGrabAt === null) seat.stallMs += stallOf(now - seat.heldSince);
    seat.drawn = null;
    const next = this.order[(this.order.indexOf(id) + 1) % this.order.length];
    if (next === this.dealerId) this.discard.push(card);
    else this.seats.get(next)!.inbox.push(card);
    this.settle(now);
  }

  private doGrab(id: string, now: number): void {
    const seat = this.seats.get(id);
    const p = this.players.get(id);
    if (this.phase !== 'play' || !seat || !p || now < this.startsAt) return;
    if (seat.spoonAt !== null || now < seat.lockedUntil) return;
    const quad = fourOfAKind(cardsOf(seat));
    if (this.firstGrabAt === null && !quad) return this.fumble(id, now);
    if (this.firstGrabAt === null) {
      this.firstGrabAt = now;
      this.winnerId = id;
      this.winningCards = quad!;
      // the scramble is on: nobody is "slow" any more
      for (const s of this.seats.values()) if (s.drawn) s.stallMs += stallOf(now - s.heldSince);
      this.shout = null;
    }
    seat.spoonAt = now;
    this.spoonsLeft--;
    this.grabs.push({ id, ms: now - this.firstGrabAt });
    if (this.spoonsLeft <= 0) this.endRound(now);
  }

  /** A grab at nothing: a loss on the spot, and a moment with your hand slapped away. */
  private fumble(id: string, now: number): void {
    const p = this.players.get(id)!;
    const seat = this.seats.get(id)!;
    p.losses++;
    p.fumbles++;
    seat.lockedUntil = now + FALSE_GRAB_LOCK_MS;
    this.fumblerIds.push(id);
    this.shout = { seq: ++this.shoutSeq, kind: 'fumble', targetId: id, byId: null, text: pickFumble(p.name, this.rng, this.shout?.text), level: 2, at: now };
    for (const otherId of this.order) {
      const other = this.seats.get(otherId)!;
      if (otherId === id || !this.players.get(otherId)?.bot || other.autoGrabAt !== null) continue;
      if (this.rng() < BOT_FOOLED) other.autoGrabAt = now + this.between(BOT_REACT_MS.min, BOT_REACT_MS.max);
    }
  }

  /** Bots play their seats; so does the seat of a human who has dropped off, minus the grabbing. */
  private autoplay(now: number): void {
    for (const id of this.order) {
      if (this.phase !== 'play') return;
      const p = this.players.get(id);
      const seat = this.seats.get(id);
      if (!p || !seat || (!p.bot && p.connected)) continue;
      if (p.bot && seat.spoonAt === null) {
        if (seat.autoGrabAt === null) {
          if (this.firstGrabAt !== null) seat.autoGrabAt = now + this.between(BOT_REACT_MS.min, BOT_REACT_MS.max);
          else if (fourOfAKind(cardsOf(seat))) seat.autoGrabAt = now + this.between(BOT_GRAB_MS.min, BOT_GRAB_MS.max);
        } else if (now >= seat.autoGrabAt) {
          seat.autoGrabAt = null;
          this.doGrab(id, now);
          continue;
        }
      }
      if (seat.drawn && now >= seat.autoPassAt) this.doPass(id, botPass(cardsOf(seat), this.rng), now);
    }
  }

  /** Whoever has sat on a card longest, if anybody is holding one. */
  private slowest(now: number): { id: string; heldMs: number } | null {
    let best: { id: string; heldMs: number } | null = null;
    for (const id of this.order) {
      const seat = this.seats.get(id)!;
      if (!seat.drawn) continue;
      const heldMs = now - seat.heldSince;
      if (!best || heldMs > best.heldMs) best = { id, heldMs };
    }
    return best;
  }

  /** The game's own heckling: one more shout, a level ruder, each time the slowest player lets another step go by. */
  private pester(now: number): void {
    if (this.firstGrabAt !== null) return;
    const slow = this.slowest(now);
    if (!slow) return;
    const seat = this.seats.get(slow.id)!;
    const steps = Math.floor(slow.heldMs / HECKLE_STEP_MS);
    if (steps <= seat.heckled) return;
    seat.heckled = steps;
    this.shoutHeckle(slow.id, steps, null, now);
  }

  private shoutHeckle(targetId: string, level: number, byId: string | null, now: number): void {
    const lvl = Math.min(HECKLE_MAX_LEVEL, level);
    const text = pickHeckle(lvl, this.nameOf(targetId), this.rng, this.shout?.text);
    this.shout = { seq: ++this.shoutSeq, kind: 'heckle', targetId, byId, text, level: lvl, at: now };
  }

  private endRound(now: number): void {
    const loserIds = this.order.filter((id) => this.seats.get(id)!.spoonAt === null);
    let slowpokeId: string | null = null;
    let slowpokeMs = 0;
    for (const id of this.order) {
      const p = this.players.get(id);
      const seat = this.seats.get(id)!;
      if (!p) continue;
      if (seat.spoonAt === null) p.losses++;
      p.slowMs += seat.stallMs;
      if (seat.stallMs > slowpokeMs) [slowpokeId, slowpokeMs] = [id, seat.stallMs];
    }
    this.result = {
      round: this.round,
      winnerId: this.winnerId,
      cards: this.winningCards,
      grabs: this.grabs,
      loserIds,
      fumblerIds: this.fumblerIds,
      slowpokeId,
      slowpokeMs,
      nextAt: now + REVEAL_MS,
    };
    this.revealUntil = now + REVEAL_MS;
    this.shout = null;
    this.phase = 'reveal';
  }

  private finish(): void {
    this.phase = 'finale';
    this.seats.clear();
    this.result = null;
    this.shout = null;
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

  /** Take a player out for good, keeping a running game on its feet. */
  private remove(id: string, now: number): void {
    const p = this.players.get(id);
    if (!p) return;
    const seated = !p.spectator;
    this.players.delete(id);
    if (this.phase === 'lobby') {
      this.promoteSpectators();
      // bots do not wait around in an empty lobby
      if (this.humansConnected() === 0) this.players.clear();
      return;
    }
    if (!seated || this.phase === 'finale') return;
    if (this.participants().length < 2) return this.finish();
    // their cards are gone with them: a round in progress is dealt afresh
    if (this.phase === 'play') this.deal(now);
  }

  private toLobby(): void {
    this.phase = 'lobby';
    this.round = 0;
    this.seats.clear();
    this.order = [];
    this.dealerId = '';
    this.result = null;
    this.shout = null;
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    let n = 0;
    for (const p of this.players.values()) p.spectator = ++n > MAX_PLAYERS;
  }

  /** A free seat goes to whoever has been watching longest. */
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

const cardsOf = (seat: Seat): Card[] => (seat.drawn ? [...seat.hand, seat.drawn] : seat.hand);

/** How much of a hold counts as holding the table up. */
const stallOf = (heldMs: number): number => Math.max(0, heldMs - HECKLE_STEP_MS);

function shuffle<T>(list: T[], rng: Rng): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
