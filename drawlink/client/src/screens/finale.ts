import { sfx } from '../audio';
import { chatPanel } from '../chat';
import { h, tilt } from '../dom';
import { confetti } from '../fx';
import { isHost, nameOf, send, store } from '../store';
import type { Screen } from './index';

/** Final standings: equal scores share a place. */
export function finaleScreen(): Screen {
  const s0 = store.state!;
  const ranked = s0.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score);
  const place = (score: number) => ranked.findIndex((p) => p.score === score) + 1;
  const top = ranked[0];
  const again = h('button', { class: 'btn primary big', type: 'button', onclick: () => send({ type: 'again' }) }, 'Play again');
  const waiting = h('p', { class: 'sub' });
  const chat = chatPanel();

  const el = h(
    'section',
    { class: 'screen finale' },
    h('h2', { class: 'headline big' }, top && top.score > 0 ? `${top.id === s0.selfId ? 'You win' : `${top.name} wins`}!` : 'Nobody scored!'),
    h(
      'ol',
      { class: 'ranking sheet spiral' },
      ranked.map((p) =>
        h(
          'li',
          { class: `rank rank-${place(p.score)}${p.id === s0.selfId ? ' me' : ''}`, style: `--tilt:${tilt(p.id, 0.8)}deg` },
          h('span', { class: 'rank-no' }, place(p.score)),
          h('span', { class: 'avatar', style: `--c:${p.color}` }, p.name.slice(0, 1).toUpperCase()),
          h('span', { class: 'rank-name' }, p.name, p.bot && h('i', { class: 'tag' }, 'bot')),
          h('span', { class: 'rank-score' }, p.score),
        ),
      ),
    ),
    again,
    waiting,
    h('div', { class: 'lobby-chat' }, chat.el),
  );

  if (top && top.score > 0) {
    confetti();
    sfx.tada();
  }

  return {
    el,
    update() {
      const s = store.state!;
      again.hidden = !isHost();
      again.disabled = store.status !== 'connected';
      waiting.hidden = isHost();
      waiting.textContent = `Waiting for ${nameOf(s.hostId)} to deal the next game…`;
      chat.update();
    },
  };
}
