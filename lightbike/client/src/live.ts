/**
 * The floor as it is right now: bikes, their lines and the rim, fed by `arena` and `snap`
 * messages. Kept apart from the party store because it changes 30 times a second and nothing
 * re-renders on it; the play screen reads it every frame.
 */
import { FLAG_DEAD } from '../../shared/src/constants';
import type { Rect } from '../../shared/src/arenas';
import type { ArenaMessage, SnapMessage } from '../../shared/src/protocol';
import type { Turn } from '../../shared/src/sim';
import type { How } from '../../shared/src/types';

export type BikeView = {
  id: string;
  /** Where it is drawn from: for other riders the last snapshot, ridden on a little; for our own bike, our prediction. */
  x: number;
  y: number;
  dir: number;
  p: number;
  /** Cells reached this round. */
  odo: number;
  /** Turns we have asked for that our own bike has not reached yet. */
  queue: Turn[];
  /** The line as drawn: x, y pairs. Other riders share the server's list; ours is predicted. */
  pts: number[];
  turns: number;
  /** What the server last said. */
  sx: number;
  sy: number;
  sdir: number;
  sp: number;
  sturns: number;
  sodo: number;
  spts: number[];
  /** Cells per second. */
  speed: number;
  flags: number;
  /** 0 to 1. */
  energy: number;
  /** Bumped with every snapshot that mentions this bike. */
  snapNo: number;
  /** Cells ridden since the last snapshot, so a stalled connection does not send bikes through walls. */
  coasted: number;
  dead: boolean;
  /** When (by `performance.now()`) its line began to fade, or 0. */
  goneAt: number;
  /** A correction still being eased away, in cells. */
  ox: number;
  oy: number;
};

/** Something the play screen may want to react to with sound or sparks. */
export type LiveEvent =
  | { kind: 'crash'; bike: BikeView; by: string; how: How }
  | { kind: 'bust'; id: string }
  | { kind: 'shrink'; ring: number };

export const live = {
  seq: -1,
  name: '',
  w: 0,
  h: 0,
  blocks: [] as Rect[],
  /** How far the rim has moved in. */
  ring: 0,
  bikes: new Map<string, BikeView>(),
  /** Countdown, and time until the rim moves, as of `stampedAt`. */
  cd: 0,
  calm: 0,
  stampedAt: 0,
  /** Our own bike is predicted by the play screen, so snapshots must not move it. */
  selfId: '',
  /** How often our own bike has had to be put where the server says it is: once a round is normal, more means lag. */
  adopted: 0,
  onEvent: null as ((e: LiveEvent) => void) | null,
};

function bike(id: string, pts: number[], dead: boolean): BikeView {
  const x = pts[pts.length - 2];
  const y = pts[pts.length - 1];
  return {
    id, x, y, dir: 0, p: 0, odo: 0, queue: [], pts, turns: 0, sx: x, sy: y, sdir: 0, sp: 0, sturns: 0, sodo: 0, spts: pts,
    speed: 0, flags: dead ? FLAG_DEAD : 0, energy: 1, snapNo: 0, coasted: 0, dead, goneAt: 0, ox: 0, oy: 0,
  };
}

export function onArena(msg: ArenaMessage): void {
  live.seq = msg.seq;
  live.name = msg.name;
  live.w = msg.w;
  live.h = msg.h;
  live.blocks = msg.blocks;
  live.ring = msg.ring;
  live.bikes.clear();
  for (const [id, gone, pts] of msg.trails) live.bikes.set(id, bike(id, pts, gone === 1));
}

/** Where a bike is drawn, in cells (the middle of cell 0 is 0.5). */
export const drawnX = (b: BikeView): number => b.x + 0.5 + (b.dir === 0 ? b.p : b.dir === 2 ? -b.p : 0) + b.ox;
export const drawnY = (b: BikeView): number => b.y + 0.5 + (b.dir === 1 ? b.p : b.dir === 3 ? -b.p : 0) + b.oy;

export function onSnap(msg: SnapMessage): void {
  const now = performance.now();
  live.cd = msg.cd;
  live.calm = msg.calm;
  live.stampedAt = now;
  for (const [id, x, y, dir, p, speed, flags, energy, turns, odo] of msg.bikes) {
    let b = live.bikes.get(id);
    if (!b) live.bikes.set(id, (b = bike(id, [x, y], false)));
    b.sx = x;
    b.sy = y;
    b.sdir = dir;
    b.sp = p / 100;
    b.sturns = turns;
    b.sodo = odo;
    b.speed = speed / 10;
    b.flags = flags;
    b.energy = energy / 100;
    b.snapNo++;
    b.coasted = 0;
    if (id === live.selfId && !b.dead && !(flags & FLAG_DEAD) && b.snapNo > 1) continue;
    // everybody else simply is where the server says; the jump is eased away over a few frames
    const px = drawnX(b);
    const py = drawnY(b);
    b.x = x;
    b.y = y;
    b.dir = dir;
    b.p = b.sp;
    b.turns = turns;
    b.odo = odo;
    b.ox = b.oy = 0;
    const jx = px - drawnX(b);
    const jy = py - drawnY(b);
    if (b.snapNo > 1 && Math.abs(jx) + Math.abs(jy) < 2.5) [b.ox, b.oy] = [jx, jy];
  }
  for (const fx of msg.fx) {
    if (fx[0] === 's') {
      live.ring = fx[1];
      live.onEvent?.({ kind: 'shrink', ring: fx[1] });
      continue;
    }
    const b = live.bikes.get(fx[1]);
    if (!b) continue;
    if (fx[0] === 'c') {
      b.spts.push(fx[2], fx[3]);
    } else if (fx[0] === 'x') {
      b.spts.push(fx[3], fx[4]);
      // our own line was a guess until now: this is where it really ran
      b.pts = b.spts;
      b.dead = true;
      b.flags |= FLAG_DEAD;
      b.x = fx[3];
      b.y = fx[4];
      b.p = 0;
      b.ox = b.oy = 0;
      b.speed = 0;
      b.queue.length = 0;
      live.onEvent?.({ kind: 'crash', bike: b, by: fx[2], how: fx[5] });
    } else if (fx[0] === 'e') {
      b.goneAt = now;
    } else if (fx[0] === 'b') {
      live.onEvent?.({ kind: 'bust', id: fx[1] });
    }
  }
}

/** Forget the floor (back in the lobby, or disconnected for good). */
export function clearLive(): void {
  live.seq = -1;
  live.bikes.clear();
  live.ring = 0;
}
