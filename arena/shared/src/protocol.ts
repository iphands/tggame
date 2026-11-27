/** Wire protocol between server and client: one JSON message per WebSocket frame. */
import type {
  CrateState,
  FeedEntry,
  Fx,
  Phase,
  PlatformState,
  PlayerState,
  ProjectileState,
  ResultRow,
} from './types.js';

export type ClientMessage =
  | { type: 'join'; name?: string }
  | { type: 'input'; left: boolean; right: boolean; jump: boolean }
  | { type: 'shoot' }
  /** Fire button let go: throws a bomb that is still winding up. */
  | { type: 'release' }
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
  winnerId: string | null;
  /** Arena being played (index into LEVELS). */
  level: number;
  /** Arena for the next round. */
  nextLevel: number;
  players: PlayerState[];
  /** Empty in the lobby. */
  platforms: PlatformState[];
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
  /** Somebody changed their name. Sent once, so nothing has to watch for it in every snapshot. */
  | { type: 'renamed'; id: string; name: string }
  | { type: 'full'; capacity: number }
  | SnapshotMessage;

const NO_ARGS = new Set(['shoot', 'release', 'drop', 'restart', 'leave', 'addBot', 'removeBot']);

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
