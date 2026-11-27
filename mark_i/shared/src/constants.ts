/** Game tuning: the single source of truth for every gameplay number. */

export { BOT_NAMES, COLORS, PHYS, SNAP_EVERY_TICKS, TICK_HZ, TICK_MS } from '@tggame/base/platformer/constants';

export const ARENA = {
  width: 1280,
  height: 720,
  /** Blast zones: crossing any of these loses a stock. */
  blastLeft: -200,
  blastRight: 1480,
  blastTop: -460,
  blastBottom: 860,
} as const;

export const COMBAT = {
  maxKnock: 2600,
  /** Hitstun ms per px/s of knockback speed. */
  hitstunPerSpeed: 0.32,
  koCreditMs: 5000,
  stomp: { dmg: 9, base: 220, growth: 3.6, bounceVel: 1100, angleDeg: 65 },
  pistol: { dmg: 5, base: 210, growth: 2.9, speed: 1600, ttlMs: 650, cooldownMs: 300, angleDeg: 24 },
  /** Guns bend toward the nearest foe in front within this cone (no jump-to-aim needed on touch). */
  aimAssist: { maxDeg: 12.5, range: 900 },
  boomstick: { pellets: 5, spreadDeg: 18, dmg: 5, base: 230, growth: 3.4, speed: 1350, ttlMs: 250, cooldownMs: 650, ammo: 4, angleDeg: 22, recoil: 380 },
  bomb: { fuseMs: 1500, throwVx: 640, throwVy: -640, shortVx: 250, shortVy: -430, holdMs: 300, gravity: 1800, radius: 125, dmg: 16, base: 480, growth: 6.4, ammo: 3, cooldownMs: 350, minAngleDeg: 28, armMs: 90 },
  smg: { dmg: 3, base: 130, growth: 1.6, speed: 1700, ttlMs: 450, cooldownMs: 70, ammo: 30, angleDeg: 15, spreadDeg: 5 },
  rocket: { speed: 520, accel: 900, maxSpeed: 1250, ttlMs: 1600, radius: 115, dmg: 30, base: 1040, growth: 13.2, ammo: 3, cooldownMs: 600, minAngleDeg: 25, recoil: 160 },
  /** The big one: rare, 2 shots, short telegraphed charge, screen-wide piercing beam. */
  railgun: { chargeMs: 320, dmg: 30, base: 820, growth: 9.5, range: 1500, ammo: 2, cooldownMs: 900, angleDeg: 20, recoil: 520, width: 14 },
  shieldMs: 6000,
  heal: 40,
} as const;

export const MATCH = {
  capacity: 16,
  stocks: 5,
  respawnDelayMs: 1300,
  invulnMs: 2000,
  countdownMs: 3000,
  durationMs: 4 * 60_000,
  endHoldMs: 9000,
  quickStartPlayers: 10,
  fallbackStartPlayers: 2,
  fallbackWaitMs: 10_000,
} as const;

export const ITEMS = {
  firstCrateMinMs: 2000,
  firstCrateMaxMs: 4000,
  intervalMinMs: 3500,
  intervalMaxMs: 5500,
  /** Crates rain faster near the end. */
  finaleMs: 45_000,
  finaleMul: 0.55,
  maxCrates: 5,
  size: 28,
  lifeMs: 14_000,
  blinkMs: 3000,
  gravity: 1800,
  maxFall: 900,
} as const;

