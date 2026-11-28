import { describe, expect, it } from 'vitest';
import { bookHeldBy, holderOf, turnCount, turnKind } from '../shared/src/rotation';

describe('rotation', () => {
  for (let n = 3; n <= 16; n++) {
    it(`${n} players: every book alternates draw/guess, ends on a guess, visits everyone once`, () => {
      const turns = turnCount(n);
      expect(turnKind(1)).toBe('draw');
      expect(turnKind(turns)).toBe('guess');
      for (let book = 0; book < n; book++) {
        const holders = [];
        for (let t = 1; t <= turns; t++) holders.push(holderOf(book, t, n));
        expect(new Set(holders).size).toBe(holders.length);
        // the owner always draws their own word, and never sees the book again
        expect(holders[0]).toBe(book);
        expect(holders.slice(1).includes(book)).toBe(false);
        // even tables: everyone contributes; odd tables: all but the seat before the owner
        expect(new Set(holders).size).toBe(n % 2 === 0 ? n : n - 1);
      }
    });

    it(`${n} players: each turn is a permutation and bookHeldBy inverts holderOf`, () => {
      for (let t = 0; t <= turnCount(n); t++) {
        const seen = new Set<number>();
        for (let book = 0; book < n; book++) {
          const seat = holderOf(book, t, n);
          seen.add(seat);
          expect(bookHeldBy(seat, t, n)).toBe(book);
        }
        expect(seen.size).toBe(n);
      }
    });
  }

  it('nobody guesses a drawing of their own or draws from their own guess', () => {
    for (let n = 3; n <= 16; n++) {
      for (let book = 0; book < n; book++) {
        for (let t = 2; t <= turnCount(n); t++) expect(holderOf(book, t, n)).not.toBe(holderOf(book, t - 1, n));
      }
    }
  });
});
