/**
 * The round as it is right now: bodies, pills, chores and the clock, fed by `snap` messages.
 * Kept apart from the party store because it changes 30 times a second and nothing re-renders on
 * it; the play screen reads it every frame.
 */
import { SnapshotBuffer } from '@tggame/base/platformer/interp';
import type { SnapMessage } from '../../shared/src/protocol';
import type { BodySnap, Fx, SelfSnap } from '../../shared/src/types';

type BodyFrame = { simTimeMs: number; bodies: BodySnap[] };
/** Something a Beast heard: roughly where, how many were at it, and when (local clock). */
export type Noise = { x: number; y: number; k: number; at: number };

export const live = {
  buffer: new SnapshotBuffer<BodyFrame>(),
  /** Countdown and clock as of `stampedAt`. */
  cd: 0,
  /** Left until the Beast is let loose, as of `stampedAt`. */
  go: 0,
  left: 0,
  /** Left of a pause for a catch, as of `stampedAt`. */
  hold: 0,
  stampedAt: 0,
  /** Our own energy and waits, or null while only watching. */
  me: null as SelfSnap | null,
  /** Bit `i` set while pill `i` is there. */
  pills: 0,
  /** Progress of each chore, 0 to 100. */
  tasks: [] as number[],
  noises: [] as Noise[],
  onEvent: null as ((e: Fx) => void) | null,
};

export function clearLive(): void {
  live.buffer.clear();
  live.cd = 0;
  live.left = 0;
  live.go = 0;
  live.hold = 0;
  live.stampedAt = 0;
  live.me = null;
  live.pills = 0;
  live.tasks = [];
  live.noises = [];
}

export function onSnap(msg: SnapMessage): void {
  const now = performance.now();
  live.cd = msg.cd;
  live.left = msg.left;
  live.go = msg.go;
  live.hold = msg.hold;
  live.stampedAt = now;
  live.me = msg.me;
  live.pills = msg.pl;
  live.tasks = msg.tk;
  live.buffer.push({ simTimeMs: msg.simTimeMs, bodies: msg.bodies }, now);
  for (const e of msg.fx) {
    if (e[0] === 'n') live.noises.push({ x: e[1], y: e[2], k: e[3], at: now });
    live.onEvent?.(e);
  }
}

/** Clock left on the round at `now`, counted on from the last snapshot. `aheadMs` shifts it onto our own timeline. */
export function clockLeft(now: number, aheadMs = 0): number {
  return live.cd > 0 || live.hold > 0 ? live.left : Math.max(0, live.left - (now - live.stampedAt) - aheadMs);
}

/** Left until the Beast is let loose at the start of a round, on that same timeline. */
export function goLeft(now: number, aheadMs = 0): number {
  return live.go > 0 ? Math.max(0, live.go - (live.hold > 0 ? 0 : now - live.stampedAt + aheadMs)) : 0;
}

/** Countdown left before the round starts, on that same timeline. */
export function countdownLeft(now: number, aheadMs = 0): number {
  return live.cd > 0 ? Math.max(0, live.cd - (now - live.stampedAt) - aheadMs) : 0;
}
