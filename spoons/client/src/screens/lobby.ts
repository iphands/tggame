import { MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store } from '../store';
import type { Screen } from './index';

export function lobbyScreen(): Screen {
  const notes = h('div', { class: 'notes' });
  const status = h('p', { class: 'lobby-status' });
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'start' })) }, 'Deal the cards');
  const addBot = h('button', { class: 'btn', type: 'button', onclick: () => (sfx.pop(), send({ type: 'addBot' })) }, '+ Spoonbot');
  const removeBot = h('button', { class: 'btn', type: 'button', onclick: () => send({ type: 'removeBot' }) }, '− Spoonbot');
  const hostRow = h('div', { class: 'row host-row' }, addBot, removeBot);
  const share = h('p', { class: 'share' }, 'Friends join at ', h('b', null, location.host || 'this address'));

  const roundBtns = ROUND_OPTIONS.map((n) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', rounds: n }) }, n));
  const settings = h('div', { class: 'settings' }, h('span', { class: 'setting' }, h('span', null, 'Rounds'), roundBtns));
  const summary = h('p', { class: 'share' });

  const el = h(
    'section',
    { class: 'screen lobby' },
    h('div', { class: 'sheet spiral' }, h('h2', null, "Who's playing?"), notes, status, settings, summary, hostRow, start, share),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, 'Cards come at you one at a time. ', h('b', null, 'Tap one to pass it on'), ' and keep four.')),
      h('li', null, h('span', null, 'Got ', h('b', null, 'four of a kind'), '? Tap the spoons. Quietly!')),
      h('li', null, h('span', null, 'A spoon is missing? ', h('b', null, 'Grab one'), ' before they run out. One player always ends up without.')),
      h('li', null, h('span', null, 'Grab when nobody has four of a kind and it ', h('b', null, 'counts against you'), '.')),
      h('li', null, h('span', null, 'Sit on a card and the whole table ', h('b', null, 'heckles you'), '. Fewest spoonless rounds wins.')),
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
      summary.hidden = host;
      summary.textContent = `${s.settings.rounds} rounds`;
      roundBtns.forEach((b, i) => b.classList.toggle('primary', ROUND_OPTIONS[i] === s.settings.rounds));
      start.disabled = need > 0 || !online;
      addBot.disabled = seated.length >= MAX_PLAYERS || !online;
      removeBot.disabled = !seated.some((p) => p.bot) || !online;
      status.textContent =
        need > 0
          ? `Need ${need} more ${need === 1 ? 'player' : 'players'} (${MIN_PLAYERS} minimum, ${MAX_PLAYERS} at most). ${host ? 'Add a Spoonbot or invite a friend.' : ''}`
          : host
            ? `${seated.length} of ${MAX_PLAYERS} seats taken. Deal whenever you like!`
            : `Waiting for ${nameOf(s.hostId)} to deal…`;
    },
  };
}
