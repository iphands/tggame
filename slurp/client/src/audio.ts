/** This game's sound cues. The engine behind them is shared. */
import { createAudio } from '@tggame/base/client/audio';
import { saved } from './store';

const audio = createAudio(saved);
export const { isMuted, setMuted, unlockAudio } = audio;
const { tone, noise } = audio;

let lastGulp = 0;

export const sfx = {
  /** Button / pick. */
  pop: () => tone('sine', 520, 880, 0.09, 0.5),
  /** Something went down a hole: bigger food, deeper gulp. Quieter when it was not yours. */
  gulp: (tier: number, mine: boolean) => {
    const now = performance.now();
    // a sweep through a pile of berries is a patter, not a wall of noise
    if (now - lastGulp < (mine ? 45 : 110)) return;
    lastGulp = now;
    const f = 620 - tier * 95 + Math.random() * 60;
    tone('sine', f, f * 0.42, 0.09 + tier * 0.03, mine ? 0.42 : 0.14);
    if (tier >= 3) tone('triangle', f * 0.5, f * 0.2, 0.2, mine ? 0.3 : 0.1, 0.03);
  },
  /** Your hole can now eat the next size up. */
  grow: () => {
    tone('triangle', 659, 659, 0.1, 0.35);
    tone('triangle', 988, 988, 0.22, 0.35, 0.09);
  },
  /** Food went over the edge. */
  spill: () => {
    tone('square', 260, 110, 0.22, 0.16);
    noise(0.12, 0.12, 1400, 400);
  },
  /** A prize box went down your hole. */
  prize: () => [660, 880, 1175].forEach((f, i) => tone('triangle', f, f, 0.09, 0.35, i * 0.07)),
  /** A rotten fish went down your hole. */
  yuck: () => {
    tone('sawtooth', 220, 90, 0.35, 0.3);
    tone('sawtooth', 180, 70, 0.3, 0.2, 0.12);
  },
  /** Somebody set a power off. */
  power: (mine: boolean) => {
    tone('sawtooth', 220, 880, 0.3, mine ? 0.3 : 0.12);
    tone('sine', 440, 1760, 0.35, mine ? 0.3 : 0.12, 0.05);
  },
  /** It came back. */
  plop: () => tone('sine', 300, 520, 0.08, 0.2),
  /** The last seconds. */
  tick: () => tone('square', 990, 990, 0.04, 0.14),
  count: () => tone('triangle', 440, 440, 0.12, 0.35),
  go: () => tone('triangle', 660, 1320, 0.22, 0.4),
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.14, 0.4, i * 0.11)),
  /** Out of time: a soft sigh, not a buzzer. */
  lose: () => [392, 349, 294].forEach((f, i) => tone('sine', f, f * 0.96, i === 2 ? 0.6 : 0.24, 0.28, i * 0.22)),
};

/** A short buzz on phones that have one. */
export function buzz(ms: number): void {
  if (!isMuted()) navigator.vibrate?.(ms);
}
