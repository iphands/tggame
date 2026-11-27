import type { Card } from './cards.js';

/** `play`: cards are moving. `reveal`: the round's result is on show before the next deal. */
export type Phase = 'lobby' | 'play' | 'reveal' | 'finale';

export type Settings = { rounds: number };

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  connected: boolean;
  /** No cards this round: the table is full, or they arrived mid-game and sit down at the next deal. */
  spectator: boolean;
  /** Here only to watch (a TV in the room): never given a seat. */
  watcher: boolean;
  /** Rounds ended without a spoon, false grabs included. Fewest wins. */
  losses: number;
  /** How many of those losses were false grabs. */
  fumbles: number;
  /** Time spent holding everyone up this game (ms beyond the first heckle). */
  slowMs: number;
  /** Cards piled up waiting for this player. */
  waiting: number;
  /** Server clock when they picked up the card they are sitting on; null when they hold none. */
  heldSince: number | null;
  hasSpoon: boolean;
  /** Server clock until which a false grab keeps them off the spoons (0: free). */
  lockedUntil: number;
};

export type RoundView = {
  /** 1-based. */
  round: number;
  rounds: number;
  dealerId: string;
  /** Seated players in passing order: each passes to the next, the last to the discard pile. */
  order: string[];
  /** Server clock when cards start moving. */
  startsAt: number;
  spoons: number;
  spoonsLeft: number;
};

/** Something the whole table sees at once: a heckle, or a grab at nothing. */
export type Shout = {
  seq: number;
  kind: 'heckle' | 'fumble';
  /** Who it is about. */
  targetId: string;
  /** Who pressed Heckle; null when the game itself is doing the pestering. */
  byId: string | null;
  text: string;
  /** 1 (nudge) to 3 (the whole table yelling). */
  level: number;
  /** Server clock when it was shouted. */
  at: number;
};

/** How the last round ended. */
export type ResultView = {
  round: number;
  /** Who completed four of a kind and took the first spoon; null if the round was cut short. */
  winnerId: string | null;
  /** Their four cards. */
  cards: Card[];
  /** Everyone who got a spoon, in order, with how long after the first grab. */
  grabs: { id: string; ms: number }[];
  /** Left without a spoon. */
  loserIds: string[];
  /** False grabs this round, one entry each. */
  fumblerIds: string[];
  slowpokeId: string | null;
  slowpokeMs: number;
  /** Server clock when the next round deals (or the finale starts). */
  nextAt: number;
};

/** Public, per-player game state. Never contains anybody's cards during a round. */
export type StateView = {
  /** Increments every time a game starts. */
  game: number;
  phase: Phase;
  selfId: string;
  hostId: string | null;
  players: PlayerView[];
  settings: Settings;
  round: RoundView | null;
  result: ResultView | null;
  shout: Shout | null;
};

/** A seated player's own cards. Null for everyone else and outside a round. */
export type Task = {
  hand: Card[];
  /** The fifth card, just picked up; one of the five must be passed on. */
  drawn: Card | null;
  /** True while these cards hold four of a kind: time to grab. */
  quad: boolean;
};
