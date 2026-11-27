/**
 * A screen that only watches a game and never plays it: a TV in the room.
 *
 * Chosen on a game's join screen or in its lobby, or with `?watch=1` on the end of the address
 * (the screen then goes straight in, with nobody pressing anything). Remembered in the browser
 * until `?watch=0`, or until the screen joins to play. The server is told in every `join`
 * (`SocketClientOptions.watch`), so a reconnect cannot forget it.
 */
import { getItem, setItem } from './storage.js';

export function watchPref(prefix: string) {
  const key = `${prefix}-watch`;
  const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('watch');
  if (asked !== null) setItem(key, asked === '0' ? null : '1');
  let on = getItem(key) === '1' || (asked !== null && asked !== '0');
  return {
    /** Is this screen only watching? */
    on: (): boolean => on,
    set(next: boolean): void {
      on = next;
      setItem(key, next ? '1' : null);
    },
    /** The address asked for it: join without waiting for anybody to press a button. */
    straightIn: asked !== null && on,
  };
}
