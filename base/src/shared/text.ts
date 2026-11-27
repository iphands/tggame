/** Cleaning and comparing the text players type. Runs on the server and in the browser. */

export const NAME_MAX = 16;

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Clean a typed line (a guess, a chat message): single line, no control characters, at most `max` characters. */
export function sanitizeLine(raw: unknown, max: number): string {
  const s = typeof raw === 'string' ? raw : '';
  return [...s.replace(/[\p{C}\s]+/gu, ' ').trim()].slice(0, max).join('').trim();
}

/** Letters and digits only, lower case, accents folded: what answers are compared on. */
export function bare(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Are these the same word? Forgives case, spacing, punctuation, a leading article and a plural "s". */
export function sameWord(a: string, b: string): boolean {
  const norm = (s: string) =>
    bare(s)
      .replace(/^(the|a|an)(?=.{3,})/, '')
      .replace(/s$/, '');
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}
