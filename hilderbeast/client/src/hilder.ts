/**
 * Hilder herself: the Hilder Beast, as SVG. Bunny ears that glow, a mop of hair going purple,
 * yellow eyes and a roar, in her big white beach shirt with a life-size bikini body printed on the
 * front (the bikini in her player's colour), furry arms and legs, and flip-flops. The game draws
 * her on the canvas from an image made of this; the catch cutscene shows her from the waist up.
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

/** The box the whole of her sits in, the middle of it across, and where the soles of her feet are. */
export const HILDER_BOX = { x: -10, y: -30, w: 220, h: 400, cx: 100, feet: 368 };
/** Head to waist, for the cutscene. */
const BUST_BOX = { x: -4, y: -30, w: 208, h: 266 };

const PAPER = '#fbfaf6';
const CREASE = '#dcd6ca';
const PRINT_SKIN = '#f2b892';
const PRINT_LINE = '#5a2e1a';
const HEM = 318;

export type HilderLook = {
  /** The printed bikini: in the game, the colour of the player who is this Beast. */
  top?: string;
  /** Boosting or dashing: the eyes go red. */
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
  const suit = look.top ?? '#ff5db1';
  const iris = look.angry ? '#ff3b4e' : '#ffd23f';
  const white = look.angry ? '#ffd0d0' : '#fff3b0';
  const flip = (s: string): string => `<g transform="translate(200 0) scale(-1 1)">${s}</g>`;

  // furry legs in flip-flops, under the hem
  const leg = `<path d="M72 ${HEM - 6}L74 350Q83 355 92 350L94 ${HEM - 6}Z" fill="${HAIR}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>
    <path d="${cloud(83, 349, 11, 5, 8, 3)}" fill="${HAIR_LIGHT}" stroke="${INK}" stroke-width="${w * 0.6}"/>
    <ellipse cx="82" cy="365" rx="17" ry="5" fill="#ff5d8f" stroke="${INK}" stroke-width="${w * 0.6}"/>
    <path d="M68 357Q68 351 82 351Q97 351 97 358Q97 364 82 364Q68 364 68 357Z" fill="${HAIR}" stroke="${INK}" stroke-width="${w * 0.75}"/>
    <path d="M72 356Q82 350 92 356" fill="none" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/>
    ${small ? '' : `<path d="M70 363l-4 4l6 -1M77 364l-2 5l5 -4M84 364l0 5l3 -5" fill="#fff" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`}`;
  const legs = leg + flip(leg);

  // furry arms hanging out of the sleeves, ending in clawed paws
  const armPath = 'M32 212L28 252L34 286';
  const arm = `<path d="${armPath}" fill="none" stroke="${INK}" stroke-width="${16 + w * 2}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${armPath}" fill="none" stroke="${HAIR}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 300l-3 7l5 -3M35 301l0 8l3 -7M40 299l3 7l-1 -7" fill="#fff" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="35" cy="292" r="9" fill="${HAIR}" stroke="${INK}" stroke-width="${w * 0.75}"/>
    ${small ? '' : `<path d="${cloud(35, 292, 6, 6, 6, 1.5)}" fill="none" stroke="${HAIR_LIGHT}" stroke-width="1.4"/>`}`;
  const arms = arm + flip(arm);

  // the big white tee
  const tee = `<path d="M60 164Q40 168 28 192L18 222L46 231L42 ${HEM}Q100 ${HEM + 12} 158 ${HEM}L154 231L182 222L172 192Q160 168 140 164Q100 176 60 164Z" fill="${PAPER}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>
    ${small ? '' : `<path d="M21 213L47 222M179 213L153 222" stroke="${INK}" stroke-width="1.4" opacity=".4"/>
    <path d="M30 200Q36 206 44 206M170 200Q164 206 156 206" fill="none" stroke="${CREASE}" stroke-width="2.4" stroke-linecap="round"/>`}`;

  // and the body printed on it, lined up with hers
  const ln = `stroke="${PRINT_LINE}" stroke-width="${small ? 2.6 : 1.8}" stroke-linejoin="round"`;
  const torso = `M56 170Q100 186 144 170Q151 177 148 191Q142 206 140 222Q136 240 138 252Q146 268 145 290L144 ${HEM - 2}Q124 ${HEM + 3} 102 ${HEM + 3}L100 296L98 ${HEM + 3}Q76 ${HEM + 3} 56 ${HEM - 2}L55 290Q54 268 62 252Q64 240 60 222Q58 206 52 191Q49 177 56 170Z`;
  const printArm = `<path d="M51 180Q43 190 45 214L48 262Q53 267 58 262L58 214Q58 196 57 186Z" fill="${PRINT_SKIN}" ${ln}/>`;
  const cup = `<path d="M66 200Q80 192 97 204Q99 214 96 222Q80 228 68 220Q64 210 66 200Z" fill="${suit}" ${ln}/>`;
  const printed = `<path d="${torso}" fill="${PRINT_SKIN}" ${ln}/>
    ${small ? '' : `<path d="M78 186Q86 191 94 189M122 186Q114 191 106 189" fill="none" stroke="${PRINT_LINE}" stroke-width="1.2" opacity=".5"/>`}
    <path d="M99 244q1 3 2 0" fill="none" stroke="${PRINT_LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M58 258Q100 266 142 258L138 268Q112 276 103 297L97 297Q88 276 62 268Z" fill="${suit}" ${ln}/>
    <path d="M72 197L62 172M128 197L138 172M67 212L54 216M133 212L146 216" stroke="${suit}" stroke-width="2.4" stroke-linecap="round"/>
    ${cup}${flip(cup)}
    <path d="M100 207l-7 -5l1 9zM100 207l7 -5l-1 9z" fill="${suit}" ${ln}/>
    ${printArm}${flip(printArm)}`;

  const collar = `<path d="M74 164Q100 186 126 164" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M74 164Q100 186 126 164" fill="none" stroke="#eeeae0" stroke-width="6" stroke-linecap="round"/>`;
  const body = legs + arms + tee + printed + collar;

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

  return body + ear(74, -20) + ear(126, 20) + hair + face + fringe + headband + eyes + mouth;
}

/** The drawing as an SVG document, `px` pixels wide: the whole of her, or (`bust`) head to waist. */
export function hilderSvg(look: HilderLook = {}, px = 220, bust = false): string {
  const b = bust ? BUST_BOX : HILDER_BOX;
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
