import { MAX_PLAYERS, MIN_PLAYERS, MODES } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store } from '../store';
import { MODE_NAMES, type Screen } from './index';

const BLURB = {
  last: 'No chores, no way out. The last Cousin left uncaught wins.',
  escape: 'One Beast all round. Do the chores together to open the exits, then get out. Working makes noise. Get caught and you are a ghost.',
} as const;

export function lobbyScreen(): Screen {
  const notes = h('div', { class: 'notes' });
  const status = h('p', { class: 'lobby-status' });
  const start = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'start' })) }, 'Lights out!');
  const addBot = h('button', { class: 'btn', type: 'button', onclick: () => (sfx.pop(), send({ type: 'addBot' })) }, '+ Bot');
  const removeBot = h('button', { class: 'btn', type: 'button', onclick: () => send({ type: 'removeBot' }) }, '− Bot');
  const hostRow = h('div', { class: 'row host-row' }, addBot, removeBot);
  const share = h('p', { class: 'share' }, 'Friends join at ', h('b', null, location.host || 'this address'));
  const modeBtns = MODES.map((mode) => h('button', { class: 'btn small', type: 'button', onclick: () => send({ type: 'settings', mode }) }, MODE_NAMES[mode]));
  const settings = h('div', { class: 'settings' }, h('span', { class: 'setting' }, modeBtns));
  const summary = h('p', { class: 'share' });
  const watchers = h('p', { class: 'share' });
  const toggle = h('button', { class: 'btn small', type: 'button' });
  toggle.addEventListener('click', () => send({ type: 'watch', on: !store.state?.players.find((p) => p.id === store.state?.selfId)?.watcher }));

  const el = h(
    'section',
    { class: 'screen lobby' },
    h('div', { class: 'sheet spiral' }, h('h2', null, "Who's in the house?"), notes, status, settings, summary, hostRow, start, watchers, toggle, share),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, 'One of you is the ', h('b', null, 'Hilder Beast'), '. Everyone else is a ', h('b', null, 'Cousin'), '. You are told which.')),
      h('li', null, h('span', null, h('b', null, 'Move'), ' with WASD or the arrows, or drag a thumb anywhere. Walls hide you: nobody sees round a corner.')),
      h('li', null, h('span', null, 'Cousins: hold ', h('b', null, 'Boost'), ' (Space) to run. It burns energy; ', h('b', null, 'pills'), ' give it back.')),
      h('li', null, h('span', null, 'Beast: ', h('b', null, 'touch'), ' a Cousin to catch them. ', h('b', null, 'Boost'), ' (Space) is a big burst, ', h('b', null, 'Dash'), ' (E) a quick small one. Swirls in the floor are your ', h('b', null, 'Beast doors'), '.')),
      h('li', null, h('span', null, 'In Last Cousin Standing a caught Cousin ', h('b', null, 'becomes a Beast'), '. In Escape they become a ', h('b', null, 'ghost'), ' who can only roam and watch.')),
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
            h('span', { class: 'tags' }, p.id === s.selfId && h('i', { class: 'tag you' }, 'you'), p.id === s.hostId && h('i', { class: 'tag' }, 'host'), p.bot && h('i', { class: 'tag' }, 'bot')),
          ),
        ),
      );
      const tv = s.players.filter((p) => p.watcher);
      const mine = s.players.find((p) => p.id === s.selfId);
      watchers.hidden = tv.length === 0;
      watchers.textContent = `Watching: ${tv.map((p) => p.name).join(', ')}`;
      toggle.textContent = mine?.watcher ? 'Play instead' : 'Just watch';
      const host = isHost();
      const online = store.status === 'connected';
      const enough = seated.length >= MIN_PLAYERS;
      hostRow.hidden = !host;
      start.hidden = !host;
      settings.hidden = !host;
      summary.textContent = `${host ? '' : `${MODE_NAMES[s.settings.mode]}. `}${BLURB[s.settings.mode]}`;
      modeBtns.forEach((b, i) => b.classList.toggle('primary', MODES[i] === s.settings.mode));
      start.disabled = !online || !enough;
      addBot.disabled = seated.length >= MAX_PLAYERS || !online;
      removeBot.disabled = !seated.some((p) => p.bot) || !online;
      status.textContent = !host
        ? `${seated.length} of ${MAX_PLAYERS} in the house. Waiting for ${nameOf(s.hostId)} to put the lights out…`
        : enough
          ? `${seated.length} of ${MAX_PLAYERS} in the house. Add bots or invite friends, then put the lights out!`
          : 'It takes two. Add a bot or invite a friend.';
    },
  };
}
