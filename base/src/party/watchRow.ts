/** The lobby's two lines about screens that only watch: who they are, and a button to become one or stop. */
import { h } from '../client/dom.js';

type Watchable = { id: string; name: string; watcher: boolean };

/**
 * `pref` is this screen's own memory of the choice (`client/watch.ts`), `send` tells the server.
 * Put `els` in the lobby and call `update` whenever the state changes.
 */
export function watchRow(pref: { set(on: boolean): void }, send: (on: boolean) => void) {
  const list = h('p', { class: 'share' });
  const toggle = h('button', { class: 'btn small', type: 'button' });
  let mine = false;
  toggle.addEventListener('click', () => {
    pref.set(!mine);
    send(!mine);
  });
  return {
    els: [list, toggle],
    update(players: readonly Watchable[], selfId: string): void {
      const tv = players.filter((p) => p.watcher);
      mine = tv.some((p) => p.id === selfId);
      list.hidden = tv.length === 0;
      list.textContent = `Watching: ${tv.map((p) => p.name).join(', ')}`;
      toggle.textContent = mine ? 'Play instead' : 'Just watch';
    },
  };
}
