/** Game tuning: the single source of truth for every gameplay number. */

export { BOT_NAMES, COLORS, PHYS, SNAP_EVERY_TICKS, TICK_HZ, TICK_MS } from '@tggame/base/platformer/constants';

/** The visible window onto the course (the camera never zooms out past this). */
export const ARENA = {
  width: 1280,
  height: 720,
} as const;

/** Runner rules: the scrolling screen, lives, the finish. */
export const RUN = {
  lives: 8,
  /** The screen always creeps forward at least this fast (px/s). */
  scrollBase: 190,
  /** Grace after GO before the screen starts moving. */
  scrollDelayMs: 1000,
  /** The leader drags the screen along once past this fraction of its width. */
  leadFrac: 0.58,
  /** Fastest the screen can chase the leader (px/s). */
  catchup: 520,
  /** You're caught once fully this far past the left screen edge. */
  killMargin: 8,
  /** ...or this far below the bottom of the screen. */
  fallBelow: 140,
  /** A standing gate holds the screen with the gate at this fraction of its width. */
  gateHoldFrac: 0.72,
  /** Respawn on the first safe spot at least this far in from the left edge. */
  respawnAheadFrac: 0.3,
  /** After the first finisher, everyone else has this long to cross the line. */
  finishGraceMs: 20_000,
  /** Every life lost adds this to your finishing time. */
  deathPenaltyMs: 1000,
  /** Every hit shoves as if the victim sat at this damage percent (no build-up). */
  shovePct: 40,
  /** Damage percent a runner takes per hit (per life). It never changes the shove: it only slows them. */
  dmg: { stomp: 8, pistol: 6, boomstick: 5, bomb: 18, smg: 3, rocket: 25, railgun: 30 },
  /** Most the card will show. */
  dmgMax: 999,
  /** Damage trims max run speed: by `dmgSlow` at `dmgSlowFull` percent and beyond. */
  dmgSlow: 0.15,
  dmgSlowFull: 100,
  /** Each shot that hits the gate while the screen waits at it heals the shooter this much damage percent. */
  gateHeal: 2,
  /**
   * Rubber band: a runner ahead of the rest of the pack (the mean x of the
   * other runners on the course) loses up to `leadSlow` of their max speed,
   * ramping from `leadSlowFrom` px of lead to `leadSlowFull` px.
   */
  leadSlow: 0.1,
  leadSlowFrom: 150,
  leadSlowFull: 650,
} as const;

/** Breakable boxes and co-op gates. */
export const BOX = {
  size: 48,
  hp: 5,
  /** Ledges this low are stepped onto instead of blocking. */
  stepUp: 8,
  gateW: 96,
  /** Gate hit points per racer still in the round. */
  gateHpPerPlayer: 36,
  /** A held gate crumbles on its own within this long (nobody gets stuck forever). */
  gateDecayMs: 45_000,
  /** Damage each weapon deals to boxes and gates. */
  dmg: { bullet: 1, pellet: 1, dart: 0.5, bomb: 8, rocket: 12, railgun: 15 },
} as const;

export const COMBAT = {
  maxKnock: 2600,
  /** Hitstun ms per px/s of knockback speed. */
  hitstunPerSpeed: 0.32,
  koCreditMs: 5000,
  stomp: { base: 220, growth: 3.6, bounceVel: 1100, angleDeg: 65 },
  pistol: { base: 210, growth: 2.9, speed: 1600, ttlMs: 650, cooldownMs: 300, angleDeg: 24 },
  /** Guns bend toward the nearest foe in front within this cone (no jump-to-aim needed on touch). */
  aimAssist: { maxDeg: 12.5, range: 900 },
  boomstick: { pellets: 5, spreadDeg: 18, base: 230, growth: 3.4, speed: 1350, ttlMs: 250, cooldownMs: 650, ammo: 4, angleDeg: 22, recoil: 380 },
  bomb: { fuseMs: 1500, throwVx: 640, throwVy: -640, gravity: 1800, radius: 125, base: 480, growth: 6.4, ammo: 3, cooldownMs: 450, minAngleDeg: 28, armMs: 90 },
  smg: { base: 130, growth: 1.6, speed: 1700, ttlMs: 450, cooldownMs: 70, ammo: 30, angleDeg: 15, spreadDeg: 5 },
  rocket: { speed: 520, accel: 900, maxSpeed: 1250, ttlMs: 1600, radius: 115, base: 1040, growth: 13.2, ammo: 3, cooldownMs: 600, minAngleDeg: 25, recoil: 160 },
  /** The big one: rare, 2 shots, short telegraphed charge, screen-wide piercing beam. */
  railgun: { chargeMs: 320, base: 820, growth: 9.5, range: 1500, ammo: 2, cooldownMs: 900, angleDeg: 20, recoil: 520, width: 14 },
  shieldMs: 6000,
} as const;

export const MATCH = {
  capacity: 16,
  respawnDelayMs: 1300,
  invulnMs: 2000,
  countdownMs: 3000,
  durationMs: 3 * 60_000,
  endHoldMs: 9000,
  quickStartPlayers: 10,
  fallbackStartPlayers: 2,
  fallbackWaitMs: 10_000,
} as const;

export const ITEMS = {
  firstCrateMinMs: 2000,
  firstCrateMaxMs: 4000,
  intervalMinMs: 2500,
  intervalMaxMs: 4000,
  maxCrates: 5,
  size: 28,
  lifeMs: 14_000,
  blinkMs: 3000,
  gravity: 1800,
  maxFall: 900,
  /** Speed shoes: max run speed (ground and air) is multiplied by this for `shoesMs`. Lost with a life. */
  shoesSpeed: 1.3,
  shoesMs: 8000,
} as const;

