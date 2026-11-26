import { describe, expect, it } from 'vitest';
import { HINT_BLANKS_MS, MAX_AWARD, ROUND_MS } from '../shared/src/constants';
import { awardAt, hintAt } from '../shared/src/round';

describe('awardAt', () => {
  it('starts at the maximum and drops ten every full ten seconds', () => {
    expect(awardAt(0)).toBe(MAX_AWARD);
    expect(awardAt(9_999)).toBe(120);
    expect(awardAt(10_000)).toBe(110);
    expect(awardAt(45_000)).toBe(80);
    expect(awardAt(119_999)).toBe(10);
    expect(awardAt(ROUND_MS)).toBe(0);
    expect(awardAt(999_999)).toBe(0);
    expect(awardAt(-50)).toBe(MAX_AWARD);
  });
});

describe('hintAt', () => {
  it('shows nothing, then blanks, then first, last, second, second-to-last', () => {
    expect(hintAt('elephant', 0)).toBeNull();
    expect(hintAt('elephant', HINT_BLANKS_MS - 1)).toBeNull();
    expect(hintAt('elephant', 20_000)).toBe('________');
    expect(hintAt('elephant', 40_000)).toBe('e_______');
    expect(hintAt('elephant', 60_000)).toBe('e______t');
    expect(hintAt('elephant', 80_000)).toBe('el_____t');
    expect(hintAt('elephant', 100_000)).toBe('el____nt');
    expect(hintAt('elephant', 119_000)).toBe('el____nt');
  });

  it('keeps spaces and punctuation in place and counts letters across words', () => {
    expect(hintAt('ice cream', 20_000)).toBe('___ _____');
    expect(hintAt('ice cream', 100_000)).toBe('ic_ ___am');
    expect(hintAt('jack-in-the-box', 60_000)).toBe('j___-__-___-__x');
  });

  it('never opens more than half of a short word', () => {
    expect(hintAt('bee', 100_000)).toBe('b__');
    expect(hintAt('ox', 100_000)).toBe('o_');
    expect(hintAt('taco', 100_000)).toBe('t__o');
    expect(hintAt('a', 100_000)).toBe('_');
  });
});
