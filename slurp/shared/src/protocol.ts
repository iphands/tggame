import { DIFFICULTIES } from './constants.js';
import type { Difficulty, FoodInit, FoodMove, Fx, HoleSnap, StateView } from './types.js';

// ---- client → server

export type ClientMessage =
  | { type: 'join'; name?: string; token?: string; watch?: boolean }
  /** Only watch from now on (`on`), or ask for a seat again. */
  | { type: 'watch'; on: boolean }
  | { type: 'leave' }
  | { type: 'rename'; name: string }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'settings'; difficulty?: Difficulty; finale?: boolean }
  | { type: 'start' }
  /** Where this player's hole should head, in table coordinates. */
  | { type: 'aim'; x: number; y: number }
  /** Set off the power this player's hole is carrying. */
  | { type: 'use' }
  | { type: 'again' }
  | { type: 'abort' };

// ---- server → client

/** A freshly laid table, or the table as it stands for someone who (re)joins mid-course. */
export type CourseMessage = {
  type: 'course';
  /** Changes with every new table. */
  seq: number;
  no: number;
  w: number;
  h: number;
  foods: FoodInit[];
};

/** 30 times a second while a course is on. */
export type SnapMessage = {
  type: 'snap';
  /** The simulation's clock, for interpolation. */
  simTimeMs: number;
  /** Countdown left before the course starts (0 once it has). */
  cd: number;
  /** Clock left on the course. */
  left: number;
  /** Food still to eat. */
  n: number;
  holes: HoleSnap[];
  /** Only the food that moved since the last snapshot. */
  foods: FoodMove[];
  fx: Fx[];
};

export type ServerMessage =
  | { type: 'welcome'; selfId: string; token: string }
  | { type: 'full' }
  | { type: 'state'; state: StateView }
  | CourseMessage
  | SnapMessage;

const NO_ARGS = new Set(['leave', 'addBot', 'removeBot', 'start', 'again', 'abort', 'use']);

/** Shape check for anything a socket sends. Deeper validation (who, which phase) is the game's job. */
export function isClientMessage(x: unknown): x is ClientMessage {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  if (typeof m.type !== 'string') return false;
  if (NO_ARGS.has(m.type)) return true;
  switch (m.type) {
    case 'watch':
      return typeof m.on === 'boolean';
    case 'join':
      return (
        (m.name === undefined || typeof m.name === 'string') &&
        (m.token === undefined || (typeof m.token === 'string' && m.token.length <= 64)) &&
        (m.watch === undefined || typeof m.watch === 'boolean')
      );
    case 'rename':
      return typeof m.name === 'string' && m.name.length <= 64;
    case 'settings':
      return (m.difficulty === undefined || (DIFFICULTIES as readonly unknown[]).includes(m.difficulty)) && (m.finale === undefined || typeof m.finale === 'boolean');
    case 'aim':
      return Number.isFinite(m.x) && Number.isFinite(m.y);
    default:
      return false;
  }
}
