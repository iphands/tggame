import { MAX_PLAYERS, MIN_PLAYERS, MODES } from '../../../shared/src/constants';
import { MAPS } from '../../../shared/src/maps';
import { mapPicture } from '../art';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { isHost, nameOf, send, store } from '../store';
import { MODE_NAMES, type Screen } from './index';

const BLURB = {
  last: 'No chores, no way out. The last Cousin left uncaught wins.',
  escape: 'One Beast all round. Do the chores together to open the one exit, then get out. Working makes noise. Get caught and you are a ghost.',
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
  // the map: one by lot each round, or the host's pick; a small picture of it either way
  const step = (by: number): void => {
    const now = store.state?.settings.map ?? -1;
    // -1 (by lot) sits before the first map and after the last
    send({ type: 'settings', map: ((now + 1 + by + MAPS.length + 1) % (MAPS.length + 1)) - 1 });
  };
  const prev = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Previous map', onclick: () => step(-1) }, '◀');
  const next = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Next map', onclick: () => step(1) }, '▶');
  const mapName = h('b', { class: 'map-name' });
  const mapPic = h('canvas', { class: 'map-pic', width: 240, height: 156 });
  const mapRow = h('div', { class: 'map-row' }, prev, mapName, next);
  let shownMap = -2;
  const settings = h('div', { class: 'settings' }, h('span', { class: 'setting' }, modeBtns));
  const summary = h('p', { class: 'share' });
  const watchers = h('p', { class: 'share' });
  const toggle = h('button', { class: 'btn small', type: 'button' });
  toggle.addEventListener('click', () => send({ type: 'watch', on: !store.state?.players.find((p) => p.id === store.state?.selfId)?.watcher }));

  const el = h(
    'section',
    { class: 'screen lobby' },
    h('div', { class: 'sheet spiral' }, h('h2', null, "Who's in the house?"), notes, status, settings, summary, mapRow, mapPic, hostRow, start, watchers, toggle, share),
    h(
      'ol',
      { class: 'howto' },
      h('li', null, h('span', null, 'One of you is the ', h('b', null, 'Hilder Beast'), ', starting somewhere new each round. Everyone else is a ', h('b', null, 'Cousin'), ', with 3 seconds to get away.')),
      h('li', null, h('span', null, h('b', null, 'Move'), ' with WASD or the arrows, or drag a thumb anywhere. Walls hide you: nobody sees round a corner.')),
      h('li', null, h('span', null, 'Cousins: hold ', h('b', null, 'Boost'), ' (Space) to run. It burns energy; ', h('b', null, 'pills'), ' give it back.')),
      h('li', null, h('span', null, 'Beast: ', h('b', null, 'touch'), ' a Cousin to catch them. ', h('b', null, 'Boost'), ' (Space) is a big burst, ', h('b', null, 'Dash'), ' (E) a quick small one. Swirls in the floor are your ', h('b', null, 'Beast doors'), ': red leads to red, blue to blue, green to green.')),
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
      if (s.settings.map !== shownMap) {
        shownMap = s.settings.map;
        const map = MAPS[shownMap];
        mapName.textContent = map ? map.name : 'Any map, by lot';
        const m = mapPic.getContext('2d')!;
        m.clearRect(0, 0, mapPic.width, mapPic.height);
        if (map) m.drawImage(mapPicture(map, 6), 0, 0);
        else {
          m.fillStyle = 'rgba(31,26,46,0.75)';
          m.fillRect(0, 0, mapPic.width, mapPic.height);
          m.fillStyle = '#ffd23f';
          m.font = '90px Chewy, sans-serif';
          m.textAlign = 'center';
          m.textBaseline = 'middle';
          m.fillText('?', mapPic.width / 2, mapPic.height / 2 + 6);
        }
      }
      const host = isHost();
      prev.hidden = next.hidden = !host;
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
