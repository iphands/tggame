import { isCard, type Card } from './cards.js';
import type { StateView, Task } from './types.js';

// ---- client → server

export type ClientMessage =
  | { type: 'join'; name?: string; token?: string; watch?: boolean }
  /** Only watch from now on (`on`), or ask for a seat again. */
  | { type: 'watch'; on: boolean }
  | { type: 'leave' }
  | { type: 'rename'; name: string }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'settings'; rounds?: number }
  | { type: 'start' }
  /** Pass one of your five cards to the left. */
  | { type: 'pass'; card: Card }
  /** Reach for a spoon. */
  | { type: 'grab' }
  /** Shout at whoever is slowest right now. */
  | { type: 'heckle' }
  /** Host: cut the result screen short. */
  | { type: 'skip' }
  | { type: 'again' }
  | { type: 'abort' };

// ---- server → client

export type ServerMessage =
  /** `now` is the server clock, so clients can run timers that agree with it. */
  | { type: 'welcome'; selfId: string; token: string; now: number }
  | { type: 'full' }
  | { type: 'state'; state: StateView }
  | { type: 'task'; task: Task | null };

const NO_ARGS = new Set(['leave', 'addBot', 'removeBot', 'start', 'grab', 'heckle', 'skip', 'again', 'abort']);

/** Shape check for anything a socket sends. Deeper validation (whose card, which phase) is the game's job. */
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
      return m.rounds === undefined || typeof m.rounds === 'number';
    case 'pass':
      return isCard(m.card);
    default:
      return false;
  }
}
