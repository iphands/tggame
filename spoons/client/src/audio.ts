/**
 * Procedural sound cues via WebAudio: no audio files. The context is created
 * on the first user gesture (browsers block audio before that).
 */
import { saved } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = saved.muted();

export const isMuted = (): boolean => muted;

export function setMuted(m: boolean): void {
  muted = m;
  saved.setMuted(m);
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.4, ctx.currentTime, 0.02);
}

/** Call from a user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.4;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(wave: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, f0: number, f1: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  /** Button / pick. */
  pop: () => tone('sine', 520, 880, 0.09, 0.5),
  /** Page handed in. */
  done: () => {
    tone('triangle', 660, 660, 0.1, 0.4);
    tone('triangle', 990, 990, 0.16, 0.4, 0.09);
  },
  /** A new page lands in front of you. */
  turn: () => {
    noise(0.22, 0.35, 900, 3200);
    tone('sine', 784, 784, 0.12, 0.3, 0.12);
    tone('sine', 1047, 1047, 0.2, 0.3, 0.22);
  },
  /** Reveal page flip. */
  flip: () => noise(0.25, 0.4, 600, 4200),
  heart: () => tone('sine', 880, 1320, 0.12, 0.35),
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.14, 0.4, i * 0.11)),
  nope: () => tone('square', 180, 120, 0.16, 0.2),
};
