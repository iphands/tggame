import { describe, expect, it } from 'vitest';
import { BOT_ADJECTIVES, WORDS } from '../shared/src/words';
import { CHAT_MAX, DRAW_LIMITS, ERASER, INK, PAGE_H, PAGE_W } from '../shared/src/constants';
import { bare, givesAway, hasInk, sameWord, sanitizeChat, sanitizeName, sanitizeStroke } from '../shared/src/drawing';

describe('sanitizeStroke', () => {
  it('accepts a normal stroke and rounds/clamps coordinates', () => {
    expect(sanitizeStroke({ c: 1, w: 11.4, p: [10.6, 20.2, -5, 9999] })).toEqual({ c: 1, w: 11, p: [11, 20, 0, PAGE_H] });
    expect(sanitizeStroke({ c: 0, w: 5, p: [PAGE_W + 50, 3] })!.p).toEqual([PAGE_W, 3]);
  });

  it('drops unknown fields', () => {
    expect(sanitizeStroke({ c: 0, w: 5, p: [1, 2], evil: '<script>' })).toEqual({ c: 0, w: 5, p: [1, 2] });
  });

  it('rejects malformed input', () => {
    const bad: unknown[] = [
      null, 'x', [], {},
      { c: INK.length, w: 5, p: [1, 2] },
      { c: -2, w: 5, p: [1, 2] },
      { c: 0.5, w: 5, p: [1, 2] },
      { c: 0, w: 'fat', p: [1, 2] },
      { c: 0, w: 5, p: [1] },
      { c: 0, w: 5, p: [] },
      { c: 0, w: 5, p: [1, 'a'] },
      { c: 0, w: 5, p: [1, NaN] },
      { c: 0, w: NaN, p: [1, 2] },
      { c: 0, w: 5, p: Array(DRAW_LIMITS.maxPointsPerStroke * 2 + 2).fill(1) },
    ];
    for (const b of bad) expect(sanitizeStroke(b)).toBeNull();
    expect(sanitizeStroke({ c: ERASER, w: 5, p: Array(DRAW_LIMITS.maxPointsPerStroke * 2).fill(1) })).not.toBeNull();
  });

  it('clamps widths', () => {
    expect(sanitizeStroke({ c: 0, w: 9999, p: [1, 2] })!.w).toBe(DRAW_LIMITS.maxWidth);
    expect(sanitizeStroke({ c: 0, w: 0, p: [1, 2] })!.w).toBe(DRAW_LIMITS.minWidth);
  });

  it('hasInk ignores eraser-only drawings', () => {
    expect(hasInk([])).toBe(false);
    expect(hasInk([{ c: ERASER, w: 30, p: [1, 2] }])).toBe(false);
    expect(hasInk([{ c: ERASER, w: 30, p: [1, 2] }, { c: 3, w: 5, p: [1, 2] }])).toBe(true);
  });
});

describe('text helpers', () => {
  it('sanitizeName strips symbols and bounds length', () => {
    expect(sanitizeName('  <b>Mo</b>  ')).toBe('bMob');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(16);
    expect(sanitizeName(42)).toBe('');
  });

  it('sanitizeChat flattens whitespace and control characters', () => {
    expect(sanitizeChat('  hairy\n\televphant\u0000 ')).toBe('hairy elevphant');
    expect([...sanitizeChat('é'.repeat(200))]).toHaveLength(CHAT_MAX);
    expect(sanitizeChat('   ')).toBe('');
    expect(sanitizeChat(undefined)).toBe('');
  });

  it('sameWord is forgiving about case, articles, plurals and punctuation', () => {
    expect(sameWord('Elephant', 'elephant!')).toBe(true);
    expect(sameWord('hot dog', 'Hotdogs')).toBe(true);
    expect(sameWord('the lighthouse', 'A Lighthouse')).toBe(true);
    expect(sameWord('piñata', 'pinata')).toBe(true);
    expect(sameWord('elephant', 'mammoth')).toBe(false);
    expect(sameWord('is it an elephant', 'elephant')).toBe(false);
    expect(sameWord('', '')).toBe(false);
  });

  it('givesAway spots the answer anywhere in a line', () => {
    expect(givesAway('it is a HOT-DOG you fools', 'hot dog')).toBe(true);
    expect(givesAway('think lunch', 'hot dog')).toBe(false);
    expect(givesAway('anything', '')).toBe(false);
    expect(bare('Jack-in-the-Box!')).toBe('jackinthebox');
  });
});

describe('word deck', () => {
  it('has no duplicates', () => {
    const seen = new Set<string>();
    const dupes = WORDS.filter((w) => seen.size === seen.add(w.toLowerCase()).size);
    expect(dupes).toEqual([]);
  });

  it('every word can be typed as a guess, and so can a bot guess with an adjective', () => {
    for (const w of WORDS) {
      expect(sanitizeChat(w)).toBe(w);
      expect(sameWord(w, w)).toBe(true);
    }
    const longestAdjective = Math.max(...BOT_ADJECTIVES.map((a) => a.length));
    for (const w of WORDS) expect(w.length + longestAdjective + 1).toBeLessThanOrEqual(CHAT_MAX);
  });
});
