/** Every tunable number and palette lives here. Dependency-free (shared by client and server). */
import { STROKE_LIMITS } from '@tggame/base/party/draw/kit';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** Words dealt to each player at the start; they secretly pick one. */
export const CARD_SIZE = 4;
export { NAME_MAX } from '@tggame/base/shared/text';
export const GUESS_MAX = 40;

/** Drawings live on a fixed 4:3 page in integer page units, whatever the screen size. */
export { ERASER, ERASER_NIBS, INK, NIBS, PAGE_H, PAGE_W } from '@tggame/base/party/draw/kit';

/** Limits on a whole drawing, on top of the shared per-stroke ones. */
export const DRAW_LIMITS = {
  ...STROKE_LIMITS,
  maxStrokes: 500,
  maxPoints: 24000,
};

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
