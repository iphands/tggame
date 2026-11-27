// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16 pencil scribbling a squiggle: # outline, Y body, y shade, P eraser, M ferrule, W wood, k tip, S squiggle
const ART = [
  '................',
  '...........##...',
  '..........#PP#..',
  '.........#MPPP#.',
  '........#YYMPP#.',
  '.......#YYYyM#..',
  '......#YYYyy#...',
  '.....#YYYyy#....',
  '....#YYYyy#.....',
  '...#WYYyy#......',
  '...#WWyy#.......',
  '..#kWW##........',
  '..#kk#....SS..S.',
  '..###..SS.S.SS..',
  '.....SS..S......',
  '................',
];
const PAL = {
  '#': [31, 36, 64],
  Y: [255, 210, 63],
  y: [240, 170, 40],
  P: [255, 93, 115],
  M: [201, 204, 217],
  W: [255, 231, 190],
  k: [31, 36, 64],
  S: [255, 250, 240],
};

writeIcons({ art: ART, pal: PAL, bg: [[30, 22], [63, 40], [148, 60]] });
