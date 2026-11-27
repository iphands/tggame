/**
 * The table as it is right now: food, holes and the clock, fed by `course` and `snap` messages.
 * Kept apart from the party store because it changes 30 times a second and nothing re-renders on it;
 * the play screen reads it every frame.
 */
import { SnapshotBuffer } from '@tggame/base/platformer/interp';
import { TIERS, itemRadius } from '../../shared/src/constants';
import type { CourseMessage, SnapMessage } from '../../shared/src/protocol';
import type { HoleSnap } from '../../shared/src/types';

export type FoodView = {
  id: number;
  tier: number;
  r: number;
  /** Where it is drawn, easing toward where the server last said it is. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** `eaten` and `spilt` food plays its exit and is then dropped. */
  state: 'on' | 'eaten' | 'spilt';
  /** When it entered this state (or was laid), by `performance.now()`. */
  at: number;
  /** The hole swallowing it. */
  by: string;
  /** Extra wobble from being shoved, fading out. */
  nudge: number;
};

type HoleFrame = { simTimeMs: number; holes: HoleSnap[] };

/** Something the play screen may want to react to with sound or sparkle. */
export type LiveEvent =
  | { kind: 'eat'; food: FoodView; hole: string }
  | { kind: 'spill'; food: FoodView; by: string }
  | { kind: 'back'; food: FoodView }
  /** A hole set off the power with this index in `POWERS`. */
  | { kind: 'power'; hole: string; power: number };

export const live = {
  seq: -1,
  no: 0,
  w: 0,
  h: 0,
  foods: new Map<number, FoodView>(),
  buffer: new SnapshotBuffer<HoleFrame>(),
  /** Countdown and clock as of `stampedAt`. */
  cd: 0,
  left: 0,
  stampedAt: 0,
  /** Food still to eat. */
  n: 0,
  /** Pieces eaten per player on this course. */
  eaten: new Map<string, number>(),
  onEvent: null as ((e: LiveEvent) => void) | null,
};

function food(id: number, tier: number, x: number, y: number, now: number): FoodView {
  return { id, tier, r: itemRadius(tier), x, y, tx: x, ty: y, state: 'on', at: now, by: '', nudge: 0 };
}

export function onCourse(msg: CourseMessage): void {
  const now = performance.now();
  live.seq = msg.seq;
  live.no = msg.no;
  live.w = msg.w;
  live.h = msg.h;
  live.foods.clear();
  live.eaten.clear();
  live.n = msg.foods.filter((f) => f[1] < TIERS.length).length;
  // laid a moment "ago" so a table that was already there does not pop in
  for (const [id, tier, x, y] of msg.foods) live.foods.set(id, food(id, tier, x, y, now - 1000));
}

export function onSnap(msg: SnapMessage): void {
  const now = performance.now();
  live.cd = msg.cd;
  live.left = msg.left;
  live.n = msg.n;
  live.stampedAt = now;
  live.buffer.push({ simTimeMs: msg.simTimeMs, holes: msg.holes }, now);
  for (const [id, x, y] of msg.foods) {
    const f = live.foods.get(id);
    if (!f || f.state !== 'on') continue;
    f.tx = x;
    f.ty = y;
    f.nudge = 1;
  }
  for (const fx of msg.fx) {
    if (fx[0] === 'r') {
      const f = food(fx[1], fx[4], fx[2], fx[3], now);
      live.foods.set(f.id, f);
      live.onEvent?.({ kind: 'back', food: f });
      continue;
    }
    if (fx[0] === 'p') {
      live.onEvent?.({ kind: 'power', hole: fx[1], power: fx[2] });
      continue;
    }
    const f = live.foods.get(fx[1]);
    if (!f || f.state !== 'on') continue;
    f.at = now;
    if (fx[0] === 'e') {
      f.state = 'eaten';
      f.by = fx[2];
      // boxes and fish are not bites
      if (f.tier < TIERS.length) live.eaten.set(fx[2], (live.eaten.get(fx[2]) ?? 0) + 1);
      live.onEvent?.({ kind: 'eat', food: f, hole: fx[2] });
    } else {
      f.state = 'spilt';
      live.onEvent?.({ kind: 'spill', food: f, by: fx[2] });
    }
  }
}

/** Forget the table (back in the lobby, or disconnected for good). */
export function clearLive(): void {
  live.seq = -1;
  live.foods.clear();
  live.eaten.clear();
  live.buffer.clear();
}

/** Clock left right now, counted down locally between snapshots. */
export function clockLeft(now: number): number {
  return live.cd > 0 ? live.left : Math.max(0, live.left - (now - live.stampedAt));
}
