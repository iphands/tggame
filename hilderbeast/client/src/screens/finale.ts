import { h } from '@tggame/base/client/dom';
import { confetti } from '@tggame/base/client/fx';
import { sfx } from '../audio';
import { isHost, nameOf, send, store } from '../store';
import { MODE_NAMES, type Screen } from './index';

/** Who won, why, and who caught whom. */
export function finaleScreen(): Screen {
  const s0 = store.state!;
  const r = s0.result!;
  const side = s0.round?.sides[s0.selfId];
  // you end the round a Beast if you were caught, whichever side you started on
  const mine = side === 'b' ? 'beasts' : side ? 'cousins' : null;
  const won = mine === r.winner;
  const who = (id: string): HTMLElement => {
    const p = s0.players.find((x) => x.id === id);
    return h('span', { class: 'who' }, h('span', { class: 'avatar mini', style: `--c:${p?.color ?? '#999'}` }, (p?.name ?? '?').slice(0, 1).toUpperCase()), ' ', p?.name ?? 'someone who left');
  };
  const list = (ids: string[]): (HTMLElement | string)[] => ids.flatMap((id, i) => [i > 0 ? ', ' : '', who(id)]);

  const headline = r.winner === 'cousins' ? (r.why === 'escaped' ? 'The Cousins got out!' : r.why === 'clock' ? 'The Cousins lasted the night!' : 'One Cousin left standing!') : 'The Hilder Beasts got everyone!';
  const why =
    r.why === 'escaped'
      ? ['Out of the door: ', ...list(r.escaped)]
      : r.why === 'last'
        ? r.survivors.length
          ? ['Never caught: ', ...list(r.survivors)]
          : ['Nobody was left to hunt.']
        : r.why === 'clock'
          ? r.winner === 'cousins'
            ? ['Still free when the clock ran out: ', ...list(r.survivors)]
            : ['The clock ran out with the exits still shut.']
          : ['Not one Cousin was left.'];
  const secs = Math.round(r.tookMs / 1000);

  const again = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'again' })) }, 'Another round');
  const waiting = h('p', { class: 'share' });
  const el = h(
    'section',
    { class: `screen finale ${r.winner}` },
    h(
      'div',
      { class: 'sheet spiral' },
      h('p', { class: 'verdict' }, mine === null ? 'Round over' : won ? 'Your side won!' : 'Your side lost'),
      h('h2', null, headline),
      h('p', { class: 'facts' }, ...why),
      h('p', { class: 'facts' }, h('span', null, MODE_NAMES[r.mode]), h('span', null, h('b', null, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`), ' on the clock')),
      h('h3', null, 'The hunt'),
      h(
        'ol',
        { class: 'crew' },
        h('li', { class: r.firstBeast === s0.selfId ? 'me' : '' }, who(r.firstBeast), h('span', { class: 'ate' }, 'the first Beast')),
        r.catches.map((c) =>
          h(
            'li',
            { class: c.who === s0.selfId || c.by === s0.selfId ? 'me' : '' },
            who(c.who),
            h('span', { class: 'ate' }, c.by ? ['caught by ', nameOf(c.by)] : 'turned when the Beast left', ` at ${Math.floor(c.atMs / 60000)}:${String(Math.floor(c.atMs / 1000) % 60).padStart(2, '0')}`),
          ),
        ),
      ),
      again,
      waiting,
    ),
  );

  if (won) {
    confetti();
    sfx.tada();
  } else if (mine) sfx.lose();

  return {
    el,
    update() {
      const s = store.state!;
      again.hidden = !isHost();
      waiting.hidden = isHost();
      waiting.textContent = `Waiting for ${nameOf(s.hostId)}…`;
    },
  };
}
