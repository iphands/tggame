// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16 hole with a berry going in: # outline, R rim, k dark, b berry, w shine, g leaf
const ART = [
  '................',
  '.........g......',
  '........#g#.....',
  '.......#bbb#....',
  '.......#bwb#....',
  '.......#bbb#....',
  '....####bbb###..',
  '...#RRRR###RRR#.',
  '..#RRkkkkkkkkRR#',
  '..#RkkkkkkkkkkR#',
  '..#RkkkkkkkkkkR#',
  '..#RRkkkkkkkkRR#',
  '...#RRRRRRRRRR#.',
  '....##########..',
  '................',
  '................',
];
const PAL = {
  '#': [31, 36, 64],
  R: [255, 210, 63],
  k: [20, 16, 34],
  b: [255, 93, 115],
  w: [255, 255, 255],
  g: [61, 220, 151],
};

writeIcons({ art: ART, pal: PAL, bg: [[18, 16], [84, 50], [63, 40]] });
