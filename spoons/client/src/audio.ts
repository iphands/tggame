/** This game's sound cues. The engine behind them is shared. */
import { createAudio } from '@tggame/base/client/audio';
import { saved } from './store';

const audio = createAudio(saved);
export const { isMuted, setMuted, unlockAudio } = audio;
const { tone, noise } = audio;

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
  heckle: audio.heckle,
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.14, 0.4, i * 0.11)),
  /** Sad trombone, short. */
  lose: () => [392, 370, 349, 311].forEach((f, i) => tone('sawtooth', f, f * 0.97, i === 3 ? 0.55 : 0.2, 0.25, i * 0.2)),
  nope: () => tone('square', 180, 120, 0.16, 0.2),
};
