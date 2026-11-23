/**
 * Arena art: painted backdrops, scrolling parallax layers and per-platform
 * textures for each theme. Everything is drawn once onto canvases.
 */
import type { PlatformKind, ThemeId } from '../../../shared/src/levels';
import { canvas, gradeCanvas, mulberry32, rgba, shade } from './color';

export const W = 1280;
export const H = 720;
/** Platform textures extend below the collision box for hanging decoration. */
export const PLATFORM_HANG = 22;

export type Ambient = 'none' | 'snow' | 'dust' | 'embers' | 'stars';

export type ThemeLayer = {
  key: string;
  /** px/s horizontal scroll (tile sprite). */
  speed: number;
  depth: number;
  alpha: number;
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
};

/** Light shafts fanning out from a light source (sun, moon, lava…). */
export type Rays = {
  x: number;
  y: number;
  color: number;
  count: number;
  length: number;
  /** Center direction in degrees (0 = right, 90 = down). */
  angle: number;
  /** Total fan width in degrees. */
  spread: number;
  alpha: number;
};

/** Camera color grade (applied via a ColorMatrix pass). */
export type Grade = { saturate: number; contrast: number; brightness: number };

export type Theme = {
  /** Shown on HUD panels / lobby accents. */
  accent: string;
  rays: Rays | null;
  grade: Grade;
  paintBackdrop: (ctx: CanvasRenderingContext2D) => void;
  layers: ThemeLayer[];
  ambient: Ambient;
  ambientColor: number;
  paintPlatform: (ctx: CanvasRenderingContext2D, w: number, h: number, kind: PlatformKind, seed: number) => void;
};

// ---------------------------------------------------------------- helpers

function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function ridge(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  baseY: number,
  amp: number,
  step: number,
  color: string,
  jag = 0.5
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  let y = baseY - rand() * amp;
  for (let x = 0; x <= W + step; x += step) {
    y = Math.max(baseY - amp, Math.min(baseY, y + (rand() - 0.5) * amp * jag * 2));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, shadow: string): void {
  const blobs: [number, number, number][] = [
    [0, 0, 1],
    [0.9, -0.35, 0.85],
    [1.8, 0, 0.95],
    [0.9, 0.25, 1],
    [-0.8, 0.15, 0.7],
    [2.6, 0.2, 0.65],
  ];
  ctx.fillStyle = shadow;
  for (const [bx, by, r] of blobs) {
    ctx.beginPath();
    ctx.arc(x + bx * s, y + by * s + s * 0.18, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  for (const [bx, by, r] of blobs) {
    ctx.beginPath();
    ctx.arc(x + bx * s, y + by * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function stars(ctx: CanvasRenderingContext2D, rand: () => number, n: number, maxY: number, color = '255,248,230'): void {
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * maxY;
    const s = rand() < 0.85 ? 1 : 2;
    ctx.fillStyle = `rgba(${color},${0.3 + rand() * 0.7})`;
    ctx.fillRect(Math.floor(x), Math.floor(y), s, s);
  }
}

function vignette(ctx: CanvasRenderingContext2D, strength = 0.45): void {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 1.0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A tapering rocky underside hanging below a platform body. */
function underside(ctx: CanvasRenderingContext2D, rand: () => number, w: number, top: number, depth: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(4, top);
  const steps = Math.max(3, Math.floor(w / 14));
  for (let i = 0; i <= steps; i++) {
    const x = 4 + ((w - 8) * i) / steps;
    const edge = Math.min(i, steps - i) / (steps / 2);
    const d = depth * (0.35 + 0.65 * edge) * (0.6 + rand() * 0.4);
    ctx.lineTo(x, top + d);
  }
  ctx.lineTo(w - 4, top);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- themes

const sky: Theme = {
  accent: '#4da3ff',
  rays: { x: 1060, y: 120, color: 0xfff1c4, count: 7, length: 950, angle: 125, spread: 60, alpha: 0.13 },
  grade: { saturate: 0.18, contrast: 0.06, brightness: 1.03 },
  ambient: 'none',
  ambientColor: 0xffffff,
  paintBackdrop(ctx) {
    const rand = mulberry32(11);
    ctx.fillStyle = vgrad(ctx, 0, H, [
      [0, '#2f7fd6'],
      [0.5, '#7cc4f5'],
      [0.85, '#c9ecff'],
      [1, '#e8f7ff'],
    ]);
    ctx.fillRect(0, 0, W, H);
    // sun
    const sun = ctx.createRadialGradient(1060, 120, 10, 1060, 120, 220);
    sun.addColorStop(0, 'rgba(255,250,220,1)');
    sun.addColorStop(0.15, 'rgba(255,240,190,0.9)');
    sun.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(800, 0, 480, 400);
    ridge(ctx, rand, 560, 170, 70, '#a9cdee', 0.35);
    ridge(ctx, rand, 610, 120, 50, '#8fbbe3', 0.4);
    // distant floating islets
    for (let i = 0; i < 5; i++) {
      const x = 80 + rand() * 1100;
      const y = 120 + rand() * 220;
      const s = 20 + rand() * 30;
      ctx.fillStyle = 'rgba(120,170,200,0.55)';
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x + s * 0.2, y + s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(140,200,150,0.6)';
      ctx.fillRect(x - s, y - 3, s * 2, 4);
    }
    vignette(ctx, 0.25);
  },
  layers: [
    {
      key: 'sky-clouds',
      speed: -9,
      depth: -80,
      alpha: 0.85,
      paint(ctx, w) {
        const rand = mulberry32(5);
        for (let i = 0; i < 7; i++) cloud(ctx, (i / 7) * w + rand() * 80, 70 + rand() * 200, 18 + rand() * 22, '#ffffff', 'rgba(170,205,235,0.9)');
      },
    },
    {
      key: 'sky-sea',
      speed: -22,
      depth: 40,
      alpha: 1,
      paint(ctx, w, h) {
        const rand = mulberry32(9);
        for (let i = 0; i < 26; i++) cloud(ctx, (i / 26) * w + rand() * 30, h - 40 + rand() * 30, 22 + rand() * 16, '#ffffff', 'rgba(185,215,240,1)');
      },
    },
  ],
  paintPlatform(ctx, w, h, kind, seed) {
    const rand = mulberry32(seed);
    underside(ctx, rand, w, h - 4, PLATFORM_HANG + 4, '#6e4a2f');
    roundRect(ctx, 0, 4, w, h - 4, 6);
    ctx.fillStyle = '#a5703f';
    ctx.fill();
    for (let i = 0; i < w / 6; i++) {
      ctx.fillStyle = rand() < 0.5 ? '#8a5a32' : '#b98250';
      ctx.fillRect(rand() * (w - 6), 10 + rand() * (h - 14), 4 + rand() * 6, 3);
    }
    // grass cap
    ctx.fillStyle = '#2f8f3a';
    roundRect(ctx, 0, 0, w, 11, 5);
    ctx.fill();
    ctx.fillStyle = '#5fd35a';
    roundRect(ctx, 1, 0, w - 2, 8, 4);
    ctx.fill();
    for (let x = 3; x < w - 3; x += 3) {
      ctx.fillStyle = rand() < 0.4 ? '#8ef07a' : '#4cc04a';
      ctx.fillRect(x, rand() < 0.5 ? 0 : 2, 2, 3);
      if (rand() < 0.18) {
        ctx.fillStyle = '#3ba83f';
        ctx.fillRect(x, 9, 2, 3 + rand() * 6);
      }
    }
    if (rand() < 0.9) {
      const fx = 8 + rand() * (w - 16);
      ctx.fillStyle = ['#ffe066', '#ff8fab', '#ffffff'][Math.floor(rand() * 3)];
      ctx.fillRect(fx, -2, 3, 3);
    }
    if (kind === 'bounce') bouncePad(ctx, w, '#ffd23f', '#ff6b35');
  },
};

const frost: Theme = {
  accent: '#7fe6ff',
  rays: { x: 230, y: 110, color: 0xc4e8ff, count: 6, length: 850, angle: 58, spread: 50, alpha: 0.09 },
  grade: { saturate: 0.12, contrast: 0.1, brightness: 1.02 },
  ambient: 'snow',
  ambientColor: 0xffffff,
  paintBackdrop(ctx) {
    const rand = mulberry32(23);
    ctx.fillStyle = vgrad(ctx, 0, H, [
      [0, '#060b24'],
      [0.45, '#14275a'],
      [0.8, '#2e4f86'],
      [1, '#5f86b8'],
    ]);
    ctx.fillRect(0, 0, W, H);
    stars(ctx, rand, 220, 420);
    // moon
    ctx.fillStyle = 'rgba(235,245,255,0.95)';
    ctx.beginPath();
    ctx.arc(230, 110, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,215,240,0.7)';
    ctx.beginPath();
    ctx.arc(220, 100, 7, 0, Math.PI * 2);
    ctx.arc(244, 122, 5, 0, Math.PI * 2);
    ctx.fill();
    ridge(ctx, rand, 520, 230, 90, '#30487a', 0.7);
    // snow caps
    ridge(ctx, rand, 590, 140, 60, '#3d5d94', 0.6);
    ridge(ctx, rand, 650, 90, 40, '#4a6da6', 0.5);
    ctx.fillStyle = vgrad(ctx, 620, H, [
      [0, 'rgba(20,50,90,0)'],
      [1, 'rgba(8,24,50,0.95)'],
    ]);
    ctx.fillRect(0, 620, W, 100);
    vignette(ctx, 0.4);
  },
  layers: [
    {
      key: 'frost-aurora',
      speed: -6,
      depth: -80,
      alpha: 0.55,
      paint(ctx, w) {
        for (let band = 0; band < 3; band++) {
          const g = ctx.createLinearGradient(0, 40, 0, 300);
          const col = ['#3dffb0', '#3de0ff', '#b07dff'][band];
          g.addColorStop(0, rgba(col, 0));
          g.addColorStop(0.5, rgba(col, 0.35));
          g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 300);
          for (let x = 0; x <= w; x += 20) {
            ctx.lineTo(x, 120 + band * 30 + Math.sin((x / w) * Math.PI * 4 + band * 1.7) * 50);
          }
          for (let x = w; x >= 0; x -= 20) {
            ctx.lineTo(x, 200 + band * 30 + Math.sin((x / w) * Math.PI * 4 + band * 1.7) * 50);
          }
          ctx.closePath();
          ctx.fill();
        }
      },
    },
    {
      key: 'frost-mist',
      speed: -18,
      depth: 40,
      alpha: 0.8,
      paint(ctx, w, h) {
        const rand = mulberry32(3);
        for (let i = 0; i < 22; i++) cloud(ctx, (i / 22) * w + rand() * 40, h - 30 + rand() * 20, 18 + rand() * 14, 'rgba(200,225,255,0.55)', 'rgba(140,180,230,0.3)');
      },
    },
  ],
  paintPlatform(ctx, w, h, kind, seed) {
    const rand = mulberry32(seed);
    const ice = kind === 'ice';
    if (ice) {
      // icicles
      for (let x = 6; x < w - 6; x += 7 + rand() * 9) {
        const len = 6 + rand() * (PLATFORM_HANG + 2);
        ctx.fillStyle = 'rgba(190,240,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(x - 3, h - 2);
        ctx.lineTo(x + 3, h - 2);
        ctx.lineTo(x, h - 2 + len);
        ctx.closePath();
        ctx.fill();
      }
      roundRect(ctx, 0, 0, w, h, 6);
      ctx.fillStyle = vgrad(ctx, 0, h, [
        [0, '#e6fbff'],
        [0.35, '#9fe3fa'],
        [1, '#4aa3d6'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < w / 40; i++) {
        const x = rand() * w;
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x + 10, h - 6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(4, 2, w - 8, 2);
    } else {
      underside(ctx, rand, w, h - 4, PLATFORM_HANG, '#3b4a63');
      roundRect(ctx, 0, 3, w, h - 3, 5);
      ctx.fillStyle = '#5b6d88';
      ctx.fill();
      for (let i = 0; i < w / 8; i++) {
        ctx.fillStyle = rand() < 0.5 ? '#4a5a74' : '#6e82a0';
        ctx.fillRect(rand() * (w - 6), 10 + rand() * (h - 13), 5, 3);
      }
      // snow cap with drips
      ctx.fillStyle = '#f4fbff';
      roundRect(ctx, -1, 0, w + 2, 9, 5);
      ctx.fill();
      for (let x = 4; x < w - 4; x += 6 + rand() * 10) {
        ctx.beginPath();
        ctx.arc(x, 8, 2 + rand() * 3, 0, Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(2, 7, w - 4, 1);
    }
    if (kind === 'bounce') bouncePad(ctx, w, '#7fe6ff', '#3d7bff');
  },
};

const temple: Theme = {
  accent: '#ffb35c',
  rays: { x: 640, y: 520, color: 0xffcf8a, count: 11, length: 760, angle: -90, spread: 150, alpha: 0.1 },
  grade: { saturate: 0.22, contrast: 0.08, brightness: 1.04 },
  ambient: 'dust',
  ambientColor: 0xffd59a,
  paintBackdrop(ctx) {
    const rand = mulberry32(31);
    ctx.fillStyle = vgrad(ctx, 0, H, [
      [0, '#2c1640'],
      [0.35, '#7a2f5a'],
      [0.62, '#e0684f'],
      [0.8, '#ffb36b'],
      [1, '#ffd69a'],
    ]);
    ctx.fillRect(0, 0, W, H);
    stars(ctx, rand, 60, 160, '255,220,240');
    // big low sun
    ctx.fillStyle = 'rgba(255,214,140,0.95)';
    ctx.beginPath();
    ctx.arc(640, 520, 130, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,110,0.35)';
    ctx.beginPath();
    ctx.arc(640, 520, 190, Math.PI, 0);
    ctx.fill();
    // pyramids + obelisks
    const sil = '#5a2a4a';
    const pyr = (x: number, base: number, s: number, c: string) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x - s, base);
      ctx.lineTo(x, base - s * 0.8);
      ctx.lineTo(x + s, base);
      ctx.closePath();
      ctx.fill();
    };
    pyr(250, 560, 200, '#7a3a55');
    pyr(1020, 560, 240, '#7a3a55');
    pyr(420, 560, 120, sil);
    pyr(900, 560, 110, sil);
    for (const ox of [120, 560, 760, 1180]) {
      ctx.fillStyle = sil;
      ctx.fillRect(ox - 9, 380 + rand() * 60, 18, 200);
      ctx.beginPath();
      ctx.moveTo(ox - 9, 380);
      ctx.lineTo(ox, 360);
      ctx.lineTo(ox + 9, 380);
      ctx.fill();
    }
    // dunes
    ctx.fillStyle = '#c9714f';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 560 + Math.sin(x / 140) * 18);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.fillStyle = '#a65644';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 620 + Math.sin(x / 90 + 1) * 14);
    ctx.lineTo(W, H);
    ctx.fill();
    vignette(ctx, 0.4);
  },
  layers: [
    {
      key: 'temple-haze',
      speed: -12,
      depth: 40,
      alpha: 0.7,
      paint(ctx, w, h) {
        const rand = mulberry32(13);
        for (let i = 0; i < 18; i++) cloud(ctx, (i / 18) * w + rand() * 50, h - 26 + rand() * 20, 20 + rand() * 18, 'rgba(255,190,140,0.45)', 'rgba(200,110,110,0.25)');
      },
    },
  ],
  paintPlatform(ctx, w, h, kind, seed) {
    const rand = mulberry32(seed);
    const crumble = kind === 'crumble';
    const base = crumble ? '#b98a52' : '#d9a55b';
    const mortar = crumble ? '#7d5a33' : '#a87a3c';
    if (!crumble) underside(ctx, rand, w, h - 4, PLATFORM_HANG - 4, '#8a5f33');
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, w, h);
    const bh = Math.max(8, Math.floor(h / 2));
    for (let row = 0; row * bh < h; row++) {
      const off = row % 2 ? 0 : -12;
      for (let x = off; x < w; x += 24) {
        ctx.fillStyle = shade(base, (rand() - 0.5) * 0.15);
        ctx.fillRect(Math.max(0, x + 1), row * bh + 1, Math.min(22, w - x - 1), bh - 2);
      }
    }
    ctx.fillStyle = shade(base, 0.35);
    ctx.fillRect(0, 0, w, 3);
    // carved glyphs
    ctx.fillStyle = shade(base, -0.3);
    for (let x = 16; x < w - 10; x += 36) {
      ctx.fillRect(x, h / 2 - 2, 2, 5);
      ctx.fillRect(x + 4, h / 2 - 1, 4, 2);
    }
    if (crumble) {
      ctx.strokeStyle = '#4a3020';
      ctx.lineWidth = 2;
      for (let i = 0; i < Math.max(2, w / 40); i++) {
        let x = rand() * w;
        let y = 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (y < h) {
          x += (rand() - 0.5) * 10;
          y += 4 + rand() * 4;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // dangling pebbles
      ctx.fillStyle = '#8a6440';
      for (let x = 6; x < w - 6; x += 10 + rand() * 12) ctx.fillRect(x, h, 4, 3 + rand() * 4);
    }
    if (kind === 'bounce') bouncePad(ctx, w, '#ffd23f', '#c0392b');
  },
};

const forge: Theme = {
  accent: '#ff7a2e',
  rays: { x: 640, y: 780, color: 0xff7a2e, count: 8, length: 760, angle: -90, spread: 100, alpha: 0.1 },
  grade: { saturate: 0.25, contrast: 0.14, brightness: 1.0 },
  ambient: 'embers',
  ambientColor: 0xff9a3d,
  paintBackdrop(ctx) {
    const rand = mulberry32(41);
    ctx.fillStyle = vgrad(ctx, 0, H, [
      [0, '#0b0406'],
      [0.5, '#22090b'],
      [0.8, '#4a1208'],
      [1, '#a8320a'],
    ]);
    ctx.fillRect(0, 0, W, H);
    // machinery silhouettes: gears, pipes, chains
    const metal = '#1c0d10';
    const gear = (x: number, y: number, r: number) => {
      ctx.fillStyle = metal;
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = i % 2 ? r : r * 1.18;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2e1416';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };
    gear(160, 180, 90);
    gear(300, 90, 50);
    gear(1120, 220, 110);
    gear(960, 80, 45);
    ctx.fillStyle = '#170a0c';
    ctx.fillRect(0, 300, W, 14);
    ctx.fillRect(420, 0, 14, 300);
    ctx.fillRect(850, 0, 14, 320);
    for (let y = 20; y < 420; y += 14) {
      ctx.fillStyle = y % 28 ? '#2a1214' : '#1a0b0d';
      ctx.fillRect(637, y, 6, 10);
    }
    // heat glow from below
    ctx.fillStyle = vgrad(ctx, 380, H, [
      [0, 'rgba(255,90,20,0)'],
      [1, 'rgba(255,110,30,0.55)'],
    ]);
    ctx.fillRect(0, 380, W, H - 380);
    stars(ctx, rand, 30, 400, '255,160,90');
    vignette(ctx, 0.5);
  },
  layers: [
    {
      key: 'forge-lava',
      speed: -26,
      depth: 40,
      alpha: 1,
      paint(ctx, w, h) {
        const top = h - 46;
        ctx.fillStyle = vgrad(ctx, top, h, [
          [0, '#ffd34d'],
          [0.25, '#ff8a1e'],
          [1, '#a82206'],
        ]);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, top + Math.sin((x / w) * Math.PI * 12) * 5);
        ctx.lineTo(w, h);
        ctx.fill();
        const rand = mulberry32(2);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,170,0.8)' : 'rgba(140,20,0,0.6)';
          ctx.fillRect(rand() * w, top + 8 + rand() * 34, 6 + rand() * 18, 3);
        }
      },
    },
  ],
  paintPlatform(ctx, w, h, kind, seed) {
    const rand = mulberry32(seed);
    if (kind === 'bounce') {
      // coil spring + hazard pad
      ctx.fillStyle = '#2a2430';
      ctx.fillRect(6, h - 2, w - 12, 6);
      ctx.strokeStyle = '#a7a2b3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(w / 2 + (i % 2 ? 14 : -14), h + 2 + i * 3);
      ctx.stroke();
      bouncePad(ctx, w, '#ffd23f', '#1d1a22', h);
      return;
    }
    // chains
    ctx.fillStyle = '#3d3540';
    for (const cx of [10, w - 14]) for (let y = h; y < h + PLATFORM_HANG; y += 6) ctx.fillRect(cx, y, 4, 4);
    roundRect(ctx, 0, 0, w, h, 4);
    ctx.fillStyle = '#3a3440';
    ctx.fill();
    ctx.fillStyle = '#2a252f';
    for (let x = 0; x < w; x += 12) ctx.fillRect(x, 8, 2, h - 10);
    ctx.fillStyle = '#6b6470';
    for (let x = 8; x < w - 4; x += 22) {
      ctx.fillRect(x, 6, 3, 3);
      ctx.fillRect(x, h - 7, 3, 3);
    }
    // hot glowing top edge
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = 'rgba(255,200,120,0.9)';
    ctx.fillRect(0, 0, w, 1);
    for (let i = 0; i < w / 30; i++) {
      ctx.fillStyle = 'rgba(255,120,40,0.5)';
      ctx.fillRect(rand() * w, 3, 2, 4);
    }
  },
};

const neon: Theme = {
  accent: '#ff4fd8',
  rays: { x: 640, y: 505, color: 0xff7ab6, count: 9, length: 620, angle: -90, spread: 170, alpha: 0.08 },
  grade: { saturate: 0.35, contrast: 0.12, brightness: 1.02 },
  ambient: 'stars',
  ambientColor: 0xb9f6ff,
  paintBackdrop(ctx) {
    const rand = mulberry32(53);
    ctx.fillStyle = vgrad(ctx, 0, H, [
      [0, '#05010f'],
      [0.45, '#1d0638'],
      [0.7, '#4a0e5e'],
      [0.72, '#0d0420'],
      [1, '#16052e'],
    ]);
    ctx.fillRect(0, 0, W, H);
    stars(ctx, rand, 180, 480, '220,240,255');
    // striped synth sun
    const cy = 505;
    const r = 150;
    const sg = vgrad(ctx, cy - r, cy, [
      [0, '#ffe36e'],
      [0.5, '#ff7ab6'],
      [1, '#ff3d9a'],
    ]);
    ctx.save();
    ctx.beginPath();
    ctx.arc(640, cy, r, Math.PI, 0);
    ctx.clip();
    ctx.fillStyle = sg;
    ctx.fillRect(640 - r, cy - r, r * 2, r);
    ctx.fillStyle = '#1d0638';
    for (let i = 0; i < 7; i++) {
      const y = cy - 60 + i * 9;
      ctx.fillRect(640 - r, y, r * 2, 2 + i);
    }
    ctx.restore();
    // wireframe mountains
    ctx.strokeStyle = 'rgba(255,79,216,0.8)';
    ctx.lineWidth = 2;
    for (const [x0, s] of [
      [80, 220],
      [900, 260],
    ] as const) {
      ctx.fillStyle = '#12042a';
      ctx.beginPath();
      ctx.moveTo(x0, 518);
      ctx.lineTo(x0 + s * 0.5, 518 - s * 0.6);
      ctx.lineTo(x0 + s, 518);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + s * 0.5, 518 - s * 0.6);
      ctx.lineTo(x0 + s * 0.35, 518);
      ctx.moveTo(x0 + s * 0.5, 518 - s * 0.6);
      ctx.lineTo(x0 + s * 0.68, 518);
      ctx.stroke();
    }
    ctx.fillStyle = '#3df2ff';
    ctx.fillRect(0, 518, W, 2);
    vignette(ctx, 0.5);
  },
  layers: [],
  paintPlatform(ctx, w, h, kind, seed) {
    void seed;
    const edge = kind === 'bounce' ? '#ff4fd8' : '#3df2ff';
    roundRect(ctx, 0, 0, w, h, 5);
    ctx.fillStyle = 'rgba(22,10,46,0.92)';
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, w - 2, h - 2, 4);
    ctx.stroke();
    ctx.fillStyle = edge;
    ctx.fillRect(2, 0, w - 4, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(4, 1, w - 8, 1);
    ctx.fillStyle = 'rgba(61,242,255,0.18)';
    for (let x = 10; x < w - 6; x += 14) ctx.fillRect(x, 5, 1, h - 9);
    // glow drip below
    ctx.fillStyle = vgrad(ctx, h, h + PLATFORM_HANG, [
      [0, rgba(edge, 0.35)],
      [1, rgba(edge, 0)],
    ]);
    ctx.fillRect(6, h, w - 12, PLATFORM_HANG);
    if (kind === 'bounce') bouncePad(ctx, w, '#ff4fd8', '#3df2ff');
  },
};

/** A springy pad stripe on top of a platform. */
function bouncePad(ctx: CanvasRenderingContext2D, w: number, a: string, b: string, h = 8): void {
  const ph = Math.min(10, h);
  ctx.fillStyle = a;
  roundRect(ctx, 0, 0, w, ph, 4);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, ph);
  ctx.clip();
  ctx.fillStyle = b;
  for (let x = -10; x < w + 10; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, ph);
    ctx.lineTo(x + 7, 0);
    ctx.lineTo(x + 12, 0);
    ctx.lineTo(x + 5, ph);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(3, 1, w - 6, 1);
}

export const THEMES: Record<ThemeId, Theme> = { sky, frost, temple, forge, neon };

export function platformCanvas(theme: ThemeId, w: number, h: number, kind: PlatformKind, seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h + PLATFORM_HANG);
  // baked ambient occlusion: a soft shadow pooled under the platform
  ctx.save();
  ctx.translate(w / 2, h + 2);
  ctx.scale(w / 2, PLATFORM_HANG * 0.7);
  const ao = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  ao.addColorStop(0, 'rgba(10,4,24,0.42)');
  ao.addColorStop(1, 'rgba(10,4,24,0)');
  ctx.fillStyle = ao;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  THEMES[theme].paintPlatform(ctx, w, h, kind, seed);
  // crisp top highlight + darker underside line for depth
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(3, 0, w - 6, 1);
  ctx.fillStyle = 'rgba(8,2,20,0.35)';
  ctx.fillRect(2, h - 2, w - 4, 2);
  gradeCanvas(c, THEMES[theme].grade);
  return c;
}

export function backdropCanvas(theme: ThemeId): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  THEMES[theme].paintBackdrop(ctx);
  gradeCanvas(c, THEMES[theme].grade);
  return c;
}

/** Scrolling layers are painted three times (shifted by ±W) so the tile wraps without a seam. */
export function layerCanvas(layer: ThemeLayer, theme: ThemeId): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  for (const dx of [-W, 0, W]) {
    ctx.save();
    ctx.translate(dx, 0);
    layer.paint(ctx, W, H);
    ctx.restore();
  }
  gradeCanvas(c, THEMES[theme].grade);
  return c;
}
