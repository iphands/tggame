// Generates the web-app icons (PNG) procedurally so no binary assets live in git.
// Output: client/public/icons/*.png  (run automatically before dev/build)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('client/public/icons');

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

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Icon: radial purple backdrop + the pixel fighter head, `artFrac` of the canvas wide. */
function icon(size, artFrac, rounded) {
  const art = Math.floor(size * artFrac);
  const cell = art / 16;
  const off = (size - art) / 2;
  const radius = rounded ? size * 0.22 : 0;
  return png(size, (x, y) => {
    // rounded-square mask
    if (radius) {
      const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
      const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) return [0, 0, 0, 0];
    }
    const gx = Math.floor((x - off) / cell);
    const gy = Math.floor((y - off) / cell);
    const ch = ART[gy]?.[gx];
    if (ch && ch !== '.') return [...PAL[ch], 255];
    const d = Math.hypot(x - size / 2, y - size * 0.45) / size;
    const k = Math.max(0, 1 - d * 1.6);
    return [Math.round(16 + 80 * k), Math.round(9 + 30 * k), Math.round(40 + 90 * k), 255];
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), icon(192, 0.75, true));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), icon(512, 0.75, true));
fs.writeFileSync(path.join(OUT, 'icon-512-maskable.png'), icon(512, 0.6, false));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), icon(180, 0.72, false));
console.log('icons written to', path.relative(process.cwd(), OUT));
