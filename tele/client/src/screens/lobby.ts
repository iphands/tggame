import { MAX_PLAYERS, MIN_PLAYERS } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store } from '../store';
import type { Order } from '../../../shared/src/types';
import type { Screen } from './index';

/** The passing orders, with what the host's button says and what it means. */
const ORDER_CHOICES: [Order, string, string][] = [
  ['fixed', 'Fixed order', 'Same seats every game. You always pass to the same player.'],
  ['round', 'Shuffle per round', 'Seats are shuffled every game. You pass to one player all game.'],
  ['turn', 'Shuffle every turn', 'Books hop around. You get pages from a different player every turn.'],
];

export function lobbyScreen(): Screen {
  const notes = h('div', { class: 'notes' });
  const status = h('p', { class: 'lobby-status' });
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'start' })) }, 'Start the game');
  const addBot = h('button', { class: 'btn', type: 'button', onclick: () => (sfx.pop(), send({ type: 'addBot' })) }, '+ Doodlebot');
  const removeBot = h('button', { class: 'btn', type: 'button', onclick: () => send({ type: 'removeBot' }) }, '− Doodlebot');
  const hostRow = h('div', { class: 'row host-row' }, addBot, removeBot);
  const share = h('p', { class: 'share' }, 'Friends join at ', h('b', null, location.host || 'this address'));

  // who passes to whom: the host chooses, everyone else sees the choice
  const orderBtns = ORDER_CHOICES.map(([order, label, hint]) =>
    h('button', { class: 'btn small', type: 'button', title: hint, onclick: () => send({ type: 'settings', order }) }, label),
  );
  const settings = h('div', { class: 'settings' }, h('span', { class: 'setting' }, h('span', null, 'Passing order'), orderBtns));
  const summary = h('p', { class: 'share order-note' });

  const el = h(
    'section',
    { class: 'screen lobby' },
    h(
      'div',
      { class: 'sheet spiral' },
      h('h2', null, "Who's playing?"),
      notes,
      status,
      settings,
      summary,
      hostRow,
      start,
      share,
    ),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, h('b', null, 'Pick'), ' a secret word.')),
      h('li', null, h('span', null, h('b', null, 'Draw'), ' it. No letters, no numbers!')),
      h('li', null, h('span', null, h('b', null, 'Pass'), ' it on: the next player guesses your doodle, the next draws that guess…')),
      h('li', null, h('span', null, h('b', null, 'Reveal'), ' the carnage together.')),
    ),
  );

  return {
    el,
    update() {
      const s = store.state!;
      const seated = s.players.filter((p) => !p.spectator);
      notes.replaceChildren(
        ...seated.map((p) =>
          h(
            'div',
            { class: 'note', style: `--c:${p.color};--tilt:${tilt(p.id, 4)}deg` },
            h('span', { class: 'note-name' }, p.name),
            h(
              'span',
              { class: 'tags' },
              p.id === s.selfId && h('i', { class: 'tag you' }, 'you'),
              p.id === s.hostId && h('i', { class: 'tag' }, 'host'),
              p.bot && h('i', { class: 'tag' }, 'bot'),
            ),
          ),
        ),
        ...Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, () => h('div', { class: 'note empty' }, '?')),
      );
      const host = isHost();
      const need = MIN_PLAYERS - seated.length;
      const online = store.status === 'connected';
      hostRow.hidden = !host;
      start.hidden = !host;
      settings.hidden = !host;
      const [, label, hint] = ORDER_CHOICES.find(([order]) => order === s.settings.order)!;
      orderBtns.forEach((b, i) => b.classList.toggle('primary', ORDER_CHOICES[i][0] === s.settings.order));
      summary.textContent = host ? hint : `${label}: ${hint.toLowerCase()}`;
      start.disabled = need > 0 || !online;
      addBot.disabled = seated.length >= MAX_PLAYERS || !online;
      removeBot.disabled = !seated.some((p) => p.bot) || !online;
      status.textContent =
        need > 0
          ? `Need ${need} more ${need === 1 ? 'doodler' : 'doodlers'} (${MIN_PLAYERS} minimum). ${host ? 'Add a Doodlebot or invite a friend.' : ''}`
          : host
            ? `${seated.length} doodlers ready. Start whenever you like!`
            : `Waiting for ${nameOf(s.hostId)} to start…`;
    },
  };
}
