/** Everything on the floor of the house, drawn in code. */
import { BODY_R, F_BEAST, F_BOOST, F_CONVERT, F_DASH, F_GHOST, F_HELD, F_HURT, F_SCARE_SHIFT, F_WORK, SCARE_MAX, TILE } from '../../shared/src/constants';
import { SPIKES_UP, SPIKES_WARN, T_CREAK, T_FLOOR, T_GOO, T_SPIKE, T_WALL, spikesAt, type GameMap } from '../../shared/src/map';
import { HILDER_BOX, hilderSprite } from './hilder';

export const INK = '#120f1c';
export const NIGHT = '#0c0a14';
const PAPER = '#f4ecd8';
type Ctx = CanvasRenderingContext2D;

/**
 * The part of the map between these world coordinates: floors, room names, traps, walls.
 * `timeMs` is how far into the round we are, which is what the spikes go by.
 */
export function drawHouse(c: Ctx, map: GameMap, x0: number, y0: number, x1: number, y1: number, timeMs: number, now: number): void {
  const look = map.look;
  c.fillStyle = INK;
  c.fillRect(0, 0, map.w, map.h);
  map.rooms.forEach((room, i) => {
    const rx = (room.x0 - 0.5) * TILE;
    const ry = (room.y0 - 0.5) * TILE;
    const rw = (room.x1 - room.x0 + 2) * TILE;
    const rh = (room.y1 - room.y0 + 2) * TILE;
    if (rx > x1 || ry > y1 || rx + rw < x0 || ry + rh < y0) return;
    c.fillStyle = look.floors[i % look.floors.length];
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
    // a name only where there is room to read it
    if (room.x1 - room.x0 < 7) return;
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
      const kind = map.kind[r * map.cols + col];
      const x = col * TILE;
      const y = r * TILE;
      if (kind === T_WALL) continue;
      if (kind === T_GOO) drawGoo(c, x, y, col, r, now);
      else if (kind === T_SPIKE) drawSpikes(c, x, y, spikesAt(timeMs, col, r));
      else if (kind === T_CREAK) drawCreak(c, x, y);
    }
  }
  // the walls, over everything on the floor: thin bars with a dark edge. Every piece's edge is
  // laid down first and every piece's face over them all, so the joins between pieces do not show.
  for (const edge of [true, false]) {
    c.fillStyle = edge ? look.wall : look.wallTop;
    const grow = edge ? 2 : 0.3;
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        for (const [wx0, wy0, wx1, wy1] of map.walls[r * map.cols + col]) c.fillRect(wx0 - grow, wy0 - grow, wx1 - wx0 + grow * 2, wy1 - wy0 + grow * 2);
      }
    }
  }
}

/** Goo: a sticky green pool that slows a Cousin down. */
function drawGoo(c: Ctx, x: number, y: number, col: number, r: number, now: number): void {
  c.fillStyle = '#4f8f2f';
  c.beginPath();
  c.roundRect(x + 1, y + 1, TILE - 2, TILE - 2, 9);
  c.fill();
  c.fillStyle = '#8fd94a';
  for (let i = 0; i < 3; i++) {
    const a = now / 700 + col * 2.1 + r * 1.3 + i * 2.2;
    c.beginPath();
    c.arc(x + TILE / 2 + Math.cos(a) * 9, y + TILE / 2 + Math.sin(a * 1.3) * 9, 3 + ((i + col + r) % 3), 0, Math.PI * 2);
    c.fill();
  }
}

/** Spikes: holes in a plate when down, an amber plate when about to rise, steel points when up. */
function drawSpikes(c: Ctx, x: number, y: number, state: number): void {
  c.fillStyle = state === SPIKES_WARN ? '#b9772a' : '#3b3a44';
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 4);
  c.fill();
  c.stroke();
  for (let i = 0; i < 9; i++) {
    const px = x + 10 + (i % 3) * 10;
    const py = y + 12 + Math.floor(i / 3) * 10;
    if (state === SPIKES_UP) {
      c.fillStyle = '#e8ecf4';
      c.beginPath();
      c.moveTo(px - 4, py + 3);
      c.lineTo(px, py - 9);
      c.lineTo(px + 4, py + 3);
      c.closePath();
      c.fill();
      c.stroke();
    } else {
      c.fillStyle = state === SPIKES_WARN ? '#ffd23f' : '#15141c';
      c.beginPath();
      c.arc(px, py, state === SPIKES_WARN ? 2.6 : 2, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/** A creaky board: a pale, cracked plank. Easy to miss in a hurry. */
function drawCreak(c: Ctx, x: number, y: number): void {
  c.fillStyle = 'rgba(244,236,216,0.2)';
  c.fillRect(x + 2, y + 6, TILE - 4, TILE - 12);
  c.strokeStyle = 'rgba(18,15,28,0.65)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x + 6, y + 14);
  c.lineTo(x + 15, y + 19);
  c.lineTo(x + 22, y + 15);
  c.lineTo(x + 33, y + 24);
  c.moveTo(x + 15, y + 19);
  c.lineTo(x + 13, y + 28);
  c.stroke();
}

/** The whole map as a small picture, `px` pixels to the square: walls and traps. For the minimap and the lobby. */
export function mapPicture(map: GameMap, px: number): HTMLCanvasElement {
  const pic = document.createElement('canvas');
  pic.width = map.cols * px;
  pic.height = map.lines * px;
  const m = pic.getContext('2d')!;
  m.fillStyle = 'rgba(244,236,216,0.16)';
  m.fillRect(0, 0, pic.width, pic.height);
  for (let r = 0; r < map.lines; r++) {
    for (let col = 0; col < map.cols; col++) {
      const kind = map.kind[r * map.cols + col];
      if (kind === T_WALL) {
        // the bars themselves, to scale, and never too thin to see
        m.fillStyle = 'rgba(12,10,20,0.9)';
        const k = px / TILE;
        for (const [x0, y0, x1, y1] of map.walls[r * map.cols + col]) m.fillRect(x0 * k, y0 * k, Math.max(1.5, (x1 - x0) * k), Math.max(1.5, (y1 - y0) * k));
        continue;
      }
      if (kind === T_FLOOR) continue;
      m.fillStyle = kind === T_GOO ? '#6fb93a' : kind === T_SPIKE ? '#ff5d73' : 'rgba(244,236,216,0.45)';
      m.fillRect(col * px, r * px, px, px);
    }
  }
  return pic;
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
  // cranking a chore, or hopping about after the spikes
  const bob = flags & F_WORK ? Math.sin(t / 60) * 1.5 : flags & F_HURT ? -Math.abs(Math.sin(t / 90)) * 4 : 0;
  // a Beast is near: a shiver, quicker and wider the nearer it is. Only the drawing shakes; they are where they are
  const scare = (flags >> F_SCARE_SHIFT) & SCARE_MAX;
  const shiver = scare ? Math.sin(t / (26 - scare * 4) + x) * (0.5 + scare * 0.55) : 0;
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
  c.translate(x + shiver, y + bob + (scare ? Math.cos(t / 19 + y) * scare * 0.25 : 0));
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
  if (scare) {
    // a wobbly little mouth, and from the second fright on, beads of sweat
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-r * 0.28, r * 0.42);
    for (let i = 1; i <= 4; i++) c.lineTo(-r * 0.28 + i * r * 0.14, r * 0.42 + (i % 2 ? -1 : 1) * r * 0.07);
    c.stroke();
    if (scare >= 2) {
      c.fillStyle = '#9fdcff';
      for (let i = 0; i < scare - 1; i++) {
        const fall = ((t / 500 + i * 0.5) % 1) * r * 0.7;
        c.beginPath();
        c.ellipse((i ? -1 : 1) * r * 0.95, -r * 0.5 + fall, r * 0.09, r * 0.15, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    }
  }
  c.restore();
}

/** How tall Hilder is drawn, in world units: her head is about as wide as a Cousin and a half. */
const HILDER_H = 74;
const HILDER_W = (HILDER_H * HILDER_BOX.w) / HILDER_BOX.h;
/** Where the middle of her head is in the drawing, as a share of its width and height. */
const HEAD_X = (HILDER_BOX.cx - HILDER_BOX.x) / HILDER_BOX.w;
const HEAD_Y = (HILDER_BOX.cy - HILDER_BOX.y) / HILDER_BOX.h;

/** A Hilder Beast: Hilder herself (`hilder.ts`), wearing her player's colour as her top. */
export function drawBeast(c: Ctx, x: number, y: number, color: string, facing: number, flags: number, t: number): void {
  const r = BODY_R * 1.45;
  const lx = Math.cos(facing);
  const ly = Math.sin(facing);
  shadow(c, x, y + 8, r);
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
  // leaning the way she is going, and bigger in a dash
  c.rotate(lx * 0.1 + Math.sin(t / 160) * 0.03);
  if (flags & F_DASH) c.scale(1.12, 1.12);
  if (flags & (F_HELD | F_CONVERT)) c.globalAlpha = 0.75;
  const img = hilderSprite(color, (flags & (F_BOOST | F_DASH)) !== 0);
  if (img) c.drawImage(img, -HILDER_W * HEAD_X, -4 - HILDER_H * HEAD_Y, HILDER_W, HILDER_H);
  else {
    // the frame or two before her picture is ready
    c.fillStyle = '#b9a3c9';
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}

/** A caught Cousin's ghost: a pale sheet with a wavy hem, still wearing its bobble in the player's colour. */
export function drawGhost(c: Ctx, x: number, y: number, color: string, facing: number, t: number): void {
  const r = BODY_R * 1.15;
  const lx = Math.cos(facing);
  const ly = Math.sin(facing);
  c.save();
  c.translate(x, y + Math.sin(t / 420 + x) * 2.5);
  c.globalAlpha = 0.72;
  c.fillStyle = '#eef0ff';
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(0, -r * 0.1, r, Math.PI, 0);
  c.lineTo(r, r * 0.95);
  // the hem ripples
  for (let i = 0; i < 4; i++) {
    const x0 = r - (i * r) / 2;
    c.quadraticCurveTo(x0 - r / 4, r * (0.55 + 0.12 * Math.sin(t / 160 + i)), x0 - r / 2, r * 0.95);
  }
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.arc(0, -r * 1.2, r * 0.24, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = INK;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(side * r * 0.36 + lx * r * 0.15, -r * 0.15 + ly * r * 0.15, r * 0.14, r * 0.22, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.ellipse(lx * r * 0.15, r * 0.3 + ly * r * 0.1, r * 0.13, r * 0.17, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Whichever the flags say this body is. A Cousin turning into a Beast flickers between the two. */
export function drawBody(c: Ctx, x: number, y: number, color: string, facing: number, flags: number, t: number): void {
  if (flags & F_GHOST) return drawGhost(c, x, y, color, facing, t);
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

/** A pair of Beast doors shares a colour and a number: red 1, blue 2, green 3. Go in one, come out of its twin. */
export const PORTAL_COLORS = [
  { deep: '#8f1f2d', bright: '#ff5d73' },
  { deep: '#1f4f9f', bright: '#5aa9ff' },
  { deep: '#1f7a3a', bright: '#4fe07f' },
];

/**
 * One end of a Beast door: a swirl in the floor, in its pair's colour and with its pair's
 * number (so the pairs can be told apart without the colours). Brighter for a moment when a
 * Beast comes through. `pair` is 0, 1 or 2.
 */
export function drawPortal(c: Ctx, x: number, y: number, t: number, flare: number, pair: number): void {
  const look = PORTAL_COLORS[pair % PORTAL_COLORS.length];
  c.save();
  c.translate(x, y);
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 22);
  g.addColorStop(0, flare > 0 ? '#ffffff' : '#0c0a14');
  g.addColorStop(0.6, look.deep);
  g.addColorStop(1, 'rgba(12,10,20,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 22 + flare * 14, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = look.bright;
  c.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const a = t / 500 + (i * Math.PI * 2) / 3;
    c.beginPath();
    c.arc(0, 0, 10 + i * 3.5, a, a + 1.8);
    c.stroke();
  }
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.strokeText(String(pair + 1), 0, 1);
  c.fillStyle = '#fff';
  c.fillText(String(pair + 1), 0, 1);
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
