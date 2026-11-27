/** Wire protocol between server and client: one JSON message per WebSocket frame. */
import type { CrateState, FeedEntry, Fx, Phase, PlayerState, ProjectileState, Records, ResultRow } from './types.js';

export type ClientMessage =
  /** `token` is the seat token of an earlier welcome: a dropped player gets their runner back with it. */
  | { type: 'join'; name?: string; token?: string; /** A screen that only watches (a TV): it gets no runner and is sent what everybody is. */ watch?: boolean }
  /**
   * Held buttons. With `seq` and `tick` the server does it on that very tick (the client has
   * already done it there in its prediction); without them it is done as it arrives.
   */
  | { type: 'input'; left: boolean; right: boolean; jump: boolean; seq?: number; tick?: number }
  | { type: 'shoot'; seq?: number; tick?: number }
  | { type: 'drop'; seq?: number; tick?: number }
  | { type: 'restart' }
  | { type: 'leave' }
  | { type: 'rename'; name: string }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'pickLevel'; dir: 1 | -1 };

/** Everything the server broadcasts each snapshot (30 Hz). */
export type SnapshotBody = {
  tick: number;
  simTimeMs: number;
  phase: Phase;
  /** ms left in the current phase: the countdown while 'starting', the results screen while 'ended'. */
  countdownMs: number | null;
  /** Lobby: ms until the round auto-starts (null = not armed). */
  autoStartMs: number | null;
  timeLeftMs: number | null;
  /** Once someone has finished: ms the rest have left to cross the line. */
  graceMs: number | null;
  winnerId: string | null;
  /** Course being played (index into LEVELS). */
  level: number;
  /** Course for the next round. */
  nextLevel: number;
  /** Bumps every time a round is (re)built, so clients rebuild the course even on a same-course restart. */
  round: number;
  /** Left edge of the screen in course px. */
  scrollX: number;
  players: PlayerState[];
  /** Crumbling platforms that aren't solid right now: [platform index, state]. Positions come from the level data. */
  crumble: [number, 'shaking' | 'gone'][];
  /** Boxes near the screen that are damaged or broken: [index into level.boxes, hp left]. */
  boxes: [number, number][];
  /** The next standing gate (index into level.gates), or null when all are down. */
  gate: { i: number; hp: number; max: number } | null;
  projectiles: ProjectileState[];
  crates: CrateState[];
  /** One-shot effects since the previous snapshot. */
  fx: Fx[];
  /** Recent KOs, newest first. */
  feed: FeedEntry[];
  /** Final standings while phase === 'ended'. */
  results: ResultRow[] | null;
};

/** When a stamped command is for: its number, and the server tick it should be done on. */
export type Stamp = { seq: number; tick: number };

/**
 * The part of your own runner nobody else is sent: everything `stepPlayer` reads, unrounded, so
 * the client can carry it forward from this snapshot through the commands it has sent since.
 */
export type SelfState = {
  /** Number of the last stamped command done (0 = none yet). */
  ack: number;
  /**
   * Ticks to spare when the stamped commands since the last snapshot arrived (the least of them;
   * negative = late, done at once). null if none arrived. The client leads by more or less on it.
   */
  slack: number | null;
  /** The sim clock, exactly. */
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  grounded: boolean;
  platIdx: number;
  coyoteMs: number;
  jumpBufferMs: number;
  prevJump: boolean;
  cuttable: boolean;
  airJumpsLeft: number;
  dropFrom: number;
  dropUntil: number;
  prevBottom: number;
  launchUntil: number;
  boostUntil: number;
  input: { left: boolean; right: boolean; jump: boolean };
  /** Max-speed multiplier this tick (damage, lead over the pack, shoes). */
  speedMul: number;
  /** The screen's left edge, exactly. */
  scrollX: number;
  /** Sim ms the round went live (the screen waits a moment before it starts to creep). */
  roundStartT: number;
};

export type SnapshotMessage = { type: 'snapshot'; selfId: string; you: SelfState | null } & SnapshotBody;

export type ServerMessage =
  /** `selfId` and `token` are empty for a screen that only watches. */
  | { type: 'welcome'; selfId: string; token: string; capacity: number; serverTimeMs: number }
  /** Sent after the welcome and again whenever somebody sets a new best. */
  | { type: 'records'; records: Records }
  /** Somebody changed their name. Sent once, so nothing has to watch for it in every snapshot. */
  | { type: 'renamed'; id: string; name: string }
  | { type: 'full'; capacity: number }
  | SnapshotMessage;

const NO_ARGS = new Set(['shoot', 'drop', 'restart', 'leave', 'addBot', 'removeBot']);

const isCount = (n: unknown): boolean => n === undefined || (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 2 ** 31);

/** The stamp on a command, if it carries a whole one. */
export function stampOf(m: { seq?: number; tick?: number }): Stamp | undefined {
  return typeof m.seq === 'number' && typeof m.tick === 'number' ? { seq: m.seq, tick: m.tick } : undefined;
}

export function isClientMessage(v: unknown): v is ClientMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (!isCount(m.seq) || !isCount(m.tick)) return false;
  switch (m.type) {
    case 'join':
      return (m.name === undefined || typeof m.name === 'string') && (m.token === undefined || (typeof m.token === 'string' && m.token.length <= 64)) && (m.watch === undefined || typeof m.watch === 'boolean');
    case 'input':
      return typeof m.left === 'boolean' && typeof m.right === 'boolean' && typeof m.jump === 'boolean';
    case 'pickLevel':
      return m.dir === 1 || m.dir === -1;
    case 'rename':
      return typeof m.name === 'string' && m.name.length <= 64;
    default:
      return typeof m.type === 'string' && NO_ARGS.has(m.type);
  }
}
