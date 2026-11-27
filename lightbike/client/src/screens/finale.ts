import { h } from '@tggame/base/client/dom';
import { confetti } from '@tggame/base/client/fx';
import { sfx } from '../audio';
import { isHost, nameOf, send, store } from '../store';
import type { PlayerStats } from '../../../shared/src/types';
import type { Screen } from './index';

/** The player with the most of something, if anybody has any and nobody ties. */
function most(stats: PlayerStats[], of: (s: PlayerStats) => number): string | null {
  const top = Math.max(0, ...stats.map(of));
  const who = stats.filter((s) => of(s) === top);
  return top > 0 && who.length === 1 ? who[0].id : null;
}

/** The match is over: who won, the standings, and a few prizes nobody asked for. */
export function finaleScreen(): Screen {
  const s0 = store.state!;
  const r = s0.result!;
  const stats = [...r.stats].sort((a, b) => b.score - a.score || b.wins - a.wins);
  const medals: Record<string, string[]> = {};
  const give = (id: string | null, text: string): void => {
    if (id) (medals[id] ??= []).push(text);
  };
  give(most(stats, (s) => s.cuts), '✂️ sharpest cut-offs');
  give(most(stats, (s) => s.cells), '🖊 longest line');
  give(most(stats, (s) => s.shaves), '🫣 closest shaves');
  give(most(stats, (s) => s.own), '🤦 own worst enemy');
  give(most(stats, (s) => s.walls), '🧱 wall inspector');
  give(most(stats, (s) => s.firsts), '🐣 first to find trouble');

  const nameIn = (id: string): string => s0.players.find((p) => p.id === id)?.name ?? 'somebody';
  const won = r.winner === s0.selfId;
  const again = h('button', { class: 'btn primary big', type: 'button', onclick: () => send({ type: 'again' }) }, 'Ride again');
  const waiting = h('p', { class: 'sub' });
  const rounds = `${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'}`;

  const el = h(
    'section',
    { class: 'screen finale' },
    h('h2', { class: 'headline big' }, r.winner ? (won ? 'YOU WIN!' : `${nameIn(r.winner)} WINS!`) : 'A DEAD HEAT!'),
    h('p', { class: 'award' }, r.winner ? `The last line standing, after ${rounds}.` : `Level after ${rounds}, and nobody left to settle it.`),
    h(
      'div',
      { class: 'sheet' },
      h(
        'ol',
        { class: 'crew' },
        stats.map((st, i) => {
          const p = s0.players.find((x) => x.id === st.id);
          const facts = [`${st.wins} ${st.wins === 1 ? 'round' : 'rounds'} won`, ...(medals[st.id] ?? [])];
          return h(
            'li',
            { class: `${st.id === s0.selfId ? 'me' : ''}${st.id === r.winner ? ' best' : ''}` },
            h('span', { class: 'course-no' }, i + 1),
            h('span', { class: 'avatar', style: `--c:${p?.color ?? '#fff'}` }, (p?.name ?? '?').slice(0, 1).toUpperCase()),
            h('span', { class: 'who' }, p?.name ?? 'somebody', p?.bot && h('i', { class: 'tag' }, 'bot'), h('span', { class: 'medals' }, facts.join(' · '))),
            h('span', { class: 'ate' }, st.score),
          );
        }),
      ),
    ),
    again,
    waiting,
  );

  if (won) {
    confetti();
    sfx.tada();
  } else if (r.winner && s0.players.find((p) => p.id === s0.selfId)?.spectator === false) sfx.lose();
  else sfx.tada();

  return {
    el,
    update() {
      const s = store.state!;
      again.hidden = !isHost();
      again.disabled = store.status !== 'connected';
      waiting.hidden = isHost();
      waiting.textContent = `Waiting for ${nameOf(s.hostId)} to wheel the bikes back out…`;
    },
  };
}
