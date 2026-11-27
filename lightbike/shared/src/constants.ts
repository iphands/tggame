/** Every number that shapes the game. Speeds are in cells per second, energy runs from 0 to 1. */

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
/** A snapshot goes out every this many ticks (30 a second). */
export const SNAP_EVERY_TICKS = 2;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const NAME_MAX = 16;
export const MAX_PAYLOAD_BYTES = 2048;
/** A table nobody is connected to goes back to an empty lobby after this long. */
export const ABANDON_MS = 90_000;

// ---- match flow

export const COUNTDOWN_MS = 3000;
/** The last crash plays out for this long before the round's result is shown. */
export const ROUND_END_MS = 1400;
/** How long the round's result stays up. */
export const CLEARED_MS = 5000;

/** How fast a bike goes with nothing helping it. */
export const PACES = ['chill', 'normal', 'spicy', 'silly'] as const;
export const PACE_SPEED = { chill: 11, normal: 15, spicy: 19, silly: 25 } as const;
export const DEFAULT_PACE = 'normal';

/** The match ends after the round in which somebody reaches this score (and leads alone). */
export const TARGETS = { short: 10, normal: 20, long: 35 } as const;
export const LENGTHS = ['short', 'normal', 'long'] as const;
export const DEFAULT_LENGTH = 'normal';

/** Points for each rider who crashes while you are still going. */
export const POINTS_OUTLIVE = 1;
/** Points when somebody crashes into your line. */
export const POINTS_CUT_OFF = 1;

// ---- the toys

/** Boost: speed gained per second of holding it, as a share of the pace. */
export const BOOST_GAIN = 0.45;
/** A full bar is this many seconds of boost. */
export const BOOST_SECONDS = 3.2;
/** Slipstream: speed gained per second of riding beside somebody else's line. */
export const SLIP_GAIN = 0.3;
/** How many cells to either side count as "beside". */
export const SLIP_REACH = 2;
/** Extra speed, however it was earned, is capped at this share of the pace. */
export const EXTRA_MAX = 0.8;
/** With neither boost nor slipstream the extra speed drains away at this share of the pace per second. */
export const EXTRA_DECAY = 0.25;
/** The bar refills in this many seconds while the boost is off. */
export const ENERGY_REFILL_SECONDS = 12;
/** Buster: what it costs, and how long the bike then passes through lines. */
export const BUST_COST = 0.5;
export const BUST_MS = 700;
/** A crashed rider's line fades over this long when the host has "erase" on. */
export const ERASE_FADE_MS = 1000;
/** Turns a rider may have waiting. Two quick taps make a U-turn. */
export const TURN_QUEUE = 2;
/** A turn may be booked for a cell at most this far ahead of where the server has the bike. */
export const TURN_LEAD_CELLS = 3;

// ---- the walls close in

/** The rim starts moving inward this long into a round… */
export const SHRINK_AFTER_MS = 40_000;
/** …one cell at a time, this often. */
export const SHRINK_EVERY_MS = 700;

/** Once only bots are riding, the round runs this many times faster. */
export const FAST_FINISH = 4;

// ---- bots

/** How many cells a bot counts when it asks "how much room is that way?". */
export const BOT_LOOK_CELLS = 500;
/** How often a bot simply does not look (it is only a machine). */
export const BOT_BLUNDER = 0.012;
/** How often, per cell, a bot turns for no reason at all. */
export const BOT_WHIM = 0.03;

// ---- bit flags in a bike snapshot

export const FLAG_DEAD = 1;
export const FLAG_BOOST = 2;
export const FLAG_BUST = 4;
export const FLAG_SLIP = 8;

/** Bright enough to glow on a dark floor. */
export const PLAYER_COLORS = ['#3de0e0', '#ff6bcb', '#ffc23d', '#3ddc84', '#ff5d5d', '#4da3ff', '#c77dff', '#ff8c42', '#a3e635', '#f5f6fa'] as const;

export const BOT_NAMES = ['Skid', 'Wheelie', 'Sprocket', 'Kickstand', 'Vroomhilda', 'Sir Skidsalot', 'Two-Stroke', 'Dynamo', 'Handlebar', 'Backfire'] as const;
