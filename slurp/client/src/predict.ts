/**
 * Where the server will have our hole once everything we have sent has reached it.
 *
 * A snapshot shows the hole as it was a trip ago, heading for an aim point that was already a trip
 * old when the server got it: a whole round trip behind the finger. Leaning the drawn hole toward
 * that snapshot (as this game used to) drags it back wherever the line is slow. Instead the hole
 * is carried forward from the snapshot through the aims sent since, each for as long as the server
 * will have followed it, with the very rule the server moves it by.
 */
import { TICK_MS } from '../../shared/src/constants';
import { moveHole } from '../../shared/src/sim';

/** An aim point sent to the server, and when (local clock, ms). */
export type SentAim = { at: number; x: number; y: number };

/** Never carry a hole forward by more than this: beyond it the line is too poor to guess across. */
const MAX_AHEAD_MS = 600;
/** How long sent aims are kept. */
const KEEP_MS = 1500;

/** Note an aim as sent, and forget the ones too old to matter (bar the one still in force then). */
export function noteAim(aims: SentAim[], aim: SentAim): void {
  aims.push(aim);
  while (aims.length > 1 && aims[1].at <= aim.at - KEEP_MS) aims.shift();
}

/**
 * @param snap where the newest snapshot has the hole
 * @param snapAt when that snapshot arrived (local clock, ms)
 * @param rttMs the round trip to the server
 * @param aims what was sent, oldest first
 * @param speed the hole's speed factor, as in the snapshot
 */
export function predictHole(
  snap: { x: number; y: number },
  snapAt: number,
  rttMs: number,
  aims: readonly SentAim[],
  now: number,
  w: number,
  h: number,
  speed: number,
): { x: number; y: number } {
  const m = { x: snap.x, y: snap.y, ax: snap.x, ay: snap.y };
  if (!aims.length) return m;
  // the snapshot knows of everything we sent up to a round trip (and a tick) before it arrived
  let t = Math.max(snapAt - rttMs - TICK_MS, now - MAX_AHEAD_MS);
  let i = 0;
  while (i + 1 < aims.length && aims[i + 1].at <= t) i++;
  while (t < now) {
    const until = i + 1 < aims.length ? Math.min(now, aims[i + 1].at) : now;
    m.ax = aims[i].x;
    m.ay = aims[i].y;
    while (t < until) {
      const step = Math.min(TICK_MS, until - t);
      moveHole(m, w, h, step / 1000, speed);
      t += step;
    }
    i++;
  }
  return m;
}
