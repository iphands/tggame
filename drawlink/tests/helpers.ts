import { Game } from '../server/src/game';

/** Deterministic RNG (mulberry32). */
export function seeded(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
