import { MODES } from './constants.js';
import type { BodySnap, Fx, Mode, SelfSnap, StateView } from './types.js';

// ---- client → server

export type ClientMessage =
  | { type: 'join'; name?: string; token?: string }
  | { type: 'leave' }
  | { type: 'rename'; name: string }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  /** `map`: an index into `MAPS`, or -1 for one by lot. */
  | { type: 'settings'; mode?: Mode; map?: number }
  | { type: 'start' }
  /** Only watch from now on (`on`), or ask for a seat again. A screen that only watches sees the whole house. */
  | { type: 'watch'; on: boolean }
  /**
   * Everything a player is doing with their controls right now: the stick (`x`, `y`, each within
   * -1..1), the boost button and the action button. Sent whenever it changes, so a lost message
   * is put right by the next one.
   */
  | { type: 'in'; x: number; y: number; b: 0 | 1; a: 0 | 1 }
  | { type: 'again' }
  | { type: 'abort' };

// ---- server → client

/** 30 times a second while a round is on. Each player gets their own: it holds only what they can see. */
export type SnapMessage = {
  type: 'snap';
  /** The simulation's clock, for interpolation. */
  simTimeMs: number;
  /** Countdown left before the round starts (0 once it has). */
  cd: number;
  /** Clock left on the round. */
  left: number;
  /** Left of the pause for a catch being shown (0 when the round is running): nothing moves meanwhile. */
  hold: number;
  bodies: BodySnap[];
  /** Null for someone who is only watching. */
  me: SelfSnap | null;
  /** Bit `i` is set while pill `i` is there to take. */
  pl: number;
  /** Progress of each chore in the round, 0 to 100, in the order of `RoundView.tasks`. */
  tk: number[];
  fx: Fx[];
};

export type ServerMessage = { type: 'welcome'; selfId: string; token: string } | { type: 'full' } | { type: 'state'; state: StateView } | SnapMessage;

const NO_ARGS = new Set(['leave', 'addBot', 'removeBot', 'start', 'again', 'abort']);

const bit = (v: unknown): boolean => v === 0 || v === 1;
const axis = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= -1.01 && v <= 1.01;

/** Shape check for anything a socket sends. Deeper validation (who, which phase) is the game's job. */
export function isClientMessage(x: unknown): x is ClientMessage {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  if (typeof m.type !== 'string') return false;
  if (NO_ARGS.has(m.type)) return true;
  switch (m.type) {
    case 'join':
      return (m.name === undefined || typeof m.name === 'string') && (m.token === undefined || (typeof m.token === 'string' && m.token.length <= 64));
    case 'rename':
      return typeof m.name === 'string' && m.name.length <= 64;
    case 'settings':
      return (m.mode === undefined || (MODES as readonly unknown[]).includes(m.mode)) && (m.map === undefined || (Number.isInteger(m.map) && (m.map as number) >= -1 && (m.map as number) < 64));
    case 'watch':
      return typeof m.on === 'boolean';
    case 'in':
      return axis(m.x) && axis(m.y) && bit(m.b) && bit(m.a);
    default:
      return false;
  }
}
