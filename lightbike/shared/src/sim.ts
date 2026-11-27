/**
 * The rules of riding that the server and the client's prediction both run. A bike sits in a cell
 * and is `p` (0 to 1) of the way to the next one; it can only change direction on arriving in a cell.
 */
import { TURN_LEAD_CELLS, TURN_QUEUE } from './constants.js';

/** Directions: 0 right, 1 down, 2 left, 3 up. Adding 1 turns right, subtracting 1 turns left. */
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

/** A turn waiting to be taken: face `d` on arriving in the `at`-th cell of the round. */
export type Turn = { d: number; at: number };

export type Rider = {
  x: number;
  y: number;
  dir: number;
  /** Progress to the next cell. */
  p: number;
  /** Cells arrived in so far this round. */
  odo: number;
  queue: Turn[];
};

export const isDir = (d: unknown): d is number => d === 0 || d === 1 || d === 2 || d === 3;

/** The direction a new turn is measured against: the last one queued, or the one being ridden. */
export const heading = (r: Rider): number => (r.queue.length ? r.queue[r.queue.length - 1].d : r.dir);

/** Left (-1) or right (+1) of the way the rider is, or will be, heading. */
export const relative = (r: Rider, side: -1 | 1): number => (heading(r) + side + 4) % 4;

/**
 * Ask for a turn. Only a quarter turn from the current heading is taken; anything else is ignored.
 * `at` is the cell (by count) the rider wants it in: a client rides a little ahead of the server,
 * and naming the cell makes both turn in the same place. It is kept to the next cell or a few
 * beyond. Returns the cell it was booked for, or 0 when it was refused.
 */
export function queueTurn(r: Rider, d: number, at = 0): number {
  if (r.queue.length >= TURN_QUEUE) return 0;
  if ((heading(r) + d) % 2 === 0) return 0; // straight on, or straight back
  const soonest = r.queue.length ? r.queue[r.queue.length - 1].at + 1 : r.odo + 1;
  const booked = Math.min(Math.max(at, soonest), soonest + TURN_LEAD_CELLS);
  r.queue.push({ d, at: booked });
  return booked;
}

/** Arrived in a cell: count it, and take the turn booked for it (or for one already passed). True when the direction changed. */
export function arriveAndTurn(r: Rider): boolean {
  r.odo++;
  const t = r.queue[0];
  if (!t || t.at > r.odo) return false;
  r.queue.shift();
  r.dir = t.d;
  return true;
}
