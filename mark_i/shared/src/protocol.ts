/** Shared wire protocol between server and client. Keep in sync via tests. */

export type Phase = 'lobby' | 'starting' | 'playing' | 'ended';

export type Cause = 'pit' | 'left' | 'timeout' | 'knockdown' | 'stomp';

export type PlayerInput = {
  left: boolean;
  right: boolean;
  jump: boolean;
};

export type ClientMessage =
  | { type: 'join'; name?: string }
  | { type: 'input'; left: boolean; right: boolean; jump: boolean }
  | { type: 'leave' }
  | { type: 'restart' };

export type PlayerSnapshot = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  /** true for players who joined mid-match (spectators) */
  waiting: boolean;
  hp: number;
  maxHp: number;
};

export type PlatformSnapshot = {
  x: number;
  y: number;
  w: number;
  h: number;
  moving: boolean;
};

export type EventItem = {
  id: string;
  name: string;
  cause: Cause;
  atMs: number; // ms since match start at which it happened
};

export type ServerMessage =
  | {
      type: 'welcome';
      selfId: string;
      capacity: number;
      serverTimeMs: number;
    }
  | {
      type: 'snapshot';
      tick: number; // sim tick
      phase: Phase;
      selfId: string;
      countdownMs: number | null; // during 'starting'
      timeLeftMs: number | null; // during 'playing'
      winnerId: string | null; // during 'ended'
      players: PlayerSnapshot[];
      platforms: PlatformSnapshot[];
      events: EventItem[]; // most recent elimination events (newest first)
      serverTimeMs: number;
    };

export function isClientMessage(v: unknown): v is ClientMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as { type?: unknown };
  if (m.type === 'join') return true;
  if (m.type === 'input') {
    const i = v as { left?: unknown; right?: unknown; jump?: unknown };
    return typeof i.left === 'boolean' && typeof i.right === 'boolean' && typeof i.jump === 'boolean';
  }
  if (m.type === 'leave') return true;
  if (m.type === 'restart') return true;
  return false;
}
