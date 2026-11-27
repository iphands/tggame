/** Eye candy: confetti and toasts. */
import { reducedMotion } from './dom.js';

const COLORS = ['#ffd23f', '#ff5d73', '#3ddc97', '#7bdff2', '#cdb4ff', '#ff8c42', '#fffaf0'];

/** Rain confetti over the whole page for a few seconds. */
export function confetti(ms = 3800): void {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (canvas.width = innerWidth * dpr);
  const H = (canvas.height = innerHeight * dpr);
  const ctx = canvas.getContext('2d')!;
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * W,
    y: -Math.random() * H * 0.6,
    vx: (Math.random() - 0.5) * 3 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    size: (6 + Math.random() * 8) * dpr,
    rot: Math.random() * 6.28,
    spin: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.3,
  }));
  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.min(1, (ms - t) / 600);
    for (const b of bits) {
      b.x += b.vx + Math.sin((t + b.y) / 300) * dpr;
      b.y += b.vy;
      b.rot += b.spin;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      if (b.round) {
        ctx.beginPath();
        ctx.arc(0, 0, b.size / 2, 0, 6.3);
        ctx.fill();
      } else ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    }
    if (t < ms) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

let toastTimer = 0;
export function toast(text: string): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2400);
}
