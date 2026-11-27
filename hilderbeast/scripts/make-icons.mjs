// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16 Hilder Beast: # outline, h horn, f fur, y eye, k pupil and mouth, t tooth
const ART = [
  '................',
  '..#..........#..',
  '.#h#........#h#.',
  '.#hh#.####.#hh#.',
  '..#h##ffff##h#..',
  '..##ffffffff##..',
  '.#ffffffffffff#.',
  '.#f#yy#ff#yy#f#.',
  '.#f#yk#ff#ky#f#.',
  '.#ff##ffff##ff#.',
  '.#ffffffffffff#.',
  '.#f#kkkkkkkk#f#.',
  '.#f#tktktktk#f#.',
  '..#ffffffffff#..',
  '...##########...',
  '................',
];
const PAL = {
  '#': [12, 10, 20],
  h: [244, 236, 216],
  f: [123, 92, 190],
  y: [255, 210, 63],
  k: [12, 10, 20],
  t: [244, 236, 216],
};

writeIcons({ art: ART, pal: PAL, bg: [[22, 40], [18, 30], [36, 60]] });
