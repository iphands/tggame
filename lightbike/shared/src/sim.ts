/**
 * The rules of riding that the server and the client's prediction both run. A bike sits in a cell
 * and is `p` (0 to 1) of the way to the next one; it can only change direction on arriving in a cell.
 */
import { TURN_QUEUE } from './constants.js';

/** Directions: 0 right, 1 down, 2 left, 3 up. Adding 1 turns right, subtracting 1 turns left. */
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export type Rider = {
  x: number;
  y: number;
  dir: number;
  /** Progress to the next cell. */
  p: number;
  /** Directions waiting to be taken, one per cell arrived in. */
  queue: number[];
};

export const isDir = (d: unknown): d is number => d === 0 || d === 1 || d === 2 || d === 3;

/** The direction a new turn is measured against: the last one queued, or the one being ridden. */
export const heading = (r: Rider): number => (r.queue.length ? r.queue[r.queue.length - 1] : r.dir);

/** Left (-1) or right (+1) of the way the rider is, or will be, heading. */
export const relative = (r: Rider, side: -1 | 1): number => (heading(r) + side + 4) % 4;

/** Ask for a turn. Only a quarter turn from the current heading is taken; anything else is ignored. */
export function queueTurn(r: Rider, d: number): boolean {
  if (r.queue.length >= TURN_QUEUE) return false;
  if ((heading(r) + d) % 2 === 0) return false; // straight on, or straight back
  r.queue.push(d);
  return true;
}

/** Arrived in a cell: take the next waiting turn. True when the direction changed. */
export function turnHere(r: Rider): boolean {
  const d = r.queue.shift();
  if (d === undefined) return false;
  r.dir = d;
  return true;
}
