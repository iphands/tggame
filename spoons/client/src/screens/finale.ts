import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { confetti } from '@tggame/base/client/fx';
import { isHost, nameOf, send, store } from '../store';
import type { Screen } from './index';

export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** Final standings: fewest spoonless rounds wins, and equal counts share a place. */
export function finaleScreen(): Screen {
  const s0 = store.state!;
  const ranked = s0.players.filter((p) => !p.spectator).sort((a, b) => a.losses - b.losses);
  const place = (losses: number) => ranked.findIndex((p) => p.losses === losses) + 1;
  const winners = ranked.filter((p) => p.losses === ranked[0].losses);
  const iWon = winners.some((p) => p.id === s0.selfId);
  const slowpoke = [...ranked].sort((a, b) => b.slowMs - a.slowMs)[0];
  const again = h('button', { class: 'btn primary big', type: 'button', onclick: () => send({ type: 'again' }) }, 'Play again');
  const waiting = h('p', { class: 'sub' });

  const headline = !ranked.length
    ? 'Game over!'
    : winners.length > 1
      ? winners.length === ranked.length
        ? "It's a draw!"
        : `${winners.map((p) => (p.id === s0.selfId ? 'You' : p.name)).join(' & ')} win!`
      : iWon
        ? 'You win!'
        : `${winners[0].name} wins!`;

  const el = h(
    'section',
    { class: 'screen finale' },
    h('h2', { class: 'headline big' }, headline),
    h(
      'ol',
      { class: 'ranking sheet spiral' },
      ranked.map((p) =>
        h(
          'li',
          { class: `rank rank-${place(p.losses)}${p.id === s0.selfId ? ' me' : ''}`, style: `--tilt:${tilt(p.id, 0.8)}deg` },
          h('span', { class: 'rank-no' }, place(p.losses)),
          h('span', { class: 'avatar', style: `--c:${p.color}` }, p.name.slice(0, 1).toUpperCase()),
          h('span', { class: 'rank-name' }, p.name, p.bot && h('i', { class: 'tag' }, 'bot')),
          h('span', { class: 'rank-score', title: p.fumbles ? `${p.fumbles} of them false grabs` : null }, p.losses === 0 ? 'never spoonless' : `${p.losses}× spoonless`),
        ),
      ),
    ),
    slowpoke && slowpoke.slowMs > 0 && h('p', { class: 'award' }, `🐌 Slowpoke of the game: ${slowpoke.name}, who held the table up for ${seconds(slowpoke.slowMs)}.`),
    again,
    waiting,
  );

  if (ranked.length) {
    if (iWon) {
      confetti();
      sfx.tada();
    } else sfx.deal();
  }

  return {
    el,
    update() {
      const s = store.state!;
      again.hidden = !isHost();
      again.disabled = store.status !== 'connected';
      waiting.hidden = isHost();
      waiting.textContent = `Waiting for ${nameOf(s.hostId)} to set up the next game…`;
    },
  };
}
