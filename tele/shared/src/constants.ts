/** Every tunable number and palette lives here. Dependency-free (shared by client and server). */
import { STROKE_LIMITS } from '@tggame/base/party/draw/kit';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;
/** Words dealt to each player at the start; they secretly pick one. */
export const CARD_SIZE = 4;
export { NAME_MAX } from '@tggame/base/shared/text';
export const GUESS_MAX = 40;

/**
 * Who passes to whom. `fixed`: seats in the order people joined, books move one seat per turn.
 * `round`: seats are shuffled for every game. `turn`: that, and books also hop around so you
 * get pages from a different player each turn.
 */
export const ORDERS = ['fixed', 'round', 'turn'] as const;
export const DEFAULT_ORDER: (typeof ORDERS)[number] = 'round';

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
  '#ff6b6b',
  '#8ecae6',
  '#e9c46a',
  '#f9c6e8',
  '#d0a3ff',
  '#90e0ef',
] as const;

/** Bot think time (ms) is drawn uniformly from this range by the server. */
/** A finished player may heckle this often; faster taps are dropped. */
export const HECKLE_COOLDOWN_MS = 300;
/** A slow player's heckles get louder every this many, within one turn. */
export const HECKLES_PER_LEVEL = 3;
/** How long a heckle stays on everyone's screen. */
export const HECKLE_SHOW_MS = 2600;

export const BOT_DELAY_MS = { min: 900, max: 2600 };

/** Largest WebSocket frame a client may send (a full drawing fits comfortably). */
export const MAX_PAYLOAD_BYTES = 512 * 1024;

/** A game with no connected humans is cleared after this long (a reload or a dropped phone gets time to return). */
export const ABANDON_MS = 90_000;
