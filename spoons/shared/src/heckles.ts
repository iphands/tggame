/**
 * What the table shouts at whoever is sitting on a card. `{name}` becomes the
 * slow player's name. Level 1 is a nudge; level 3 is the whole table yelling.
 */
import { HECKLE_MAX_LEVEL } from './constants.js';

export const HECKLES: readonly (readonly string[])[] = [
  [
    "What's taking you so long?!",
    'Hurr up slow poke',
    'Any day now, {name}.',
    'Psst, {name}. It is a card. You pass it.',
    '{name} is reading the fine print.',
    'Tick tock, {name}.',
    'Did {name} fall asleep?',
    '{name}, the cards go that way →',
    'Somebody poke {name}.',
    'Take your time, {name}. Not really.',
    'Is {name} buffering?',
    '{name} is admiring the artwork.',
  ],
  [
    'Jeez you are dragging anchor!',
    'Hurry up {name}, HURRY UP',
    '{name}! We are growing old here!',
    'Pass. The. Card. {name}.',
    'The pile behind {name} now has its own postcode.',
    '{name} is playing a different, slower game.',
    'Glaciers are lapping you, {name}.',
    'It is four cards, {name}, not a chess match!',
    'Somebody check {name} for a pulse.',
    'My grandma passes faster, {name}. She is a tortoise.',
    'Earth to {name}! Come in, {name}!',
    'We could have dealt a whole new round by now, {name}.',
  ],
  [
    '{name}!!! PASS! THE! CARD!',
    'HURRY UP {name}, HURRY UUUUP',
    'EVERYBODY STARE AT {name}.',
    'This round is brought to you by {name}, professional anchor.',
    '{name} has officially been declared a traffic jam.',
    'Archaeologists will find {name} still holding that card.',
    'WAKE UP {name}! WAKE UP!',
    'The spoons are rusting, {name}!',
    '{name}, we are begging you. BEGGING.',
    'Send a search party for {name}.',
    'SLOWEST. PASSER. EVER. Take a bow, {name}.',
    '{name} is single-handedly holding up civilisation.',
  ],
];

/** What the table says about a grab at nothing. */
export const FUMBLES: readonly string[] = [
  '{name} grabbed at nothing!',
  'False alarm! {name} lunged at thin air.',
  '{name} got jumpy. That costs a spoon-less mark!',
  'Nice try, {name}. Nobody had four of a kind.',
  '{name} flinched! Butterfingers.',
];

const fill = (line: string, name: string): string => line.replaceAll('{name}', name);

/** A line for `level` (1-based, clamped), never the same line as `avoid`. */
export function pickHeckle(level: number, name: string, rng: () => number, avoid = ''): string {
  const lines = HECKLES[Math.min(HECKLE_MAX_LEVEL, Math.max(1, Math.floor(level))) - 1];
  return pickFrom(lines, name, rng, avoid);
}

export function pickFumble(name: string, rng: () => number, avoid = ''): string {
  return pickFrom(FUMBLES, name, rng, avoid);
}

function pickFrom(lines: readonly string[], name: string, rng: () => number, avoid: string): string {
  const start = Math.floor(rng() * lines.length);
  for (let k = 0; k < lines.length; k++) {
    const text = fill(lines[(start + k) % lines.length], name);
    if (text !== avoid) return text;
  }
  return fill(lines[start], name);
}
