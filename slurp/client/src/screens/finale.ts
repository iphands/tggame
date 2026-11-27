import { h } from '@tggame/base/client/dom';
import { confetti } from '@tggame/base/client/fx';
import { TIER_NAMES } from '../art';
import { sfx } from '../audio';
import { isHost, nameOf, send, store } from '../store';
import type { PlayerStats } from '../../../shared/src/types';
import { starText, type Screen } from './index';

/** The player with the most of something, if anybody has any and nobody ties. */
function most(stats: PlayerStats[], of: (s: PlayerStats) => number): string | null {
  const top = Math.max(0, ...stats.map(of));
  const who = stats.filter((s) => of(s) === top);
  return top > 0 && who.length === 1 ? who[0].id : null;
}

/** How the run went for the team, and who did what. There is no winner: everybody is on one side. */
export function finaleScreen(): Screen {
  const s0 = store.state!;
  const r = s0.result!;
  const stats = [...r.stats].sort((a, b) => b.eaten - a.eaten);
  const total = stats.reduce((n, s) => n + s.eaten, 0);
  const starSum = s0.stars.reduce((a, b) => a + b, 0);
  const medals: Record<string, string[]> = {};
  const give = (id: string | null, text: string): void => {
    if (id) (medals[id] ??= []).push(text);
  };
  if (stats.length > 1) {
    give(most(stats, (s) => s.eaten), '🍽️ hungriest');
    give(most(stats, (s) => s.herds), '🐑 best herder');
    give(most(stats, (s) => s.spills), '🫣 clumsiest');
  }

  // who ate the most on each course
  const nameIn = (id: string): string => s0.players.find((p) => p.id === id)?.name ?? 'someone';
  const colorIn = (id: string): string => s0.players.find((p) => p.id === id)?.color ?? '#fff';
  const champions =
    stats.length > 1 &&
    r.courses.length > 0 &&
    h(
      'div',
      { class: 'sheet champions' },
      h('h3', null, 'Hungriest on each course'),
      h(
        'ol',
        { class: 'crew' },
        r.courses.map((course) => {
          const top = course.bites[0]?.eaten ?? 0;
          const best = top > 0 ? course.bites.filter((b) => b.eaten === top) : [];
          return h(
            'li',
            { class: best.some((b) => b.id === s0.selfId) ? 'me' : '' },
            h('span', { class: 'course-no' }, course.no),
            h(
              'span',
              { class: 'who' },
              best.length === 0
                ? 'nobody got a bite'
                : best.flatMap((b, i) => [i > 0 && ' & ', h('span', { class: 'avatar mini', style: `--c:${colorIn(b.id)}` }, nameIn(b.id).slice(0, 1).toUpperCase()), ' ', nameIn(b.id)]),
              !course.cleared && h('span', { class: 'medals' }, 'the clock ran out here'),
            ),
            h('span', { class: 'ate' }, top > 0 ? top : ''),
          );
        }),
      ),
    );

  const again = h('button', { class: 'btn primary big', type: 'button', onclick: () => send({ type: 'again' }) }, 'Play again');
  const waiting = h('p', { class: 'sub' });
  const headline = r.won ? 'The whole banquet, gone!' : r.cleared === 0 ? 'Out of time!' : `Out of time on course ${r.failedOn}`;
  const sub = r.won
    ? `All ${r.cleared} courses cleared.`
    : `${r.cleared} ${r.cleared === 1 ? 'course' : 'courses'} cleared. ${r.leftOver} ${r.leftOver === 1 ? 'bite was' : 'bites were'} left on the table.`;

  const el = h(
    'section',
    { class: 'screen finale' },
    h('h2', { class: 'headline big' }, headline),
    h('p', { class: 'award' }, sub),
    s0.stars.length > 0 && h('div', { class: 'stars small' }, s0.stars.map((n) => starText(n)).join(' ')),
    h(
      'div',
      { class: 'sheet spiral' },
      h('div', { class: 'facts' }, h('span', null, h('b', null, total), ' bites'), h('span', null, h('b', null, starSum), ` of ${s0.stars.length * 3 || 3} stars`)),
      h(
        'ol',
        { class: 'crew' },
        stats.map((st) => {
          const p = s0.players.find((x) => x.id === st.id);
          return h(
            'li',
            { class: st.id === s0.selfId ? 'me' : '' },
            h('span', { class: 'avatar', style: `--c:${p?.color ?? '#fff'}` }, (p?.name ?? '?').slice(0, 1).toUpperCase()),
            h(
              'span',
              { class: 'who' },
              p?.name ?? 'someone',
              p?.bot && h('i', { class: 'tag' }, 'bot'),
              h(
                'span',
                { class: 'medals' },
                [...(medals[st.id] ?? []), st.biggest >= 0 ? `biggest bite: ${TIER_NAMES[st.biggest].replace(/(ie)?s$/, (m) => (m === 'ies' ? 'y' : ''))}` : 'still hungry'].join(' · '),
              ),
            ),
            h('span', { class: 'ate' }, st.eaten),
          );
        }),
      ),
    ),
    champions,
    again,
    waiting,
  );

  if (r.won) {
    confetti();
    sfx.tada();
  } else sfx.lose();

  return {
    el,
    update() {
      const s = store.state!;
      again.hidden = !isHost();
      again.disabled = store.status !== 'connected';
      waiting.hidden = isHost();
      waiting.textContent = `Waiting for ${nameOf(s.hostId)} to set up the next picnic…`;
    },
  };
}
