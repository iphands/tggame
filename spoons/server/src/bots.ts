/** Spoonbots: they pass sensibly, grab when they should, and sometimes fall for a flinch. */
import { rankOf, type Card } from '../../shared/src/cards.js';

export type Rng = () => number;

export const BOT_NAMES = ['Ladle', 'Teaspoon', 'Spork', 'Dessert', 'Soupy', 'Stirling', 'Runcible', 'Scoop', 'Dollop', 'Whisk', 'Tongs', 'Gravy'];

/**
 * Which of these cards to pass on: one of the rank held least, so sets grow.
 * Also what a human's seat plays while its owner is away.
 */
export function botPass(cards: readonly Card[], rng: Rng): Card {
  const count = new Map<string, number>();
  for (const c of cards) count.set(rankOf(c), (count.get(rankOf(c)) ?? 0) + 1);
  const least = Math.min(...count.values());
  const spare = cards.filter((c) => count.get(rankOf(c)) === least);
  return spare[Math.floor(rng() * spare.length)];
}
