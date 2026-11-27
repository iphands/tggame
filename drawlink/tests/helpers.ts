import { seeded } from '@tggame/base/testing/seeded';
import { Game } from '../server/src/game';

/** Tests run on their own clock, starting here. */
export const T0 = 1_000_000;

type Joined = { id: string; token: string; resumed: boolean };

export function join(g: Game, name: string, now = T0, token?: string): Joined {
  const j = g.join(name, token, now);
  if (typeof j === 'string') throw new Error(`join refused: ${j}`);
  return j;
}

/** A lobby with `n` humans named P1..Pn; returns their ids in seat order. */
export function table(n: number, seed = 1): { g: Game; ids: string[]; tokens: string[] } {
  const g = new Game(seeded(seed));
  const ids: string[] = [];
  const tokens: string[] = [];
  for (let i = 1; i <= n; i++) {
    const j = join(g, `P${i}`);
    ids.push(j.id);
    tokens.push(j.token);
  }
  return { g, ids, tokens };
}

/** The secret word of the running round, read the only way there is: from the drawer's task. */
export const wordOf = (g: Game): string => g.taskFor(g.drawerId!)!.word;

/** Everything `id` has been sent in chat, as one string per line. */
export const chatOf = (g: Game, id: string): string[] => g.chatFor(id, 0).map((l) => l.text);

export { seeded } from '@tggame/base/testing/seeded';
