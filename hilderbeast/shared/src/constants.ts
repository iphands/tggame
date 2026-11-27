/** Every tunable number in the game. Rules read these; nothing else holds a magic number. */

// ---- the loop

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
/** A snapshot every other tick: 30 a second. */
export const SNAP_EVERY_TICKS = 2;

// ---- the table

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const MAX_PAYLOAD_BYTES = 2048;
/** A table nobody is connected to is cleared after this long. */
export const ABANDON_MS = 90_000;

export const PLAYER_COLORS = ['#ff5d73', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388ff', '#ff9f43', '#f78fb3', '#9be564', '#e0e0e0', '#c98b5b'] as const;

export const MODES = ['last', 'escape'] as const;
export const DEFAULT_MODE = 'last';

// ---- the house

/** Side of one map square, in world units. */
export const TILE = 40;
/** A player is a circle this big. */
export const BODY_R = 13;
/** How far anyone sees, walls permitting. */
export const SIGHT_R = 400;

// ---- moving

/** World units a second at 1.0x. */
export const BASE_SPEED = 190;

export const ROLE = {
  cousin: {
    speed: 1,
    /** Slower than the Beast's boost, but it lasts as long as the energy does. */
    boost: 1.35,
  },
  beast: {
    speed: 1.05,
    /** A short, sharp burst. */
    boost: 1.9,
  },
} as const;

// ---- a Cousin's energy

export const ENERGY_MAX = 100;
export const ENERGY_START = 60;
/** A full bar is four seconds of boost. */
export const ENERGY_DRAIN_PER_S = 25;
/** A boost cannot start on less than this, so an empty bar does not stutter. */
export const ENERGY_TO_START = 10;
export const PILL_ENERGY = 40;
/** A Cousin this near a pill takes it. */
export const PILL_R = 22;
export const PILL_BACK_MS = 20_000;

// ---- a Beast's burst

export const BEAST_BOOST_MS = 1200;
/** From the moment the burst starts. */
export const BEAST_BOOST_COOLDOWN_MS = 9000;

// ---- the lunge

/** The Beast rears back and cannot move: this is the warning a Cousin gets. */
export const LUNGE_WINDUP_MS = 180;
export const LUNGE_DASH_MS = 180;
export const LUNGE_SPEED = 2.6;
/** A Cousin this near a dashing Beast, with no wall between, is caught. */
export const CATCH_R = 30;
/** A lunge that catches nobody leaves the Beast stumbling for this long, at this speed. */
export const LUNGE_MISS_MS = 700;
export const LUNGE_MISS_SPEED = 0.55;
/** After a catch the Beast cannot lunge again for this long, so a crowd is not swept in one go. */
export const CATCH_COOLDOWN_MS = 2000;
/** A caught Cousin stands frozen and harmless for this long, then is a Beast. */
export const CONVERT_MS = 2500;

// ---- Beast doors

export const PORTAL_R = 15;
/** Time spent out of sight between the two ends. */
export const PORTAL_TRANSIT_MS = 400;
/** Per Beast, from the moment it comes out. */
export const PORTAL_COOLDOWN_MS = 4000;

// ---- a round

export const COUNTDOWN_MS = 3000;
/** The first Beast stays in its den this long after the countdown. */
export const HEAD_START_MS = 6000;
/** Last Cousin Standing: Cousins still free when this runs out have won. */
export const LAST_CLOCK_MS = 240_000;
/** Escape: the Beasts win when this runs out. */
export const ESCAPE_CLOCK_MS = 360_000;

// ---- Escape: chores and doors

/** One Cousin, working alone, finishes a chore in this long. */
export const TASK_WORK_MS = 8000;
export const TASK_R = 46;
/** Each helper after the first adds this much speed. */
export const HELP_RATE = 0.6;
/** A chore being worked on is heard by the Beasts this often. */
export const NOISE_EVERY_MS = 3000;
/** How far off the true spot a noise may be reported. */
export const NOISE_BLUR = 110;
/** How long a noise stays on a Beast's screen. */
export const NOISE_SHOW_MS = 4000;
export const EXIT_R = 46;
/** Hold the action this long at an open exit to get out. */
export const ESCAPE_HOLD_MS = 1500;
/** Chores in a round: one more than there are Cousins, within these bounds. */
export const TASKS_MIN = 3;
export const TASKS_MAX = 7;

export const tasksFor = (cousins: number): number => Math.min(TASKS_MAX, Math.max(TASKS_MIN, cousins + 1));

// ---- bots

export const BOT_THINK_MS = 150;

// ---- what a snapshot says about a body

export const F_BEAST = 1;
export const F_BOOST = 2;
/** Rearing back before a lunge. */
export const F_WINDUP = 4;
export const F_DASH = 8;
/** Stumbling after a missed lunge. */
export const F_MISS = 16;
/** Just caught: frozen while it turns into a Beast. */
export const F_CONVERT = 32;
/** Between two Beast doors: nowhere to be seen. */
export const F_PORTAL = 64;
/** Working on a chore, or on the way out of an exit. */
export const F_WORK = 128;
/** The first Beast, still held in its den. */
export const F_HELD = 256;
/** Escaped: out of the round. */
export const F_OUT = 512;
