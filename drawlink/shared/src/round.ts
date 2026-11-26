/** The arithmetic of a round: what a guess is worth and which letters guessers can see. Pure. */
import { AWARD_STEP, AWARD_STEP_MS, HINT_BLANK, HINT_BLANKS_MS, HINT_REVEALS, MAX_AWARD } from './constants.js';

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
 * What guessers see of `word` after `elapsedMs`: nothing at first (null), then
 * a blank per letter with spaces and punctuation in place, then single letters.
 * Never shows more than half the letters, so short words stay a puzzle.
 */
export function hintAt(word: string, elapsedMs: number): string | null {
  if (elapsedMs < HINT_BLANKS_MS) return null;
  const chars = [...word];
  const letters = chars.map((ch, i) => (isLetter(ch) ? i : -1)).filter((i) => i >= 0);
  const n = letters.length;
  const open = new Set<number>();
  const cap = Math.floor(n / 2);
  for (const { at, letter } of HINT_REVEALS) {
    if (elapsedMs < at || open.size >= cap) break;
    const k = letter === 'first' ? 0 : letter === 'last' ? n - 1 : letter === 'second' ? 1 : n - 2;
    if (k >= 0 && k < n) open.add(letters[k]);
  }
  return chars.map((ch, i) => (!isLetter(ch) || open.has(i) ? ch : HINT_BLANK)).join('');
}
