import { LENGTHS, PACES } from './constants.js';
import { isDir } from './sim.js';
import type { Rect } from './arenas.js';
import type { BikeSnap, Fx, Length, Pace, StateView, TrailInit } from './types.js';

// ---- client → server

export type ClientMessage =
  | { type: 'join'; name?: string; token?: string }
  | { type: 'leave' }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'settings'; pace?: Pace; length?: Length; boost?: boolean; bust?: boolean; slip?: boolean; erase?: boolean }
  | { type: 'start' }
  /** Turn to face this way (0 right, 1 down, 2 left, 3 up) in the `at`-th cell of the round (0: the next one). */
  | { type: 'turn'; d: number; at?: number }
  /** The boost is being held, or was let go. */
  | { type: 'boost'; on: boolean }
  /** Set off the buster. */
  | { type: 'bust' }
  | { type: 'again' }
  | { type: 'abort' };

// ---- server → client

/** A fresh floor, or the floor as it stands for someone who (re)joins mid-round. */
export type ArenaMessage = {
  type: 'arena';
  /** Changes with every round. */
  seq: number;
  name: string;
  w: number;
  h: number;
  blocks: Rect[];
  /** How far the rim has moved in. */
  ring: number;
  trails: TrailInit[];
};

/** 30 times a second while a round is on. */
export type SnapMessage = {
  type: 'snap';
  simTimeMs: number;
  /** Countdown left before the round starts (0 once it has). */
  cd: number;
  /** Time until the rim starts closing in (0 once it has). */
  calm: number;
  bikes: BikeSnap[];
  fx: Fx[];
};

export type ServerMessage = { type: 'welcome'; selfId: string; token: string } | { type: 'full' } | { type: 'state'; state: StateView } | ArenaMessage | SnapMessage;

const NO_ARGS = new Set(['leave', 'addBot', 'removeBot', 'start', 'again', 'abort', 'bust']);
const optional = (v: unknown, type: string): boolean => v === undefined || typeof v === type;

/** Shape check for anything a socket sends. Deeper validation (who, which phase) is the game's job. */
export function isClientMessage(x: unknown): x is ClientMessage {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  if (typeof m.type !== 'string') return false;
  if (NO_ARGS.has(m.type)) return true;
  switch (m.type) {
    case 'join':
      return optional(m.name, 'string') && (m.token === undefined || (typeof m.token === 'string' && m.token.length <= 64));
    case 'settings':
      return (
        (m.pace === undefined || (PACES as readonly unknown[]).includes(m.pace)) &&
        (m.length === undefined || (LENGTHS as readonly unknown[]).includes(m.length)) &&
        optional(m.boost, 'boolean') &&
        optional(m.bust, 'boolean') &&
        optional(m.slip, 'boolean') &&
        optional(m.erase, 'boolean')
      );
    case 'turn':
      return isDir(m.d) && (m.at === undefined || (Number.isInteger(m.at) && (m.at as number) >= 0));
    case 'boost':
      return typeof m.on === 'boolean';
    default:
      return false;
  }
}
