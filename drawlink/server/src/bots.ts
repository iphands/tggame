/** Guessbots: they never draw, they just blurt guesses, and now and then one lands. */
import { BOT_ADJECTIVES, WORDS } from '../../shared/src/words.js';

export type Rng = () => number;

export const BOT_NAMES = ['Scribbles', 'Inky', 'Smudge', 'Sketchy', 'Crayon', 'Blot', 'Squiggle', 'Guessbot', 'Fineliner', 'Splotch', 'Doodad', 'Nib', 'Stencil', 'Pastel'];

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

/** A confident wrong guess. */
export function botGuess(rng: Rng): string {
  const word = pick(rng, WORDS);
  return rng() < 0.3 ? `${pick(rng, BOT_ADJECTIVES)} ${word}` : word;
}
