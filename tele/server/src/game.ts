/**
 * The whole game as a pure state machine: no sockets, no clocks. `index.ts`
 * feeds it player actions and asks it what each player is allowed to see.
 */
import { randomBytes } from 'node:crypto';
import { CARD_SIZE, HECKLE_COOLDOWN_MS, HECKLES_PER_LEVEL, MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '../../shared/src/constants.js';
import { HECKLE_MAX_LEVEL, pickHeckle } from '../../shared/src/heckles.js';
import { hasInk, sanitizeDrawing, sanitizeGuess, sanitizeName } from '../../shared/src/drawing.js';
import { bookHeldBy, turnCount, turnKind } from '../../shared/src/rotation.js';
import { heartKey } from '../../shared/src/awards.js';
import { WORDS } from '../../shared/src/words.js';
import type { Heckle, Page, PageRef, Phase, PlayerView, StateView, Task } from '../../shared/src/types.js';
import { Roster, shuffle } from '@tggame/base/party/roster';
import { BOT_NAMES, botDoodle, botGuess, type Rng } from './bots.js';

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
};

export type JoinResult = { id: string; token: string; resumed: boolean };

export class Game extends Roster<Player> {
  phase: Phase = 'lobby';
  /** Bumped each time a game starts. */
  gameNo = 0;
  turn = 0;
  turns = 0;
  /** Player ids in passing order; book `i` belongs to `seats[i]`. */
  seats: string[] = [];
  books: Page[][] = [];
  /** Word cards dealt per seat. */
  private cards: string[][] = [];
  /** This turn's handed-in pages per seat; applied to the books when everyone is done. */
  private pending: (Page | null)[] = [];
  private lastHeckle: Heckle | null = null;
  private heckleSeq = 0;
  /** Heckles each player has taken this turn. */
  private heckleCounts = new Map<string, number>();
  /** When each player last heckled, for the cooldown. */
  private lastHeckleAt = new Map<string, number>();
  private reveal = { book: 0, shown: 0 };
  private hearts = new Map<string, Set<string>>();

  constructor(rng: Rng = Math.random) {
    super(rng, MAX_PLAYERS, PLAYER_COLORS);
  }

  // ---- joining and leaving

  join(rawName: unknown, token?: string): JoinResult | null {
    if (token) {
      for (const p of this.players.values()) {
        if (!p.bot && p.token === token) {
          p.connected = true;
          return { id: p.id, token: p.token, resumed: true };
        }
      }
    }
    if (this.players.size >= MAX_PEOPLE) return null;
    const inLobby = this.phase === 'lobby';
    if (inLobby && this.participants().length >= MAX_PLAYERS) {
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
      spectator: !inLobby || this.participants().length >= MAX_PLAYERS,
    };
    this.players.set(player.id, player);
    return { id: player.id, token: player.token, resumed: false };
  }

  /** Socket closed or the player chose to leave. Seats in a running game are kept for a reconnect. */
  drop(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || p.spectator) {
      this.players.delete(id);
      // bots do not wait around in an empty lobby
      if (this.phase === 'lobby' && this.humansConnected() === 0) this.players.clear();
      this.promoteSpectators();
    } else {
      p.connected = false;
    }
  }

  addBot(by: string): void {
    if (!this.canAddBot(by)) return;
    const id = `b${this.nextId++}`;
    this.players.set(id, {
      id,
      name: this.botName(BOT_NAMES, 'Doodlebot'),
      color: this.freeColor(),
      bot: true,
      token: '',
      connected: true,
      spectator: false,
    });
  }

  // ---- game flow

  start(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    const seated = this.participants();
    if (seated.length < MIN_PLAYERS || seated.length > MAX_PLAYERS) return;
    this.gameNo++;
    this.seats = seated.map((p) => p.id);
    this.books = this.seats.map(() => []);
    const deck = shuffle([...WORDS], this.rng);
    this.cards = this.seats.map((_, i) => deck.slice(i * CARD_SIZE, (i + 1) * CARD_SIZE));
    this.pending = this.seats.map(() => null);
    this.quietDown();
    this.hearts.clear();
    this.turn = 0;
    this.turns = turnCount(this.seats.length);
    this.phase = 'pick';
  }

  pick(id: string, index: number): void {
    const seat = this.seatOf(id);
    if (this.phase !== 'pick' || seat < 0) return;
    const text = this.cards[seat][index];
    if (text === undefined) return;
    this.submit(seat, { kind: 'word', text, by: id });
  }

  /** Start the book with a word of the player's own instead of one from their card. */
  write(id: string, rawText: unknown): void {
    const seat = this.seatOf(id);
    if (this.phase !== 'pick' || seat < 0) return;
    const text = sanitizeGuess(rawText);
    if (!text) return;
    this.submit(seat, { kind: 'word', text, by: id });
  }

  draw(id: string, rawStrokes: unknown): void {
    const seat = this.seatOf(id);
    if (this.phase !== 'draw' || seat < 0) return;
    const strokes = sanitizeDrawing(rawStrokes);
    if (!strokes || !hasInk(strokes)) return;
    this.submit(seat, { kind: 'drawing', strokes, by: id });
  }

  guess(id: string, rawText: unknown): void {
    const seat = this.seatOf(id);
    if (this.phase !== 'guess' || seat < 0) return;
    const text = sanitizeGuess(rawText);
    if (!text) return;
    this.submit(seat, { kind: 'word', text, by: id });
  }

  /** Host fills in a blank for a player who is holding everyone up. */
  skip(by: string, targetId: string): void {
    if (by !== this.hostId()) return;
    const seat = this.seatOf(targetId);
    if (seat < 0 || this.pending[seat]) return;
    if (this.phase === 'pick') {
      const card = this.cards[seat];
      this.submit(seat, { kind: 'word', text: card[Math.floor(this.rng() * card.length)], by: targetId, skipped: true });
    } else if (this.phase === 'draw') {
      this.submit(seat, { kind: 'drawing', strokes: [], by: targetId, skipped: true });
    } else if (this.phase === 'guess') {
      this.submit(seat, { kind: 'word', text: '???', by: targetId, skipped: true });
    }
  }

  /**
   * A player who has handed in their page shouts at one who has not. Spamming is the point, so
   * the only brake is a short cooldown; the more one player is heckled in a turn, the louder it gets.
   */
  heckle(by: string, targetId: string, now: number): void {
    if (!this.isTurnPhase()) return;
    const seat = this.seatOf(by);
    const targetSeat = this.seatOf(targetId);
    if (seat < 0 || targetSeat < 0 || by === targetId) return;
    if (!this.pending[seat] || this.pending[targetSeat]) return;
    if (now - (this.lastHeckleAt.get(by) ?? -Infinity) < HECKLE_COOLDOWN_MS) return;
    this.lastHeckleAt.set(by, now);
    const count = (this.heckleCounts.get(targetId) ?? 0) + 1;
    this.heckleCounts.set(targetId, count);
    const level = Math.min(HECKLE_MAX_LEVEL, 1 + Math.floor((count - 1) / HECKLES_PER_LEVEL));
    const name = this.players.get(targetId)?.name ?? 'you';
    this.lastHeckle = {
      seq: ++this.heckleSeq,
      targetId,
      byId: by,
      text: pickHeckle(level, name, this.rng, this.lastHeckle?.text),
      level,
    };
  }

  /** Turn the next page of the reveal. Allowed for the book's owner and the host. */
  next(by: string): void {
    if (this.phase !== 'reveal') return;
    if (by !== this.hostId() && by !== this.seats[this.reveal.book]) return;
    if (this.reveal.shown < this.books[this.reveal.book].length) {
      this.reveal.shown++;
    } else if (this.reveal.book < this.books.length - 1) {
      this.reveal = { book: this.reveal.book + 1, shown: 1 };
    } else {
      this.phase = 'finale';
    }
  }

  /** Toggle a heart on a revealed page. You cannot heart your own work. */
  heart(by: string, book: number, page: number): void {
    if (!this.players.has(by) || !this.isVisible(book, page)) return;
    if (this.books[book][page].by === by) return;
    const key = heartKey(book, page);
    const set = this.hearts.get(key) ?? new Set<string>();
    if (!set.delete(by)) set.add(by);
    if (set.size) this.hearts.set(key, set);
    else this.hearts.delete(key);
  }

  /** Nobody is left: clear the table (bots included) so the next visitor finds an open lobby. */
  reset(): void {
    this.players.clear();
    this.toLobby();
  }

  // ---- bots

  botsPending(): boolean {
    return this.pendingBotSeat() >= 0;
  }

  /** Let one waiting bot take its turn. */
  stepBot(): void {
    const seat = this.pendingBotSeat();
    if (seat < 0) return;
    const id = this.seats[seat];
    if (this.phase === 'pick') this.pick(id, Math.floor(this.rng() * CARD_SIZE));
    else if (this.phase === 'draw') this.draw(id, botDoodle(this.rng));
    else if (this.phase === 'guess') this.guess(id, botGuess(this.rng));
  }

  // ---- what a player may see

  viewFor(id: string): StateView {
    const seat = this.seatOf(id);
    const inTurn = this.isTurnPhase();
    const players: PlayerView[] = [...this.players.values()].map((p) => {
      const s = this.seatOf(p.id);
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot,
        connected: p.connected,
        spectator: p.spectator,
        done: inTurn && s >= 0 && this.pending[s] !== null,
      };
    });
    const hearts: Record<string, number> = {};
    const myHearts: string[] = [];
    for (const [key, set] of this.hearts) {
      hearts[key] = set.size;
      if (set.has(id)) myHearts.push(key);
    }
    return {
      game: this.gameNo,
      phase: this.phase,
      turn: this.turn,
      turns: this.turns,
      selfId: id,
      hostId: this.hostId(),
      players,
      seats: this.seats,
      submitted: inTurn && seat >= 0 && this.pending[seat] !== null,
      reveal:
        this.phase === 'reveal'
          ? {
              book: this.reveal.book,
              shown: this.reveal.shown,
              pageCount: this.books[this.reveal.book].length,
              ownerId: this.seats[this.reveal.book],
            }
          : null,
      hearts,
      myHearts,
      heckle: inTurn ? this.lastHeckle : null,
    };
  }

  /** The single previous page this player is working from, or null (spectator, lobby, reveal). */
  taskFor(id: string): Task | null {
    const seat = this.seatOf(id);
    if (seat < 0) return null;
    if (this.phase === 'pick') return { kind: 'pick', card: this.cards[seat] };
    if (this.phase !== 'draw' && this.phase !== 'guess') return null;
    const book = this.books[bookHeldBy(seat, this.turn, this.seats.length)];
    const prev = book[book.length - 1];
    const from = this.players.get(prev.by)?.name ?? '?';
    if (this.phase === 'draw' && prev.kind === 'word') return { kind: 'draw', word: prev.text, from };
    if (this.phase === 'guess' && prev.kind === 'drawing') return { kind: 'guess', strokes: prev.strokes, from };
    return null;
  }

  /** Pages that are face up for everyone: nothing until the reveal, then one page at a time. */
  visiblePages(): PageRef[] {
    const out: PageRef[] = [];
    if (this.phase !== 'reveal' && this.phase !== 'finale') return out;
    this.books.forEach((pages, book) =>
      pages.forEach((page, index) => {
        if (this.isVisible(book, index)) out.push({ book, index, page });
      }),
    );
    return out;
  }

  // ---- internals

  private isVisible(book: number, page: number): boolean {
    if (!this.books[book]?.[page]) return false;
    if (this.phase === 'finale') return true;
    if (this.phase !== 'reveal') return false;
    return book < this.reveal.book || (book === this.reveal.book && page < this.reveal.shown);
  }

  private isTurnPhase(): boolean {
    return this.phase === 'pick' || this.phase === 'draw' || this.phase === 'guess';
  }

  private seatOf(id: string): number {
    return this.phase === 'lobby' ? -1 : this.seats.indexOf(id);
  }

  private pendingBotSeat(): number {
    if (!this.isTurnPhase()) return -1;
    return this.seats.findIndex((id, seat) => this.pending[seat] === null && this.players.get(id)?.bot);
  }

  /** Record a seat's page (resubmitting replaces it); when the last one lands, every book passes on. */
  /** A new turn starts with a clean slate: nobody has been heckled yet. */
  private quietDown(): void {
    this.lastHeckle = null;
    this.heckleCounts.clear();
    this.lastHeckleAt.clear();
  }

  private submit(seat: number, page: Page): void {
    this.pending[seat] = page;
    if (this.pending.some((p) => p === null)) return;
    const n = this.seats.length;
    this.pending.forEach((p, s) => this.books[bookHeldBy(s, this.turn, n)].push(p!));
    this.pending = this.seats.map(() => null);
    this.quietDown();
    this.turn++;
    if (this.turn > this.turns) {
      this.phase = 'reveal';
      this.reveal = { book: 0, shown: 1 };
    } else {
      this.phase = turnKind(this.turn);
    }
  }

  protected toLobby(): void {
    this.phase = 'lobby';
    this.turn = 0;
    this.turns = 0;
    this.seats = [];
    this.books = [];
    this.cards = [];
    this.pending = [];
    this.quietDown();
    this.hearts.clear();
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    let n = 0;
    for (const p of this.players.values()) p.spectator = ++n > MAX_PLAYERS;
  }

  private promoteSpectators(): void {
    if (this.phase !== 'lobby') return;
    let n = this.participants().length;
    for (const p of this.players.values()) {
      if (n >= MAX_PLAYERS) break;
      if (p.spectator) {
        p.spectator = false;
        n++;
      }
    }
  }

}
