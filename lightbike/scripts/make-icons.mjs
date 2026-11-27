// This game's icon art. Run automatically before dev/build; output: client/public/icons/*.png
import { writeIcons } from '@tggame/base/icons';

// 16x16: two bikes and the lines they leave. c/C cyan line and bike, m/M pink line and bike, w headlight
const ART = [
  '................',
  '................',
  '..ccccccccccCw..',
  '..c.............',
  '..c.............',
  '..c......wM.....',
  '..c.......m.....',
  '..c.......m.....',
  '..c.......m.....',
  '..cccc....m.....',
  '.....c....m.....',
  '.....c....m.....',
  '.....c....mmmmm.',
  '.....c........m.',
  '..............m.',
  '................',
];
const PAL = {
  c: [61, 224, 224],
  C: [190, 255, 255],
  m: [255, 107, 203],
  M: [255, 200, 235],
  w: [255, 255, 255],
};

writeIcons({ art: ART, pal: PAL, bg: [[7, 22], [4, 12], [26, 44]] });
