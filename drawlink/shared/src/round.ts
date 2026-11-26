/** The arithmetic of a round: what a guess is worth and which letters guessers can see. Pure. */
import { AWARD_STEP, AWARD_STEP_MS, HINT_BLANK, HINT_BLANKS_MS, HINT_FIRST_MS, HINT_STEP_MS, MAX_AWARD } from './constants.js';

/**
 * Points for a correct guess `elapsedMs` after the drawer got the word. Both
 * the guesser and the drawer get this. Started intervals do not count: the
 * award drops only once a full step has passed.
 */
export function awardAt(elapsedMs: number): number {
  const steps = Math.floor(Math.max(0, elapsedMs) / AWARD_STEP_MS);
  return Math.max(0, MAX_AWARD - AWARD_STEP * steps);
}

const isLetter = (ch: string): boolean => /[\p{L}\p{N}]/u.test(ch);

/**
 * The order letters are given away in, as indexes into the word's characters:
 * the first letter of each word, then the last letter of each word, then the
 * rest scattered. Depends only on the word, so every screen and every tick agree.
 */
function revealOrder(chars: readonly string[]): number[] {
  const words: number[][] = [];
  let run: number[] = [];
  chars.forEach((ch, i) => {
    if (isLetter(ch)) run.push(i);
    else if (run.length) (words.push(run), (run = []));
  });
  if (run.length) words.push(run);

  const order = [...words.map((w) => w[0]), ...words.filter((w) => w.length > 1).map((w) => w[w.length - 1])];
  const seed = chars.reduce((a, ch) => (a * 31 + ch.codePointAt(0)!) >>> 0, 7);
  const key = (i: number): number => (Math.imul(i + 1, 2654435761) ^ seed) >>> 0;
  const rest = words.flatMap((w) => w.slice(1, -1)).sort((a, b) => key(a) - key(b));
  return [...order, ...rest];
}

/**
 * What guessers see of `word` after `elapsedMs`: a blank per letter with spaces
 * and punctuation in place, then one more letter every step. Stops at half the
 * letters (rounded up) and always leaves at least one hidden.
 */
export function hintAt(word: string, elapsedMs: number): string | null {
  if (elapsedMs < HINT_BLANKS_MS) return null;
  const chars = [...word];
  const order = revealOrder(chars);
  const cap = Math.min(order.length - 1, Math.ceil(order.length / 2));
  const due = elapsedMs < HINT_FIRST_MS ? 0 : 1 + Math.floor((elapsedMs - HINT_FIRST_MS) / HINT_STEP_MS);
  const open = new Set(order.slice(0, Math.max(0, Math.min(cap, due))));
  return chars.map((ch, i) => (!isLetter(ch) || open.has(i) ? ch : HINT_BLANK)).join('');
}
