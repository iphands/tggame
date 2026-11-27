import { describe, expect, it } from 'vitest';
import { fullDeck } from '../shared/src/cards';
import { REVEAL_MS } from '../shared/src/constants';
import { cardsOf, join, playRound, playToQuad, started } from './helpers';

const CARD = new RegExp(`"(${fullDeck().join('|')})"`);

describe('hidden information', () => {
  it('never puts a card in the public state while a round runs', () => {
    const { g, ids, now } = started(4);
    const q = playToQuad(g, ids, now);
    for (const id of ids) expect(JSON.stringify(g.viewFor(id))).not.toMatch(CARD);
    g.grab(q.id, q.now);
    for (const id of ids) expect(JSON.stringify(g.viewFor(id))).not.toMatch(CARD);
  });
  it('gives each player their own cards and nobody else\'s', () => {
    const { g, ids } = started(4);
    const hands = ids.map((id) => cardsOf(g, id));
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i !== j) for (const c of hands[j]) expect(hands[i]).not.toContain(c);
      }
    }
  });
  it('gives spectators no cards', () => {
    const { g, now } = started(3);
    const late = join(g, 'Late', now);
    expect(g.taskFor(late.id)).toBeNull();
    expect(g.taskFor('nobody')).toBeNull();
    expect(JSON.stringify(g.viewFor(late.id))).not.toMatch(CARD);
  });
  it('shows only the winning four once the round is over', () => {
    const { g, ids, now } = started(4);
    const end = playRound(g, ids, now);
    const json = JSON.stringify(g.viewFor(ids[0]));
    const shown = json.match(new RegExp(CARD, 'g')) ?? [];
    expect(shown).toHaveLength(4);
    for (const id of ids) expect(g.taskFor(id)).toBeNull();
    g.tick(end + REVEAL_MS); // next deal: nothing on show again
    expect(JSON.stringify(g.viewFor(ids[0]))).not.toMatch(CARD);
  });
  it('does not say whether anyone holds four of a kind', () => {
    const { g, ids, now } = started(4);
    const q = playToQuad(g, ids, now);
    expect(g.taskFor(q.id)!.quad).toBe(true);
    expect(JSON.stringify(g.viewFor(ids[0]))).not.toContain('quad');
  });
});
