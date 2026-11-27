/**
 * Who holds which sketchbook when.
 *
 * Book `b` belongs to seat `b`. Turn 0 is the owner picking a secret word, and
 * on turn 1 the owner draws it themselves. From then on the book moves to a
 * new seat every turn: guess, draw, guess… always ending on a guess. With an
 * even number of players that takes every other player exactly once; with an
 * odd number one player never sees it (a full lap would end on a drawing).
 * By default it moves one seat per turn; `Steps` can scramble that.
 */

export type TurnKind = 'draw' | 'guess';

/** Turns played after the word pick. */
export function turnCount(players: number): number {
  return players % 2 === 0 ? players : players - 1;
}

export function turnKind(turn: number): TurnKind {
  return turn % 2 === 1 ? 'draw' : 'guess';
}

/**
 * How far each book has travelled by each turn: `steps[turn]` seats on from its owner. Without
 * steps a book moves one seat per turn, so a player always receives from the same neighbour.
 */
export type Steps = readonly number[];

/**
 * The steps for one game. Plain: one seat per turn. Mixed: the same visits in a scrambled order,
 * chosen so that a player receives from a different person each turn wherever that is possible.
 * Either way every book is held by a different player every turn and never by the same one twice.
 */
export function passingSteps(players: number, mixed: boolean, rng: () => number): number[] {
  const turns = turnCount(players);
  const plain = [0, ...Array.from({ length: turns }, (_, i) => i)];
  if (!mixed || turns < 2) return plain;
  // Search for an order of visits in which no two turns make the same jump: who a seat receives
  // from depends only on the jump between two turns, so different jumps mean different people.
  const steps = [0, 0];
  const usedSteps = new Set([0]);
  const usedJumps = new Set<number>();
  let best = plain;
  let budget = 20_000;
  const extend = (): boolean => {
    if (steps.length > turns) return true;
    if (steps.length - 1 > best.length - 1 || best === plain) best = [...steps];
    if (--budget < 0) return false;
    const options: number[] = [];
    for (let step = 1; step < players; step++) if (!usedSteps.has(step)) options.push(step);
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const from = steps[steps.length - 1];
    for (const step of options) {
      const jump = (step - from + players) % players;
      if (usedJumps.has(jump)) continue;
      steps.push(step);
      usedSteps.add(step);
      usedJumps.add(jump);
      if (extend()) return true;
      steps.pop();
      usedSteps.delete(step);
      usedJumps.delete(jump);
    }
    return false;
  };
  if (extend()) return steps;
  // An even table always has a perfect order: zigzag out from the owner (0, -1, +1, -2, +2, …),
  // stretched by a random amount that shares no factor with the table size.
  if (players % 2 === 0) {
    const units = Array.from({ length: players - 1 }, (_, i) => i + 1).filter((u) => gcd(u, players) === 1);
    const unit = units[Math.floor(rng() * units.length)];
    const zigzag = Array.from({ length: players }, (_, i) => (i % 2 === 0 ? i / 2 : players - (i + 1) / 2));
    return [0, ...zigzag.map((z) => (z * unit) % players)];
  }
  // No perfect order found in time: finish the longest one found with whatever visits are left.
  const rest = Array.from({ length: players - 1 }, (_, i) => i + 1).filter((step) => !best.includes(step));
  return best === plain ? plain : [...best, ...rest].slice(0, turns + 1);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** How many seats on from its owner a book is at `turn` (turn ≥ 1). */
function offset(turn: number, steps?: Steps): number {
  return steps ? steps[turn] : turn - 1;
}

/** Seat holding book `book` during `turn`. */
export function holderOf(book: number, turn: number, players: number, steps?: Steps): number {
  if (turn <= 0) return book;
  return (book + offset(turn, steps)) % players;
}

/** Book held by `seat` during `turn`. */
export function bookHeldBy(seat: number, turn: number, players: number, steps?: Steps): number {
  if (turn <= 0) return seat;
  const o = offset(turn, steps) % players;
  return (seat - o + players) % players;
}
