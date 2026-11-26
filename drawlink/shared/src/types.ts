/** One marker stroke: colour index (or ERASER), width in page units, flat `x,y,x,y…` page coordinates. */
export type Stroke = { c: number; w: number; p: number[] };
export type Drawing = Stroke[];

/** `draw`: a round is running. `between`: the answer is on show before the next round. */
export type Phase = 'lobby' | 'draw' | 'between' | 'finale';

export type Settings = {
  rounds: number;
  /** Timed letter hints for the guessers. */
  hints: boolean;
};

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  connected: boolean;
  /** No seat (the table is full): watching and chatting only. */
  spectator: boolean;
  score: number;
  /** Votes to boot this player so far. */
  boots: number;
};

export type RoundView = {
  /** 1-based; a pass keeps the number. */
  round: number;
  rounds: number;
  /** Unique per turn (a pass starts a new turn); canvases are keyed on it. */
  turn: number;
  drawerId: string;
  /** Server clock (ms since epoch) when the drawer got the word. */
  startedAt: number;
  /** What guessers may know of the word so far; null until the blanks appear. */
  hint: string | null;
};

/** How the last round ended. Only present once it has. */
export type ResultView = {
  word: string;
  drawerId: string;
  /** Null when time ran out. */
  winnerId: string | null;
  award: number;
};

/** Public, per-player game state. Never contains the word of a running round. */
export type StateView = {
  /** Increments every time a game starts. */
  game: number;
  phase: Phase;
  selfId: string;
  hostId: string | null;
  players: PlayerView[];
  settings: Settings;
  round: RoundView | null;
  result: ResultView | null;
  /** Ids this player has voted to boot. */
  myBoots: string[];
  /** Votes needed to boot someone right now. */
  bootNeed: number;
};

/** The drawer's secret. Null for everyone else. */
export type Task = { word: string };

export type ChatLine = {
  seq: number;
  /** `say`: chat or a wrong guess. `whisper`: private. `win`/`info`: from the game itself. */
  kind: 'say' | 'whisper' | 'win' | 'info';
  text: string;
  fromId?: string;
  from?: string;
  color?: string;
  /** Whisper recipient. */
  toId?: string;
  to?: string;
};
