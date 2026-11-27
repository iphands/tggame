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
  /** Hilder bites. */
  chomp: () => {
    noise(0.07, 0.3, 900, 200);
    tone('square', 160, 60, 0.09, 0.3);
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
   * beats and `beatS` is how long this beat lasts, so what is played inside it keeps time.
   *
   * Far off it is a heartbeat under a low figure that creeps up a semitone and back. As she
   * closes in the figure climbs in pitch and a second, driving note lands on the off-beat; then
   * a high pair of notes a semitone apart starts to saw across it; and when she is nearly on
   * top of you the beat is hammered out in quick stabs, with a shriek over everything.
   */
  dread: (near: number, step: number, beatS: number) => {
    const hard = near * near;
    // the heart: thump-thump, and harder the nearer she is
    tone('sine', 78, 42, 0.13, 0.22 + 0.45 * near);
    tone('sine', 66, 38, 0.12, 0.16 + 0.34 * near, Math.min(0.16, beatS * 0.3));
    // the creeping figure: it rises up to a fifth as she closes in
    const low = CREEP[step % CREEP.length] * (1 + 0.5 * hard);
    tone('sawtooth', low, low * (1 + 0.04 * near), 0.2, 0.06 + 0.2 * near);
    tone('triangle', low * 2, low * 2, 0.16, 0.05 + 0.14 * near, 0.02);
    if (near > 0.3) {
      // the off-beat: the same note again, shorter and biting, so the pulse doubles
      tone('sawtooth', low, low * 0.97, 0.1, 0.05 + 0.2 * (near - 0.3), beatS / 2);
      tone('square', low / 2, low / 2, 0.09, 0.04 + 0.12 * (near - 0.3), beatS / 2);
    }
    if (near > 0.5) {
      // two high notes a semitone apart, sawing against each other
      const k = near - 0.5;
      const high = step % 2 ? 1245 : 1175;
      tone('sawtooth', high, high * 1.04, 0.14, 0.04 + 0.16 * k);
      tone('sawtooth', high * 1.06, high * 1.02, 0.14, 0.03 + 0.14 * k, beatS / 2);
    }
    if (near > 0.75) {
      // nearly caught: the beat hammered out in four, and a shriek that climbs
      const k = (near - 0.75) * 4;
      for (let i = 1; i < 4; i++) tone('square', low * 3, low * 3, 0.05, 0.05 + 0.1 * k, (beatS * i) / 4);
      tone('sawtooth', 1480 + 500 * k, 2100 + 700 * k, Math.min(0.2, beatS * 0.8), 0.05 + 0.12 * k);
      noise(0.09, 0.07 + 0.1 * k, 3200, 900);
    }
  },
  /** A ghost bumped a Beast. */
  boo: () => {
    tone('sine', 300, 720, 0.18, 0.3);
    tone('sine', 720, 240, 0.3, 0.22, 0.16);
  },
  /** Somebody trod on the spikes. */
  ouch: (mine: boolean) => {
    tone('square', 620, 180, 0.16, mine ? 0.3 : 0.12);
    noise(0.1, mine ? 0.2 : 0.08, 3000, 800);
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
