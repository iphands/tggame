/** This game's sound cues. The engine behind them is shared. */
import { createAudio } from '@tggame/base/client/audio';
import { saved } from './store';

const audio = createAudio(saved);
export const { isMuted, setMuted, unlockAudio } = audio;
const { tone, noise } = audio;

/** The low figure of the dread music: two notes a semitone apart, then a step down and back. */
const CREEP = [82.4, 87.3, 82.4, 87.3, 77.8, 87.3, 82.4, 98];

export const sfx = {
  /** Button / pick. */
  pop: () => tone('sine', 520, 880, 0.09, 0.5),
  /** A Cousin's boost: a light whoosh. */
  dash: () => noise(0.18, 0.12, 900, 2400),
  /** A Beast's burst: a low growl rising. */
  burst: () => {
    tone('sawtooth', 70, 190, 0.35, 0.3);
    noise(0.25, 0.14, 300, 1200);
  },
  /** Out of energy. */
  empty: () => tone('square', 180, 120, 0.12, 0.14),
  pill: () => {
    tone('sine', 660, 990, 0.08, 0.35);
    tone('sine', 990, 1320, 0.1, 0.3, 0.07);
  },
  /** A Beast dashes. */
  lunge: (mine: boolean) => {
    tone('sawtooth', 240, 90, 0.2, mine ? 0.3 : 0.4);
    noise(0.14, 0.2, 1800, 500);
  },
  /** Somebody was caught. */
  caught: (me: boolean) => {
    tone('sawtooth', 330, 55, me ? 0.7 : 0.4, me ? 0.45 : 0.22);
    tone('square', 165, 41, me ? 0.7 : 0.4, me ? 0.25 : 0.1, 0.05);
  },
  /** You are a Beast now. */
  turned: () => [110, 147, 196].forEach((f, i) => tone('sawtooth', f, f * 1.5, 0.22, 0.28, i * 0.12)),
  /** A Beast went through a Beast door. */
  portal: () => {
    tone('sine', 880, 110, 0.35, 0.22);
    tone('sine', 110, 660, 0.3, 0.18, 0.3);
  },
  /** Working on a chore: one turn of the crank. */
  crank: () => tone('triangle', 300, 360, 0.07, 0.16),
  /** The Beasts heard you. */
  heard: () => {
    tone('sine', 1320, 1320, 0.06, 0.2);
    tone('sine', 1320, 1320, 0.06, 0.2, 0.12);
  },
  /** Beasts: a chore is being worked on. */
  noise: () => tone('triangle', 196, 247, 0.3, 0.25),
  done: () => [523, 784].forEach((f, i) => tone('triangle', f, f, 0.12, 0.35, i * 0.1)),
  /** The exits are open. */
  doors: () => [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.2, 0.35, i * 0.12)),
  /**
   * A Beast is near: one beat of the music that says so. `near` is 0 to 1, `step` counts the
   * beats. A heartbeat under a low figure that creeps up a semitone and back; the nearer the
   * Beast, the louder it is, and close to it a thin high note starts to whine over the top.
   */
  dread: (near: number, step: number) => {
    tone('sine', 70, 45, 0.12, 0.2 + 0.35 * near);
    tone('sine', 62, 40, 0.12, 0.14 + 0.28 * near, 0.16);
    const low = CREEP[step % CREEP.length];
    tone('sawtooth', low, low, 0.22, 0.05 + 0.13 * near);
    tone('triangle', low * 2, low * 2, 0.18, 0.04 + 0.1 * near, 0.02);
    if (near > 0.55) {
      const high = step % 2 ? 1245 : 1175;
      tone('sine', high, high * 1.03, 0.16, 0.05 + 0.12 * (near - 0.55));
    }
    if (near > 0.85 && step % 2 === 0) noise(0.08, 0.06, 2600, 900);
  },
  /** The last seconds. */
  tick: () => tone('square', 990, 990, 0.04, 0.14),
  count: () => tone('triangle', 440, 440, 0.12, 0.35),
  go: () => tone('triangle', 660, 1320, 0.22, 0.4),
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.14, 0.4, i * 0.11)),
  lose: () => [392, 349, 294].forEach((f, i) => tone('sine', f, f * 0.96, i === 2 ? 0.6 : 0.24, 0.28, i * 0.22)),
};

/** A short buzz on phones that have one. */
export function buzz(ms: number): void {
  if (!isMuted()) navigator.vibrate?.(ms);
}
