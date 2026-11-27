import { store } from '../store';
import { clearedScreen } from './cleared';
import { finaleScreen } from './finale';
import { lobbyScreen } from './lobby';
import { playScreen } from './play';

/** A mounted screen: `update` is called on every state change while its key stays the same. */
export interface Screen {
  el: HTMLElement;
  update(): void;
  destroy?(): void;
}

/**
 * Which screen the current state calls for. A new key means "tear down and rebuild"; the same
 * key means "update in place". Each course gets a fresh play screen (countdown included).
 */
export function screenKey(): string {
  const s = store.state;
  if (!s) return 'join';
  if (s.phase === 'lobby') return 'lobby';
  if (s.phase === 'finale') return `finale:${s.game}`;
  if (s.phase === 'cleared') return `cleared:${s.game}:${s.course?.no}`;
  return `play:${s.game}:${s.course?.no}`;
}

export function makeScreen(key: string): Screen {
  switch (key.split(':')[0]) {
    case 'lobby':
      return lobbyScreen();
    case 'finale':
      return finaleScreen();
    case 'cleared':
      return clearedScreen();
    default:
      return playScreen();
  }
}

/** Three stars, `n` of them lit. */
export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
