/**
 * Hilder herself: the Hilder Beast's face, as SVG. Bunny ears that glow, fairy wings, a mop of
 * hair going purple, yellow eyes and a roar. The game draws her on the canvas from an image made
 * of this; the cover and the join screen use the same drawing.
 */

const INK = '#1f1a2e';
const HAIR = '#b9a3c9';
const HAIR_LIGHT = '#e6d9f2';
const HAIR_DARK = '#6b4f8f';
const SKIN = '#f3c4a6';
const BLUSH = '#f08c8c';
const LIP = '#d8213c';
const EAR = '#f6b6cf';
const GLOW = '#b9ffcf';

/** The box the drawing sits in, and the point in it that is the middle of her head. */
export const HILDER_BOX = { x: -6, y: -30, w: 212, h: 236, cx: 100, cy: 112 };

export type HilderLook = {
  /** Her top: in the game, the colour of the player who is this Beast. */
  top?: string;
  /** Rearing back to lunge: the eyes go red. */
  angry?: boolean;
  /** For the size she is in the game: thicker lines and none of the fine detail. */
  small?: boolean;
};

/** A fluffy outline: bumps round an ellipse. */
function cloud(cx: number, cy: number, rx: number, ry: number, n: number, amp: number, a0 = 0, a1 = Math.PI * 2, close = true): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) {
      d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      continue;
    }
    const m = a - (a1 - a0) / n / 2;
    d += `Q${(cx + Math.cos(m) * (rx + amp)).toFixed(1)} ${(cy + Math.sin(m) * (ry + amp)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + (close ? 'Z' : '');
}

/** What goes inside the `<svg>`: everything but the wrapper. */
export function hilderParts(look: HilderLook = {}): string {
  const small = !!look.small;
  const w = small ? 5.5 : 3.2;
  const top = look.top ?? '#5b3f8f';
  const iris = look.angry ? '#ff3b4e' : '#ffd23f';
  const white = look.angry ? '#ffd0d0' : '#fff3b0';

  const wing = (s: number): string => `<g transform="translate(100 0) scale(${s} 1)">
    <ellipse cx="62" cy="120" rx="30" ry="22" fill="#ffd9ea" opacity=".8" stroke="${INK}" stroke-width="${w * 0.7}" transform="rotate(-25 62 120)"/>
    <ellipse cx="58" cy="158" rx="22" ry="16" fill="#ffd9ea" opacity=".8" stroke="${INK}" stroke-width="${w * 0.7}" transform="rotate(20 58 158)"/>
    ${small ? '' : '<path d="M56 122a8 8 0 1 1 8 -8a5 5 0 1 1 -5 5" fill="none" stroke="#f08cb4" stroke-width="1.6"/>'}</g>`;

  const body = `<path d="M34 204C36 170 62 156 100 156C138 156 164 170 166 204Z" fill="${top}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;

  const sequins = [[-4, -22], [4, -30], [-3, -40], [3, -50], [0, -58], [5, -16], [-6, -33]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#fff" opacity=".9"/>`).join('');
  const ear = (x: number, rot: number): string => `<g transform="translate(${x} 60) rotate(${rot})">
    <path d="M-5 0C-20 -22 -17 -62 0 -78C17 -62 20 -22 5 0Z" fill="${EAR}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>
    <path d="M-1 -10C-11 -28 -9 -52 0 -66C9 -52 11 -28 1 -10Z" fill="${GLOW}"/>${small ? '' : sequins}</g>`;

  const hair = `<path d="${cloud(100, 108, 58, 58, 13, 9)}" fill="${HAIR}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;

  const face = `<path d="M58 108C58 84 76 76 100 76C124 76 142 84 142 108C142 140 126 162 100 162C74 162 58 140 58 108Z" fill="${SKIN}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>
    <ellipse cx="72" cy="128" rx="10" ry="7" fill="${BLUSH}" opacity=".55"/><ellipse cx="128" cy="128" rx="10" ry="7" fill="${BLUSH}" opacity=".55"/>
    ${small ? '' : `<path d="M57 138l-3 12l6 0z" fill="#e9c46a" stroke="${INK}" stroke-width="1.5"/><path d="M143 138l-3 12l6 0z" fill="#e9c46a" stroke="${INK}" stroke-width="1.5"/>
    <path d="M96 118Q92 130 98 132Q104 133 106 128" fill="none" stroke="${INK}" stroke-width="${w * 0.7}" stroke-linecap="round" opacity=".7"/>`}`;

  const strands = `<g fill="none" stroke-linecap="round" stroke-width="2.2">
    <path d="M78 70Q72 82 74 92" stroke="${HAIR_LIGHT}"/><path d="M92 66Q88 78 91 90" stroke="${HAIR_LIGHT}"/>
    <path d="M108 66Q110 78 107 88" stroke="${HAIR_LIGHT}"/><path d="M122 70Q128 80 124 90" stroke="${HAIR_LIGHT}"/>
    <path d="M100 64Q98 74 100 86" stroke="${HAIR_DARK}" opacity=".6"/><path d="M132 78Q138 88 136 96" stroke="${HAIR_DARK}" opacity=".6"/>
    <path d="M52 110Q46 124 52 140" stroke="${HAIR_LIGHT}"/><path d="M148 110Q154 124 148 140" stroke="${HAIR_LIGHT}"/>
    <path d="M48 120Q44 132 50 150" stroke="${HAIR_DARK}" opacity=".6"/><path d="M152 122Q156 134 150 150" stroke="${HAIR_DARK}" opacity=".6"/></g>`;
  const fringe = `<path d="M58 104C54 78 74 60 100 60C128 60 146 78 142 104C136 92 128 86 122 96C118 84 110 82 106 94C100 82 92 84 90 96C84 84 74 88 72 98C66 92 60 96 58 104Z" fill="${HAIR}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>${small ? '' : strands}`;

  const headband = `<path d="M58 78Q100 38 142 78" fill="none" stroke="${EAR}" stroke-width="9" stroke-linecap="round"/>
    ${small ? '' : `<path d="${cloud(100, 57, 16, 6, 7, 3, Math.PI, Math.PI * 2, false)}" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>`}`;

  const eye = (cx: number, px: number): string => `<ellipse cx="${cx}" cy="107" rx="15" ry="11" fill="#5b3f6b" opacity=".35"/>
    <ellipse cx="${cx}" cy="108" rx="${small ? 13 : 11}" ry="${small ? 10 : 8}" fill="${white}" stroke="${INK}" stroke-width="${w * 0.8}"/>
    <circle cx="${cx + px}" cy="109" r="${small ? 6.5 : 5}" fill="${iris}"/><circle cx="${cx + px}" cy="109" r="${small ? 3 : 2.5}" fill="${INK}"/>`;
  const eyes = `${eye(80, 2)}${eye(120, -2)}
    ${small ? '' : `<path d="M67 104Q80 98 93 106L93 100Q80 92 67 98Z" fill="${INK}"/><path d="M133 104Q120 98 107 106L107 100Q120 92 133 98Z" fill="${INK}"/>`}
    <path d="M64 ${small ? 90 : 92}L94 100" stroke="${INK}" stroke-width="${w * 1.6}" stroke-linecap="round"/><path d="M136 ${small ? 90 : 92}L106 100" stroke="${INK}" stroke-width="${w * 1.6}" stroke-linecap="round"/>`;

  const mouth = `<path d="M78 136Q100 128 122 136Q124 162 100 162Q76 162 78 136Z" fill="#5a0f1e" stroke="${LIP}" stroke-width="${small ? 6 : 4.5}" stroke-linejoin="round"/>
    <path d="M82 137l5 10l5 -9l5 9l4 -10l4 10l5 -9l5 9l4 -10" fill="#fff" stroke="${INK}" stroke-width="1"/>
    ${small ? '' : `<path d="M86 156l5 -8l5 7l4 -8l4 8l5 -7l5 8" fill="#fff" stroke="${INK}" stroke-width="1"/><ellipse cx="100" cy="155" rx="9" ry="4" fill="#e05a6f"/>`}`;

  return wing(1) + wing(-1) + body + ear(74, -20) + ear(126, 20) + hair + face + fringe + headband + eyes + mouth;
}

/** The whole drawing as an SVG document, `px` pixels wide. */
export function hilderSvg(look: HilderLook = {}, px = 212): string {
  const b = HILDER_BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${px}" height="${Math.round((px * b.h) / b.w)}">${hilderParts(look)}</svg>`;
}

// ---- for the canvas

const sprites = new Map<string, HTMLImageElement>();
const waiting: (() => void)[] = [];

/** Call `fn` once whenever a sprite that was asked for has finished loading. */
export function onHilderReady(fn: () => void): void {
  waiting.push(fn);
}

/**
 * Hilder as an image for `drawImage`, in this top colour. Made on first use; null until it has
 * loaded (a frame or two later).
 */
export function hilderSprite(top: string, angry: boolean): HTMLImageElement | null {
  const key = `${top}:${angry ? 1 : 0}`;
  let img = sprites.get(key);
  if (!img) {
    img = new Image();
    img.onload = () => waiting.forEach((fn) => fn());
    // big enough to stay sharp on a dense screen with the camera close
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hilderSvg({ top, angry, small: true }, 300))}`;
    sprites.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
