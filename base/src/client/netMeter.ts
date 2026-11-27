/**
 * On-screen net graph (top-right): round trip, jitter, traffic, and whatever lines the game adds
 * (interpolation buffer, corrections, …). Shown with `?net=1` (remembered on the device, `?net=0`
 * forgets it) and whenever the pretend bad line of `lag.ts` is on. Works in every game: the
 * socket starts it, and it builds its own box.
 */

const HISTORY = 120;
const KEY = 'tggame.net';

export type NetStats = {
  rtt: number;
  jitter: number;
  bytesIn: number;
  bytesOut: number;
  msgsIn: number;
  msgsOut: number;
};

let box: HTMLElement | null = null;
let text: HTMLElement | null = null;
let graph: HTMLCanvasElement | null = null;
const rtts: number[] = [];
const extras = new Map<string, string>();
let read: (() => NetStats) | null = null;
let note = '';

export function netMeterEnabled(search: string): boolean {
  const q = new URLSearchParams(search).get('net');
  try {
    if (q === '0') localStorage.removeItem(KEY);
    else if (q !== null) localStorage.setItem(KEY, '1');
    return localStorage.getItem(KEY) === '1';
  } catch {
    return q !== null && q !== '0';
  }
}

/** A line of the game's own (`setNetExtra('interp', '92 ms · 0 underruns')`); '' removes it. */
export function setNetExtra(key: string, value: string): void {
  if (value) extras.set(key, value);
  else extras.delete(key);
}

/** Is the meter on screen? Lets a game skip working out lines nobody will read. */
export const netMeterShown = (): boolean => box !== null;

/** Show the meter. `stats` is read once a second; `heading` says what line is being pretended. */
export function startNetMeter(stats: () => NetStats, heading = ''): void {
  read = stats;
  note = heading;
  if (box || typeof document === 'undefined') return;
  box = document.createElement('div');
  box.style.cssText =
    'position:fixed;top:4px;right:4px;z-index:9999;padding:4px 6px;border-radius:6px;' +
    'background:rgba(0,0,0,0.72);color:#e8edf5;font:11px/1.35 ui-monospace,monospace;' +
    'pointer-events:none;white-space:pre;text-align:left';
  text = document.createElement('div');
  graph = document.createElement('canvas');
  graph.width = HISTORY;
  graph.height = 24;
  graph.style.display = 'block';
  box.append(text, graph);
  document.body.append(box);
  setInterval(draw, 1000);
}

/** A round trip this long is felt: the badge shows from here. */
const SLOW_MS = 150;
const BAD_MS = 300;

let badge: HTMLElement | null = null;

/**
 * The slow-line badge: a small "ping 260 ms" at the top of the page, there only while the round
 * trip is long enough to feel. A player on a slow line should know it is the line, and that the
 * game knows too. Every game gets it from the socket; nothing shows on a good connection.
 */
export function showLineBadge(rttMs: number): void {
  if (typeof document === 'undefined' || box) return; // the full meter already says it
  if (!badge) {
    badge = document.createElement('div');
    badge.style.cssText =
      'position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:9998;padding:1px 7px;' +
      'border-radius:8px;background:rgba(0,0,0,0.55);font:10px/1.4 ui-monospace,monospace;' +
      'pointer-events:none;display:none';
    document.body.append(badge);
  }
  const slow = rttMs >= SLOW_MS;
  badge.style.display = slow ? 'block' : 'none';
  if (!slow) return;
  badge.style.color = rttMs >= BAD_MS ? '#ff8f8f' : '#ffd166';
  badge.textContent = `ping ${rttMs.toFixed(0)} ms`;
}

/** One round trip measured, for the sparkline. */
export function reportRtt(ms: number): void {
  rtts.push(ms);
  if (rtts.length > HISTORY) rtts.shift();
}

function draw(): void {
  if (!read || !text || !graph) return;
  const s = read();
  const lines = [
    `ping ${s.rtt.toFixed(0)} ms ± ${s.jitter.toFixed(0)}`,
    `in ${(s.bytesIn / 1024).toFixed(1)} kB/s · ${s.msgsIn}/s`,
    `out ${(s.bytesOut / 1024).toFixed(1)} kB/s · ${s.msgsOut}/s`,
  ];
  if (note) lines.unshift(note);
  for (const [key, value] of extras) lines.push(`${key} ${value}`);
  text.textContent = lines.join('\n');

  const ctx = graph.getContext('2d');
  if (!ctx) return;
  const h = graph.height;
  ctx.clearRect(0, 0, graph.width, h);
  // bars scale to 400 ms; guide lines at 100 and 250
  const y = (ms: number): number => h - Math.min(h, (ms / 400) * h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, y(100), graph.width, 1);
  ctx.fillRect(0, y(250), graph.width, 1);
  const x0 = graph.width - rtts.length;
  rtts.forEach((ms, i) => {
    ctx.fillStyle = ms <= 100 ? '#7dffb0' : ms <= 250 ? '#ffd166' : '#ff6b6b';
    const top = y(ms);
    ctx.fillRect(x0 + i, top, 1, h - top);
  });
}
