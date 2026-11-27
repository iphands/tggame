/**
 * On-screen performance meter (top-left): FPS, frame timing, CPU time per
 * frame and a frame-time sparkline. Enable with `?fps=1` (remembered on the
 * device), disable with `?fps=0`. Runs on its own requestAnimationFrame so it
 * measures what the screen actually shows, on every scene.
 */

import { prefKey } from './prefs.js';

const HISTORY = 120; // frames kept for the sparkline
const BUDGET_MS = 1000 / 60;

let el: HTMLElement | null = null;
let text: HTMLElement | null = null;
let graph: HTMLCanvasElement | null = null;
const frames: number[] = []; // frame intervals (ms), newest last
let last = 0;
let lastDraw = 0;
let cpuMs = 0; // smoothed game update+render JS time per frame
let extra = '';

export function perfEnabled(): boolean {
  const q = new URLSearchParams(location.search).get('fps');
  try {
    if (q === '0') localStorage.removeItem(prefKey('fps'));
    else if (q !== null) localStorage.setItem(prefKey('fps'), '1');
    return localStorage.getItem(prefKey('fps')) === '1';
  } catch {
    return q !== null && q !== '0';
  }
}

/** Extra context line (graphics tier, particle count, …). */
export function setPerfExtra(s: string): void {
  extra = s;
}

/** Report the JS time the game spent on one frame (update + render submit). */
export function reportCpu(ms: number): void {
  cpuMs += (ms - cpuMs) * 0.1;
}

export function startPerfMeter(): void {
  el = document.getElementById('perf-meter');
  if (!el) return;
  el.classList.remove('hidden');
  text = document.createElement('div');
  graph = document.createElement('canvas');
  graph.width = HISTORY;
  graph.height = 28;
  el.append(text, graph);
  requestAnimationFrame(tick);
}

function tick(now: number): void {
  if (last) {
    frames.push(now - last);
    if (frames.length > HISTORY) frames.shift();
  }
  last = now;
  if (now - lastDraw > 250 && frames.length > 10) {
    lastDraw = now;
    draw();
  }
  requestAnimationFrame(tick);
}

function draw(): void {
  // stats over roughly the last second
  const recent = frames.slice(-60);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const worst = Math.max(...recent);
  const sorted = [...frames].sort((a, b) => b - a);
  const p99 = sorted[Math.max(0, Math.floor(sorted.length * 0.01))];
  const fps = 1000 / avg;
  const color = fps >= 55 ? '#7dffb0' : fps >= 40 ? '#ffd166' : '#ff6b6b';
  if (text) {
    text.innerHTML =
      `<b style="color:${color}">${fps.toFixed(0)} fps</b> · ${avg.toFixed(1)} ms avg<br>` +
      `worst ${worst.toFixed(1)} ms · 1% low ${(1000 / p99).toFixed(0)} fps<br>` +
      `cpu ${cpuMs.toFixed(1)} ms/frame${extra ? ` · ${extra}` : ''}`;
  }
  if (!graph) return;
  const ctx = graph.getContext('2d')!;
  const h = graph.height;
  ctx.clearRect(0, 0, graph.width, h);
  // 60 fps (16.7 ms) and 30 fps (33 ms) guide lines; bars scale to 50 ms
  const y = (ms: number) => h - Math.min(h, (ms / 50) * h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, y(BUDGET_MS), graph.width, 1);
  ctx.fillRect(0, y(BUDGET_MS * 2), graph.width, 1);
  const x0 = graph.width - frames.length;
  frames.forEach((ms, i) => {
    ctx.fillStyle = ms <= BUDGET_MS * 1.15 ? '#7dffb0' : ms <= BUDGET_MS * 2.1 ? '#ffd166' : '#ff6b6b';
    const top = y(ms);
    ctx.fillRect(x0 + i, top, 1, h - top);
  });
}
