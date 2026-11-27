import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER } from '../shared/src/constants';
import { isClientMessage } from '../shared/src/protocol';
import { holderOf, bookHeldBy, passingSteps, turnCount } from '../shared/src/rotation';
import { Game } from '../server/src/game';
import { playTurn, seeded, table } from './helpers';

/** Play a whole game; returns, per player, who made the page they worked from in each turn from 2 on. */
function sources(n: number, seed: number, order: 'fixed' | 'round' | 'turn') {
  const { g, ids } = table(n, seed, order);
  g.start(ids[0]);
  playTurn(g, ids); // pick
  const from = new Map<string, string[]>(ids.map((id) => [id, []]));
  while (g.phase !== 'reveal') {
    if (g.turn >= 2) {
      for (const id of ids) {
        const seat = g.seats.indexOf(id);
        // the page in front of this player is the last one in whichever book lists them next
        const book = g.books.find((b) => b.length === g.turn && !b.some((p) => p.by === id) && g.taskFor(id) !== null && holds(g, seat, b));
        from.get(id)!.push(book ? book[book.length - 1].by : '?');
      }
    }
    playTurn(g, ids);
  }
  return { g, ids, from };
}

/** Does `seat` hold `book` right now? Checked by handing in and seeing where the page lands. */
function holds(g: Game, seat: number, book: Game['books'][number]): boolean {
  const task = g.taskFor(g.seats[seat]);
  const last = book[book.length - 1];
  if (!task) return false;
  if (task.kind === 'draw') return last.kind === 'word' && last.text === task.word;
  if (task.kind === 'guess') return last.kind === 'drawing' && last.strokes === task.strokes;
  return false;
}

describe('passing order: the setting', () => {
  it('defaults to shuffling the seats every game', () => {
    expect(DEFAULT_ORDER).toBe('round');
    expect(new Game(seeded()).settings.order).toBe('round');
  });

  it('is the host\'s to change, and only in the lobby', () => {
    const { g, ids } = table(4, 1, 'round');
    g.configure(ids[1], 'turn');
    expect(g.settings.order).toBe('round');
    g.configure(ids[0], 'turn');
    expect(g.viewFor(ids[2]).settings.order).toBe('turn');
    g.start(ids[0]);
    g.configure(ids[0], 'fixed');
    expect(g.settings.order).toBe('turn');
  });

  it('survives into the next game', () => {
    const { g, ids } = table(3, 1, 'turn');
    g.start(ids[0]);
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(g.settings.order).toBe('turn');
  });

  it('travels as a message with one of the three orders', () => {
    for (const order of ['fixed', 'round', 'turn']) expect(isClientMessage({ type: 'settings', order })).toBe(true);
    expect(isClientMessage({ type: 'settings', order: 'chaos' })).toBe(false);
    expect(isClientMessage({ type: 'settings' })).toBe(false);
  });
});

describe('passing order: fixed', () => {
  it('seats people in the order they joined, every game', () => {
    const { g, ids } = table(6, 3, 'fixed');
    g.start(ids[0]);
    expect(g.seats).toEqual(ids);
    g.abort(ids[0]);
    g.start(ids[0]);
    expect(g.seats).toEqual(ids);
  });

  it('means you always work from the same neighbour', () => {
    const { ids, from } = sources(6, 3, 'fixed');
    ids.forEach((id, i) => expect(new Set(from.get(id))).toEqual(new Set([ids[(i + 5) % 6]])));
  });
});

describe('passing order: shuffle per round', () => {
  it('reseats everyone for each game, keeping all players', () => {
    const { g, ids } = table(8, 5, 'round');
    const seatings = new Set<string>();
    for (let game = 0; game < 6; game++) {
      g.start(ids[0]);
      expect([...g.seats].sort()).toEqual([...ids].sort());
      seatings.add(g.seats.join());
      g.abort(ids[0]);
    }
    expect(seatings.size).toBeGreaterThan(3);
  });

  it('still gives you one neighbour for the whole of a game', () => {
    const { g, ids, from } = sources(6, 5, 'round');
    for (const id of ids) {
      const seat = g.seats.indexOf(id);
      expect(new Set(from.get(id))).toEqual(new Set([g.seats[(seat + 5) % 6]]));
    }
  });
});

describe('passing order: shuffle every turn', () => {
  for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    it(`${n} players: every book goes to a new player each turn and nobody holds two`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const steps = passingSteps(n, true, seeded(seed));
        const turns = turnCount(n);
        expect(steps).toHaveLength(turns + 1);
        expect(steps[1]).toBe(0); // the owner draws their own word
        for (let t = 1; t <= turns; t++) {
          const holders = Array.from({ length: n }, (_, book) => holderOf(book, t, n, steps));
          expect(new Set(holders).size).toBe(n);
          holders.forEach((seat, book) => expect(bookHeldBy(seat, t, n, steps)).toBe(book));
        }
        for (let book = 0; book < n; book++) {
          const visited = Array.from({ length: turns }, (_, i) => holderOf(book, i + 1, n, steps));
          expect(new Set(visited).size).toBe(turns);
        }
      }
    });
  }

  it('gives you pages from a different player every turn when there are enough players', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (let seed = 1; seed <= 10; seed++) {
        const { ids, from } = sources(n, seed, 'turn');
        for (const id of ids) {
          const got = from.get(id)!;
          expect(got).not.toContain('?');
          expect(got).not.toContain(id);
          expect(new Set(got).size, `${n} players, seed ${seed}: ${got.join()}`).toBe(got.length);
        }
      }
    }
  });

  it('plays a full game through to the reveal with every book complete', () => {
    for (const n of [3, 4, 7, 12]) {
      const { g } = sources(n, 2, 'turn');
      g.books.forEach((book, b) => {
        expect(book).toHaveLength(1 + turnCount(n));
        expect(book[0].by).toBe(g.seats[b]);
        expect(book[1].by).toBe(g.seats[b]);
        expect(new Set(book.slice(1).map((p) => p.by)).size).toBe(book.length - 1);
      });
    }
  });

  it('without mixing is the plain one-seat-per-turn order', () => {
    expect(passingSteps(6, false, seeded())).toEqual([0, 0, 1, 2, 3, 4, 5]);
  });
});
