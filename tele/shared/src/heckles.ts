/**
 * What players who have finished shout at the ones who have not. `{name}` becomes the slow
 * player's name. Level 1 is a nudge; level 3 is the whole table yelling.
 */
export const HECKLE_MAX_LEVEL = 3;

export const HECKLES: readonly (readonly string[])[] = [
  [
    'Any day now, {name}.',
    'Tick tock, {name}.',
    '{name}, it is a doodle, not a mural.',
    'Psst, {name}. Everyone is waiting.',
    'Is {name} sharpening the pencil?',
    'Less shading, more finishing, {name}.',
    '{name} is adding a signature.',
    'Stick figures are fine, {name}!',
    'Did {name} fall asleep on the page?',
    'Somebody poke {name}.',
    '{name} is staring at a blank page.',
    'It does not have to be good, {name}.',
  ],
  [
    'HURRY UP, {name}!',
    'Pencils down, {name}!',
    '{name}! We are growing old here!',
    'This is not the Sistine Chapel, {name}.',
    'Museums close faster than {name} draws.',
    'Glaciers are lapping you, {name}.',
    'Wrap it up, Picasso. Yes, you, {name}.',
    'My grandma doodles faster, {name}. She uses her feet.',
    'Earth to {name}! Come in, {name}!',
    '{name} is on brush stroke nine thousand.',
    'Somebody check {name} for a pulse.',
    'Hand. It. In. {name}.',
  ],
  [
    '{name}!!! HAND! IT! IN!',
    'EVERYBODY STARE AT {name}.',
    'PENCILS DOWN, {name}! PENCILS! DOWN!',
    '{name} has officially been declared a traffic jam.',
    'Archaeologists will find {name} still doodling.',
    'WAKE UP {name}! WAKE UP!',
    'The ink is drying, {name}!',
    '{name}, we are begging you. BEGGING.',
    'Send a search party for {name}.',
    'SLOWEST. DOODLER. EVER. Take a bow, {name}.',
    '{name} is single-handedly holding up civilisation.',
    'This masterpiece is brought to you by {name}, professional anchor.',
  ],
];

/** A line for `level` (1-based, clamped), never the same line as `avoid`. */
export function pickHeckle(level: number, name: string, rng: () => number, avoid = ''): string {
  const lines = HECKLES[Math.min(HECKLE_MAX_LEVEL, Math.max(1, Math.floor(level))) - 1];
  const start = Math.floor(rng() * lines.length);
  for (let k = 0; k < lines.length; k++) {
    const text = lines[(start + k) % lines.length].replaceAll('{name}', name);
    if (text !== avoid) return text;
  }
  return lines[start].replaceAll('{name}', name);
}
