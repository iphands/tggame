/**
 * The catch: for as long as the server holds the round still, every screen shows Hilder biting
 * the Cousin she caught, the Cousin turning (into a Beast, or in Escape a ghost), and two of
 * her sayings.
 */
import { h, reducedMotion } from '@tggame/base/client/dom';
import { CUTSCENE_MS } from '../../shared/src/constants';
import { drawBeast, drawCousin, drawGhost } from './art';
import { sfx } from './audio';
import { hilderSvg } from './hilder';

/** What Hilder says. Two of these flash up with every catch. */
export const SAYINGS = ["That's SOMETHING BAD", 'Now quit it!', 'Byyyeee', 'You nearly collapsed', 'You fell out!'];

/** When, in the 2.5 seconds, she bites, and when the Cousin turns. */
const BITE_AT_MS = [900, 1200];
const TURN_AT_MS = 1550;

export type Catch = {
  /** Who caught and who was caught, as they should be named on this screen. */
  beast: string;
  victim: string;
  beastColor: string;
  victimColor: string;
  /** Escape: the Cousin becomes a ghost, not a Beast. */
  ghost: boolean;
  /** The same on every screen for the same catch, so everyone reads the same two sayings. */
  seed: number;
  /** It was us. */
  mine: boolean;
};

/** Two different sayings, picked by `seed`. */
export function sayingsFor(seed: number): [string, string] {
  const n = SAYINGS.length;
  const a = Math.abs(Math.floor(seed)) % n;
  const b = (a + 1 + (Math.floor(Math.abs(seed) / n) % (n - 1))) % n;
  return [SAYINGS[a], SAYINGS[b]];
}

let showing: { el: HTMLElement; raf: number; timers: number[] } | null = null;

export function endCutscene(): void {
  if (!showing) return;
  cancelAnimationFrame(showing.raf);
  showing.timers.forEach((t) => clearTimeout(t));
  showing.el.remove();
  showing = null;
}

/** Play the catch over `host`. A catch that arrives while another is playing takes its place. */
export function playCutscene(host: HTMLElement, c: Catch): void {
  endCutscene();
  const [first, second] = sayingsFor(c.seed);
  const beast = h('div', { class: 'cs-beast' });
  // our own drawing, in a colour from the game's own list: safe to set as markup
  beast.innerHTML = hilderSvg({ top: c.beastColor, angry: true }, 320);
  const victim = h('canvas', { class: 'cs-victim', width: 260, height: 260 });
  const el = h(
    'div',
    { class: `cutscene${reducedMotion() ? ' still' : ''}` },
    h('div', { class: 'cs-title' }, `${c.beast} got ${c.victim}!`),
    h('div', { class: 'cs-stage' }, beast, victim),
    h('div', { class: 'cs-say cs-a' }, first),
    h('div', { class: 'cs-say cs-b' }, second),
  );
  host.append(el);

  const ctx = victim.getContext('2d')!;
  const t0 = performance.now();
  const draw = (now: number): void => {
    const t = now - t0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 260, 260);
    const bitten = BITE_AT_MS.some((at) => t >= at && t < at + 160);
    const shake = !reducedMotion() && t < TURN_AT_MS ? (bitten ? 9 : 2.5) : 0;
    ctx.translate(130 + (Math.random() - 0.5) * shake, 150 + (Math.random() - 0.5) * shake);
    if (t < TURN_AT_MS) {
      ctx.scale(5.5, 5.5);
      // facing the Beast that is coming for them
      drawCousin(ctx, 0, 0, c.victimColor, Math.PI, 0, now);
    } else {
      // turning: it swells up out of a flash
      const k = Math.min(1, (t - TURN_AT_MS) / 260);
      const s = (c.ghost ? 5.5 : 2.9) * (0.5 + 0.5 * k);
      ctx.scale(s, s);
      if (c.ghost) drawGhost(ctx, 0, 0, c.victimColor, Math.PI, now);
      else drawBeast(ctx, 0, 6, c.victimColor, Math.PI, 0, now);
    }
    const flash = 1 - Math.abs(t - TURN_AT_MS) / 220;
    if (flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createRadialGradient(130, 140, 10, 130, 140, 130);
      g.addColorStop(0, `rgba(255,255,255,${flash})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 260, 260);
    }
    if (showing) showing.raf = requestAnimationFrame(draw);
  };

  showing = {
    el,
    raf: requestAnimationFrame(draw),
    timers: [
      ...BITE_AT_MS.map((at) => window.setTimeout(() => sfx.chomp(), at)),
      window.setTimeout(() => (c.ghost ? sfx.portal() : sfx.turned()), TURN_AT_MS),
      window.setTimeout(endCutscene, CUTSCENE_MS),
    ],
  };
  sfx.caught(c.mine);
}
