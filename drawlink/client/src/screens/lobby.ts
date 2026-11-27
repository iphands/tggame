import { MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { chatPanel } from '../chat';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store, watching } from '../store';
import { watchRow } from '@tggame/base/party/watchRow';
import type { Screen } from './index';

export function lobbyScreen(): Screen {
  const notes = h('div', { class: 'notes' });
  const status = h('p', { class: 'lobby-status' });
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'start' })) }, 'Start the game');
  const addBot = h('button', { class: 'btn', type: 'button', onclick: () => (sfx.pop(), send({ type: 'addBot' })) }, '+ Guessbot');
  const removeBot = h('button', { class: 'btn', type: 'button', onclick: () => send({ type: 'removeBot' }) }, '− Guessbot');
  const hostRow = h('div', { class: 'row host-row' }, addBot, removeBot);
  const share = h('p', { class: 'share' }, 'Friends join at ', h('b', null, location.host || 'this address'));

  const roundBtns = ROUND_OPTIONS.map((n) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', rounds: n }) }, n));
  const hintBtns = [true, false].map((on) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', hints: on }) }, on ? 'On' : 'Off'));
  const settings = h(
    'div',
    { class: 'settings' },
    h('span', { class: 'setting' }, h('span', null, 'Rounds'), roundBtns),
    h('span', { class: 'setting' }, h('span', { title: 'A blank for each letter from the start, then a letter every 10 seconds' }, 'Letter hints'), hintBtns),
  );
  const summary = h('p', { class: 'share' });
  const chat = chatPanel();

  const tv = watchRow(watching, (on) => send({ type: 'watch', on }));

  const el = h(
    'section',
    { class: 'screen lobby' },
    h('div', { class: 'sheet spiral' }, h('h2', null, "Who's playing?"), notes, status, settings, summary, hostRow, start, tv.els, share),
    h('div', { class: 'lobby-chat' }, chat.el),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, 'One player gets a ', h('b', null, 'secret word'), ' and draws it. No letters, no numbers!')),
      h('li', null, h('span', null, 'Everyone else ', h('b', null, 'types guesses'), ' while the drawing takes shape.')),
      h('li', null, h('span', null, 'The ', h('b', null, 'first right guess'), ' scores, and so does the drawer. Faster is worth more.')),
      h('li', null, h('span', null, 'Tap a player to ', h('b', null, 'whisper'), ' or to vote them out.')),
    ),
  );

  return {
    el,
    update() {
      const s = store.state!;
      tv.update(s.players, s.selfId);
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
      summary.textContent = `${s.settings.rounds} rounds · letter hints ${s.settings.hints ? 'on' : 'off'}`;
      roundBtns.forEach((b, i) => b.classList.toggle('primary', ROUND_OPTIONS[i] === s.settings.rounds));
      hintBtns.forEach((b, i) => b.classList.toggle('primary', (i === 0) === s.settings.hints));
      start.disabled = need > 0 || !online;
      addBot.disabled = seated.length >= MAX_PLAYERS || !online;
      removeBot.disabled = !seated.some((p) => p.bot) || !online;
      status.textContent =
        need > 0
          ? `Need ${need} more ${need === 1 ? 'player' : 'players'} (${MIN_PLAYERS} minimum, ${MAX_PLAYERS} at most). ${host ? 'Add a Guessbot or invite a friend.' : ''}`
          : host
            ? `${seated.length} of ${MAX_PLAYERS} seats taken. Start whenever you like!`
            : `Waiting for ${nameOf(s.hostId)} to start…`;
      chat.update();
    },
  };
}
