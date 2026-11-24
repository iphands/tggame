/** Entity shapes sent from the server to clients in every snapshot. */
export type Phase = 'lobby' | 'starting' | 'playing' | 'ended';

export type WeaponKind = 'pistol' | 'boomstick' | 'bombs' | 'smg' | 'rockets' | 'railgun';
export type ItemKind = 'boomstick' | 'bombs' | 'smg' | 'rockets' | 'railgun' | 'shield' | 'life';
export type HitHow = 'stomp' | 'pistol' | 'boomstick' | 'bomb' | 'smg' | 'rocket' | 'railgun';

/**
 * alive      — on the course (still running, or past the finish line: see finishMs)
 * respawning — lost a life, waiting to drop back in
 * out        — no lives left (spectating the rest of the round)
 * waiting    — joined mid-round, plays next round
 */
export type LifeState = 'alive' | 'respawning' | 'out' | 'waiting';

export type PlayerState = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  x: number; // top-left of the body box
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  grounded: boolean;
  life: LifeState;
  lives: number;
  /** Finishing position this round (0 = hasn't finished). */
  place: number;
  /** Run time in ms when they crossed the line, plus the penalty for lives lost (-1 = hasn't finished). */
  finishMs: number;
  weapon: WeaponKind;
  ammo: number; // -1 = infinite
  invuln: boolean;
  shield: boolean;
  launched: boolean;
  /** Damage percent taken this life (slows the runner; resets with each life). */
  dmg: number;
  /** Charging a railgun shot (draw the sight line). */
  charging: boolean;
  /** Sim ms of the last shot (-1 if never). */
  shotAt: number;
  airJumps: number;
  /** Session totals (persist across rounds while connected). */
  wins: number;
  kos: number;
};

export type ProjectileState = {
  id: number;
  kind: 'bullet' | 'pellet' | 'bomb' | 'dart' | 'rocket';
  owner: string;
  x: number; // center
  y: number;
  vx: number;
  vy: number;
};

export type CrateState = {
  id: number;
  item: ItemKind;
  x: number; // top-left
  y: number;
  blink: boolean;
};

/** One-shot visual/audio effects that happened since the previous snapshot. */
export type Fx =
  | { k: 'jump' | 'airjump' | 'land' | 'bounce' | 'spawn'; x: number; y: number; id: string }
  | { k: 'hit'; x: number; y: number; id: string; by: string | null; power: number; how: HitHow }
  | { k: 'block'; x: number; y: number; id: string }
  | { k: 'shot'; x: number; y: number; id: string; weapon: WeaponKind; face: 1 | -1 }
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'charge'; x: number; y: number; id: string }
  | { k: 'beam'; x: number; y: number; x2: number; y2: number; id: string; color: string }
  | { k: 'ko'; x: number; y: number; id: string; color: string; dirX: number; dirY: number }
  | { k: 'pickup'; x: number; y: number; id: string; item: ItemKind }
  | { k: 'crate'; x: number; y: number }
  | { k: 'crumble'; x: number; y: number; w: number }
  /** A shot stopped on a box or gate. */
  | { k: 'boxhit'; x: number; y: number }
  | { k: 'boxbreak'; x: number; y: number; w: number; h: number }
  | { k: 'gatebreak'; x: number; w: number }
  | { k: 'finish'; x: number; y: number; id: string; place: number };

export type FeedEntry = {
  n: number; // unique sequence number
  victim: string;
  victimColor: string;
  killer: string | null;
  killerColor: string | null;
  /** 'scroll' = caught by the left screen edge; 'finish' = crossed the line (killer is null). */
  how: HitHow | 'fall' | 'scroll' | 'left' | 'finish';
};

export type ResultRow = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  place: number;
  /** Run time in ms, or null if they never crossed the line. */
  timeMs: number | null;
  /** Percent of the course covered (100 for finishers). */
  progress: number;
  deaths: number;
  /** Damage dealt to boxes and gates. */
  smash: number;
};
