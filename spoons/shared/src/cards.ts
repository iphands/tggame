/** A standard deck. A card is two characters: rank then suit, e.g. `QH`, `TD` (ten of diamonds). */
export type Card = string;

export const RANKS = 'A23456789TJQK';
export const SUITS = 'SHDC';

export function fullDeck(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(r + s);
  return out;
}

export const isCard = (v: unknown): v is Card => typeof v === 'string' && v.length === 2 && RANKS.includes(v[0]) && SUITS.includes(v[1]);

export const rankOf = (c: Card): string => c[0];

/** The four cards of one rank among `cards`, or null when there is no such set. */
export function fourOfAKind(cards: readonly Card[]): Card[] | null {
  for (const c of cards) {
    const same = cards.filter((k) => k[0] === c[0]);
    if (same.length >= 4) return same.slice(0, 4);
  }
  return null;
}

const RANK_NAMES: Record<string, string> = { A: 'aces', T: 'tens', J: 'jacks', Q: 'queens', K: 'kings', '6': 'sixes' };

/** "queens", "sevens", "sixes". */
export function rankPlural(rank: string): string {
  const words = ['', '', 'twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines'];
  return RANK_NAMES[rank] ?? words[Number(rank)] ?? rank;
}
