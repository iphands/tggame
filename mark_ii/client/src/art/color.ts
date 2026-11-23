/** Tiny color helpers for procedural art. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amt > 0 mixes toward white, amt < 0 toward a deep ink (not pure black). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  const k = -amt;
  const ink = [22, 14, 38];
  return rgbToHex(r + (ink[0] - r) * k, g + (ink[1] - g) * k, b + (ink[2] - b) * k);
}

export function hexNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bake a color grade into a canvas (saturation, contrast, brightness), so
 * the look costs nothing per frame (no shader pass).
 */
export function gradeCanvas(c: HTMLCanvasElement, g: { saturate: number; contrast: number; brightness: number }): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const sat = 1 + g.saturate;
  const con = 1 + g.contrast;
  const br = g.brightness;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i];
    let gg = d[i + 1];
    let b = d[i + 2];
    const l = 0.299 * r + 0.587 * gg + 0.114 * b;
    r = (l + (r - l) * sat - 128) * con + 128;
    gg = (l + (gg - l) * sat - 128) * con + 128;
    b = (l + (b - l) * sat - 128) * con + 128;
    d[i] = r * br;
    d[i + 1] = gg * br;
    d[i + 2] = b * br;
  }
  ctx.putImageData(img, 0, 0);
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}
