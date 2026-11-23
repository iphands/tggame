/** Logical world dimensions (Phaser canvas is this size, scaled to fit). */
export const WORLD = {
  width: 1280,
  height: 720,
  /** y past which a player is eliminated (falls into the pit). */
  killY: 820,
  gravity: 2600, // px/s^2
  playerW: 32,
  playerH: 42,
  maxSpeed: 285, // px/s horizontal, grounded
  airMaxSpeed: 260, // px/s horizontal, airborne (slightly less)
  accel: 2100, // px/s^2 grounded acceleration
  airAccel: 1500,
  friction: 2600, // px/s^2 deceleration when no horizontal input
  jumpVel: 900, // px/s
  coyoteMs: 110,
  jumpBufferMs: 140,
  maxFallSpeed: 1250,
  maxKnockbackSpeed: 430,
  knockbackImpulse: 340, // extra px/s on collision push
  pushCooldownMs: 350, // per-player cooldown on being pushed
  /** Stomp tuning. */
  maxHp: 100,
  stompDamage: 15,
  stompBounceVel: 1300, // px/s — stomper rebounds
  stompShoveVel: 620, // px/s sideways shove — can exceed maxSpeed for a short window
  stompPopVel: 340, // px/s vertical pop on the stomped player
  stompBoostMs: 200, // boost window where the shove survives the max-speed clamp
  /** Variable-height jump + slow descent. */
  jumpCutGravity: 6200, // extra px/s^2 added to gravity while rising and jump is NOT held (cuts the jump short)
  descendGravity: 750, // px/s^2 while falling and jump IS held (floaty descent)
  descendMaxFallSpeed: 340, // px/s fall cap while falling and held (soft landing)
  dropThroughMs: 120, // window during which the platform being dropped through is ignored
  /** Pistol (default weapon) tuning. */
  pistolDamage: 50, // hit deals half of maxHp (100)
  shootCooldownMs: 360,
  bulletSpeed: 1500, // px/s
  bulletTtlMs: 700,
  /** Match tuning. */
  capacity: 16,
  quickStartPlayers: 10, // start quickly once this many are connected
  fallbackStartPlayers: 2, // and never wait longer than this with this many connected
  fallbackWaitMs: 10_000,
  countdownMs: 3_000,
  matchDurationMs: 3 * 60_000,
  endHoldMs: 8_000, // how long the winner banner stays before resetting to the lobby
} as const;

export const TICK_HZ = 60;
export const SNAP_HZ = 30;

/** Palette assigned to players in join order (32-player-proof by modulo). */
export const PLAYER_COLORS = [
  '#ff6b6b', // red
  '#ffa502', // orange
  '#2ed573', // green
  '#1e90ff', // blue
  '#ff6bcb', // pink
  '#f5f6fa', // white
  '#a55eea', // purple
  '#fd79a8', // rose
  '#feca57', // yellow
  '#48dbfb', // cyan
  '#ff9f43', // apricot
  '#1dd1a1', // mint
  '#f368e0', // magenta
  '#ff9f1a', // amber
  '#00d2d3', // teal
  '#ee5a24', // burnt orange
] as const;

let nameSeq = 1;
export function nextPlayerId(): string {
  // Random-ish but unique: time + counter + short random suffix.
  return `p_${Date.now().toString(36)}_${nameSeq++}_${Math.random().toString(36).slice(2, 6)}`;
}

// ===========================================================================
// v2 rules (the rewrite). Everything below is the single source of truth for
// game tuning in the new simulation.
// ===========================================================================

export const TICK_MS = 1000 / TICK_HZ;
/** A snapshot is broadcast every N sim ticks (2 → 30 Hz). */
export const SNAP_EVERY_TICKS = 2;

export const ARENA = {
  width: 1280,
  height: 720,
  /** Blast zones: crossing any of these loses a stock. */
  blastLeft: -200,
  blastRight: 1480,
  blastTop: -460,
  blastBottom: 860,
} as const;

export const PHYS = {
  playerW: 32,
  playerH: 42,
  gravity: 2600, // px/s^2
  maxFallSpeed: 1250,
  maxSpeed: 300, // px/s, grounded
  airMaxSpeed: 275,
  accel: 2600,
  airAccel: 1700,
  friction: 3000,
  jumpVel: 900,
  airJumpVel: 820,
  airJumps: 1, // double jump
  coyoteMs: 110,
  jumpBufferMs: 140,
  /** Variable-height jump: extra gravity while rising with jump released. */
  jumpCutGravity: 6200,
  /** Holding jump while falling: floaty descent. */
  descendGravity: 750,
  descendMaxFall: 340,
  dropThroughMs: 160,
  /** Bounce pads. */
  bounceVel: 1500,
  /** Ice: multipliers on grounded accel / friction. */
  iceAccelMul: 0.32,
  iceFrictionMul: 0.08,
  iceMaxSpeedMul: 1.25,
  /** Crumbling platforms. */
  crumbleMs: 700,
  crumbleRespawnMs: 4500,
  /** Body push between overlapping players. */
  bodyPush: 90,
  /** While launched: per-second exponential drag on horizontal speed. */
  launchDrag: 0.55,
  /** Control while launched (fraction of air accel). */
  launchControl: 0.35,
} as const;

export const COMBAT = {
  maxKnock: 2600,
  /** Hitstun ms per px/s of knockback speed. */
  hitstunPerSpeed: 0.32,
  koCreditMs: 5000,
  punch: { dmg: 7, base: 330, growth: 5.4, angleDeg: 32, range: 40, activeMs: 100, cooldownMs: 320, lunge: 260 },
  stomp: { dmg: 9, base: 220, growth: 3.6, bounceVel: 1100, angleDeg: 65 },
  pistol: { dmg: 4, base: 160, growth: 2.3, speed: 1500, ttlMs: 650, cooldownMs: 380, angleDeg: 18 },
  boomstick: { pellets: 5, spreadDeg: 18, dmg: 5, base: 230, growth: 3.4, speed: 1350, ttlMs: 250, cooldownMs: 650, ammo: 4, angleDeg: 22, recoil: 380 },
  bomb: { fuseMs: 1500, throwVx: 640, throwVy: -640, gravity: 1800, radius: 125, dmg: 16, base: 480, growth: 6.4, ammo: 3, cooldownMs: 450, minAngleDeg: 28, armMs: 90 },
  shieldMs: 6000,
  heal: 40,
} as const;

export const MATCH = {
  capacity: 16,
  stocks: 3,
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
  firstCrateMinMs: 4000,
  firstCrateMaxMs: 7000,
  intervalMinMs: 7000,
  intervalMaxMs: 11000,
  /** Crates rain faster near the end. */
  finaleMs: 45_000,
  finaleMul: 0.55,
  maxCrates: 3,
  size: 28,
  lifeMs: 14_000,
  blinkMs: 3000,
  gravity: 1800,
  maxFall: 900,
} as const;

/** Player palette (assigned first-free, so colors stay unique). */
export const COLORS = [
  '#ff5d5d', // red
  '#4da3ff', // blue
  '#3ddc84', // green
  '#ffc23d', // yellow
  '#c77dff', // purple
  '#ff8c42', // orange
  '#3de0e0', // cyan
  '#ff6bcb', // pink
  '#f5f6fa', // white
  '#a3e635', // lime
  '#8d6bff', // indigo
  '#ff9e9e', // salmon
  '#1dd1a1', // mint
  '#e0a96d', // tan
  '#9aa5b1', // steel
  '#ff3d7f', // magenta
] as const;

export const BOT_NAMES = [
  'Bolt', 'Pixel', 'Rusty', 'Nova', 'Gizmo', 'Chomp', 'Zippy', 'Blip',
  'Turbo', 'Sprocket', 'Fizz', 'Widget', 'Dash', 'Ziggy', 'Boop', 'Kazoo',
] as const;
