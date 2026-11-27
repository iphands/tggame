import type { PageRef, StateView, Task } from './types.js';

// ---- client → server

export type ClientMessage =
  | { type: 'join'; name?: string; token?: string }
  | { type: 'leave' }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'start' }
  | { type: 'pick'; index: number }
  | { type: 'write'; text: string }
  | { type: 'draw'; strokes: unknown }
  | { type: 'guess'; text: string }
  | { type: 'skip'; playerId: string }
  | { type: 'heckle'; playerId: string }
  | { type: 'next' }
  | { type: 'heart'; book: number; page: number }
  | { type: 'again' }
  | { type: 'abort' };

// ---- server → client

export type ServerMessage =
  | { type: 'welcome'; selfId: string; token: string }
  | { type: 'full' }
  | { type: 'state'; state: StateView }
  | { type: 'task'; task: Task | null }
  | { type: 'pages'; game: number; pages: PageRef[] };

const NO_ARGS = new Set(['leave', 'addBot', 'removeBot', 'start', 'next', 'again', 'abort']);

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000;

/** Shape check for anything a socket sends. Deeper validation (drawings, turn order) is the game's job. */
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
    case 'pick':
      return isIndex(m.index);
    case 'draw':
      return Array.isArray(m.strokes);
    case 'write':
    case 'guess':
      return typeof m.text === 'string' && m.text.length <= 400;
    case 'skip':
    case 'heckle':
      return typeof m.playerId === 'string' && m.playerId.length <= 16;
    case 'heart':
      return isIndex(m.book) && isIndex(m.page);
    default:
      return false;
  }
}
