/** Every tunable number and palette lives here. Dependency-free (shared by client and server). */

export const MIN_PLAYERS = 3;
/** Up to eight play with one deck; a bigger table shuffles in a second (`decksFor`). */
export const MAX_PLAYERS = 16;
export { NAME_MAX } from '@tggame/base/shared/text';
export const HAND_SIZE = 4;
/** Cards a deal must leave over, to keep the deck flowing: eight hands of four leave twenty of one deck. */
export const SPARE_CARDS = 20;
/** How many 52-card decks are shuffled together for this many players: one up to eight, then more. */
export const decksFor = (players: number): number => Math.max(1, Math.ceil((players * HAND_SIZE + SPARE_CARDS) / 52));

// ---- the round

/** Hands are dealt, then everyone gets this long to look before cards start moving. */
export const DEAL_MS = 3_000;
/** Once the first spoon is gone, the round ends this long after at the latest. */
export const GRAB_CAP_MS = 10_000;
/**
 * A grab is judged by when the hand moved, not by when word of it arrived: each player's round
 * trip is taken off, up to this much. A grab then waits at most this long before it is given its
 * spoon, in case one from a slower line turns out to have been quicker.
 */
export const GRAB_FAIR_CAP_MS = 300;
/** A false grab keeps your hand off the spoons for this long. */
export const FALSE_GRAB_LOCK_MS = 3_000;
/** How long the round's result stays up before the next deal. */
export const REVEAL_MS = 9_000;

/** Table settings the host picks in the lobby. */
export const ROUND_OPTIONS = [5, 8, 12] as const;
export const DEFAULT_ROUNDS = 8;

// ---- pestering

/** Sitting on a card this long earns the first heckle; every further step earns another, a level ruder. */
export const HECKLE_STEP_MS = 4_000;
export const HECKLE_MAX_LEVEL = 3;
/** The Heckle button works on anyone who has sat on a card at least this long. */
export const HECKLE_BUTTON_MIN_MS = 2_500;
/** Shortest gap between two button heckles from one player. */
export const HECKLE_COOLDOWN_MS = 3_000;
/** How long a heckle (or any other shout) stays on every screen. */
export const SHOUT_MS = 3_500;

// ---- bots

/** A bot passes this long after picking a card up (ms, uniform)… */
export const BOT_PASS_MS = { min: 700, max: 2_200 };
/** …grabs this long after completing four of a kind… */
export const BOT_GRAB_MS = { min: 300, max: 1_000 };
/** …notices a missing spoon after this long… */
export const BOT_REACT_MS = { min: 700, max: 2_500 };
/** …and falls for somebody else's false grab this often. */
export const BOT_FOOLED = 0.15;

/** Sticky-note colours handed to players in join order. */
export const PLAYER_COLORS = [
  '#ffd23f', '#ff8fab', '#7bdff2', '#b8f2a6', '#ffb26b', '#cdb4ff', '#f7a072', '#9be7c4', '#ffe08a', '#a0c4ff',
  '#ff6b6b', '#c3f0ca', '#f9c6e8', '#8ecae6', '#e9c46a', '#d0a3ff', '#ffadad', '#a8dadc', '#fdffb6', '#bdb2ff',
  '#ffc8a2', '#90e0ef', '#e5989b', '#b5e48c',
] as const;

/** How often the server checks the clock (deals, heckles, bots). */
export const TICK_MS = 100;

/** Largest WebSocket frame a client may send. */
export const MAX_PAYLOAD_BYTES = 4 * 1024;

/** A game with no connected humans is cleared after this long (a reload or a dropped phone gets time to return). */
export const ABANDON_MS = 90_000;
