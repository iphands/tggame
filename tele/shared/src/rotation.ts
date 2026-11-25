/**
 * Who holds which sketchbook when.
 *
 * Book `b` belongs to seat `b`. Turn 0 is the owner writing a secret word.
 * Turns 1..turnCount alternate draw, guess, draw, guess… and always end on a
 * guess. With an even number of players the owner draws their own word before
 * passing; with an odd number the book is passed first. Either way every
 * other player touches each book exactly once.
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
function offset(turn: number, players: number): number {
  return players % 2 === 0 ? turn - 1 : turn;
}

/** Seat holding book `book` during `turn`. */
export function holderOf(book: number, turn: number, players: number): number {
  if (turn <= 0) return book;
  return (book + offset(turn, players)) % players;
}

/** Book held by `seat` during `turn`. */
export function bookHeldBy(seat: number, turn: number, players: number): number {
  if (turn <= 0) return seat;
  const o = offset(turn, players) % players;
  return (seat - o + players) % players;
}
