import { store } from '../store';
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
 * key means "update in place". Each round gets a fresh play screen (countdown included).
 */
export function screenKey(): string {
  const s = store.state;
  if (!s) return 'join';
  if (s.phase === 'lobby') return 'lobby';
  if (s.phase === 'finale') return `finale:${s.game}`;
  return `play:${s.game}`;
}

export function makeScreen(key: string): Screen {
  switch (key.split(':')[0]) {
    case 'lobby':
      return lobbyScreen();
    case 'finale':
      return finaleScreen();
    default:
      return playScreen();
  }
}

export const MODE_NAMES = { last: 'Last Cousin Standing', escape: 'Escape' } as const;
