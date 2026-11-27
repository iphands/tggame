// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16 fighter head: # outline, R body, r shade, W headband, w eye, k pupil, L highlight
const ART = [
  '................',
  '................',
  '.....######.....',
  '...##RRRRRR##...',
  '..#LLRRRRRRRR#..',
  '..#WWWWWWWWWW#..',
  '.#LRRRRRRRRRRR#.',
  '.#RRRRRRwwRRwwR#',
  '.#RRRRRRwkRRwkR#',
  '.#RRRRRRwkRRwkR#',
  '.#rRRRRRRRRRRRr#',
  '.#rrRRRRRRRRRrr#',
  '..#rrrrrrrrrrr#.',
  '...##rrrrrrr##..',
  '.....#######....',
  '................',
];
const PAL = {
  '#': [42, 14, 34],
  R: [255, 93, 93],
  r: [196, 58, 74],
  L: [255, 170, 160],
  W: [255, 255, 255],
  w: [255, 255, 255],
  k: [20, 16, 34],
};

writeIcons({ art: ART, pal: PAL, bg: [[16, 80], [9, 30], [40, 90]] });
