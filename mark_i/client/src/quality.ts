/**
 * Graphics quality tiers. Costly effects (full-screen shaders, extra sprites)
 * are gated by the active tier. In `auto`, a rolling FPS monitor steps the tier
 * down when the device can't keep up. Pure logic: no DOM, unit-tested.
 */

export type Tier = 'high' | 'medium' | 'low';
export type Setting = 'auto' | Tier;

export type QualityFlags = {
  /** Full-screen bloom shader (the only post pass; desktop-class GPUs). */
  bloom: boolean;
  /** Vignette overlay (a single sprite, not a shader pass). */
  vignette: boolean;
  /** Baked sun/moon rays over the backdrop. */
  lightShafts: boolean;
  /** Contact shadows under fighters. */
  shadows: boolean;
  /** Ghost trails behind fast/launched fighters. */
  afterimages: boolean;
  /** Fluttering headband ribbons. */
  ribbons: boolean;
  /** Multiplier on ambient weather / life counts. */
  ambientMul: number;
  /** Multiplier on particle burst sizes. */
  particleMul: number;
};

export const FLAGS: Record<Tier, QualityFlags> = {
  high: { bloom: true, vignette: true, lightShafts: true, shadows: true, afterimages: true, ribbons: true, ambientMul: 1, particleMul: 1 },
  medium: { bloom: false, vignette: true, lightShafts: true, shadows: true, afterimages: true, ribbons: true, ambientMul: 0.7, particleMul: 0.75 },
  low: { bloom: false, vignette: false, lightShafts: false, shadows: false, afterimages: false, ribbons: false, ambientMul: 0.35, particleMul: 0.5 },
};

const ORDER: Tier[] = ['high', 'medium', 'low'];

/** Rolling-average FPS below this (in auto) drops a tier. */
export const MIN_FPS = 50;
const WINDOW_MS = 3000;
const COOLDOWN_MS = 10_000;

export class QualityManager {
  tier: Tier;
  private samples: { t: number; fps: number }[] = [];
  private lastChange = -Infinity;

  constructor(
    public setting: Setting,
    touch: boolean
  ) {
    this.tier = setting === 'auto' ? (touch ? 'medium' : 'high') : setting;
  }

  get flags(): QualityFlags {
    return FLAGS[this.tier];
  }

  /** Change the user setting; returns true if the active tier changed. */
  set(setting: Setting, touch: boolean): boolean {
    const before = this.tier;
    this.setting = setting;
    this.tier = setting === 'auto' ? (touch ? 'medium' : 'high') : setting;
    this.samples = [];
    return before !== this.tier;
  }

  /**
   * Feed one FPS reading. In auto mode, steps down one tier if the average
   * over the last 3 s is under MIN_FPS (at most once per 10 s). Returns true
   * when the tier changed.
   */
  sample(fps: number, now: number): boolean {
    if (this.setting !== 'auto') return false;
    this.samples.push({ t: now, fps });
    while (this.samples.length && now - this.samples[0].t > WINDOW_MS) this.samples.shift();
    if (now - this.lastChange < COOLDOWN_MS) return false;
    const span = now - this.samples[0].t;
    if (span < WINDOW_MS * 0.9) return false;
    const avg = this.samples.reduce((s, x) => s + x.fps, 0) / this.samples.length;
    const i = ORDER.indexOf(this.tier);
    if (avg < MIN_FPS && i < ORDER.length - 1) {
      this.tier = ORDER[i + 1];
      this.lastChange = now;
      this.samples = [];
      return true;
    }
    return false;
  }
}

export const SETTINGS: Setting[] = ['auto', 'high', 'medium', 'low'];

export function nextSetting(s: Setting): Setting {
  return SETTINGS[(SETTINGS.indexOf(s) + 1) % SETTINGS.length];
}
