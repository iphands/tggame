import type { MODES } from './constants.js';

/**
 * `countdown`: everyone has been told what they are and nobody can move yet. `play`: the hunt is
 * on. `finale`: the round is over and the result is up.
 */
export type Phase = 'lobby' | 'countdown' | 'play' | 'finale';

/** `last`: Last Cousin Standing. `escape`: do the chores, open the doors, get out. */
export type Mode = (typeof MODES)[number];
export type Settings = { mode: Mode };

export type Role = 'cousin' | 'beast';
/** What a player is right now: `c` a Cousin, `b` a Beast, `x` a Cousin who got out. */
export type Side = 'c' | 'b' | 'x';

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  connected: boolean;
  /** Not in the round: they arrived while it was on, or the table is full. */
  spectator: boolean;
};

export type RoundView = {
  /** Changes with every round. */
  seq: number;
  mode: Mode;
  /** The whole clock for this round. */
  clockMs: number;
  /** Which of the map's chore spots are in use this round (empty in Last Cousin Standing). */
  tasks: number[];
  /** What everyone in the round is. Changes only when somebody is caught or gets out. */
  sides: Record<string, Side>;
  /** The Beast the round started with. */
  firstBeast: string;
};

/** One catch, for the result screen. */
export type Catch = { by: string; who: string; atMs: number };

export type ResultView = {
  mode: Mode;
  winner: 'cousins' | 'beasts';
  /** `last`: one Cousin left. `clock`: time ran out. `escaped`: somebody got out. `caught`: nobody is left. */
  why: 'last' | 'clock' | 'escaped' | 'caught';
  /** Cousins still free at the end. */
  survivors: string[];
  /** Cousins who got out. */
  escaped: string[];
  firstBeast: string;
  catches: Catch[];
  /** How long the hunt lasted. */
  tookMs: number;
};

/** Public game state, sent to a player whenever it changes. Positions travel separately, in snapshots. */
export type StateView = {
  /** Increments every time a round starts. */
  game: number;
  phase: Phase;
  selfId: string;
  hostId: string | null;
  players: PlayerView[];
  settings: Settings;
  round: RoundView | null;
  result: ResultView | null;
};

/** `[id, x, y, flags, facing]`: `flags` are the `F_…` bits, `facing` an angle in hundredths of a radian. */
export type BodySnap = [string, number, number, number, number];

/**
 * What only the player themselves is told: `[energy, boost wait ms, lunge wait ms, door wait ms, dread]`.
 * `dread` is how near the nearest Beast is to a Cousin, 0 to `DREAD_STEPS`: a distance only, never a direction.
 */
export type SelfSnap = [number, number, number, number, number];

/**
 * Things that happened since the last snapshot:
 * - `['c', beast, cousin, x, y]` a catch (everyone hears of it)
 * - `['b', id]` a caught Cousin finished turning into a Beast
 * - `['l', id]` a Beast began a lunge
 * - `['p', pill, id]` a Cousin took this pill
 * - `['t', id, from, to]` a Beast went through a Beast door
 * - `['n', x, y, strength]` Beasts only: a chore is being worked on somewhere near here
 * - `['h']` Cousins at that chore only: you were heard
 * - `['d', task]` a chore is finished
 * - `['o']` the exits are open
 * - `['x', id]` a Cousin got out
 */
export type Fx =
  | ['c', string, string, number, number]
  | ['b', string]
  | ['l', string]
  | ['p', number, string]
  | ['t', string, number, number]
  | ['n', number, number, number]
  | ['h']
  | ['d', number]
  | ['o']
  | ['x', string];
