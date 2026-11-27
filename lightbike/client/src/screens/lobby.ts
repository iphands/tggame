import { LENGTHS, MAX_PLAYERS, MIN_PLAYERS, PACES, TARGETS } from '../../../shared/src/constants';
import type { Settings } from '../../../shared/src/types';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store } from '../store';
import type { Screen } from './index';

const PACE_BLURB = { chill: 'time to think', normal: 'a fair lick', spicy: 'blink and you turn late', silly: 'good luck' } as const;
const TOYS: { key: 'boost' | 'bust' | 'slip' | 'erase'; label: string; blurb: string }[] = [
  { key: 'boost', label: 'Boost', blurb: 'hold to go faster' },
  { key: 'bust', label: 'Buster', blurb: 'pass through lines' },
  { key: 'slip', label: 'Slipstream', blurb: 'speed up beside a line' },
  { key: 'erase', label: 'Tidy up', blurb: 'crashed lines vanish' },
];

export function lobbyScreen(): Screen {
  const notes = h('div', { class: 'notes' });
  const status = h('p', { class: 'lobby-status' });
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'start' })) }, 'Lights out');
  const addBot = h('button', { class: 'btn', type: 'button', onclick: () => (sfx.pop(), send({ type: 'addBot' })) }, '+ Bikebot');
  const removeBot = h('button', { class: 'btn', type: 'button', onclick: () => send({ type: 'removeBot' }) }, '− Bikebot');
  const hostRow = h('div', { class: 'row host-row' }, addBot, removeBot);
  const share = h('p', { class: 'share' }, 'Friends join at ', h('b', null, location.host || 'this address'));

  const paceBtns = PACES.map((pace) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', pace }) }, pace));
  const lengthBtns = LENGTHS.map((length) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', length }) }, `first to ${TARGETS[length]}`));
  const toyBtns = TOYS.map((toy) =>
    h('button', { class: 'btn small', type: 'button', title: toy.blurb, onclick: () => send({ type: 'settings', [toy.key]: !store.state!.settings[toy.key] } as { type: 'settings' } & Partial<Settings>) }, toy.label),
  );
  const settings = h(
    'div',
    { class: 'settings' },
    h('span', { class: 'setting' }, h('span', null, 'Pace'), paceBtns),
    h('span', { class: 'setting' }, h('span', null, 'Match'), lengthBtns),
    h('span', { class: 'setting' }, h('span', null, 'Toys'), toyBtns),
  );
  const summary = h('p', { class: 'share' });

  const el = h(
    'section',
    { class: 'screen lobby' },
    h('div', { class: 'sheet' }, h('h2', null, "Who's riding?"), notes, status, settings, summary, hostRow, start, share),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, 'Your bike ', h('b', null, 'never stops'), ' and leaves a line of light behind it.')),
      h('li', null, h('span', null, h('b', null, 'Tap left or right'), ' to turn (or swipe, or use the arrow keys).')),
      h('li', null, h('span', null, 'Touch ', h('b', null, 'any line or wall'), ' and you are out. Yes, your own line counts.')),
      h('li', null, h('span', null, 'A point for ', h('b', null, 'everyone you outlast'), ', and one more when somebody hits your line.')),
      h('li', null, h('span', null, h('b', null, 'Boost'), ' to get in front. ', h('b', null, 'Bust'), ' to slip through a line. Both drink from one bar.')),
      h('li', null, h('span', null, 'Dawdle and ', h('b', null, 'the walls close in'), '.')),
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
            { class: 'note', style: `--c:${p.color};--tilt:${tilt(p.id, 3)}deg` },
            h('span', { class: 'note-name' }, p.name),
            h('span', { class: 'tags' }, p.id === s.selfId && h('i', { class: 'tag you' }, 'you'), p.id === s.hostId && h('i', { class: 'tag' }, 'host'), p.bot && h('i', { class: 'tag' }, 'bot')),
          ),
        ),
      );
      const host = isHost();
      const online = store.status === 'connected';
      const enough = seated.length >= MIN_PLAYERS;
      const on = TOYS.filter((t) => s.settings[t.key]).map((t) => t.label.toLowerCase());
      hostRow.hidden = !host;
      start.hidden = !host;
      settings.hidden = !host;
      summary.hidden = host;
      summary.textContent = `Pace: ${s.settings.pace} (${PACE_BLURB[s.settings.pace]}) · first to ${TARGETS[s.settings.length]} · ${on.length ? on.join(', ') : 'no toys'}`;
      paceBtns.forEach((b, i) => b.classList.toggle('primary', PACES[i] === s.settings.pace));
      lengthBtns.forEach((b, i) => b.classList.toggle('primary', LENGTHS[i] === s.settings.length));
      toyBtns.forEach((b, i) => b.classList.toggle('primary', s.settings[TOYS[i].key]));
      start.disabled = !online || !enough;
      addBot.disabled = seated.length >= MAX_PLAYERS || !online;
      removeBot.disabled = !seated.some((p) => p.bot) || !online;
      status.textContent = host
        ? enough
          ? `${seated.length} of ${MAX_PLAYERS} bikes. Invite friends, add a Bikebot, or just go.`
          : 'One bike is a commute, not a race. Add a Bikebot or invite a friend.'
        : `${seated.length} of ${MAX_PLAYERS} bikes. Waiting for ${nameOf(s.hostId)} to hit the lights…`;
    },
  };
}
