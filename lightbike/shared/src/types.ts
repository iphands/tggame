import type { LENGTHS, PACES } from './constants.js';

/**
 * `countdown`: the bikes are on the floor, engines running. `play`: riding (and the moment after
 * the last crash). `cleared`: the round's result. `finale`: the match is over.
 */
export type Phase = 'lobby' | 'countdown' | 'play' | 'cleared' | 'finale';

export type Pace = (typeof PACES)[number];
export type Length = (typeof LENGTHS)[number];

/** What the host chooses in the lobby. */
export type Settings = {
  pace: Pace;
  length: Length;
  /** Hold to go faster, while the bar lasts. */
  boost: boolean;
  /** Spend half a bar to pass through lines for a moment. */
  bust: boolean;
  /** Riding beside somebody else's line speeds you up. */
  slip: boolean;
  /** A crashed rider's line disappears. */
  erase: boolean;
};

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  connected: boolean;
  /** No bike right now: they arrived mid-match (or the floor is full) and ride from the next round. */
  spectator: boolean;
  score: number;
};

export type RoundView = {
  /** 1-based. */
  no: number;
  arena: string;
  /** The score that ends the match. */
  target: number;
};

/**
 * How a rider went out: into a `wall` (or a block, or the rim as it closed in), their `own` line,
 * somebody else's `line`, nose to nose with another bike (`headon`), or they `left` the game.
 */
export type How = 'wall' | 'own' | 'line' | 'headon' | 'left';

/** How one rider's round ended. `how` is '' for the rider left at the end; `by` is the other rider involved, if any. */
export type Exit = { id: string; by: string; how: How | ''; /** 1 for the winner. */ place: number; /** Points earned this round. */ gained: number };

/** The round just ridden. */
export type ClearedView = {
  no: number;
  /** Who was left, or '' when the last riders went out together. */
  winner: string;
  /** Everyone who rode, best first. */
  exits: Exit[];
  /** The match is over after this round. */
  last: boolean;
};

export type PlayerStats = {
  id: string;
  score: number;
  /** Rounds won. */
  wins: number;
  /** Riders who crashed into this player's line. */
  cuts: number;
  /** Times they hit their own line. */
  own: number;
  /** Times they hit a wall or a block. */
  walls: number;
  /** Rounds in which they were first out. */
  firsts: number;
  /** Cells of line laid. */
  cells: number;
  /** Ticks spent in somebody's slipstream. */
  shaves: number;
};

/** The whole match, shown in the finale. */
export type ResultView = {
  /** Whoever reached the target and leads. */
  winner: string;
  rounds: number;
  stats: PlayerStats[];
};

/** Public game state, sent to a player whenever it changes. Positions travel separately, in snapshots. */
export type StateView = {
  /** Increments every time a match starts. */
  game: number;
  phase: Phase;
  selfId: string;
  hostId: string | null;
  players: PlayerView[];
  settings: Settings;
  round: RoundView | null;
  cleared: ClearedView | null;
  result: ResultView | null;
};

/**
 * `[id, x, y, dir, p, speed, flags, energy, turns, odo]`: the cell, the way it faces, how far it is
 * to the next cell (hundredths), cells per second (tenths), `FLAG_…` bits, the bar (hundredths),
 * and how many turns it has made and cells it has reached this round.
 */
export type BikeSnap = [string, number, number, number, number, number, number, number, number, number];

/** A rider's line so far: `[id, gone, points]`, the points being x, y pairs from the start through every corner. */
export type TrailInit = [string, 0 | 1, number[]];

/**
 * Things that happened since the last snapshot:
 * - `['c', id, x, y]` a bike turned in this cell
 * - `['x', id, by, x, y, how]` a bike crashed in this cell (`by` and `how` as in `Exit`)
 * - `['e', id]` a line was erased
 * - `['b', id]` a bike set off its buster
 * - `['s', ring]` the rim moved in: `ring` cells from every edge are now wall
 */
export type Fx = ['c', string, number, number] | ['x', string, string, number, number, How] | ['e', string] | ['b', string] | ['s', number];
