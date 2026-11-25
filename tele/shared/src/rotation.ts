/**
 * Who holds which sketchbook when.
 *
 * Book `b` belongs to seat `b`. Turn 0 is the owner picking a secret word, and
 * on turn 1 the owner draws it themselves. From then on the book moves one
 * seat per turn: guess, draw, guess… always ending on a guess. With an even
 * number of players that takes every other player exactly once; with an odd
 * number the book stops one seat short of its owner (a full lap would end on
 * a drawing).
 */

export type TurnKind = 'draw' | 'guess';

/** Turns played after the word pick. */
export function turnCount(players: number): number {
  return players % 2 === 0 ? players : players - 1;
}

export function turnKind(turn: number): TurnKind {
  return turn % 2 === 1 ? 'draw' : 'guess';
}

/** How many seats to the left a book has travelled by `turn` (turn ≥ 1). */
function offset(turn: number): number {
  return turn - 1;
}

/** Seat holding book `book` during `turn`. */
export function holderOf(book: number, turn: number, players: number): number {
  if (turn <= 0) return book;
  return (book + offset(turn)) % players;
}

/** Book held by `seat` during `turn`. */
export function bookHeldBy(seat: number, turn: number, players: number): number {
  if (turn <= 0) return seat;
  const o = offset(turn) % players;
  return (seat - o + players) % players;
}
