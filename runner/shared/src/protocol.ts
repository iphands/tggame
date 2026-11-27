/** Wire protocol between server and client: one JSON message per WebSocket frame. */
import type { CrateState, FeedEntry, Fx, Phase, PlayerState, ProjectileState, Records, ResultRow } from './types.js';

export type ClientMessage =
  | { type: 'join'; name?: string }
  | { type: 'input'; left: boolean; right: boolean; jump: boolean }
  | { type: 'shoot' }
  | { type: 'drop' }
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

export type SnapshotMessage = { type: 'snapshot'; selfId: string } & SnapshotBody;

export type ServerMessage =
  | { type: 'welcome'; selfId: string; capacity: number; serverTimeMs: number }
  /** Sent after the welcome and again whenever somebody sets a new best. */
  | { type: 'records'; records: Records }
  /** Somebody changed their name. Sent once, so nothing has to watch for it in every snapshot. */
  | { type: 'renamed'; id: string; name: string }
  | { type: 'full'; capacity: number }
  | SnapshotMessage;

const NO_ARGS = new Set(['shoot', 'drop', 'restart', 'leave', 'addBot', 'removeBot']);

export function isClientMessage(v: unknown): v is ClientMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  switch (m.type) {
    case 'join':
      return m.name === undefined || typeof m.name === 'string';
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
