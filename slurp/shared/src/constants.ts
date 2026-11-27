/** Every tunable number and palette lives here. Dependency-free (shared by client and server). */

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
export { NAME_MAX } from '@tggame/base/shared/text';

// ---- the clock the simulation runs on

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
/** A snapshot goes out every this many ticks (30 per second). */
export const SNAP_EVERY_TICKS = 2;

// ---- the table

/** Table size for one player on the first course, in world units. */
export const TABLE_W = 1000;
export const TABLE_H = 700;
/** Each course after the first is this much wider and taller. */
export const COURSE_GROWTH = 0.04;

/** How much bigger the table's area is for `players` on course `no` than for one player on course 1. */
export function areaFactor(players: number, no: number): number {
  const side = 1 + COURSE_GROWTH * (no - 1);
  return (0.5 + 0.5 * players) * side * side;
}

/** Table width and height for `players` on course `no`. */
export function tableSize(players: number, no: number): { w: number; h: number } {
  const k = Math.sqrt(areaFactor(players, no));
  return { w: Math.round(TABLE_W * k), h: Math.round(TABLE_H * k) };
}

// ---- food

/** Smallest first. `value` is how much a hole grows by eating one. */
export const TIERS = [
  { name: 'berry', r: 10, value: 1 },
  { name: 'cookie', r: 18, value: 3 },
  { name: 'sandwich', r: 28, value: 8 },
  { name: 'pie', r: 40, value: 16 },
  { name: 'melon', r: 56, value: 31 },
] as const;
export const MAX_FOOD_R = 56;

/** How many of each tier a one-player table holds on course 1 (when that tier is in play). */
export const BASE_COUNTS = [56, 32, 15, 7, 2] as const;
/** How many tiers course `no` uses. */
export const tiersInCourse = (no: number): number => Math.min(TIERS.length, no + 1);
/** Later courses are more crowded. */
export const countFactor = (no: number): number => 0.85 + 0.05 * no;
/** The share of food laid near the table's edge. */
export const edgeShare = (no: number): number => Math.min(0.4, 0.04 + 0.04 * no);

// ---- holes

export const HOLE_R0 = 18;
/** Radius is `HOLE_R0 * sqrt(1 + mass / GROW_K)`. */
export const GROW_K = 20;
/** A hole can eat food whose radius is at most this share of its own. */
export const EAT_RATIO = 0.9;
/** Food is swallowed once its centre is this far (in food radii) inside the rim. */
export const EAT_INSET = 0.35;
/** When one hole eats, every other hole grows by this share of the bite. */
export const TEAM_SHARE = 0.25;
/** Top speed, world units per second. */
export const HOLE_SPEED = 480;
/** How eagerly a hole closes the last stretch to its aim point (per second). */
export const HOLE_FOLLOW = 10;
/** The aim point is kept within this distance of the hole. */
export const AIM_LEASH = 240;

// ---- physics

/** Edible food this close to the rim (in hole radii) is drawn in. */
export const PULL_REACH = 0.7;
/** World units per second squared. */
export const PULL_ACCEL = 1500;
/** How long a swallow takes. */
export const SWALLOW_MS = 150;
/** Share of a shove's speed the food keeps. */
export const PUSH_KEEP = 0.7;
export const MAX_FOOD_SPEED = 650;
/** Food slows by this factor per second (exponential). */
export const FRICTION = 5;
/** Slower than this and food stops dead. */
export const SLEEP_SPEED = 6;
export const BOUNCE = 0.2;
/** A shove counts as somebody's doing for this long (spills, herding). */
export const PUSH_MEMORY_MS = 4000;

// ---- courses and the clock

export const COURSES = 8;
export const COUNTDOWN_MS = 3000;
export const CLEARED_MS = 6000;
/** Time allowed on course `no` at normal difficulty. */
export const courseTimeMs = (no: number): number => 36_000 + 3_000 * (no - 1);
/** This share of the unused time is carried into the next course… */
export const CARRY_SHARE = 0.5;
/** …up to this much. */
export const CARRY_MAX_MS = 12_000;
/** Food knocked off the table costs this much time… */
export const SPILL_PENALTY_MS = 3000;
/** …and is put back after this long. */
export const RESPAWN_MS = 3000;

export const DIFFICULTIES = ['chill', 'normal', 'spicy'] as const;
export const DEFAULT_DIFFICULTY = 'normal';
/** Clock multiplier per difficulty. */
export const CLOCK_FACTOR = { chill: 1.4, normal: 1, spicy: 0.75 } as const;

/** Stars for a cleared course: share of the clock left for two and for three. */
export const STAR_2 = 0.12;
export const STAR_3 = 0.3;

// ---- bots

/** A bot picks a new target this often. */
export const BOT_THINK_MS = 250;

/** Rim colours handed to players in join order. */
export const PLAYER_COLORS = ['#ffd23f', '#ff8fab', '#7bdff2', '#b8f2a6', '#ffb26b', '#cdb4ff', '#f7a072', '#9be7c4', '#ffe08a', '#a0c4ff'] as const;

/** Largest WebSocket frame a client may send. */
export const MAX_PAYLOAD_BYTES = 4 * 1024;

/** A game with no connected humans is cleared after this long (a reload or a dropped phone gets time to return). */
export const ABANDON_MS = 90_000;
