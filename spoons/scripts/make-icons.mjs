// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16 spoon: # outline, S silver, s shade, w shine
const ART = [
  '................',
  '..........###...',
  '.........#SSS#..',
  '........#SwSSS#.',
  '........#SwSsS#.',
  '........#SSssS#.',
  '.........#SsS#..',
  '........#Ss##...',
  '.......#Ss#.....',
  '......#Ss#......',
  '.....#Ss#.......',
  '....#Ss#........',
  '...#Ss#.........',
  '..#Ss#..........',
  '..###...........',
  '................',
];
const PAL = {
  '#': [31, 36, 64],
  S: [233, 236, 245],
  s: [170, 176, 200],
  w: [255, 255, 255],
};

writeIcons({ art: ART, pal: PAL, bg: [[18, 16], [84, 50], [63, 40]] });
