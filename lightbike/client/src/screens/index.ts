import { store } from '../store';
import type { Exit } from '../../../shared/src/types';
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
 * key means "update in place". Each round gets a fresh play screen (countdown included).
 */
export function screenKey(): string {
  const s = store.state;
  if (!s) return 'join';
  if (s.phase === 'lobby') return 'lobby';
  if (s.phase === 'finale') return `finale:${s.game}`;
  if (s.phase === 'cleared') return `cleared:${s.game}:${s.cleared?.no}`;
  return `play:${s.game}:${s.round?.no}`;
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

/** How a rider's round ended, in a few words. */
export function fate(e: Exit, nameOf: (id: string) => string): string {
  switch (e.how) {
    case '':
      return 'last line standing';
    case 'wall':
      return 'found the wall';
    case 'own':
      return 'hit their own line';
    case 'line':
      return `met ${nameOf(e.by)}'s line`;
    case 'headon':
      return `shared a square with ${nameOf(e.by)}`;
    default:
      return 'left the floor';
  }
}
