/** Tuning the platformers agree on: the simulation clock, movement physics, player colours, bot names. */

/** Simulation rate. */
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
/** A snapshot is broadcast every N sim ticks (2 → 30 Hz). */
export const SNAP_EVERY_TICKS = 2;

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
  /** Pressing down in the air snaps your fall to at least this speed. */
  fastFallVel: 950,
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
