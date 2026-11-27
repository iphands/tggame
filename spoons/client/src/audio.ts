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
  /** A card lands in front of you. */
  card: () => noise(0.07, 0.22, 1800, 4200),
  /** You passed a card on. */
  pass: () => noise(0.09, 0.18, 3200, 900),
  /** The deal. */
  deal: () => {
    noise(0.22, 0.35, 900, 3200);
    tone('sine', 784, 784, 0.12, 0.3, 0.12);
    tone('sine', 1047, 1047, 0.2, 0.3, 0.22);
  },
  /** Cards start moving. */
  go: () => tone('triangle', 660, 1320, 0.18, 0.4),
  /** Your hand closes on a spoon. */
  grab: () => {
    tone('triangle', 1568, 2093, 0.08, 0.45);
    tone('sine', 2637, 2637, 0.25, 0.3, 0.05);
  },
  /** The table is on somebody's case: a nudge, a honk, an air horn. */
  heckle: (level: number) => {
    if (level <= 1) return tone('sine', 700, 520, 0.12, 0.3);
    if (level === 2) {
      tone('sawtooth', 311, 300, 0.16, 0.3);
      tone('sawtooth', 311, 300, 0.22, 0.3, 0.2);
      return;
    }
    for (let i = 0; i < 3; i++) {
      tone('sawtooth', 392, 370, 0.2, 0.32, i * 0.22);
      tone('square', 494, 466, 0.2, 0.16, i * 0.22);
    }
  },
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.14, 0.4, i * 0.11)),
  /** Sad trombone, short. */
  lose: () => [392, 370, 349, 311].forEach((f, i) => tone('sawtooth', f, f * 0.97, i === 3 ? 0.55 : 0.2, 0.25, i * 0.2)),
  nope: () => tone('square', 180, 120, 0.16, 0.2),
};
