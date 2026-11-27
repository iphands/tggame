import type { DIFFICULTIES } from './constants.js';

/**
 * `countdown`: the table is laid and holes may move, nothing can be eaten yet. `play`: the clock
 * runs. `cleared`: the table is empty and the next course is on its way. `finale`: the run is over.
 */
export type Phase = 'lobby' | 'countdown' | 'play' | 'cleared' | 'finale';

export type Difficulty = (typeof DIFFICULTIES)[number];
export type Settings = { difficulty: Difficulty };

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  connected: boolean;
  /** No hole right now: they arrived mid-course (or the table is full) and get one at the next course. */
  spectator: boolean;
};

export type CourseView = {
  /** 1-based. */
  no: number;
  of: number;
  /** The whole clock for this course, carried time included. */
  timeMs: number;
  /** How many food tiers are on the table. */
  tiers: number;
};

/** How much each hole ate on one course, hungriest first. */
export type Bites = { id: string; eaten: number }[];

/** One course of the run: who ate what, and whether the table was cleared in time. */
export type CourseTally = { no: number; cleared: boolean; bites: Bites };

/** How the course just cleared went. */
export type ClearedView = {
  no: number;
  /** 1 to 3. */
  stars: number;
  leftMs: number;
  spills: number;
  /** Time taken along to the next course. */
  carryMs: number;
  /** Who ate how much on this course. */
  bites: Bites;
};

export type PlayerStats = {
  id: string;
  /** Pieces of food eaten. */
  eaten: number;
  /** Largest tier eaten, -1 for none. */
  biggest: number;
  /** Food this player knocked off the table. */
  spills: number;
  /** Food this player pushed into a teammate's hole. */
  herds: number;
};

/** The whole run, shown in the finale. */
export type ResultView = {
  /** Every course cleared. */
  won: boolean;
  /** Courses cleared. */
  cleared: number;
  /** The course the clock ran out on; 0 when the run was won. */
  failedOn: number;
  /** Pieces of food left on the table when the clock ran out. */
  leftOver: number;
  stats: PlayerStats[];
  /** Every course played, in order, the one the clock ran out on included. */
  courses: CourseTally[];
};

/** Public game state, sent to a player whenever it changes. Positions travel separately, in snapshots. */
export type StateView = {
  /** Increments every time a run starts. */
  game: number;
  phase: Phase;
  selfId: string;
  hostId: string | null;
  players: PlayerView[];
  settings: Settings;
  course: CourseView | null;
  cleared: ClearedView | null;
  /** Stars for each course cleared so far. */
  stars: number[];
  result: ResultView | null;
};

/** `[id, x, y, radius]` */
export type HoleSnap = [string, number, number, number];
/** `[id, tier, x, y]` */
export type FoodInit = [number, number, number, number];
/** `[id, x, y]` */
export type FoodMove = [number, number, number];
/**
 * Things that happened since the last snapshot:
 * - `['e', food, hole]` a hole started swallowing this food
 * - `['s', food, player]` it fell off the table (`player` shoved it, or '')
 * - `['r', food, x, y, tier]` it was put back
 */
export type Fx = ['e', number, string] | ['s', number, string] | ['r', number, number, number, number];
