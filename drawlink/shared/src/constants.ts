/** Every tunable number and palette lives here. Dependency-free (shared by client and server). */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;
export const NAME_MAX = 16;
/** Longest chat line; guesses are chat lines. */
export const CHAT_MAX = 80;

// ---- the round

/** A round is worth this much the instant the drawer gets the word… */
export const MAX_AWARD = 120;
/** …and loses this much… */
export const AWARD_STEP = 10;
/** …every time this long passes. At zero the round is over. */
export const AWARD_STEP_MS = 10_000;
export const ROUND_MS = (MAX_AWARD / AWARD_STEP) * AWARD_STEP_MS;
/** How long the answer stays on screen before the next round. */
export const BETWEEN_MS = 6_000;
/** A drawer whose connection is gone this long passes automatically. */
export const DRAWER_GRACE_MS = 12_000;

/** Letter hints: a blank per letter from this moment (0 = as soon as the round starts)… */
export const HINT_BLANKS_MS = 0;
/** …the first letter at this moment, and another every `HINT_STEP_MS` after it. */
export const HINT_FIRST_MS = 10_000;
export const HINT_STEP_MS = 10_000;
/** The deck only deals answers of at most this many words (hyphens count as spaces). */
export const MAX_ANSWER_WORDS = 2;
/** Stands for a hidden letter in a hint. */
export const HINT_BLANK = '_';

/** Table settings the host picks in the lobby. */
export const ROUND_OPTIONS = [5, 10, 15, 20] as const;
export const DEFAULT_ROUNDS = 10;

/** Chat lines kept for late joiners and reconnects. */
export const CHAT_KEEP = 80;
/** Shortest gap between two chat lines from one player. */
export const CHAT_GAP_MS = 250;

/** Drawings live on a fixed 4:3 page in integer page units, whatever the screen size. */
export const PAGE_W = 1000;
export const PAGE_H = 750;

export const DRAW_LIMITS = {
  maxStrokes: 600,
  maxPointsPerStroke: 1500,
  maxPoints: 40000,
  /** Bucket fills per drawing: each one is a flood on every screen, every repaint. */
  maxFills: 40,
  minWidth: 2,
  maxWidth: 90,
};

/** Marker colours; a stroke stores an index into this list. */
export const INK = [
  '#1f2440', // ink
  '#e63946', // red
  '#ff8c42', // orange
  '#ffc21a', // yellow
  '#3fa34d', // green
  '#19a7ce', // sky
  '#3d5af1', // blue
  '#8e44d9', // purple
  '#ff6fb5', // pink
  '#8d5a3b', // brown
] as const;

/** Stroke colour index meaning "erase" (rendered with destination-out). */
export const ERASER = -1;

/** Nib widths in page units. */
export const NIBS = [5, 11, 24] as const;
export const ERASER_NIBS = [16, 34, 64] as const;

/** Sticky-note colours handed to players in join order. */
export const PLAYER_COLORS = [
  '#ffd23f',
  '#ff8fab',
  '#7bdff2',
  '#b8f2a6',
  '#ffb26b',
  '#cdb4ff',
  '#f7a072',
  '#9be7c4',
  '#ffe08a',
  '#a0c4ff',
  '#ffadad',
  '#d0f4de',
  '#f1c0e8',
  '#90dbf4',
  '#e9c46a',
  '#c8e7a0',
] as const;

/** Guessbots blurt a guess every so often (ms, uniform)… */
export const BOT_GUESS_MS = { min: 6_000, max: 15_000 };
/** …and with this chance per round they "get it" somewhere in this window after the round starts. */
export const BOT_EUREKA = { chance: 0.6, min: 35_000, max: 110_000 };

/** How often the server checks the clock (timeouts, hints, bots). */
export const TICK_MS = 250;

/** Largest WebSocket frame a client may send (ink arrives in small batches). */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

/** A game with no connected humans is cleared after this long (a reload or a dropped phone gets time to return). */
export const ABANDON_MS = 90_000;
