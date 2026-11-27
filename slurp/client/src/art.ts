/** Every picture in the game is drawn here, in code: food sprites, holes, the blanket. */
import { TIERS } from '../../shared/src/constants';

const INK = '#1f2440';
/** Sprites are drawn this many pixels per world unit, enough for a zoomed-in phone screen. */
const RES = 3;
/** Room round the food for its outline and shadow, in world units. */
const PAD = 6;

type Ctx = CanvasRenderingContext2D;

function circle(c: Ctx, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

function ink(c: Ctx, width = 2.2): void {
  c.lineWidth = width;
  c.strokeStyle = INK;
  c.lineJoin = c.lineCap = 'round';
  c.stroke();
}

function shine(c: Ctx, r: number): void {
  c.beginPath();
  c.arc(0, 0, r * 0.68, Math.PI * 1.08, Math.PI * 1.42);
  c.lineWidth = Math.max(1.6, r * 0.13);
  c.strokeStyle = 'rgba(255,255,255,.75)';
  c.lineCap = 'round';
  c.stroke();
}

/** Each drawn centred on the origin, to fit a circle of radius `r`. */
const DRAW: ((c: Ctx, r: number) => void)[] = [
  // berry
  (c, r) => {
    circle(c, 0, 0, r);
    c.fillStyle = '#ff5d73';
    c.fill();
    ink(c, 2);
    c.fillStyle = '#ffe3a6';
    for (const [x, y] of [[-0.3, 0.25], [0.3, 0.1], [0, 0.55], [-0.45, -0.2]]) {
      circle(c, x * r, y * r, r * 0.09);
      c.fill();
    }
    c.beginPath();
    c.moveTo(-r * 0.55, -r * 0.75);
    c.quadraticCurveTo(0, -r * 0.2, r * 0.55, -r * 0.75);
    c.quadraticCurveTo(0, -r * 1.25, -r * 0.55, -r * 0.75);
    c.fillStyle = '#3ddc97';
    c.fill();
    ink(c, 1.6);
  },
  // cookie
  (c, r) => {
    circle(c, 0, 0, r);
    c.fillStyle = '#e3aa62';
    c.fill();
    ink(c);
    c.fillStyle = '#5b3a24';
    for (const [x, y, s] of [[-0.4, -0.3, 0.17], [0.35, -0.4, 0.14], [0.05, 0.1, 0.18], [-0.45, 0.4, 0.13], [0.5, 0.35, 0.16], [-0.05, -0.65, 0.1]]) {
      circle(c, x * r, y * r, s * r);
      c.fill();
    }
    shine(c, r);
  },
  // sandwich
  (c, r) => {
    const s = r * 0.84;
    c.beginPath();
    c.roundRect(-s, -s, s * 2, s * 2, r * 0.3);
    c.fillStyle = '#c98b4a';
    c.fill();
    ink(c);
    c.beginPath();
    c.roundRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6, r * 0.2);
    c.fillStyle = '#fbe8bd';
    c.fill();
    // lettuce and tomato peeking out along the cut
    c.beginPath();
    c.moveTo(-s * 0.8, s * 0.55);
    for (let i = 0; i <= 8; i++) c.lineTo(-s * 0.8 + (i / 8) * s * 1.6, -(-s * 0.55 + (i / 8) * s * 1.1) + (i % 2 ? -r * 0.12 : r * 0.12));
    c.lineWidth = r * 0.2;
    c.strokeStyle = '#3ddc97';
    c.lineJoin = 'round';
    c.stroke();
    c.beginPath();
    c.moveTo(-s * 0.72, s * 0.5);
    c.lineTo(s * 0.72, -s * 0.5);
    c.lineWidth = r * 0.08;
    c.strokeStyle = '#ff5d73';
    c.stroke();
    c.lineWidth = 1.6;
    c.strokeStyle = INK;
    c.stroke();
  },
  // pie
  (c, r) => {
    circle(c, 0, 0, r);
    c.fillStyle = '#e2a868';
    c.fill();
    ink(c, 2.6);
    circle(c, 0, 0, r * 0.78);
    c.fillStyle = '#c0304a';
    c.fill();
    ink(c, 1.8);
    c.save();
    circle(c, 0, 0, r * 0.78);
    c.clip();
    c.lineWidth = r * 0.14;
    c.strokeStyle = '#f0c486';
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(i * r * 0.36 - r, -r);
      c.lineTo(i * r * 0.36 + r, r);
      c.moveTo(i * r * 0.36 + r, -r);
      c.lineTo(i * r * 0.36 - r, r);
      c.stroke();
    }
    c.restore();
    c.lineWidth = r * 0.07;
    c.strokeStyle = '#c98b4a';
    c.setLineDash([r * 0.16, r * 0.14]);
    circle(c, 0, 0, r * 0.89);
    c.stroke();
    c.setLineDash([]);
  },
  // melon
  (c, r) => {
    circle(c, 0, 0, r);
    c.fillStyle = '#46b356';
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = '#237a3a';
    c.lineWidth = r * 0.13;
    c.lineCap = 'round';
    for (let i = -3; i <= 3; i++) {
      c.beginPath();
      c.moveTo(i * r * 0.33, -r);
      c.bezierCurveTo(i * r * 0.5, -r * 0.3, i * r * 0.5, r * 0.3, i * r * 0.33, r);
      c.stroke();
    }
    c.restore();
    circle(c, 0, 0, r);
    ink(c, 3);
    shine(c, r);
    circle(c, 0, -r * 0.93, r * 0.07);
    c.fillStyle = '#5b3a24';
    c.fill();
  },
];

export type Sprite = { img: HTMLCanvasElement; /** Half the sprite's size in world units. */ half: number };

function makeSprite(tier: number): Sprite {
  const r = TIERS[tier].r;
  const half = r + PAD;
  const img = document.createElement('canvas');
  img.width = img.height = Math.ceil(half * 2 * RES);
  const c = img.getContext('2d')!;
  c.scale(RES, RES);
  c.translate(half, half);
  // a soft shadow, so food sits on the blanket rather than in it
  circle(c, r * 0.1, r * 0.16, r * 0.98);
  c.fillStyle = 'rgba(31,36,64,.2)';
  c.fill();
  DRAW[tier](c, r);
  return { img, half };
}

let sprites: Sprite[] | null = null;
export const foodSprites = (): Sprite[] => (sprites ??= TIERS.map((_, tier) => makeSprite(tier)));

/** Draw a food sprite centred at (x, y) in the current transform, `scale` times its natural size. */
export function drawFood(c: Ctx, tier: number, x: number, y: number, scale = 1, turn = 0): void {
  const s = foodSprites()[tier];
  const half = s.half * scale;
  if (turn) {
    c.save();
    c.translate(x, y);
    c.rotate(turn);
    c.drawImage(s.img, -half, -half, half * 2, half * 2);
    c.restore();
  } else c.drawImage(s.img, x - half, y - half, half * 2, half * 2);
}

/** A hole in the blanket with a rim in its player's colour. `pulse` (0..1) fattens the rim after a bite. */
export function drawHole(c: Ctx, x: number, y: number, r: number, color: string, pulse = 0): void {
  const rim = Math.max(3, r * 0.16) * (1 + pulse * 0.6);
  circle(c, x, y, r + rim * 0.5);
  c.fillStyle = INK;
  c.fill();
  circle(c, x, y, r + rim * 0.5 - 1.5);
  c.fillStyle = color;
  c.fill();
  circle(c, x, y, r - rim * 0.5);
  c.fillStyle = INK;
  c.fill();
  const g = c.createRadialGradient(x, y + r * 0.25, r * 0.1, x, y, r);
  g.addColorStop(0, '#05040c');
  g.addColorStop(1, '#2b2350');
  circle(c, x, y, Math.max(1, r - rim * 0.5 - 1.5));
  c.fillStyle = g;
  c.fill();
}

const BAND = 80;

/** The gingham blanket, drawing only the bands between (x0, y0) and (x1, y1). */
export function drawBlanket(c: Ctx, w: number, h: number, x0: number, y0: number, x1: number, y1: number): void {
  c.fillStyle = 'rgba(20,50,24,.3)';
  c.beginPath();
  c.roundRect(8, 12, w, h, 18);
  c.fill();
  c.beginPath();
  c.roundRect(0, 0, w, h, 18);
  c.fillStyle = '#fff7ea';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(255,93,115,.2)';
  const ax = Math.max(0, x0);
  const ay = Math.max(0, y0);
  const bx = Math.min(w, x1);
  const by = Math.min(h, y1);
  for (let x = Math.floor(ax / (BAND * 2)) * BAND * 2; x < bx; x += BAND * 2) c.fillRect(x, ay, BAND, by - ay);
  for (let y = Math.floor(ay / (BAND * 2)) * BAND * 2; y < by; y += BAND * 2) c.fillRect(ax, y, bx - ax, BAND);
  c.restore();
  c.beginPath();
  c.roundRect(0, 0, w, h, 18);
  c.lineWidth = 4;
  c.strokeStyle = INK;
  c.stroke();
  // stitching just inside the hem
  c.beginPath();
  c.roundRect(9, 9, w - 18, h - 18, 12);
  c.lineWidth = 2;
  c.setLineDash([10, 8]);
  c.strokeStyle = 'rgba(31,36,64,.35)';
  c.stroke();
  c.setLineDash([]);
}

export const GRASS = '#5fae57';
export const TIER_NAMES = ['berries', 'cookies', 'sandwiches', 'pies', 'melons'] as const;
