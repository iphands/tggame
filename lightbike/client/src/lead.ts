/**
 * How far ahead of the last snapshot our own bike rides, in seconds.
 *
 * A snapshot shows the server as it was one trip ago, and a turn takes one more trip to get back,
 * plus up to a tick of waiting there. So the bike on screen has to be a whole round trip and a
 * little more ahead of the snapshot for the cell we book to still lie ahead of the server's bike
 * when the turn lands. Next to the server that is the 45 ms it always was; across an ocean it is
 * a quarter of a second, and without it every turn is put back a few cells.
 */

/** A tick of waiting at the server, and a little for luck. */
const MARGIN_MS = 30;
const MIN_MS = 45;
/** Past this the line is too poor to ride ahead of: the turns will be corrected instead. */
const MAX_MS = 450;

export function leadFor(rttMs: number, jitterMs: number): number {
  const ms = rttMs + 2 * jitterMs + MARGIN_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, ms)) / 1000;
}

/** How long our bike may disagree with the server about a turn before it gives in, in ms. */
export function patienceFor(rttMs: number, jitterMs: number): number {
  return Math.max(350, rttMs + 2 * jitterMs + 250);
}
