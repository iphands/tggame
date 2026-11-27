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

// ---- dread: a Cousin's sense that a Beast is near

/** A Cousin starts to feel a Beast this far off, walls or no walls. Further than they can see. */
export const DREAD_R = 560;
/** At this distance the dread is complete. */
export const DREAD_FULL_R = 110;
/** Dread is sent in this many steps: enough to feel it rise, too coarse to find the Beast by. */
export const DREAD_STEPS = 12;

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
    /** No faster than a Cousin on foot: a touch is a catch, so the Beast must earn it with its boosts, the doors and its friends. */
    speed: 1,
    /** A short, sharp burst. */
    boost: 1.7,
  },
} as const;

// ---- a Cousin's energy

export const ENERGY_MAX = 100;
export const ENERGY_START = 80;
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
export const BEAST_BOOST_COOLDOWN_MS = 10_000;

// ---- catching, and the Beast's dash

/** A Beast that touches a Cousin has caught them: their two bodies this near, with no wall between. */
export const TOUCH_R = BODY_R * 2 + 2;
/** After a catch that Beast cannot catch again for this long, so a huddle is not swept in one step. */
export const CATCH_COOLDOWN_MS = 800;
/** The Beast's second, smaller boost: a quick dash on its own short cooldown. */
export const DASH_MS = 260;
export const DASH_SPEED = 2;
/** From the moment the dash starts. */
export const DASH_COOLDOWN_MS = 4000;
/** Every catch stops the round, for everyone, while it is shown. */
export const CUTSCENE_MS = 2500;
/** Once the round goes on, the Cousin just caught stands frozen and harmless for this long, then is a Beast. */
export const CONVERT_MS = 1200;

// ---- traps: they only ever trouble Cousins

/** How fast a Cousin wades through goo. */
export const GOO_SPEED = 0.5;
/** Spikes: one whole turn of down, warning, up. */
export const SPIKE_CYCLE_MS = 3000;
export const SPIKE_WARN_AT_MS = 1500;
export const SPIKE_UP_AT_MS = 2100;
/** Caught on the spikes: this much energy gone, and a limp (no boost) for this long. */
export const SPIKE_ENERGY = 30;
export const HURT_MS = 1600;
export const HURT_SPEED = 0.6;
/** One Cousin sets off creaky boards no more often than this. */
export const CREAK_EVERY_MS = 2500;

// ---- ghosts

/** A ghost drifts a little faster than anyone walks, and straight through walls. */
export const GHOST_SPEED = 1.3;

// ---- Beast doors

export const PORTAL_R = 15;
/** Time spent out of sight between the two ends. */
export const PORTAL_TRANSIT_MS = 400;
/** Per Beast, from the moment it comes out. */
export const PORTAL_COOLDOWN_MS = 4000;

// ---- a round

/** No wait before a round: the Cousins run at once, and the count everyone sees is the Beast's. */
export const COUNTDOWN_MS = 0;
/** The first Beast is held where it starts for this long, counted down on every screen, while the Cousins get away. */
export const HEAD_START_MS = 3000;
/** The Beast starts somewhere different each round, never this near (in squares) to where a Cousin starts, nor in sight of one. */
export const BEAST_START_CLEAR = 9;
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
/** A Cousin who touches an open exit is out, at once: nothing to hold. */
export const EXIT_R = BODY_R + 14;
/** Chores in a round: one more than there are Cousins, within these bounds. */
export const TASKS_MIN = 3;
export const TASKS_MAX = 7;

export const tasksFor = (cousins: number): number => Math.min(TASKS_MAX, Math.max(TASKS_MIN, cousins + 1));

// ---- bots

export const BOT_THINK_MS = 150;

// ---- what a snapshot says about a body

export const F_BEAST = 1;
export const F_BOOST = 2;
/** Caught in Escape: a ghost, out of the game but free to roam the house and watch. */
export const F_GHOST = 4;
/** A Beast in its dash. */
export const F_DASH = 8;
/** A Cousin wading through goo. */
export const F_SLOW = 16;
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
/** A Cousin limping after the spikes. */
export const F_HURT = 1024;
