import { describe, expect, it } from 'vitest';
import { DRAW_LIMITS, ERASER, INK, PAGE_H, PAGE_W } from '../shared/src/constants';
import { hasInk, sameWord, sanitizeDrawing, sanitizeGuess, sanitizeName, simplify, splitStroke } from '../shared/src/drawing';
import { computeAwards, survived } from '../shared/src/awards';
import type { Page } from '../shared/src/types';
import { BOT_ADJECTIVES, WORDS } from '../shared/src/words';
import { CARD_SIZE, GUESS_MAX, MAX_PLAYERS } from '../shared/src/constants';

describe('sanitizeDrawing', () => {
  it('accepts a normal drawing and rounds/clamps coordinates', () => {
    const d = sanitizeDrawing([{ c: 1, w: 11.4, p: [10.6, 20.2, -5, 9999] }]);
    expect(d).toEqual([{ c: 1, w: 11, p: [11, 20, 0, PAGE_H] }]);
    expect(sanitizeDrawing([{ c: 0, w: 5, p: [PAGE_W + 50, 3] }])![0].p).toEqual([PAGE_W, 3]);
  });

  it('drops unknown fields', () => {
    expect(sanitizeDrawing([{ c: 0, w: 5, p: [1, 2], evil: '<script>' }])).toEqual([{ c: 0, w: 5, p: [1, 2] }]);
  });

  it('rejects malformed input', () => {
    const bad: unknown[] = [
      null, 'x', {}, [null], [{}],
      [{ c: INK.length, w: 5, p: [1, 2] }],
      [{ c: -2, w: 5, p: [1, 2] }],
      [{ c: 0.5, w: 5, p: [1, 2] }],
      [{ c: 0, w: 'fat', p: [1, 2] }],
      [{ c: 0, w: 5, p: [1] }],
      [{ c: 0, w: 5, p: [] }],
      [{ c: 0, w: 5, p: [1, 'a'] }],
      [{ c: 0, w: 5, p: [1, NaN] }],
      [{ c: 0, w: NaN, p: [1, 2] }],
    ];
    for (const b of bad) expect(sanitizeDrawing(b)).toBeNull();
  });

  it('enforces stroke and point limits', () => {
    const dot = { c: 0, w: 5, p: [1, 2] };
    expect(sanitizeDrawing(Array(DRAW_LIMITS.maxStrokes).fill(dot))).not.toBeNull();
    expect(sanitizeDrawing(Array(DRAW_LIMITS.maxStrokes + 1).fill(dot))).toBeNull();
    const long = { c: 0, w: 5, p: Array(DRAW_LIMITS.maxPointsPerStroke * 2).fill(1) };
    expect(sanitizeDrawing([long])).not.toBeNull();
    expect(sanitizeDrawing([{ ...long, p: [...long.p, 1, 1] }])).toBeNull();
    const many = Math.floor(DRAW_LIMITS.maxPoints / DRAW_LIMITS.maxPointsPerStroke) + 1;
    expect(sanitizeDrawing(Array(many).fill(long))).toBeNull();
  });

  it('a fill is one point in a real colour, and there is a limit to them', () => {
    expect(sanitizeDrawing([{ c: 3, w: 5, p: [10.2, 20], f: 1 }])).toEqual([{ c: 3, w: 5, p: [10, 20], f: 1 }]);
    expect(sanitizeDrawing([{ c: 3, w: 5, p: [10, 20] }])![0]).not.toHaveProperty('f');
    for (const bad of [
      { c: ERASER, w: 5, p: [1, 2], f: 1 },
      { c: 3, w: 5, p: [1, 2, 3, 4], f: 1 },
      { c: 3, w: 5, p: [1, 2], f: true },
      { c: 3, w: 5, p: [1, 2], f: 0 },
    ]) expect(sanitizeDrawing([bad])).toBeNull();
    const fill = { c: 1, w: 5, p: [1, 2], f: 1 };
    expect(sanitizeDrawing(Array(DRAW_LIMITS.maxFills).fill(fill))).not.toBeNull();
    expect(sanitizeDrawing(Array(DRAW_LIMITS.maxFills + 1).fill(fill))).toBeNull();
  });

  it('clamps widths', () => {
    expect(sanitizeDrawing([{ c: 0, w: 9999, p: [1, 2] }])![0].w).toBe(DRAW_LIMITS.maxWidth);
    expect(sanitizeDrawing([{ c: 0, w: 0, p: [1, 2] }])![0].w).toBe(DRAW_LIMITS.minWidth);
  });

  it('hasInk ignores eraser-only drawings', () => {
    expect(hasInk([])).toBe(false);
    expect(hasInk([{ c: ERASER, w: 30, p: [1, 2] }])).toBe(false);
    expect(hasInk([{ c: ERASER, w: 30, p: [1, 2] }, { c: 3, w: 5, p: [1, 2] }])).toBe(true);
  });
});

describe('stroke helpers', () => {
  it('simplify keeps endpoints and corners, drops collinear points', () => {
    expect(simplify([0, 0, 5, 0, 10, 0, 10, 5, 10, 10], 1)).toEqual([0, 0, 10, 0, 10, 10]);
    expect(simplify([3, 4], 1)).toEqual([3, 4]);
    expect(simplify([0, 0, 0, 0, 0, 0], 1)).toEqual([0, 0, 0, 0]);
  });

  it('splitStroke yields connected chunks within the limit', () => {
    const p: number[] = [];
    for (let i = 0; i < DRAW_LIMITS.maxPointsPerStroke * 2 + 10; i++) p.push(i % 1000, 0);
    const parts = splitStroke({ c: 0, w: 5, p });
    expect(parts.length).toBeGreaterThan(1);
    for (const s of parts) expect(s.p.length / 2).toBeLessThanOrEqual(DRAW_LIMITS.maxPointsPerStroke);
    expect(sanitizeDrawing(parts)).not.toBeNull();
    for (let i = 1; i < parts.length; i++) expect(parts[i].p.slice(0, 2)).toEqual(parts[i - 1].p.slice(-2));
    expect(parts[parts.length - 1].p.slice(-2)).toEqual(p.slice(-2));
  });
});

describe('text helpers', () => {
  it('sanitizeName strips symbols and bounds length', () => {
    expect(sanitizeName('  <b>Mo</b>  ')).toBe('bMob');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(16);
    expect(sanitizeName(42)).toBe('');
  });

  it('sanitizeGuess flattens whitespace and control characters', () => {
    expect(sanitizeGuess('  hairy\n\televphant\u0000 ')).toBe('hairy elevphant');
    expect([...sanitizeGuess('é'.repeat(100))]).toHaveLength(40);
    expect(sanitizeGuess('   ')).toBe('');
    expect(sanitizeGuess(undefined)).toBe('');
  });

  it('sameWord is forgiving about case, articles, plurals and punctuation', () => {
    expect(sameWord('Elephant', 'elephant!')).toBe(true);
    expect(sameWord('hot dog', 'Hotdogs')).toBe(true);
    expect(sameWord('the lighthouse', 'A Lighthouse')).toBe(true);
    expect(sameWord('elephant', 'mammoth')).toBe(false);
    expect(sameWord('', '')).toBe(false);
  });
});

describe('awards', () => {
  const w = (text: string, by: string): Page => ({ kind: 'word', text, by });
  const d = (by: string): Page => ({ kind: 'drawing', strokes: [], by });
  const books: Page[][] = [
    [w('cat', 'a'), d('b'), w('dog', 'c')],
    [w('sun', 'b'), d('c'), w('Sun!', 'a')],
  ];

  it('survived compares first and last words', () => {
    expect(survived(books[0])).toBe(false);
    expect(survived(books[1])).toBe(true);
    expect(survived([w('cat', 'a')])).toBe(false);
  });

  it('picks the most-hearted doodle and guess, never the original word', () => {
    const a = computeAwards(books, { '0:0': 9, '0:1': 1, '1:1': 2, '0:2': 1, '1:2': 1 });
    expect(a.bestDoodle).toEqual({ book: 1, page: 1, hearts: 2 });
    expect(a.bestGuess).toEqual({ book: 0, page: 2, hearts: 1 });
    expect(a.crowdFavourite).toEqual({ playerId: 'a', hearts: 10 });
  });

  it('gives nothing when nobody hearted anything', () => {
    expect(computeAwards(books, {})).toEqual({ bestDoodle: null, bestGuess: null, crowdFavourite: null });
  });
});

describe('word deck', () => {
  it('has no duplicates, so no two cards share a word', () => {
    const seen = new Set<string>();
    const dupes = WORDS.filter((w) => seen.size === seen.add(w.toLowerCase()).size);
    expect(dupes).toEqual([]);
  });

  it('is big enough for a full table and every word survives sanitising unchanged', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(MAX_PLAYERS * CARD_SIZE * 4);
    for (const w of WORDS) expect(sanitizeGuess(w)).toBe(w);
    // a bot guess may add an adjective; it must still fit
    const longestAdjective = Math.max(...BOT_ADJECTIVES.map((a) => a.length));
    for (const w of WORDS) expect(w.length + longestAdjective + 1).toBeLessThanOrEqual(GUESS_MAX);
  });
});
