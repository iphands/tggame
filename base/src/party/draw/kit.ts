/** What the drawing games agree on: the page, the pens, a stroke and how to check one. */

/** `p` is a flat `x,y,…` list in page units; `f: 1` marks a bucket fill at the single point. */
export type Stroke = { c: number; w: number; p: number[]; f?: 1 };
export type Drawing = Stroke[];

export const PAGE_W = 1000;
export const PAGE_H = 750;

/** Limits on one stroke. Each game adds its own limits on a whole drawing. */
export const STROKE_LIMITS = {
  maxPointsPerStroke: 1500,
  /** Bucket fills per drawing: each one is a flood on every screen, every repaint. */
  maxFills: 40,
  minWidth: 2,
  maxWidth: 90,
};

/** Marker colours; a stroke stores an index into this list. */
export const INK = [
  '#1f2440', // ink
  '#e63946', // red
  '#ff8c42', // orange
  '#ffc21a', // yellow
  '#3fa34d', // green
  '#19a7ce', // sky
  '#3d5af1', // blue
  '#8e44d9', // purple
  '#ff6fb5', // pink
  '#8d5a3b', // brown
] as const;

/** Stroke colour index meaning "erase" (rendered with destination-out). */
export const ERASER = -1;

/** Nib widths in page units. */
export const NIBS = [5, 11, 24] as const;
export const ERASER_NIBS = [16, 34, 64] as const;

/**
 * Validate and normalise one untrusted stroke (or a batch of points of one).
 * Returns null when the shape is wrong; coordinates are rounded and clamped to the page.
 */
export function sanitizeStroke(raw: unknown): Stroke | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { c, w, p, f } = raw as Record<string, unknown>;
  // a fill is one point in a real colour
  if (f !== undefined && (f !== 1 || c === ERASER || !Array.isArray(p) || p.length !== 2)) return null;
  if (typeof c !== 'number' || !Number.isInteger(c) || c < ERASER || c >= INK.length) return null;
  if (typeof w !== 'number' || !Number.isFinite(w)) return null;
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0) return null;
  if (p.length / 2 > STROKE_LIMITS.maxPointsPerStroke) return null;
  const pts: number[] = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    pts[i] = clamp(Math.round(v), 0, i % 2 === 0 ? PAGE_W : PAGE_H);
  }
  const stroke: Stroke = { c, w: clamp(Math.round(w), STROKE_LIMITS.minWidth, STROKE_LIMITS.maxWidth), p: pts };
  if (f === 1) stroke.f = 1;
  return stroke;
}

/** True when a drawing has at least one visible (non-eraser) mark. */
export function hasInk(d: Drawing): boolean {
  return d.some((s) => s.c !== ERASER);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
