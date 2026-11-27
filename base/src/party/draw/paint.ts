/** Painting vector drawings onto a canvas. */
import { ERASER, INK, PAGE_H, PAGE_W, type Drawing, type Stroke } from './kit.js';
import { flood, isFill, newCanon, stamp, type Canon } from './fill.js';

type Ctx = CanvasRenderingContext2D;

/**
 * Paint points `[from, to]` of a stroke (default: all of it) at `scale` px per
 * page unit. Curves run through segment midpoints so strokes look inked, not
 * polygonal; painting overlapping ranges in sequence gives the same result.
 */
export function paintStroke(ctx: Ctx, s: Stroke, scale: number, from = 0, to = s.p.length / 2 - 1): void {
  const n = s.p.length / 2;
  to = Math.min(to, n - 1);
  if (n === 0 || to < from || isFill(s)) return; // fills need the strokes before them: see paintFill
  const X = (i: number) => s.p[i * 2] * scale;
  const Y = (i: number) => s.p[i * 2 + 1] * scale;
  ctx.save();
  ctx.globalCompositeOperation = s.c === ERASER ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = s.c === ERASER ? '#000' : INK[s.c] ?? INK[0];
  ctx.lineWidth = Math.max(1, s.w * scale);
  ctx.lineCap = ctx.lineJoin = 'round';
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(X(0), Y(0), ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const midX = (i: number) => (X(i) + X(i + 1)) / 2;
  const midY = (i: number) => (Y(i) + Y(i + 1)) / 2;
  ctx.beginPath();
  if (from === 0) ctx.moveTo(X(0), Y(0));
  else ctx.moveTo(midX(from - 1), midY(from - 1));
  for (let i = Math.max(1, from); i <= to; i++) {
    if (i === n - 1) ctx.lineTo(X(i), Y(i));
    else ctx.quadraticCurveTo(X(i), Y(i), midX(i), midY(i));
  }
  if (from === 0 && to === 0) ctx.lineTo(X(0) + 0.01, Y(0));
  ctx.stroke();
  ctx.restore();
}

/** The page at one pixel per page unit, which is where bucket fills are worked out (see fill.ts). */
function canonOf(strokes: Drawing): Canon {
  const canon = newCanon();
  for (const s of strokes) {
    if (isFill(s)) flood(canon, s);
    else paintStroke(canon, s, 1);
  }
  return canon;
}

/** Paint a bucket fill that comes right after the strokes in `before`. */
export function paintFill(ctx: Ctx, before: Drawing, s: Stroke, scale: number): void {
  const patch = flood(canonOf(before), s);
  if (patch) stamp(ctx, patch, scale);
}

export function paint(ctx: Ctx, strokes: Drawing, scale: number): void {
  ctx.clearRect(0, 0, PAGE_W * scale + 1, PAGE_H * scale + 1);
  // the canon copy is only kept up once a fill needs it
  let canon: Canon | null = null;
  strokes.forEach((s, i) => {
    if (isFill(s)) {
      canon ??= canonOf(strokes.slice(0, i));
      const patch = flood(canon, s);
      if (patch) stamp(ctx, patch, scale);
    } else {
      paintStroke(ctx, s, scale);
      if (canon) paintStroke(canon, s, 1);
    }
  });
}
