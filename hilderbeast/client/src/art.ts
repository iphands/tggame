/** Everything on the floor of the house, drawn in code. */
import { BODY_R, F_BEAST, F_BOOST, F_CONVERT, F_DASH, F_HELD, F_MISS, F_WINDUP, F_WORK, TILE } from '../../shared/src/constants';
import { wallAt, type GameMap } from '../../shared/src/map';

export const INK = '#120f1c';
export const NIGHT = '#0c0a14';
const PAPER = '#f4ecd8';
/** One floor colour per room, so a room is known at a glance. */
const FLOORS = ['#5a4a3a', '#4b4458', '#5b4a55', '#4a4f47', '#5f5540', '#57424a', '#3d3f52', '#4f5a4c', '#46584f'];
const WALL = '#2a2440';
const WALL_TOP = '#544a78';

type Ctx = CanvasRenderingContext2D;

/** The part of the house between these world coordinates: floors, room names, walls. */
export function drawHouse(c: Ctx, map: GameMap, x0: number, y0: number, x1: number, y1: number): void {
  c.fillStyle = INK;
  c.fillRect(0, 0, map.w, map.h);
  map.rooms.forEach((room, i) => {
    const rx = (room.x0 - 0.5) * TILE;
    const ry = (room.y0 - 0.5) * TILE;
    const rw = (room.x1 - room.x0 + 2) * TILE;
    const rh = (room.y1 - room.y0 + 2) * TILE;
    if (rx > x1 || ry > y1 || rx + rw < x0 || ry + rh < y0) return;
    c.fillStyle = FLOORS[i % FLOORS.length];
    c.fillRect(rx, ry, rw, rh);
    // floorboards
    c.strokeStyle = 'rgba(0,0,0,0.16)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let y = ry + TILE; y < ry + rh; y += TILE) {
      c.moveTo(rx, y);
      c.lineTo(rx + rw, y);
    }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.font = `${TILE * 1.1}px Chewy, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(room.name, rx + rw / 2, ry + rh / 2);
  });
  const c0 = Math.max(0, Math.floor(x0 / TILE));
  const c1 = Math.min(map.cols - 1, Math.floor(x1 / TILE));
  const r0 = Math.max(0, Math.floor(y0 / TILE));
  const r1 = Math.min(map.lines - 1, Math.floor(y1 / TILE));
  for (let r = r0; r <= r1; r++) {
    for (let col = c0; col <= c1; col++) {
      if (!wallAt(map, col, r)) continue;
      c.fillStyle = WALL;
      c.fillRect(col * TILE, r * TILE, TILE + 0.5, TILE + 0.5);
      c.fillStyle = WALL_TOP;
      c.fillRect(col * TILE + 3, r * TILE + 3, TILE - 6, TILE - 10);
    }
  }
}

function shadow(c: Ctx, x: number, y: number, r: number): void {
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(x, y + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  c.fill();
}

function eyes(c: Ctx, r: number, lx: number, ly: number, white: string, pupil: string, slit: boolean): void {
  for (const side of [-1, 1]) {
    const ex = side * r * 0.38 + lx * r * 0.14;
    const ey = -r * 0.12 + ly * r * 0.14;
    c.fillStyle = white;
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(ex, ey, r * 0.27, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = pupil;
    c.beginPath();
    if (slit) c.ellipse(ex + lx * r * 0.1, ey + ly * r * 0.1, r * 0.07, r * 0.19, 0, 0, Math.PI * 2);
    else c.arc(ex + lx * r * 0.12, ey + ly * r * 0.12, r * 0.12, 0, Math.PI * 2);
    c.fill();
  }
}

/** A Cousin: a round little person in a knitted jumper and a bobble hat. `facing` in radians, `t` in ms. */
export function drawCousin(c: Ctx, x: number, y: number, color: string, facing: number, flags: number, t: number): void {
  const r = BODY_R * 1.15;
  const lx = Math.cos(facing);
  const ly = Math.sin(facing);
  const bob = flags & F_WORK ? Math.sin(t / 60) * 1.5 : 0;
  shadow(c, x, y, r);
  if (flags & F_BOOST) {
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    for (const o of [-0.5, 0, 0.5]) {
      c.moveTo(x - lx * r * 1.2 - ly * r * o, y - ly * r * 1.2 + lx * r * o);
      c.lineTo(x - lx * r * 2.1 - ly * r * o, y - ly * r * 2.1 + lx * r * o);
    }
    c.stroke();
  }
  c.save();
  c.translate(x, y + bob);
  c.fillStyle = color;
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // jumper stripes
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.22)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(-r, r * 0.35);
  c.lineTo(r, r * 0.35);
  c.moveTo(-r, r * 0.7);
  c.lineTo(r, r * 0.7);
  c.stroke();
  c.restore();
  // bobble hat
  c.fillStyle = PAPER;
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-r * 0.75, -r * 0.62);
  c.quadraticCurveTo(0, -r * 1.75, r * 0.75, -r * 0.62);
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.arc(0, -r * 1.3, r * 0.24, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.stroke();
  eyes(c, r, lx, ly, '#fff', INK, false);
  c.restore();
}

/** A Hilder Beast: shaggy, horned, and wearing its player's colour on its horns. */
export function drawBeast(c: Ctx, x: number, y: number, color: string, facing: number, flags: number, t: number): void {
  const r = BODY_R * 1.45;
  const lx = Math.cos(facing);
  const ly = Math.sin(facing);
  shadow(c, x, y, r);
  if (flags & (F_BOOST | F_DASH)) {
    c.strokeStyle = flags & F_DASH ? 'rgba(255,93,115,0.75)' : 'rgba(179,136,255,0.6)';
    c.lineWidth = 3;
    c.beginPath();
    for (const o of [-0.7, -0.25, 0.25, 0.7]) {
      c.moveTo(x - lx * r * 1.1 - ly * r * o, y - ly * r * 1.1 + lx * r * o);
      c.lineTo(x - lx * r * 2.4 - ly * r * o, y - ly * r * 2.4 + lx * r * o);
    }
    c.stroke();
  }
  c.save();
  c.translate(x, y);
  // rearing back before a lunge, slumped after a miss
  if (flags & F_WINDUP) {
    c.translate(-lx * 5, -ly * 5);
    c.scale(1.18, 1.18);
  } else if (flags & F_MISS) c.rotate(Math.sin(t / 50) * 0.18);
  if (flags & (F_HELD | F_CONVERT)) c.globalAlpha = 0.75;
  // horns
  c.fillStyle = color;
  c.strokeStyle = INK;
  c.lineWidth = 2;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(side * r * 0.35, -r * 0.7);
    c.lineTo(side * r * 1.05, -r * 1.55);
    c.lineTo(side * r * 0.85, -r * 0.45);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // shaggy fur: a ragged circle
  c.fillStyle = '#4b3577';
  c.lineWidth = 2.5;
  c.beginPath();
  const spikes = 14;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const wob = Math.sin(t / 130 + i * 1.7) * 0.05;
    const rr = r * (i % 2 ? 0.86 + wob : 1.08 - wob);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
  c.stroke();
  eyes(c, r, lx, ly, flags & F_WINDUP ? '#ff5d73' : '#ffd23f', INK, true);
  // a mouth full of teeth
  c.fillStyle = INK;
  c.beginPath();
  c.ellipse(lx * r * 0.1, r * 0.42 + ly * r * 0.08, r * 0.46, r * (flags & (F_WINDUP | F_DASH) ? 0.3 : 0.16), 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = PAPER;
  c.lineWidth = 1.5;
  c.beginPath();
  for (let i = -2; i <= 2; i++) {
    c.moveTo(i * r * 0.17 + lx * r * 0.1, r * 0.34 + ly * r * 0.08);
    c.lineTo(i * r * 0.17 + lx * r * 0.1, r * 0.44 + ly * r * 0.08);
  }
  c.stroke();
  c.restore();
}

/** Whichever the flags say this body is. A Cousin turning into a Beast flickers between the two. */
export function drawBody(c: Ctx, x: number, y: number, color: string, facing: number, flags: number, t: number): void {
  const turning = flags & F_CONVERT && Math.floor(t / 110) % 2 === 0;
  if (flags & F_BEAST && !turning) drawBeast(c, x, y, color, facing, flags, t);
  else drawCousin(c, x, y, color, facing, flags & ~F_BOOST, t);
}

export function drawPill(c: Ctx, x: number, y: number, t: number, there: boolean): void {
  c.save();
  c.translate(x, y + (there ? Math.sin(t / 300 + x) * 2 : 0));
  c.rotate(-0.5);
  c.globalAlpha = there ? 1 : 0.18;
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.fillStyle = PAPER;
  c.beginPath();
  c.roundRect(-11, -5.5, 22, 11, 5.5);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd23f';
  c.beginPath();
  c.roundRect(0, -5.5, 11, 11, [0, 5.5, 5.5, 0]);
  c.fill();
  c.stroke();
  c.restore();
}

/** One end of a Beast door: a dark swirl in the floor. Brighter for a moment when a Beast comes through. */
export function drawPortal(c: Ctx, x: number, y: number, t: number, flare: number): void {
  c.save();
  c.translate(x, y);
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 20);
  g.addColorStop(0, flare > 0 ? '#ffffff' : '#0c0a14');
  g.addColorStop(0.6, '#5b3f8f');
  g.addColorStop(1, 'rgba(91,63,143,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 20 + flare * 14, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(179,136,255,0.8)';
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = t / 500 + (i * Math.PI * 2) / 3;
    c.beginPath();
    c.arc(0, 0, 9 + i * 3, a, a + 1.8);
    c.stroke();
  }
  c.restore();
}

/** A chore: a crank on a box, with a ring that fills as it is worked. `progress` 0 to 100. */
export function drawTask(c: Ctx, x: number, y: number, progress: number, t: number, busy: boolean): void {
  const done = progress >= 100;
  c.save();
  c.translate(x, y);
  c.lineWidth = 2.5;
  c.strokeStyle = INK;
  c.fillStyle = done ? '#3ddc97' : '#c98b5b';
  c.beginPath();
  c.roundRect(-14, -14, 28, 28, 5);
  c.fill();
  c.stroke();
  if (done) {
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-7, 0);
    c.lineTo(-2, 6);
    c.lineTo(8, -6);
    c.stroke();
  } else {
    const a = busy ? t / 110 : 0.6;
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
    c.stroke();
    c.fillStyle = PAPER;
    c.beginPath();
    c.arc(Math.cos(a) * 9, Math.sin(a) * 9, 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, 22, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#ffd23f';
    c.beginPath();
    c.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/** A way out: barred until the chores are done, then glowing. */
export function drawExit(c: Ctx, x: number, y: number, open: boolean, t: number): void {
  c.save();
  c.translate(x, y);
  if (open) {
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 46);
    g.addColorStop(0, `rgba(61,220,151,${0.5 + 0.2 * Math.sin(t / 200)})`);
    g.addColorStop(1, 'rgba(61,220,151,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 46, 0, Math.PI * 2);
    c.fill();
  }
  c.lineWidth = 2.5;
  c.strokeStyle = INK;
  c.fillStyle = open ? '#3ddc97' : '#6b5a4a';
  c.beginPath();
  c.moveTo(-14, 16);
  c.lineTo(-14, -6);
  c.quadraticCurveTo(0, -24, 14, -6);
  c.lineTo(14, 16);
  c.closePath();
  c.fill();
  c.stroke();
  if (!open) {
    c.beginPath();
    for (const bx of [-7, 0, 7]) {
      c.moveTo(bx, -12);
      c.lineTo(bx, 16);
    }
    c.stroke();
  } else {
    c.fillStyle = INK;
    c.font = 'bold 11px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('EXIT', 0, 4);
  }
  c.restore();
}
