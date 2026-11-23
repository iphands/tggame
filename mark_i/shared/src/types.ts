/** Entity shapes sent from the server to clients in every snapshot. */
import type { PlatformKind } from './levels.js';

export type Phase = 'lobby' | 'starting' | 'playing' | 'ended';

export type WeaponKind = 'pistol' | 'boomstick' | 'bombs';
export type ItemKind = 'boomstick' | 'bombs' | 'shield' | 'heal';
export type HitHow = 'punch' | 'stomp' | 'pistol' | 'boomstick' | 'bomb';

/**
 * alive      — on stage, playing
 * respawning — lost a stock, waiting to drop back in
 * out        — no stocks left (spectating the rest of the round)
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
  /** Damage percent: higher = flies farther when hit. */
  dmg: number;
  stocks: number;
  weapon: WeaponKind;
  ammo: number; // -1 = infinite
  invuln: boolean;
  shield: boolean;
  launched: boolean;
  /** Sim ms of the last punch (-1 if never). */
  punchAt: number;
  /** Sim ms of the last shot (-1 if never). */
  shotAt: number;
  airJumps: number;
  /** Session totals (persist across rounds while connected). */
  wins: number;
  kos: number;
};

export type PlatformState = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PlatformKind;
  state: 'solid' | 'shaking' | 'gone';
};

export type ProjectileState = {
  id: number;
  kind: 'bullet' | 'pellet' | 'bomb';
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
  | { k: 'punch'; x: number; y: number; id: string; face: 1 | -1 }
  | { k: 'hit'; x: number; y: number; id: string; by: string | null; power: number; how: HitHow }
  | { k: 'block'; x: number; y: number; id: string }
  | { k: 'shot'; x: number; y: number; id: string; weapon: WeaponKind; face: 1 | -1 }
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'ko'; x: number; y: number; id: string; color: string; dirX: number; dirY: number }
  | { k: 'pickup'; x: number; y: number; id: string; item: ItemKind }
  | { k: 'crate'; x: number; y: number }
  | { k: 'crumble'; x: number; y: number; w: number };

export type FeedEntry = {
  n: number; // unique sequence number
  victim: string;
  victimColor: string;
  killer: string | null;
  killerColor: string | null;
  how: HitHow | 'fall' | 'left';
};

export type ResultRow = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  place: number;
  kos: number;
  falls: number;
  dmgDealt: number;
};
