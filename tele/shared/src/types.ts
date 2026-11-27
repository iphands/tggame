import type { Drawing } from '@tggame/base/party/draw/kit';

export type { Drawing, Stroke } from '@tggame/base/party/draw/kit';

export type Phase = 'lobby' | 'pick' | 'draw' | 'guess' | 'reveal' | 'finale';

/** One page of a sketchbook. `skipped` pages were filled in by the host skipping a stalled player. */
export type Page =
  | { kind: 'word'; text: string; by: string; skipped?: boolean }
  | { kind: 'drawing'; strokes: Drawing; by: string; skipped?: boolean };

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  connected: boolean;
  /** Joined mid-game: watching until the next one. */
  spectator: boolean;
  /** Has handed in this turn's page. */
  done: boolean;
};

/** What a player has to do right now. This is the only secret a client ever holds. */
export type Task =
  | { kind: 'pick'; card: string[] }
  | { kind: 'draw'; word: string; from: string }
  | { kind: 'guess'; strokes: Drawing; from: string };

export type RevealView = {
  /** Index of the book being read aloud. */
  book: number;
  /** How many of its pages are face up. */
  shown: number;
  pageCount: number;
  ownerId: string;
};

/** A finished player shouting at a slow one. Everyone at the table sees it. */
export type Heckle = {
  /** Goes up with every heckle, so clients can tell a new one from the one they have shown. */
  seq: number;
  targetId: string;
  byId: string;
  text: string;
  /** 1 (nudge) to 3 (the whole table yelling). */
  level: number;
};

/** Public, per-player game state. Never contains pages; those arrive separately once revealed. */
export type StateView = {
  /** Increments every time a game starts; clients drop cached pages when it changes. */
  game: number;
  phase: Phase;
  /** 0 = picking words, then 1..turns. */
  turn: number;
  turns: number;
  selfId: string;
  hostId: string | null;
  players: PlayerView[];
  /** Ids of the players in this game, in passing order (book `i` belongs to `seats[i]`). */
  seats: string[];
  /** True when this player has handed in the current turn. */
  submitted: boolean;
  reveal: RevealView | null;
  /** `"book:page"` → heart count. */
  hearts: Record<string, number>;
  /** Keys this player has hearted. */
  myHearts: string[];
  /** The latest heckle of this turn, if any. */
  heckle: Heckle | null;
};

/** A page that has become visible to a player. */
export type PageRef = { book: number; index: number; page: Page };
