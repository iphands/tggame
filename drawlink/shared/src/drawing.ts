import { CHAT_MAX, DRAW_LIMITS, ERASER, INK, NAME_MAX, PAGE_H, PAGE_W } from './constants.js';
import type { Drawing, Stroke } from './types.js';

/**
 * Validate and normalise one untrusted stroke (or a batch of points of one).
 * Returns null when the shape is wrong; coordinates are rounded and clamped to the page.
 */
export function sanitizeStroke(raw: unknown): Stroke | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { c, w, p } = raw as Record<string, unknown>;
  if (typeof c !== 'number' || !Number.isInteger(c) || c < ERASER || c >= INK.length) return null;
  if (typeof w !== 'number' || !Number.isFinite(w)) return null;
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0) return null;
  if (p.length / 2 > DRAW_LIMITS.maxPointsPerStroke) return null;
  const pts: number[] = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    pts[i] = clamp(Math.round(v), 0, i % 2 === 0 ? PAGE_W : PAGE_H);
  }
  return { c, w: clamp(Math.round(w), DRAW_LIMITS.minWidth, DRAW_LIMITS.maxWidth), p: pts };
}

/** True when a drawing has at least one visible (non-eraser) mark. */
export function hasInk(d: Drawing): boolean {
  return d.some((s) => s.c !== ERASER);
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Clean a chat line or guess: single line, no control characters, bounded length. */
export function sanitizeChat(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return [...s.replace(/[\p{C}\s]+/gu, ' ').trim()].slice(0, CHAT_MAX).join('').trim();
}

/** Letters and digits only, lower case, accents folded: what answers are compared on. */
export function bare(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Is `guess` the answer? Forgives case, spacing, punctuation, a leading article and a plural "s". */
export function sameWord(a: string, b: string): boolean {
  const norm = (s: string) =>
    bare(s)
      .replace(/^(the|a|an)(?=.{3,})/, '')
      .replace(/s$/, '');
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

/** Does `text` spell out the answer somewhere? Used to stop the drawer typing it. */
export function givesAway(text: string, word: string): boolean {
  const w = bare(word);
  return w.length > 0 && bare(text).includes(w);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
