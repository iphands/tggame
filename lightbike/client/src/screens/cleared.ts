import { h } from '@tggame/base/client/dom';
import { confetti } from '@tggame/base/client/fx';
import { ARENA_NAMES } from '../../../shared/src/arenas';
import { CLEARED_MS } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { store } from '../store';
import { fate, type Screen } from './index';

/** The round is over: who outlasted whom, what it was worth, and a breath before the next one. */
export function clearedScreen(): Screen {
  const s = store.state!;
  const c = s.cleared!;
  const nameIn = (id: string): string => s.players.find((p) => p.id === id)?.name ?? 'somebody';
  const mine = c.winner === s.selfId;
  const next = h('p', { class: 'sub' });
  const until = performance.now() + CLEARED_MS;
  const rows = c.exits.filter((e) => s.players.some((p) => p.id === e.id));

  const el = h(
    'section',
    { class: 'screen cleared' },
    h('h2', { class: 'headline big' }, c.winner ? (mine ? 'You outlasted everyone!' : `${nameIn(c.winner)} outlasted everyone!`) : 'Nobody made it.'),
    !c.winner && h('p', { class: 'award' }, 'Impressive, in a way.'),
    h(
      'div',
      { class: 'sheet' },
      h('h3', null, `Round ${c.no}`),
      h(
        'ol',
        { class: 'crew' },
        rows.map((e) => {
          const p = s.players.find((x) => x.id === e.id)!;
          return h(
            'li',
            { class: `${e.id === s.selfId ? 'me' : ''}${e.place === 1 && c.winner ? ' best' : ''}` },
            h('span', { class: 'avatar', style: `--c:${p.color}` }, p.name.slice(0, 1).toUpperCase()),
            h('span', { class: 'who' }, e.place === 1 && c.winner && '👑 ', p.name, p.bot && h('i', { class: 'tag' }, 'bot'), h('span', { class: 'medals' }, fate(e, nameIn))),
            h('span', { class: 'gain' }, e.gained ? `+${e.gained}` : ''),
            h('span', { class: 'ate' }, p.score),
          );
        }),
      ),
      next,
    ),
  );
  if (mine) confetti(1800);
  if (mine) sfx.tada();
  else sfx.pop();

  const tick = (): void => {
    const left = Math.max(0, Math.ceil((until - performance.now()) / 1000));
    next.textContent = c.last ? `That settles it. Results in ${left}…` : `Round ${c.no + 1} on ${ARENA_NAMES[c.no % ARENA_NAMES.length]}, first to ${s.round?.target ?? ''}. Lights out in ${left}…`;
  };
  tick();
  const timer = setInterval(tick, 250);

  return {
    el,
    update() {},
    destroy() {
      clearInterval(timer);
    },
  };
}
