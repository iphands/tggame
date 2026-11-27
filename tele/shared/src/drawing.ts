import { clamp, sanitizeStroke, type Drawing, type Stroke } from '@tggame/base/party/draw/kit';
import { sanitizeLine } from '@tggame/base/shared/text';
import { DRAW_LIMITS, GUESS_MAX } from './constants.js';

export { hasInk } from '@tggame/base/party/draw/kit';
export { sameWord, sanitizeName } from '@tggame/base/shared/text';

/**
 * Validate and normalise an untrusted drawing. Returns null when the shape is
 * wrong or a limit is exceeded; coordinates are rounded and clamped to the page.
 */
export function sanitizeDrawing(input: unknown): Drawing | null {
  if (!Array.isArray(input) || input.length > DRAW_LIMITS.maxStrokes) return null;
  const out: Drawing = [];
  let total = 0;
  let fills = 0;
  for (const raw of input) {
    const stroke = sanitizeStroke(raw);
    if (!stroke) return null;
    if (stroke.f === 1 && ++fills > DRAW_LIMITS.maxFills) return null;
    total += stroke.p.length / 2;
    if (total > DRAW_LIMITS.maxPoints) return null;
    out.push(stroke);
  }
  return out;
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

/** Clean a typed guess: single line, no control characters, bounded length. */
export const sanitizeGuess = (raw: unknown): string => sanitizeLine(raw, GUESS_MAX);
