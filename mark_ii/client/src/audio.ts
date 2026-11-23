/**
 * Procedural sound effects via WebAudio. No audio files: every sound is a few
 * oscillators / filtered noise bursts. The context is created on the first
 * user gesture (browsers block audio before that).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();
const lastPlayed = new Map<string, number>();

function readMuted(): boolean {
  try {
    return localStorage.getItem('lsr-muted') === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('lsr-muted', m ? '1' : '0');
  } catch {
    /* private mode */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
}

/** Call from a user gesture (click / key / touch). Safe to call repeatedly. */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

type Wave = OscillatorType;

function tone(wave: Wave, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, delay = 0, q = 1): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export type Sfx =
  | 'jump'
  | 'airjump'
  | 'land'
  | 'bounce'
  | 'hit'
  | 'hitBig'
  | 'block'
  | 'pistol'
  | 'boomstick'
  | 'throw'
  | 'smg'
  | 'rocket'
  | 'charge'
  | 'railgun'
  | 'boom'
  | 'ko'
  | 'pickup'
  | 'crate'
  | 'crumble'
  | 'spawn'
  | 'tick'
  | 'go'
  | 'win'
  | 'click';

/** Play a sound. `vol` scales loudness (e.g. by distance or power). */
export function play(name: Sfx, vol = 1): void {
  if (!ctx || muted) return;
  // de-dupe bursts of the same sound in one frame
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 30) return;
  lastPlayed.set(name, now);
  const v = Math.max(0.05, Math.min(1.5, vol));
  switch (name) {
    case 'jump':
      tone('square', 280, 560, 0.11, 0.12 * v);
      break;
    case 'airjump':
      tone('triangle', 520, 1100, 0.14, 0.18 * v);
      noise(0.1, 0.06 * v, 'highpass', 3000);
      break;
    case 'land':
      noise(0.08, 0.2 * v, 'lowpass', 700, 200);
      break;
    case 'bounce':
      tone('sine', 180, 900, 0.25, 0.3 * v);
      tone('square', 360, 1400, 0.12, 0.05 * v);
      break;
    case 'hit':
      tone('square', 220, 70, 0.12, 0.2 * v);
      noise(0.1, 0.35 * v, 'lowpass', 2200, 300);
      break;
    case 'hitBig':
      tone('sawtooth', 160, 40, 0.3, 0.3 * v);
      noise(0.25, 0.5 * v, 'lowpass', 3000, 150);
      break;
    case 'block':
      tone('sine', 1400, 1800, 0.12, 0.18 * v);
      tone('sine', 2100, 2600, 0.1, 0.08 * v, 0.02);
      break;
    case 'pistol':
      noise(0.07, 0.25 * v, 'highpass', 1800, 900);
      tone('square', 900, 220, 0.07, 0.1 * v);
      break;
    case 'boomstick':
      noise(0.22, 0.6 * v, 'lowpass', 4000, 300);
      tone('sawtooth', 140, 50, 0.18, 0.25 * v);
      break;
    case 'smg':
      noise(0.04, 0.16 * v, 'highpass', 2600, 1400);
      tone('square', 1300, 500, 0.04, 0.06 * v);
      break;
    case 'rocket':
      noise(0.5, 0.3 * v, 'bandpass', 600, 2400, 0, 0.8);
      tone('sawtooth', 120, 260, 0.35, 0.12 * v);
      break;
    case 'charge':
      tone('sawtooth', 200, 1800, 0.32, 0.12 * v);
      tone('sine', 400, 3600, 0.32, 0.1 * v);
      break;
    case 'railgun':
      tone('square', 2400, 80, 0.45, 0.3 * v);
      noise(0.6, 0.7 * v, 'lowpass', 6000, 120);
      tone('sine', 90, 30, 0.6, 0.5 * v);
      break;
    case 'throw':
      tone('triangle', 300, 700, 0.12, 0.15 * v);
      break;
    case 'boom':
      noise(0.7, 0.8 * v, 'lowpass', 1800, 60);
      tone('sine', 90, 28, 0.6, 0.6 * v);
      break;
    case 'ko':
      tone('sawtooth', 900, 60, 0.7, 0.22 * v);
      noise(0.8, 0.55 * v, 'lowpass', 2600, 80, 0.03);
      tone('sine', 70, 30, 0.7, 0.5 * v, 0.03);
      break;
    case 'pickup':
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.08, 0.1 * v, i * 0.05));
      break;
    case 'crate':
      tone('triangle', 880, 660, 0.15, 0.08 * v);
      break;
    case 'crumble':
      noise(0.45, 0.35 * v, 'lowpass', 500, 90);
      break;
    case 'spawn':
      [392, 523, 784].forEach((f, i) => tone('triangle', f, f * 1.01, 0.12, 0.1 * v, i * 0.06));
      break;
    case 'tick':
      tone('sine', 660, 660, 0.14, 0.25 * v);
      break;
    case 'go':
      [523, 659, 784].forEach((f) => tone('square', f, f, 0.45, 0.09 * v));
      tone('sawtooth', 1047, 1047, 0.45, 0.05 * v);
      break;
    case 'win':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, i === 5 ? 0.5 : 0.13, 0.1 * v, i * 0.13));
      break;
    case 'click':
      tone('square', 1200, 900, 0.04, 0.06 * v);
      break;
  }
}
