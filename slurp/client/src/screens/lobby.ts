import { DIFFICULTIES, MAX_PLAYERS } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store } from '../store';
import type { Screen } from './index';

const BLURB = { chill: 'plenty of time', normal: 'a fair clock', spicy: 'a tight clock' } as const;

export function lobbyScreen(): Screen {
  const notes = h('div', { class: 'notes' });
  const status = h('p', { class: 'lobby-status' });
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'start' })) }, 'Lay the table');
  const addBot = h('button', { class: 'btn', type: 'button', onclick: () => (sfx.pop(), send({ type: 'addBot' })) }, '+ Slurpbot');
  const removeBot = h('button', { class: 'btn', type: 'button', onclick: () => send({ type: 'removeBot' }) }, '− Slurpbot');
  const hostRow = h('div', { class: 'row host-row' }, addBot, removeBot);
  const share = h('p', { class: 'share' }, 'Friends join at ', h('b', null, location.host || 'this address'));

  const paceBtns = DIFFICULTIES.map((d) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', difficulty: d }) }, d));
  const settings = h('div', { class: 'settings' }, h('span', { class: 'setting' }, h('span', null, 'Pace'), paceBtns));
  const summary = h('p', { class: 'share' });

  const el = h(
    'section',
    { class: 'screen lobby' },
    h('div', { class: 'sheet spiral' }, h('h2', null, "Who's hungry?"), notes, status, settings, summary, hostRow, start, share),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, h('b', null, 'Drag'), ' anywhere (or point the mouse) to steer your hole.')),
      h('li', null, h('span', null, 'It swallows whatever ', h('b', null, 'fits'), '. Every bite makes it bigger.')),
      h('li', null, h('span', null, 'Too big to eat? You ', h('b', null, 'push it'), ' instead: herd it to a bigger teammate.')),
      h('li', null, h('span', null, 'Food shoved ', h('b', null, 'off the blanket'), ' costs the team 3 seconds.')),
      h('li', null, h('span', null, h('b', null, 'Clear the table together'), ' before the clock runs out. Each course is bigger. The more of you, the bigger the picnic.')),
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
      );
      const host = isHost();
      const online = store.status === 'connected';
      hostRow.hidden = !host;
      start.hidden = !host;
      settings.hidden = !host;
      summary.hidden = host;
      summary.textContent = `Pace: ${s.settings.difficulty} (${BLURB[s.settings.difficulty]})`;
      paceBtns.forEach((b, i) => b.classList.toggle('primary', DIFFICULTIES[i] === s.settings.difficulty));
      start.disabled = !online;
      addBot.disabled = seated.length >= MAX_PLAYERS || !online;
      removeBot.disabled = !seated.some((p) => p.bot) || !online;
      status.textContent = host
        ? `${seated.length} of ${MAX_PLAYERS} holes. Play alone, add a Slurpbot or invite friends, then lay the table!`
        : `${seated.length} of ${MAX_PLAYERS} holes. Waiting for ${nameOf(s.hostId)} to lay the table…`;
    },
  };
}
