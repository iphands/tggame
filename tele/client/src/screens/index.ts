import { isSeated, store } from '../store';
import { finaleScreen } from './finale';
import { lobbyScreen } from './lobby';
import { revealScreen } from './reveal';
import { drawScreen, guessScreen, pickScreen, waitScreen } from './turns';

/** A mounted screen: `update` is called on every state change while its key stays the same. */
export interface Screen {
  el: HTMLElement;
  update(): void;
  destroy?(): void;
}

/**
 * Which screen the current state calls for. A new key means "tear down and
 * rebuild"; the same key means "update in place" (so a drawing in progress
 * survives other players handing in).
 */
export function screenKey(): string {
  const s = store.state;
  if (!s) return 'join';
  if (s.phase === 'lobby') return 'lobby';
  if (s.phase === 'reveal') return `reveal:${s.game}`;
  if (s.phase === 'finale') return `finale:${s.game}`;
  const tag = `${s.game}:${s.turn}`;
  const busy = isSeated() && (!s.submitted || store.editingTurn === s.turn) && store.task?.kind === s.phase;
  return busy ? `${s.phase}:${tag}` : `wait:${tag}`;
}

export function makeScreen(key: string): Screen {
  switch (key.split(':')[0]) {
    case 'lobby':
      return lobbyScreen();
    case 'pick':
      return pickScreen();
    case 'draw':
      return drawScreen();
    case 'guess':
      return guessScreen();
    case 'reveal':
      return revealScreen();
    case 'finale':
      return finaleScreen();
    default:
      return waitScreen();
  }
}
