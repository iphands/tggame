/** Everything on the floor is drawn here, in code: lines, bikes, blocks, the grid. Units are cells. */
import type { Rect } from '../../shared/src/arenas';

export const FLOOR = '#0d0729';
export const VOID = '#07041a';
const GRID = 'rgba(124, 108, 255, 0.13)';
const GRID_BOLD = 'rgba(124, 108, 255, 0.3)';
const EDGE = '#7c6cff';
const DANGER = '#ff3d6e';

/** The floor, its grid and its blocks, with `ring` cells of closed-in rim. `k` is pixels per cell. */
export function drawFloor(c: CanvasRenderingContext2D, w: number, h: number, blocks: readonly Rect[], ring: number, k: number, x0: number, y0: number, x1: number, y1: number): void {
  c.fillStyle = FLOOR;
  c.fillRect(0, 0, w, h);
  // fewer grid lines when the cells are small
  const step = k >= 14 ? 1 : k >= 7 ? 2 : 4;
  const px = 1 / k;
  for (const bold of [false, true]) {
    c.beginPath();
    for (let x = Math.max(0, Math.ceil(x0 / step) * step); x <= Math.min(w, x1); x += step) {
      if ((x % 8 === 0) !== bold) continue;
      c.moveTo(x, Math.max(0, y0));
      c.lineTo(x, Math.min(h, y1));
    }
    for (let y = Math.max(0, Math.ceil(y0 / step) * step); y <= Math.min(h, y1); y += step) {
      if ((y % 8 === 0) !== bold) continue;
      c.moveTo(Math.max(0, x0), y);
      c.lineTo(Math.min(w, x1), y);
    }
    c.lineWidth = px;
    c.strokeStyle = bold ? GRID_BOLD : GRID;
    c.stroke();
  }
  for (const [bx, by, bw, bh] of blocks) {
    c.fillStyle = '#1d1446';
    c.fillRect(bx, by, bw, bh);
    c.lineWidth = Math.max(2 * px, 0.14);
    c.strokeStyle = EDGE;
    c.strokeRect(bx, by, bw, bh);
  }
  if (ring > 0) {
    // the part of the floor the rim has swallowed
    c.fillStyle = 'rgba(255, 61, 110, 0.2)';
    c.fillRect(0, 0, w, ring);
    c.fillRect(0, h - ring, w, ring);
    c.fillRect(0, ring, ring, h - ring * 2);
    c.fillRect(w - ring, ring, ring, h - ring * 2);
  }
  c.lineWidth = Math.max(3 * px, 0.22);
  c.strokeStyle = ring > 0 ? DANGER : EDGE;
  c.strokeRect(ring, ring, w - ring * 2, h - ring * 2);
}

/**
 * A line of light through `pts` (x, y pairs of cells) and on to (hx, hy): a wide soft stroke under
 * a bright one, which reads as a glow without the cost of a blur.
 */
export function drawLine(c: CanvasRenderingContext2D, pts: readonly number[], hx: number, hy: number, color: string, k: number, alpha: number): void {
  c.beginPath();
  c.moveTo(pts[0] + 0.5, pts[1] + 0.5);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] + 0.5, pts[i + 1] + 0.5);
  c.lineTo(hx, hy);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = color;
  c.globalAlpha = alpha * 0.22;
  c.lineWidth = Math.max(0.95, 5 / k);
  c.stroke();
  c.globalAlpha = alpha;
  c.lineWidth = Math.max(0.4, 2.4 / k);
  c.stroke();
  c.globalAlpha = alpha * 0.75;
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(0.1, 0.8 / k);
  c.stroke();
  c.globalAlpha = 1;
}

export type BikeLook = { boost?: boolean; bust?: boolean; slip?: boolean; mine?: boolean; t?: number };

/** A bike at (x, y) facing `dir`, never smaller than a thumb can follow. */
export function drawBike(c: CanvasRenderingContext2D, x: number, y: number, dir: number, color: string, k: number, look: BikeLook = {}): void {
  const s = Math.max(1, 12 / k);
  const t = look.t ?? 0;
  c.save();
  c.translate(x, y);
  c.rotate((dir * Math.PI) / 2);
  // headlight
  const beam = c.createLinearGradient(0, 0, 5 * s, 0);
  beam.addColorStop(0, 'rgba(255,255,255,0.22)');
  beam.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(0.4 * s, 0);
  c.lineTo(5 * s, -1.5 * s);
  c.lineTo(5 * s, 1.5 * s);
  c.fill();
  if (look.boost) {
    const f = 1.1 + 0.5 * Math.sin(t / 28);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(-0.7 * s, -0.3 * s);
    c.lineTo((-0.7 - f) * s, 0);
    c.lineTo(-0.7 * s, 0.3 * s);
    c.fill();
  }
  if (look.slip) {
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 0.08 * s;
    c.beginPath();
    for (const side of [-0.62, 0.62]) {
      const o = ((t / 60) % 1) * 0.5;
      c.moveTo((-0.2 - o) * s, side * s);
      c.lineTo((-0.9 - o) * s, side * s);
    }
    c.stroke();
  }
  if (look.bust) c.globalAlpha = 0.45 + 0.25 * Math.sin(t / 40);
  c.beginPath();
  c.moveTo(0.85 * s, 0);
  c.lineTo(0.15 * s, -0.44 * s);
  c.lineTo(-0.75 * s, -0.44 * s);
  c.lineTo(-0.75 * s, 0.44 * s);
  c.lineTo(0.15 * s, 0.44 * s);
  c.closePath();
  c.fillStyle = '#fff';
  c.fill();
  c.lineJoin = 'round';
  c.lineWidth = 0.2 * s;
  c.strokeStyle = color;
  c.stroke();
  c.globalAlpha = 1;
  if (look.bust) {
    c.setLineDash([0.35 * s, 0.25 * s]);
    c.lineDashOffset = -t / 90;
    c.lineWidth = 0.12 * s;
    c.strokeStyle = '#fff';
    c.beginPath();
    c.arc(0, 0, 1.25 * s, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
  if (look.mine) {
    c.lineWidth = 0.1 * s;
    c.strokeStyle = color;
    c.globalAlpha = 0.5 + 0.4 * Math.sin(t / 160);
    c.beginPath();
    c.arc(0, 0, (1.7 + 0.25 * Math.sin(t / 160)) * s, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
  }
  c.restore();
}
