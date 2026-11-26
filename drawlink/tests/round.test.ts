import { describe, expect, it } from 'vitest';
import { HINT_BLANKS_MS, MAX_ANSWER_WORDS, MAX_AWARD, ROUND_MS } from '../shared/src/constants';
import { awardAt, hintAt } from '../shared/src/round';
import { WORDS } from '../shared/src/words';

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
  it('shows blanks from the start, then a letter every ten seconds', () => {
    expect(hintAt('elephant', -1)).toBeNull();
    expect(hintAt('elephant', HINT_BLANKS_MS)).toBe('________');
    expect(hintAt('elephant', 9_999)).toBe('________');
    expect(hintAt('elephant', 10_000)).toBe('e_______');
    expect(hintAt('elephant', 20_000)).toBe('e______t');
    const three = hintAt('elephant', 30_000)!;
    expect(three.replaceAll('_', '')).toHaveLength(3);
    expect(hintAt('elephant', 30_000)).toBe(three);
  });

  it('stops at half the letters, rounded up, and never gives the last one away', () => {
    const open = (w: string): number => [...hintAt(w, ROUND_MS)!].filter((ch) => /[a-z]/.test(ch)).length;
    expect(open('elephant')).toBe(4);
    expect(open('bee')).toBe(2);
    expect(hintAt('ox', ROUND_MS)).toBe('o_');
    expect(hintAt('a', ROUND_MS)).toBe('_');
  });

  it('only ever adds letters, and they are the right ones', () => {
    for (const w of ['grandfather clock', 'taco', 'walkie-talkie', "grandma's dentures"]) {
      let prev = hintAt(w, 0)!;
      for (let t = 0; t <= ROUND_MS; t += 5_000) {
        const now = hintAt(w, t)!;
        [...now].forEach((ch, i) => {
          expect(ch === '_' || ch === [...w][i]).toBe(true);
          if ([...prev][i] !== '_') expect(ch).toBe([...prev][i]);
        });
        prev = now;
      }
    }
  });

  it('keeps spaces and punctuation in place and starts with each word\'s first letter', () => {
    expect(hintAt('ice cream', 0)).toBe('___ _____');
    expect(hintAt('ice cream', 20_000)).toBe('i__ c____');
    expect(hintAt('ice cream', 40_000)).toBe('i_e c___m');
    expect(hintAt('walkie-talkie', 20_000)).toBe('w_____-t_____');
  });
});

describe('the deck', () => {
  it('deals nothing longer than two words', () => {
    expect(WORDS.length).toBeGreaterThan(400);
    for (const w of WORDS) expect(w.split(/[\s-]+/).length, w).toBeLessThanOrEqual(MAX_ANSWER_WORDS);
  });
});
