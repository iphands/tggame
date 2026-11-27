/**
 * Where the server will have our body once everything we have sent has reached it.
 *
 * A snapshot shows the body as it was a trip ago, steered by controls that were already a trip
 * old when the server got them: a whole round trip behind the thumb. So the body is carried
 * forward from the snapshot through the stick positions sent since, each for as long as the
 * server will have followed it, with the very rule the server moves it by.
 */
import { TICK_MS } from '../../shared/src/constants';
import type { GameMap } from '../../shared/src/map';
import { moveBody } from '../../shared/src/sim';

/** A stick position sent to the server, and when (local clock, ms). */
export type SentStick = { at: number; x: number; y: number };

/** Never carry a body forward by more than this: beyond it the line is too poor to guess across. */
const MAX_AHEAD_MS = 600;
/** How long sent sticks are kept. */
const KEEP_MS = 1500;

/** Note a stick position as sent, and forget the ones too old to matter (bar the one still in force then). */
export function noteStick(sticks: SentStick[], stick: SentStick): void {
  sticks.push(stick);
  while (sticks.length > 1 && sticks[1].at <= stick.at - KEEP_MS) sticks.shift();
}

/**
 * @param snap where the newest snapshot has the body
 * @param snapAt when that snapshot arrived (local clock, ms)
 * @param rttMs the round trip to the server
 * @param sticks what was sent, oldest first
 */
export function predictBody(
  snap: { x: number; y: number },
  snapAt: number,
  rttMs: number,
  sticks: readonly SentStick[],
  now: number,
  /** World units a second at a place: the floor (goo) can change it on the way. */
  speedAt: (x: number, y: number) => number,
  map: GameMap,
  /** A ghost: walls do not stop it. */
  through = false,
): { x: number; y: number } {
  const p = { x: snap.x, y: snap.y };
  if (!sticks.length) return p;
  // the snapshot knows of everything we sent up to a round trip (and a tick) before it arrived
  let t = Math.max(snapAt - rttMs - TICK_MS, now - MAX_AHEAD_MS);
  let i = 0;
  while (i + 1 < sticks.length && sticks[i + 1].at <= t) i++;
  if (sticks[i].at > t) t = Math.min(now, sticks[i].at);
  while (t < now) {
    const until = i + 1 < sticks.length ? Math.min(now, sticks[i + 1].at) : now;
    // a tick at a time, as the server does it
    while (t < until) {
      const step = Math.min(TICK_MS, until - t);
      const k = (speedAt(p.x, p.y) * step) / 1000;
      moveBody(p, sticks[i].x * k, sticks[i].y * k, map, through);
      t += step;
    }
    i++;
  }
  return p;
}
