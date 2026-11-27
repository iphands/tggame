// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16 Hilder: # outline, e ear, g the glow in it, h hair, s skin, y eye, k pupil and mouth, t tooth, r lip
const ART = [
  '..##........##..',
  '.#ee#......#ee#.',
  '.#eg#......#eg#.',
  '.#eg#......#eg#.',
  '..#eg#.##.#ge#..',
  '..#ee#hhhh#ee#..',
  '..#hhhhhhhhhh#..',
  '.#hhhsssssshhh#.',
  '.#hh#yy#s#yy#h#.',
  '.#hhsyksssyksh#.',
  '.#hhssssssssh#..',
  '.#hhsrrrrrrsh#..',
  '..#hsrtktkrsh#..',
  '..#hhsrrrrsh#...',
  '...##ssssss#....',
  '.....######.....',
];
const PAL = {
  '#': [31, 26, 46],
  e: [246, 182, 207],
  g: [185, 255, 207],
  h: [185, 163, 201],
  s: [243, 196, 166],
  y: [255, 210, 63],
  k: [31, 26, 46],
  t: [255, 255, 255],
  r: [216, 33, 60],
};

writeIcons({ art: ART, pal: PAL, bg: [[22, 40], [18, 30], [36, 60]] });
