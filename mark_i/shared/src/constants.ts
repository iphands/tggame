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
