/** Painting vector drawings. */
import { ERASER, INK, PAGE_H, PAGE_W } from '../../shared/src/constants';
import type { Drawing, Stroke } from '../../shared/src/types';

type Ctx = CanvasRenderingContext2D;

/**
 * Paint points `[from, to]` of a stroke (default: all of it) at `scale` px per
 * page unit. Curves run through segment midpoints so strokes look inked, not
 * polygonal; painting overlapping ranges in sequence gives the same result.
 */
export function paintStroke(ctx: Ctx, s: Stroke, scale: number, from = 0, to = s.p.length / 2 - 1): void {
  const n = s.p.length / 2;
  to = Math.min(to, n - 1);
  if (n === 0 || to < from) return;
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

export function paint(ctx: Ctx, strokes: Drawing, scale: number): void {
  ctx.clearRect(0, 0, PAGE_W * scale + 1, PAGE_H * scale + 1);
  for (const s of strokes) paintStroke(ctx, s, scale);
}
