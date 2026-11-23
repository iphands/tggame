/**
 * Procedural pixel-art-style textures baked onto canvases.
 * (The image-generation service was unavailable in this session, so these are
 * drawn with plain canvas primitives — same 16-bit feel, no network needed.)
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBackground(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(42);

  // sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#120a24');
  sky.addColorStop(0.45, '#241543');
  sky.addColorStop(0.75, '#3a2560');
  sky.addColorStop(1, '#4a2a5e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // stars
  for (let i = 0; i < 140; i++) {
    const x = rand() * width;
    const y = rand() * height * 0.55;
    const r = rand();
    const size = r < 0.8 ? 1 : 2;
    const alpha = 0.35 + rand() * 0.65;
    ctx.fillStyle = `rgba(255, 244, 214, ${alpha})`;
    ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
  }

  // horizon glow
  const glow = ctx.createLinearGradient(0, height * 0.55, 0, height * 0.85);
  glow.addColorStop(0, 'rgba(255, 122, 89, 0)');
  glow.addColorStop(0.6, 'rgba(255, 130, 90, 0.30)');
  glow.addColorStop(1, 'rgba(255, 130, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, height * 0.55, width, height * 0.3);

  // far mountains (light purple ridge)
  ridge(ctx, width, height * 0.66, height * 0.22, '#33224e', rand, 9);
  // mid mountains
  ridge(ctx, width, height * 0.74, height * 0.16, '#251a3d', rand, 11);
  // near hills (darkest)
  ridge(ctx, width, height * 0.82, height * 0.10, '#18122b', rand, 13);

  // mist band
  const mist = ctx.createLinearGradient(0, height * 0.72, 0, height);
  mist.addColorStop(0, 'rgba(90, 60, 110, 0)');
  mist.addColorStop(0.55, 'rgba(90, 60, 110, 0.28)');
  mist.addColorStop(1, 'rgba(14, 10, 26, 0.9)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, height * 0.72, width, height * 0.28);

  // vignette
  const vignette = ctx.createRadialGradient(
    width / 2, height * 0.45, height * 0.35,
    width / 2, height * 0.45, height * 0.95
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

function ridge(ctx: CanvasRenderingContext2D, w: number, baseY: number, amplitude: number, color: string, rand: () => number, peaks: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 720);
  // jagged ridgeline using deterministic steps
  let x = 0;
  while (x < w) {
    const step = w / peaks;
    const y = baseY - rand() * amplitude;
    ctx.lineTo(x, y);
    x += step;
  }
  ctx.lineTo(w, 720);
  ctx.closePath();
  ctx.fill();
}

export function makePlatformTexture(width = 128, height = 32, seed = 7): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(seed);

  // mossy grass lip
  ctx.fillStyle = '#47c93f';
  ctx.fillRect(0, 0, width, 7);
  // grass pixel variability
  for (let x = 0; x < width; x += 4) {
    const r = rand();
    ctx.fillStyle = r < 0.5 ? '#5fe04e' : r < 0.8 ? '#3aa636' : '#37a32f';
    ctx.fillRect(x, rand() < 0.5 ? 0 : 2, 4, 7);
  }
  // dirt/stone body
  ctx.fillStyle = '#5d4a72';
  ctx.fillRect(0, 7, width, height - 7);
  // pixel variability in the body
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rand() * width);
    const y = 8 + Math.floor(rand() * (height - 10));
    ctx.fillStyle = rand() < 0.5 ? '#6d5890' : '#4e3f62';
    ctx.fillRect(x, y, 2 + Math.floor(rand() * 3), 2);
  }
  // cracks
  ctx.fillStyle = '#36293f';
  for (let x = 8; x < width; x += 18 + Math.floor(rand() * 12)) {
    ctx.fillRect(x, 12, 2, height - 16);
  }
  // darker underside edge
  ctx.fillStyle = '#2b2138';
  ctx.fillRect(0, height - 2, width, 2);

  return canvas;
}

export function makeCharacterTexture(): HTMLCanvasElement {
  const W = 32, H = 42;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // dark outline silhouette
  ctx.fillStyle = '#151020';
  ctx.fillRect(7, 1, 18, 3);   // head top
  ctx.fillRect(6, 2, 20, 13);   // head
  ctx.fillRect(5, 13, 22, 24);  // body
  ctx.fillRect(6, 35, 8, 6);    // left leg
  ctx.fillRect(18, 35, 8, 6);   // right leg

  // white body (tinted per-player at render time)
  ctx.fillStyle = '#f2f0ff';
  ctx.fillRect(9, 3, 14, 11);   // head
  ctx.fillRect(7, 14, 18, 20);  // body
  ctx.fillRect(8, 35, 6, 5);    // left leg
  ctx.fillRect(19, 35, 6, 5);   // right leg

  // belly/chest shading (gray — tints multiplicatively)
  ctx.fillStyle = '#b9b6d6';
  ctx.fillRect(7, 30, 18, 4);

  // belt
  ctx.fillStyle = '#3a3350';
  ctx.fillRect(7, 26, 18, 3);

  // eyes (punch out)
  ctx.fillStyle = '#151020';
  ctx.fillRect(12, 7, 3, 3);
  ctx.fillRect(18, 7, 3, 3);

  // feet
  ctx.fillStyle = '#2b2138';
  ctx.fillRect(8, 39, 6, 3);
  ctx.fillRect(19, 39, 6, 3);

  return canvas;
}
