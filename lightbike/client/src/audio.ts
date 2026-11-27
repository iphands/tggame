/** This game's sound cues. The engine behind them is shared. */
import { createAudio } from '@tggame/base/client/audio';
import { saved } from './store';

const audio = createAudio(saved);
export const { isMuted, setMuted, unlockAudio } = audio;
const { tone, noise } = audio;

export const sfx = {
  /** Button / pick. */
  pop: () => tone('sine', 520, 880, 0.09, 0.5),
  /** Your bike took a corner. */
  turn: () => tone('square', 880, 660, 0.04, 0.12),
  count: () => tone('triangle', 440, 440, 0.12, 0.35),
  go: () => {
    tone('sawtooth', 220, 880, 0.3, 0.3);
    tone('triangle', 660, 1320, 0.25, 0.35, 0.03);
  },
  /** Somebody is out. Yours is the loud one. */
  crash: (mine: boolean) => {
    noise(mine ? 0.5 : 0.28, mine ? 0.5 : 0.18, 2400, 120);
    tone('sawtooth', mine ? 330 : 260, 40, mine ? 0.5 : 0.25, mine ? 0.4 : 0.14);
  },
  /** The boost came on. */
  boost: () => tone('sawtooth', 180, 520, 0.22, 0.22),
  /** Somebody set off a buster. */
  bust: (mine: boolean) => {
    tone('sine', 1320, 330, 0.3, mine ? 0.32 : 0.1);
    tone('square', 660, 165, 0.3, mine ? 0.14 : 0.05, 0.03);
  },
  /** The button was pressed with too little in the bar. */
  nope: () => tone('square', 160, 120, 0.1, 0.18),
  /** Somebody crashed into your line. */
  point: () => [784, 1175].forEach((f, i) => tone('triangle', f, f, 0.1, 0.32, i * 0.07)),
  /** The rim moved in. */
  shrink: () => tone('square', 140, 110, 0.12, 0.1),
  /** The rim is about to start moving. */
  alarm: () => [0, 0.22].forEach((d) => tone('sawtooth', 520, 390, 0.16, 0.22, d)),
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.14, 0.4, i * 0.11)),
  /** Not your round: a soft sigh, not a buzzer. */
  lose: () => [392, 349, 294].forEach((f, i) => tone('sine', f, f * 0.96, i === 2 ? 0.6 : 0.24, 0.28, i * 0.22)),
};

/** A short buzz on phones that have one. */
export function buzz(ms: number): void {
  if (!isMuted()) navigator.vibrate?.(ms);
}
