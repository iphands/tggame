/** Cards and spoons, drawn with elements and SVG: no image files. */
import type { Card } from '../../shared/src/cards';
import { h } from './dom';

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

export const rankLabel = (c: Card): string => (c[0] === 'T' ? '10' : c[0]);

/** One face-up card. `tag` is `button` for cards that can be tapped. */
export function cardEl<K extends 'div' | 'button'>(tag: K, card: Card, props: Record<string, unknown> = {}): HTMLElementTagNameMap[K] {
  const red = card[1] === 'H' || card[1] === 'D';
  return h(
    tag,
    { ...props, class: `card${red ? ' red' : ''}${props.class ? ` ${props.class}` : ''}`, 'aria-label': `${rankLabel(card)} of ${SUIT_NAME[card[1]]}` },
    h('span', { class: 'card-rank' }, rankLabel(card)),
    // the text-presentation selector keeps phones from swapping in emoji
    h('span', { class: 'card-suit' }, SUIT[card[1]] + '︎'),
  );
}

const NS = 'http://www.w3.org/2000/svg';

/** A spoon, bowl up. Sized by its container. */
export function spoonEl(cls = ''): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 100');
  svg.setAttribute('class', `spoon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path d="M18 4C8 4 4 15 4 24c0 10 5 17 10 19l-2 47c0 4 3 6 6 6s6-2 6-6l-2-47c5-2 10-9 10-19 0-9-4-20-14-20z" fill="#e9ecf5" stroke="#1f2440" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M12 14c-3 4-3 12 0 17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M21 50l1 38" fill="none" stroke="#aab0c8" stroke-width="3" stroke-linecap="round"/>';
  return svg;
}
