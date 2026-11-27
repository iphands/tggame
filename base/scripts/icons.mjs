// Generates a game's web-app icons (PNG) procedurally, so no binary assets live in git.
// A game's own scripts/make-icons.mjs calls writeIcons() with its 16x16 pixel art.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

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

/**
 * One icon: the backdrop with the pixel art, `artFrac` of the canvas wide.
 * `art` is 16 strings of 16 characters ('.' is empty); `pal` maps each other character to
 * [r, g, b]; `bg` is [base, gain] per channel for the backdrop glow.
 */
function icon({ art: ART, pal: PAL, bg }, size, artFrac, rounded) {
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
    return [Math.round(bg[0][0] + bg[0][1] * k), Math.round(bg[1][0] + bg[1][1] * k), Math.round(bg[2][0] + bg[2][1] * k), 255];
  });
}

/** Writes the four icon files into client/public/icons of the current project. */
export function writeIcons(look) {
  const out = path.resolve('client/public/icons');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon-192.png'), icon(look, 192, 0.75, true));
  fs.writeFileSync(path.join(out, 'icon-512.png'), icon(look, 512, 0.75, true));
  fs.writeFileSync(path.join(out, 'icon-512-maskable.png'), icon(look, 512, 0.6, false));
  fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), icon(look, 180, 0.72, false));
  console.log('icons written to', path.relative(process.cwd(), out));
}
