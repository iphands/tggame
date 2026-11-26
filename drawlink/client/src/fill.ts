/**
 * The fill bucket. A fill is a one-point stroke; what it covers depends on
 * everything drawn before it. To make that the same on a phone and on a 4K
 * monitor, the flood always runs on a "canon" copy of the page at one pixel
 * per page unit, and the result is stamped onto the real canvas at its scale.
 */
import { INK, PAGE_H, PAGE_W } from '../../shared/src/constants';
import type { Stroke } from '../../shared/src/types';

const W = PAGE_W;
const H = PAGE_H;
/** How far a pixel may be from the tapped one (per channel, 0..255) and still flood. */
const TOLERANCE = 96;

export type Canon = CanvasRenderingContext2D;

/** What a flood produced: the filled area in the fill colour, at canon size. */
export type Patch = {
  image: HTMLCanvasElement;
  /** The tapped spot was bare paper, so the colour belongs underneath the ink around it. */
  under: boolean;
};

export const isFill = (s: Stroke): boolean => s.f === 1;

export function newCanon(): Canon {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

/**
 * Flood `canon` from the stroke's point with its colour. Changes `canon` and
 * returns the patch to stamp on the visible canvas, or null when there is
 * nothing to do (the spot already has that colour).
 */
export function flood(canon: Canon, s: Stroke): Patch | null {
  const img = canon.getImageData(0, 0, W, H);
  const d = img.data;
  const hex = INK[s.c] ?? INK[0];
  const fr = parseInt(hex.slice(1, 3), 16);
  const fg = parseInt(hex.slice(3, 5), 16);
  const fb = parseInt(hex.slice(5, 7), 16);
  const x0 = Math.max(0, Math.min(W - 1, Math.round(s.p[0])));
  const y0 = Math.max(0, Math.min(H - 1, Math.round(s.p[1])));
  const i0 = (y0 * W + x0) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const under = a0 < TOLERANCE;
  if (!under && a0 === 255 && r0 === fr && g0 === fg && b0 === fb) return null;

  // bare paper is "anything faint"; an inked spot is "this colour, give or take"
  const like = under
    ? (p: number) => d[p * 4 + 3] < TOLERANCE
    : (p: number) => {
        const i = p * 4;
        return (
          Math.abs(d[i + 3] - a0) <= TOLERANCE / 2 &&
          Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) <= TOLERANCE
        );
      };

  // 1 = flooded, 2.. = the rim added afterwards
  const mask = new Uint8Array(W * H);
  const stack = [y0 * W + x0];
  while (stack.length) {
    const p = stack.pop()!;
    if (mask[p] || !like(p)) continue;
    const row = p - (p % W);
    let l = p;
    while (l > row && !mask[l - 1] && like(l - 1)) l--;
    let r = p;
    while (r < row + W - 1 && !mask[r + 1] && like(r + 1)) r++;
    for (let q = l; q <= r; q++) {
      mask[q] = 1;
      if (q >= W && !mask[q - W] && like(q - W)) stack.push(q - W);
      if (q < W * (H - 1) && !mask[q + W] && like(q + W)) stack.push(q + W);
    }
  }

  // Grow the area a little so no pale seam is left along the soft edge of the lines around it.
  const rim = under ? 2 : 1;
  for (let pass = 1; pass <= rim; pass++) {
    for (let p = 0; p < mask.length; p++) {
      if (mask[p]) continue;
      const x = p % W;
      const near = (q: number) => mask[q] > 0 && mask[q] <= pass;
      if ((x > 0 && near(p - 1)) || (x < W - 1 && near(p + 1)) || (p >= W && near(p - W)) || (p < W * (H - 1) && near(p + W))) mask[p] = pass + 1;
    }
  }

  const image = document.createElement('canvas');
  image.width = W;
  image.height = H;
  const patchCtx = image.getContext('2d')!;
  const patch = patchCtx.createImageData(W, H);
  const o = patch.data;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    o[i] = fr;
    o[i + 1] = fg;
    o[i + 2] = fb;
    o[i + 3] = 255;
    if (mask[p] > 1 && under) {
      // rim on paper: the colour slides under whatever ink is already there
      const a = d[i + 3] / 255;
      d[i] = d[i] * a + fr * (1 - a);
      d[i + 1] = d[i + 1] * a + fg * (1 - a);
      d[i + 2] = d[i + 2] * a + fb * (1 - a);
    } else {
      d[i] = fr;
      d[i + 1] = fg;
      d[i + 2] = fb;
    }
    d[i + 3] = 255;
  }
  canon.putImageData(img, 0, 0);
  patchCtx.putImageData(patch, 0, 0);
  return { image, under };
}

/** Put a flood's patch on a canvas that shows the page at `scale` px per page unit. */
export function stamp(ctx: CanvasRenderingContext2D, patch: Patch, scale: number): void {
  ctx.save();
  ctx.globalCompositeOperation = patch.under ? 'destination-over' : 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(patch.image, 0, 0, W * scale, H * scale);
  ctx.restore();
}
