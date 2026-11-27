/**
 * Each platformer keeps its browser settings under its own prefix (`lsa-…`, `lsr-…`).
 * The game's `main.ts` sets it once, first thing; nothing reads a key before then.
 */
let prefix = 'ls';

export function setPrefsPrefix(p: string): void {
  prefix = p;
}

export const prefKey = (name: string): string => `${prefix}-${name}`;
