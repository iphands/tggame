/** Painting vector drawings: static, animated replay, and a book as a PNG. */
import { ERASER, INK, PAGE_H, PAGE_W } from '../../shared/src/constants';
import type { Drawing, Page, Stroke } from '../../shared/src/types';
import { reducedMotion } from './dom';

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

/** A canvas with a fixed backing size that CSS scales (`width:100%`, 4:3). */
export function drawingCanvas(strokes: Drawing, width = 800): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((width * PAGE_H) / PAGE_W);
  canvas.className = 'drawing';
  paint(canvas.getContext('2d')!, strokes, width / PAGE_W);
  return canvas;
}

/** Draw the strokes on `canvas` one after another, like watching it being drawn. Returns a cancel function. */
export function replay(canvas: HTMLCanvasElement, strokes: Drawing, onDone?: () => void): () => void {
  const ctx = canvas.getContext('2d')!;
  const scale = canvas.width / PAGE_W;
  const total = strokes.reduce((n, s) => n + s.p.length / 2, 0);
  const finish = () => {
    paint(ctx, strokes, scale);
    onDone?.();
  };
  if (reducedMotion() || total === 0) {
    finish();
    return () => {};
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // each stroke costs its points plus a small "pen lift" so dots and short dashes are visible beats
  const LIFT = 6;
  const budget = total + strokes.length * LIFT;
  const duration = Math.min(5200, Math.max(1100, budget * 5));
  let raf = 0;
  let start = 0;
  let si = 0; // current stroke
  let pi = 0; // points of it already painted
  let spent = 0; // budget consumed by finished strokes
  const frame = (now: number) => {
    if (!start) start = now;
    const target = Math.min(budget, ((now - start) / duration) * budget);
    while (si < strokes.length) {
      const s = strokes[si];
      const n = s.p.length / 2;
      const upto = Math.min(n, Math.floor(target - spent));
      if (upto > pi) {
        paintStroke(ctx, s, scale, Math.max(0, pi - 1), upto - 1);
        pi = upto;
      }
      if (pi < n || target < spent + n + LIFT) break;
      spent += n + LIFT;
      si++;
      pi = 0;
    }
    if (si >= strokes.length) finish();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// ---- export

const FONT = '"Patrick Hand", "Comic Sans MS", cursive';

/** Lay a whole book out on one tall image and hand it to the browser as a download. */
export function downloadBook(pages: Page[], nameOf: (id: string) => string, owner: string): void {
  const W = 900;
  const pad = 40;
  const inner = W - pad * 2;
  const drawH = Math.round((inner * PAGE_H) / PAGE_W);
  const heights = pages.map((p) => (p.kind === 'word' ? 150 : drawH + 50));
  const H = 130 + heights.reduce((a, b) => a + b + 24, 0) + 50;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2b59c3';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fffaf0';
  ctx.textAlign = 'center';
  ctx.font = `48px "Chewy", ${FONT}`;
  ctx.fillText(`${owner}'s sketchbook`, W / 2, 80);
  let y = 130;
  pages.forEach((page, i) => {
    const hgt = heights[i];
    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = '#1f2440';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(pad, y, inner, hgt, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6b6f8d';
    ctx.textAlign = 'left';
    ctx.font = `26px ${FONT}`;
    const verb = page.kind === 'drawing' ? 'drew' : i === 0 ? 'picked' : 'guessed';
    ctx.fillText(`${nameOf(page.by)} ${verb}`, pad + 20, y + 36);
    if (page.kind === 'word') {
      ctx.fillStyle = '#1f2440';
      ctx.textAlign = 'center';
      let size = 60;
      do ctx.font = `${size}px ${FONT}`;
      while (ctx.measureText(page.text).width > inner - 60 && (size -= 4) > 20);
      ctx.fillText(page.text, W / 2, y + 110);
    } else {
      const layer = document.createElement('canvas');
      layer.width = inner;
      layer.height = drawH;
      paint(layer.getContext('2d')!, page.strokes, inner / PAGE_W);
      ctx.drawImage(layer, pad, y + 46);
    }
    y += hgt + 24;
  });
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'center';
  ctx.font = `26px ${FONT}`;
  ctx.fillText('Doodle Telephone', W / 2, H - 22);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doodle-telephone-${owner.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'book'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}
