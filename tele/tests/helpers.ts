import { seeded } from '@tggame/base/testing/seeded';
import { Game } from '../server/src/game';
import type { Drawing, Order } from '../shared/src/types';

export const doodle = (tag = 1): Drawing => [{ c: 0, w: 5, p: [tag, tag, tag + 10, tag + 10] }];

/**
 * A lobby with `n` humans named P1..Pn; returns their ids in seat order. The passing order is
 * `fixed` unless asked otherwise, so tests can count on seat `i` being player `i`.
 */
export function table(n: number, seed = 1, order: Order = 'fixed'): { g: Game; ids: string[]; tokens: string[] } {
  const g = new Game(seeded(seed));
  const ids: string[] = [];
  const tokens: string[] = [];
  for (let i = 1; i <= n; i++) {
    const j = g.join(`P${i}`)!;
    ids.push(j.id);
    tokens.push(j.token);
  }
  g.configure(ids[0], order);
  return { g, ids, tokens };
}

/** Have everyone who has not yet submitted take the current turn. */
export function playTurn(g: Game, ids: string[]): void {
  const phase = g.phase;
  const turn = g.turn;
  for (const id of ids) {
    if (g.phase !== phase || g.turn !== turn) break;
    if (g.viewFor(id).submitted) continue;
    if (phase === 'pick') g.pick(id, 0);
    else if (phase === 'draw') g.draw(id, doodle(g.turn * 20 + ids.indexOf(id)));
    else if (phase === 'guess') g.guess(id, `guess ${g.turn} by ${id}`);
  }
}

export function playToReveal(g: Game, ids: string[]): void {
  g.start(ids[0]);
  for (let guard = 0; guard < 50 && g.phase !== 'reveal'; guard++) playTurn(g, ids);
}

export { seeded } from '@tggame/base/testing/seeded';
