import { botPass } from '../server/src/bots';
import { Game } from '../server/src/game';
import { DEAL_MS } from '../shared/src/constants';

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

/** A started game of `n` humans with the cards just beginning to move. Returns the time. */
export function started(n: number, seed = 1): { g: Game; ids: string[]; now: number } {
  const t = table(n, seed);
  t.g.start(t.ids[0], T0);
  const now = T0 + DEAL_MS;
  t.g.tick(now);
  return { g: t.g, ids: t.ids, now };
}

/** Everybody's cards, read the only way there is: from their own task. */
export const cardsOf = (g: Game, id: string): string[] => {
  const t = g.taskFor(id)!;
  return t.drawn ? [...t.hand, t.drawn] : t.hand;
};

/**
 * Everyone passes briskly and sensibly until somebody holds four of a kind.
 * Returns who, and the time it happened.
 */
export function playToQuad(g: Game, ids: string[], from: number, seed = 7): { id: string; now: number } {
  const rng = seeded(seed);
  let now = from;
  for (let step = 0; step < 20_000; step++) {
    for (const id of ids) {
      const t = g.taskFor(id);
      if (!t) throw new Error('round ended before anyone had four of a kind');
      if (t.quad) return { id, now };
      if (t.drawn) g.pass(id, botPass([...t.hand, t.drawn], rng), now);
    }
    now += 10;
    g.tick(now);
  }
  throw new Error('nobody got four of a kind');
}

/** Play one whole round: someone completes a set and everyone but `loser` grabs. Returns the time. */
export function playRound(g: Game, ids: string[], from: number, loser?: string): number {
  const q = playToQuad(g, ids, from);
  let now = q.now;
  g.grab(q.id, now);
  const out = loser && loser !== q.id ? loser : ids.find((id) => id !== q.id)!;
  for (const id of ids) if (id !== q.id && id !== out) g.grab(id, (now += 50));
  return now;
}
