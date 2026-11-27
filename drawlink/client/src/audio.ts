/** This game's sound cues. The engine behind them is shared. */
import { createAudio } from '@tggame/base/client/audio';
import { saved } from './store';

const audio = createAudio(saved);
export const { isMuted, setMuted, unlockAudio } = audio;
const { tone, noise } = audio;

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
