import type { ChatLine, Drawing, StateView, Task } from './types.js';

// ---- client → server

export type ClientMessage =
  | { type: 'join'; name?: string; token?: string }
  | { type: 'leave' }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'settings'; rounds?: number; hints?: boolean }
  | { type: 'start' }
  /** Drawer: append points to stroke `i` (the last stroke, or a new one right after it). */
  | { type: 'ink'; i: number; c: number; w: number; p: unknown[] }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'pass' }
  /** Chat and guesses share one line; `to` makes it a whisper. */
  | { type: 'chat'; text: string; to?: string }
  | { type: 'boot'; playerId: string }
  | { type: 'again' }
  | { type: 'abort' };

// ---- server → client

/** Changes to the shared canvas; `turn` says which canvas they belong to. */
export type InkEvent =
  | { type: 'ink'; turn: number; i: number; c: number; w: number; p: number[] }
  | { type: 'undo'; turn: number }
  | { type: 'clear'; turn: number };

export type ServerMessage =
  /** `now` is the server clock, so clients can run the round timer. */
  | { type: 'welcome'; selfId: string; token: string; now: number }
  | { type: 'full' }
  | { type: 'booted' }
  | { type: 'state'; state: StateView }
  | { type: 'task'; task: Task | null }
  /** The whole canvas of a turn: sent when a turn starts and to anyone arriving mid-turn. */
  | { type: 'canvas'; turn: number; strokes: Drawing }
  | InkEvent
  | { type: 'chat'; lines: ChatLine[] };

const NO_ARGS = new Set(['leave', 'addBot', 'removeBot', 'start', 'undo', 'clear', 'pass', 'again', 'abort']);

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16;

/** Shape check for anything a socket sends. Deeper validation (ink, turn order) is the game's job. */
export function isClientMessage(x: unknown): x is ClientMessage {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  if (typeof m.type !== 'string') return false;
  if (NO_ARGS.has(m.type)) return true;
  switch (m.type) {
    case 'join':
      return (
        (m.name === undefined || typeof m.name === 'string') &&
        (m.token === undefined || (typeof m.token === 'string' && m.token.length <= 64))
      );
    case 'settings':
      return (m.rounds === undefined || typeof m.rounds === 'number') && (m.hints === undefined || typeof m.hints === 'boolean');
    case 'ink':
      return typeof m.i === 'number' && Number.isInteger(m.i) && m.i >= 0 && typeof m.c === 'number' && typeof m.w === 'number' && Array.isArray(m.p);
    case 'chat':
      return typeof m.text === 'string' && m.text.length <= 400 && (m.to === undefined || isId(m.to));
    case 'boot':
      return isId(m.playerId);
    default:
      return false;
  }
}
