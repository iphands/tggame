/**
 * Procedural pixel-art sprites: animated fighters (one sheet per color),
 * projectiles, crates, held weapons and effect textures.
 */
import Phaser from 'phaser';
import { canvas, rgba, shade } from './color';

export const FIGHTER_W = 32;
export const FIGHTER_H = 42;
const S = 2; // art pixel → texture pixel
const GW = FIGHTER_W / S; // 16

export const FRAMES = {
  idle: [0, 1],
  run: [2, 3, 4, 5],
  jump: 6,
  fall: 7,
  hurt: 8,
  punch: 9,
} as const;

type FrameSpec = {
  top: number;
  lean: number;
  feet: [number, number];
  lift: [number, number];
  eyes: 'open' | 'blink' | 'x' | 'squint' | 'wide';
  tail: number;
  arm: 'down' | 'up' | 'punch' | 'back';
};

const BOTTOM = 18;

const SPECS: FrameSpec[] = [
  { top: 3, lean: 0, feet: [0, 0], lift: [0, 0], eyes: 'open', tail: 0, arm: 'down' },
  { top: 4, lean: 0, feet: [0, 0], lift: [0, 0], eyes: 'blink', tail: 0, arm: 'down' },
  { top: 3, lean: 0.6, feet: [-2, 1], lift: [0, 1], eyes: 'open', tail: 1, arm: 'back' },
  { top: 2, lean: 0.6, feet: [0, 0], lift: [1, 0], eyes: 'open', tail: 2, arm: 'down' },
  { top: 3, lean: 0.6, feet: [1, -2], lift: [1, 0], eyes: 'open', tail: 1, arm: 'back' },
  { top: 2, lean: 0.6, feet: [0, 0], lift: [0, 1], eyes: 'open', tail: 2, arm: 'down' },
  { top: 1, lean: 0, feet: [1, -1], lift: [1, 1], eyes: 'open', tail: 2, arm: 'up' },
  { top: 3, lean: 0, feet: [-1, 1], lift: [0, 0], eyes: 'wide', tail: 1, arm: 'up' },
  { top: 4, lean: -0.8, feet: [-1, 1], lift: [1, 0], eyes: 'x', tail: 2, arm: 'up' },
  { top: 3, lean: 1, feet: [-2, 1], lift: [0, 0], eyes: 'squint', tail: 2, arm: 'punch' },
];

function drawFighterFrame(ctx: CanvasRenderingContext2D, ox: number, color: string, f: FrameSpec): void {
  const px = (x: number, y: number, c: string, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x * S, y * S, w * S, h * S);
  };
  const outline = shade(color, -0.7);
  const dark = shade(color, -0.25);
  const light = shade(color, 0.38);
  const belly = shade(color, 0.22);

  const top = f.top;
  const rows = BOTTOM - top + 1;
  const ry = rows / 2;
  const cy = top + ry;
  const cx = 7.5 + f.lean;
  const rx = 6.3;

  const inside = (x: number, y: number) => {
    if (y < top || y > BOTTOM || x < 0 || x >= GW) return false;
    const dy = (y + 0.5 - cy) / ry;
    const hw = rx * Math.cbrt(Math.max(0, 1 - Math.abs(dy) ** 3));
    return Math.abs(x + 0.5 - cx) <= hw;
  };

  // feet (behind the body)
  const footY = BOTTOM + 1;
  const feetX = [Math.round(cx - 5 + f.feet[0]), Math.round(cx + 1 + f.feet[1])];
  feetX.forEach((fx, i) => {
    const y = footY - f.lift[i];
    px(fx, y, outline, 4, 2);
    px(fx + 1, y, shade(color, -0.45), 2, 1);
  });

  // body
  for (let y = top; y <= BOTTOM; y++) {
    for (let x = 0; x < GW; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        px(x, y, outline);
        continue;
      }
      const dx = x + 0.5 - cx;
      const dy = (y + 0.5 - cy) / ry;
      let c = color;
      if (dx > 3.6 || dy > 0.62) c = dark;
      if (dx < -2.6 && dy < -0.25) c = light;
      if (dy > 0.1 && dy < 0.62 && Math.abs(dx - 1) < 3) c = belly;
      px(x, y, c);
    }
  }

  // headband + flowing tail at the back
  const bandY = top + 2;
  for (let x = 0; x < GW; x++) {
    for (const y of [bandY, bandY + 1]) {
      if (inside(x, y) && inside(x - 1, y) && inside(x + 1, y)) px(x, y, y === bandY ? '#ffffff' : '#d9dbe8');
    }
  }
  let backX = 0;
  while (backX < GW && !inside(backX, bandY)) backX++;
  const tailShape = [
    [[-1, 0], [-2, 1], [-3, 1]],
    [[-1, 0], [-2, 0], [-3, -1]],
    [[-1, 0], [-2, -1], [-3, -1]],
  ][f.tail];
  for (const [dx, dy] of tailShape) px(backX + dx, bandY + dy, '#f2f3fa');

  // eyes (facing right)
  const ey = top + 4;
  const e1 = Math.round(cx + 0.2);
  const e2 = Math.round(cx + 3.2);
  for (const ex of [e1, e2]) {
    if (f.eyes === 'blink') {
      px(ex, ey + 2, outline, 2, 1);
    } else if (f.eyes === 'squint') {
      px(ex, ey + 1, outline, 2, 1);
      px(ex, ey + 2, '#ffffff', 2, 1);
    } else if (f.eyes === 'x') {
      px(ex, ey, outline);
      px(ex + 1, ey + 1, outline);
      px(ex, ey + 2, outline);
      px(ex + 1, ey, outline);
      px(ex, ey + 1, outline);
      px(ex + 1, ey + 2, outline);
    } else {
      px(ex, ey, '#ffffff', 2, 3);
      const pupilY = f.eyes === 'wide' ? ey : ey + 1;
      px(ex + 1, pupilY, '#141022', 1, 2);
      px(ex, ey, '#ffffff');
    }
  }
  // blush
  if (f.eyes !== 'x') px(e2 + 1, ey + 4, rgba('#ff6b8a', 0.6), 1, 1);

  // arms
  const armY = top + 9;
  const rightEdge = Math.round(cx + 5.5);
  if (f.arm === 'punch') {
    px(rightEdge, armY, outline, 4, 3);
    px(rightEdge, armY + 1, color, 3, 1);
    px(rightEdge + 3, armY, '#ffffff', 2, 3);
    px(rightEdge + 3, armY - 0, outline, 1, 1);
  } else if (f.arm === 'up') {
    px(rightEdge - 1, armY - 4, outline, 2, 3);
    px(Math.round(cx - 6.5), armY - 4, outline, 2, 3);
  } else if (f.arm === 'back') {
    px(Math.round(cx - 7), armY, outline, 2, 2);
  } else {
    px(rightEdge - 1, armY + 1, outline, 2, 2);
  }
}

/** Sprite sheet for a fighter color (cached per scene texture manager). */
export function fighterTexture(scene: Phaser.Scene, color: string): string {
  const key = `fighter${color}`;
  if (scene.textures.exists(key)) return key;
  const [c, ctx] = canvas(FIGHTER_W * SPECS.length, FIGHTER_H);
  SPECS.forEach((spec, i) => drawFighterFrame(ctx, i * FIGHTER_W, color, spec));
  const tex = scene.textures.addCanvas(key, c)!;
  SPECS.forEach((_, i) => tex.add(i, 0, i * FIGHTER_W, 0, FIGHTER_W, FIGHTER_H));
  return key;
}

function add(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const [c, ctx] = canvas(w, h);
  draw(ctx);
  scene.textures.addCanvas(key, c);
}

/** Effect, projectile, crate and weapon textures. */
export function makeCommonTextures(scene: Phaser.Scene): void {
  add(scene, 'px', 4, 4, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 4, 4);
  });

  add(scene, 'soft', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

  add(scene, 'vignette', 1280, 720, (ctx) => {
    const g = ctx.createRadialGradient(640, 340, 260, 640, 360, 820);
    g.addColorStop(0, 'rgba(6,2,18,0)');
    g.addColorStop(0.6, 'rgba(6,2,18,0.12)');
    g.addColorStop(1, 'rgba(6,2,18,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
  });

  // a single soft light shaft (origin at the top center, fading downward)
  add(scene, 'ray', 64, 512, (ctx) => {
    for (let y = 0; y < 512; y++) {
      const fade = Math.pow(1 - y / 512, 1.4);
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${fade})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, 64, 1);
    }
  });

  add(scene, 'ring', 128, 128, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.stroke();
  });

  add(scene, 'puff', 24, 24, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(12, 12, 11, 0, Math.PI * 2);
    ctx.fill();
  });

  add(scene, 'bullet', 16, 6, (ctx) => {
    ctx.fillStyle = '#ffb02e';
    ctx.fillRect(0, 1, 16, 4);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(6, 2, 10, 2);
  });

  add(scene, 'pellet', 8, 8, (ctx) => {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(4, 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff1b0';
    ctx.fillRect(3, 3, 2, 2);
  });

  add(scene, 'bomb', 20, 22, (ctx) => drawBomb(ctx, 10, 13, 8));

  add(scene, 'dart', 10, 4, (ctx) => {
    ctx.fillStyle = '#3df2ff';
    ctx.fillRect(0, 0, 10, 4);
    ctx.fillStyle = '#e8feff';
    ctx.fillRect(4, 1, 6, 2);
  });

  add(scene, 'rocket', 26, 12, (ctx) => {
    ctx.fillStyle = '#7a8094';
    ctx.fillRect(3, 3, 16, 6);
    ctx.fillStyle = '#ff4f4f';
    ctx.beginPath();
    ctx.moveTo(19, 2);
    ctx.lineTo(26, 6);
    ctx.lineTo(19, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(2, 0, 5, 3);
    ctx.fillRect(2, 9, 5, 3);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(0, 4, 3, 4);
  });

  add(scene, 'fist', 40, 40, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(6, 20, 26, -0.9, 0.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 20, 24, -0.7, 0.7);
    ctx.stroke();
  });

  add(scene, 'shield', 72, 72, (ctx) => {
    const g = ctx.createRadialGradient(36, 36, 18, 36, 36, 35);
    g.addColorStop(0, 'rgba(120,220,255,0.05)');
    g.addColorStop(0.8, 'rgba(120,220,255,0.28)');
    g.addColorStop(1, 'rgba(200,245,255,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(36, 36, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(24, 22, 8, 4, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });

  add(scene, 'crate', 28, 28, drawCrate);

  add(scene, 'gun-pistol', 16, 12, (ctx) => {
    ctx.fillStyle = '#14111c';
    ctx.fillRect(0, 0, 16, 7);
    ctx.fillRect(1, 5, 6, 7);
    ctx.fillStyle = '#5d6275';
    ctx.fillRect(1, 1, 14, 3);
    ctx.fillStyle = '#9aa1b8';
    ctx.fillRect(2, 1, 12, 1);
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(2, 6, 4, 5);
  });

  add(scene, 'crown', 20, 14, (ctx) => {
    ctx.fillStyle = '#7a4a00';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, 3);
    ctx.lineTo(5, 7);
    ctx.lineTo(10, 0);
    ctx.lineTo(15, 7);
    ctx.lineTo(20, 3);
    ctx.lineTo(20, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(2, 12);
    ctx.lineTo(2, 6);
    ctx.lineTo(5, 9);
    ctx.lineTo(10, 3);
    ctx.lineTo(15, 9);
    ctx.lineTo(18, 6);
    ctx.lineTo(18, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff4f7b';
    ctx.fillRect(9, 8, 2, 2);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(3, 10, 14, 1);
  });

  add(scene, 'gun-boomstick', 30, 12, (ctx) => {
    ctx.fillStyle = '#6b3d1f';
    ctx.fillRect(0, 3, 10, 7);
    ctx.fillStyle = '#20202a';
    ctx.fillRect(8, 2, 22, 6);
    ctx.fillStyle = '#8d93a8';
    ctx.fillRect(9, 3, 20, 1);
    ctx.fillRect(9, 6, 20, 1);
  });

  add(scene, 'gun-bombs', 16, 18, (ctx) => drawBomb(ctx, 8, 11, 6));

  add(scene, 'gun-smg', 24, 14, (ctx) => {
    ctx.fillStyle = '#14111c';
    ctx.fillRect(0, 1, 22, 6);
    ctx.fillRect(4, 6, 4, 8); // grip
    ctx.fillRect(11, 6, 4, 7); // magazine
    ctx.fillStyle = '#3df2ff';
    ctx.fillRect(1, 2, 20, 2);
    ctx.fillStyle = '#5d6275';
    ctx.fillRect(20, 3, 4, 2);
  });

  add(scene, 'gun-rockets', 34, 14, (ctx) => {
    ctx.fillStyle = '#3b4a2a';
    ctx.fillRect(0, 2, 30, 9);
    ctx.fillStyle = '#5c7340';
    ctx.fillRect(1, 3, 28, 3);
    ctx.fillStyle = '#14111c';
    ctx.fillRect(28, 1, 6, 11);
    ctx.fillRect(10, 10, 5, 4);
    ctx.fillStyle = '#ff4f4f';
    ctx.fillRect(30, 4, 3, 5);
  });

  add(scene, 'gun-railgun', 38, 14, (ctx) => {
    ctx.fillStyle = '#14111c';
    ctx.fillRect(0, 3, 34, 8);
    ctx.fillRect(5, 9, 5, 5);
    ctx.fillStyle = '#d7dbe8';
    ctx.fillRect(10, 1, 26, 3);
    ctx.fillRect(10, 10, 26, 3);
    ctx.fillStyle = '#ff4fd8';
    for (let x = 12; x < 34; x += 5) ctx.fillRect(x, 5, 3, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(34, 6, 4, 2);
  });

  for (const item of ['boomstick', 'bombs', 'smg', 'rockets', 'railgun', 'shield', 'heal'] as const) {
    add(scene, `icon-${item}`, 32, 32, (ctx) => drawIcon(ctx, item));
  }
  add(scene, 'icon-pistol', 32, 32, (ctx) => drawIcon(ctx, 'pistol'));
}

function drawBomb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#1a1622';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4b4560';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b6680';
  ctx.fillRect(x - 2, y - r - 3, 4, 4);
  ctx.strokeStyle = '#c9a36a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - r - 2);
  ctx.quadraticCurveTo(x + 3, y - r - 6, x + 5, y - r - 5);
  ctx.stroke();
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(x + 4, y - r - 7, 3, 3);
}

function drawCrate(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(0, 0, 28, 28);
  ctx.fillStyle = '#b8742f';
  ctx.fillRect(2, 2, 24, 24);
  ctx.fillStyle = '#9a5e24';
  for (const y of [8, 15, 22]) ctx.fillRect(2, y, 24, 2);
  ctx.fillStyle = '#d9934a';
  ctx.fillRect(2, 2, 24, 3);
  ctx.fillStyle = '#c9cbd6';
  for (const [x, y] of [[1, 1], [23, 1], [1, 23], [23, 23]]) ctx.fillRect(x, y, 4, 4);
  // glowing "?" badge
  ctx.fillStyle = '#fff3a8';
  ctx.beginPath();
  ctx.arc(14, 14, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a2c0e';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 14, 15);
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  item: 'boomstick' | 'bombs' | 'smg' | 'rockets' | 'railgun' | 'shield' | 'heal' | 'pistol'
): void {
  if (item === 'smg') {
    ctx.fillStyle = '#14111c';
    ctx.fillRect(3, 9, 24, 8);
    ctx.fillRect(7, 16, 5, 10);
    ctx.fillRect(16, 16, 5, 9);
    ctx.fillStyle = '#3df2ff';
    ctx.fillRect(4, 10, 22, 3);
    ctx.fillStyle = '#5d6275';
    ctx.fillRect(26, 11, 5, 3);
    return;
  }
  if (item === 'rockets') {
    ctx.save();
    ctx.translate(16, 16);
    ctx.rotate(-0.6);
    ctx.fillStyle = '#7a8094';
    ctx.fillRect(-11, -4, 16, 8);
    ctx.fillStyle = '#ff4f4f';
    ctx.beginPath();
    ctx.moveTo(5, -5);
    ctx.lineTo(14, 0);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-13, -8, 6, 4);
    ctx.fillRect(-13, 4, 6, 4);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(-15, -2, 4, 4);
    ctx.restore();
    return;
  }
  if (item === 'railgun') {
    ctx.save();
    ctx.translate(16, 16);
    ctx.rotate(-0.45);
    ctx.fillStyle = '#14111c';
    ctx.fillRect(-15, -5, 26, 10);
    ctx.fillStyle = '#d7dbe8';
    ctx.fillRect(-8, -8, 24, 3);
    ctx.fillRect(-8, 5, 24, 3);
    ctx.fillStyle = '#ff4fd8';
    for (let x = -6; x < 12; x += 5) ctx.fillRect(x, -3, 3, 6);
    ctx.restore();
    return;
  }
  if (item === 'bombs') {
    drawBomb(ctx, 15, 19, 10);
  } else if (item === 'shield') {
    ctx.fillStyle = '#1b6fd1';
    ctx.beginPath();
    ctx.moveTo(16, 3);
    ctx.lineTo(28, 7);
    ctx.quadraticCurveTo(27, 22, 16, 30);
    ctx.quadraticCurveTo(5, 22, 4, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7fd3ff';
    ctx.beginPath();
    ctx.moveTo(16, 7);
    ctx.lineTo(24, 10);
    ctx.quadraticCurveTo(23, 20, 16, 25);
    ctx.closePath();
    ctx.fill();
  } else if (item === 'heal') {
    ctx.fillStyle = '#ff4f7b';
    ctx.beginPath();
    ctx.moveTo(16, 28);
    ctx.bezierCurveTo(2, 18, 3, 6, 10, 6);
    ctx.bezierCurveTo(14, 6, 16, 10, 16, 11);
    ctx.bezierCurveTo(16, 10, 18, 6, 22, 6);
    ctx.bezierCurveTo(29, 6, 30, 18, 16, 28);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(14, 11, 4, 11);
    ctx.fillRect(10, 15, 12, 4);
  } else if (item === 'boomstick') {
    ctx.save();
    ctx.translate(16, 16);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#7a4520';
    ctx.fillRect(-14, -2, 11, 8);
    ctx.fillStyle = '#2a2a36';
    ctx.fillRect(-5, -4, 19, 7);
    ctx.fillStyle = '#9aa0b5';
    ctx.fillRect(-4, -3, 17, 2);
    ctx.restore();
  } else {
    // pistol: slide, barrel, angled grip, trigger guard
    ctx.fillStyle = '#14111c';
    ctx.fillRect(4, 8, 24, 9);
    ctx.beginPath();
    ctx.moveTo(6, 15);
    ctx.lineTo(14, 15);
    ctx.lineTo(12, 28);
    ctx.lineTo(4, 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8d93a8';
    ctx.fillRect(5, 9, 22, 3);
    ctx.fillStyle = '#5d6275';
    ctx.fillRect(5, 12, 22, 3);
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(7, 18, 5, 8);
    ctx.strokeStyle = '#14111c';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 16, 6, 5);
  }
}
