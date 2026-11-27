import { h } from '@tggame/base/client/dom';
import { confetti } from '@tggame/base/client/fx';
import { CLEARED_MS } from '../../../shared/src/constants';
import { sfx } from '../audio';
import { store } from '../store';
import type { Bites } from '../../../shared/src/types';
import { starText, type Screen } from './index';

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** Who ate how much on one course, hungriest first, with a crown for whoever ate the most. */
export function bitesList(bites: Bites): HTMLElement | false {
  const s = store.state!;
  const rows = bites.filter((b) => s.players.some((p) => p.id === b.id));
  if (rows.length < 2) return false; // a lone hole needs no ranking
  const top = rows[0].eaten;
  return h(
    'ol',
    { class: 'crew bites' },
    rows.map((b) => {
      const p = s.players.find((x) => x.id === b.id)!;
      const best = b.eaten === top && top > 0;
      return h(
        'li',
        { class: `${b.id === s.selfId ? 'me' : ''}${best ? ' best' : ''}` },
        h('span', { class: 'avatar', style: `--c:${p.color}` }, p.name.slice(0, 1).toUpperCase()),
        h('span', { class: 'who' }, best && '👑 ', p.name, p.bot && h('i', { class: 'tag' }, 'bot')),
        h('span', { class: 'ate' }, b.eaten),
      );
    }),
  );
}

/** The table is empty: how it went, and a moment to breathe before the next one. */
export function clearedScreen(): Screen {
  const s = store.state!;
  const c = s.cleared!;
  const next = h('p', { class: 'sub' });
  const until = performance.now() + CLEARED_MS;
  const el = h(
    'section',
    { class: 'screen cleared' },
    h('h2', { class: 'headline big' }, `Course ${c.no} cleared!`),
    h('div', { class: 'stars' }, [...starText(c.stars)].map((ch, i) => h('span', { class: ch === '★' ? '' : 'off', style: `animation-delay:${i * 0.18}s` }, ch))),
    h(
      'div',
      { class: 'sheet spiral' },
      h(
        'div',
        { class: 'facts' },
        h('span', null, h('b', null, secs(c.leftMs)), ' to spare'),
        h('span', null, c.spills === 0 ? 'nothing spilled' : [h('b', null, c.spills), c.spills === 1 ? ' spill' : ' spills']),
        c.carryMs > 0 && h('span', null, h('b', null, `+${secs(c.carryMs)}`), ' on the next clock'),
      ),
      bitesList(c.bites),
      next,
    ),
  );
  if (c.stars === 3) confetti(1800);
  sfx.tada();

  const tick = (): void => {
    const left = Math.max(0, Math.ceil((until - performance.now()) / 1000));
    next.textContent = `Course ${c.no + 1} of ${s.course?.of ?? ''} is bigger. Laying it in ${left}…`;
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
