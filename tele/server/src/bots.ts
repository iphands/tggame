/** Doodlebots: terrible artists, worse guessers. They exist so a table is never short a player. */
import { INK, PAGE_H, PAGE_W } from '../../shared/src/constants.js';
import { BOT_ADJECTIVES, WORDS } from '../../shared/src/words.js';
import type { Drawing, Stroke } from '../../shared/src/types.js';

export type Rng = () => number;

export const BOT_NAMES = ['Scribbles', 'Inky', 'Smudge', 'Sketchy', 'Crayon', 'Blot', 'Squiggle', 'Doodlebot', 'Fineliner', 'Splotch', 'Stencil', 'Charcoal', 'Pastel', 'Highlighter', 'Etch', 'Dabble', 'Chalky', 'Quill'];

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const between = (rng: Rng, lo: number, hi: number): number => lo + rng() * (hi - lo);

export function botGuess(rng: Rng): string {
  const word = pick(rng, WORDS);
  return rng() < 0.35 ? `${pick(rng, BOT_ADJECTIVES)} ${word}` : word;
}

/** A confident, meaningless doodle: one "subject" plus a few flourishes. */
export function botDoodle(rng: Rng): Drawing {
  const out: Drawing = [];
  const colour = () => Math.floor(rng() * INK.length);
  const add = (pts: [number, number][], c: number, w: number) => out.push(stroke(rng, pts, c, w));
  const cx = between(rng, 380, 620);
  const cy = between(rng, 300, 450);
  const r = between(rng, 110, 190);
  const main = colour();

  switch (Math.floor(rng() * 5)) {
    case 0: // smiley
      add(arc(cx, cy, r, 0, Math.PI * 2.1), main, 11);
      add([[cx - r * 0.35, cy - r * 0.25]], 0, 24);
      add([[cx + r * 0.35, cy - r * 0.25]], 0, 24);
      add(arc(cx, cy + r * 0.05, r * 0.55, Math.PI * 0.15, Math.PI * 0.85), 0, 11);
      break;
    case 1: // stick figure
      add(arc(cx, cy - r, r * 0.4, 0, Math.PI * 2.1), main, 11);
      add([[cx, cy - r * 0.6], [cx, cy + r * 0.5]], main, 11);
      add([[cx - r * 0.7, cy - r * 0.1], [cx, cy - r * 0.3], [cx + r * 0.7, cy - r * 0.5]], main, 11);
      add([[cx - r * 0.5, cy + r * 1.3], [cx, cy + r * 0.5], [cx + r * 0.5, cy + r * 1.3]], main, 11);
      break;
    case 2: // house
      add([[cx - r, cy + r], [cx - r, cy - r * 0.2], [cx + r, cy - r * 0.2], [cx + r, cy + r], [cx - r, cy + r]], main, 11);
      add([[cx - r * 1.2, cy - r * 0.2], [cx, cy - r * 1.2], [cx + r * 1.2, cy - r * 0.2]], colour(), 11);
      add([[cx - r * 0.2, cy + r], [cx - r * 0.2, cy + r * 0.3], [cx + r * 0.2, cy + r * 0.3], [cx + r * 0.2, cy + r]], 0, 5);
      break;
    case 3: // sun
      add(arc(cx, cy, r * 0.6, 0, Math.PI * 2.1), 3, 24);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add([[cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85], [cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3]], 2, 11);
      }
      break;
    default: { // spiral
      const pts: [number, number][] = [];
      for (let i = 0; i < 70; i++) {
        const a = i * 0.32;
        pts.push([cx + Math.cos(a) * i * (r / 45), cy + Math.sin(a) * i * (r / 45)]);
      }
      add(pts, main, 11);
    }
  }

  const extras = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < extras; i++) {
    const x = between(rng, 120, PAGE_W - 120);
    const y = between(rng, 100, PAGE_H - 100);
    if (rng() < 0.5) {
      const pts: [number, number][] = [];
      const step = between(rng, 25, 45);
      for (let k = 0; k < 7; k++) pts.push([x + k * step - 3 * step, y + (k % 2 ? -step : step) * 0.8]);
      add(pts, colour(), 5);
    } else {
      add(arc(x, y, between(rng, 25, 60), 0, Math.PI * 2.1), colour(), 5);
    }
  }
  return out;
}

function arc(cx: number, cy: number, r: number, from: number, to: number): [number, number][] {
  const pts: [number, number][] = [];
  const steps = Math.max(8, Math.round(((to - from) * r) / 14));
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Shaky-hand jitter, clamped to the page. */
function stroke(rng: Rng, pts: [number, number][], c: number, w: number): Stroke {
  const p: number[] = [];
  for (const [x, y] of pts) {
    p.push(
      Math.max(0, Math.min(PAGE_W, Math.round(x + between(rng, -5, 5)))),
      Math.max(0, Math.min(PAGE_H, Math.round(y + between(rng, -5, 5)))),
    );
  }
  return { c, w, p };
}
