import { DRAW_LIMITS, ERASER, GUESS_MAX, INK, NAME_MAX, PAGE_H, PAGE_W } from './constants.js';
import type { Drawing, Stroke } from './types.js';

/**
 * Validate and normalise an untrusted drawing. Returns null when the shape is
 * wrong or a limit is exceeded; coordinates are rounded and clamped to the page.
 */
export function sanitizeDrawing(input: unknown): Drawing | null {
  if (!Array.isArray(input) || input.length > DRAW_LIMITS.maxStrokes) return null;
  const out: Drawing = [];
  let total = 0;
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { c, w, p } = raw as Record<string, unknown>;
    if (typeof c !== 'number' || !Number.isInteger(c) || c < ERASER || c >= INK.length) return null;
    if (typeof w !== 'number' || !Number.isFinite(w)) return null;
    if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0) return null;
    if (p.length / 2 > DRAW_LIMITS.maxPointsPerStroke) return null;
    total += p.length / 2;
    if (total > DRAW_LIMITS.maxPoints) return null;
    const pts: number[] = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      pts[i] = clamp(Math.round(v), 0, i % 2 === 0 ? PAGE_W : PAGE_H);
    }
    out.push({ c, w: clamp(Math.round(w), DRAW_LIMITS.minWidth, DRAW_LIMITS.maxWidth), p: pts });
  }
  return out;
}

/** True when a drawing has at least one visible (non-eraser) mark. */
export function hasInk(d: Drawing): boolean {
  return d.some((s) => s.c !== ERASER);
}

/**
 * Ramer-Douglas-Peucker on a flat `x,y…` list: drops points closer than `eps`
 * page units to the simplified line. Keeps hand-drawn strokes small on the wire.
 */
export function simplify(p: number[], eps: number): number[] {
  const n = p.length / 2;
  if (n <= 2) return p.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[a * 2], ay = p[a * 2 + 1];
    const dx = p[b * 2] - ax, dy = p[b * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = eps * eps;
    for (let i = a + 1; i < b; i++) {
      const px = p[i * 2] - ax, py = p[i * 2 + 1] - ay;
      let d: number;
      if (len2 === 0) d = px * px + py * py;
      else {
        const t = clamp((px * dx + py * dy) / len2, 0, 1);
        const ex = px - t * dx, ey = py - t * dy;
        d = ex * ex + ey * ey;
      }
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/** Split a stroke that is too long for the wire into several that are not. */
export function splitStroke(s: Stroke): Stroke[] {
  const max = DRAW_LIMITS.maxPointsPerStroke * 2;
  if (s.p.length <= max) return [s];
  const out: Stroke[] = [];
  for (let i = 0; i < s.p.length - 2; i += max - 2) out.push({ c: s.c, w: s.w, p: s.p.slice(i, i + max) });
  return out;
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Clean a typed guess: single line, no control characters, bounded length. */
export function sanitizeGuess(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return [...s.replace(/[\p{C}\s]+/gu, ' ').trim()].slice(0, GUESS_MAX).join('').trim();
}

/** Loose comparison used to decide whether a word "survived" the telephone. */
export function sameWord(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .replace(/^(the|a|an)(?=.{3,})/, '')
      .replace(/s$/, '');
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
