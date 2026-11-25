/** Every tunable number and palette lives here. Dependency-free (shared by client and server). */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** Words dealt to each player at the start; they secretly pick one. */
export const CARD_SIZE = 4;
export const NAME_MAX = 16;
export const GUESS_MAX = 40;

/** Drawings live on a fixed 4:3 page in integer page units, whatever the screen size. */
export const PAGE_W = 1000;
export const PAGE_H = 750;

export const DRAW_LIMITS = {
  maxStrokes: 500,
  maxPointsPerStroke: 1500,
  maxPoints: 24000,
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
] as const;

/** Bot think time (ms) is drawn uniformly from this range by the server. */
export const BOT_DELAY_MS = { min: 900, max: 2600 };

/** Largest WebSocket frame a client may send (a full drawing fits comfortably). */
export const MAX_PAYLOAD_BYTES = 512 * 1024;

/** A game with no connected humans is cleared after this long (a reload or a dropped phone gets time to return). */
export const ABANDON_MS = 90_000;
