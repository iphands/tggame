import { bare, sanitizeLine } from '@tggame/base/shared/text';
import { CHAT_MAX } from './constants.js';

export { hasInk, sanitizeStroke } from '@tggame/base/party/draw/kit';
export { bare, sameWord, sanitizeName } from '@tggame/base/shared/text';

/** Clean a chat line or guess: single line, no control characters, bounded length. */
export const sanitizeChat = (raw: unknown): string => sanitizeLine(raw, CHAT_MAX);

/** Does `text` spell out the answer somewhere? Used to stop the drawer typing it. */
export function givesAway(text: string, word: string): boolean {
  const w = bare(word);
  return w.length > 0 && bare(text).includes(w);
}
