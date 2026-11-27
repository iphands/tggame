/** Painting vector drawings: static, animated replay, and a book as a PNG. */
import { PAGE_H, PAGE_W } from '../../shared/src/constants';
import type { Drawing, Page } from '../../shared/src/types';
import { reducedMotion } from '@tggame/base/client/dom';
import { paint, paintFill, paintStroke } from '@tggame/base/party/draw/paint';
import { isFill } from '@tggame/base/party/draw/fill';

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
        if (isFill(s)) paintFill(ctx, strokes.slice(0, si), s, scale);
        else paintStroke(ctx, s, scale, Math.max(0, pi - 1), upto - 1);
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
