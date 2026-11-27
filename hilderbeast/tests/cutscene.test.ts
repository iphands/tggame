import { describe, expect, it } from 'vitest';
import { SAYINGS, sayingsFor } from '../client/src/cutscene';

describe('what Hilder says', () => {
  it('is two different sayings, the same for the same catch', () => {
    for (let seed = 0; seed < 500; seed += 7) {
      const [a, b] = sayingsFor(seed);
      expect(SAYINGS).toContain(a);
      expect(SAYINGS).toContain(b);
      expect(a).not.toBe(b);
      expect(sayingsFor(seed)).toEqual([a, b]);
    }
  });
  it('gets round to all of them', () => {
    const said = new Set<string>();
    for (let seed = 0; seed < 60; seed++) sayingsFor(seed).forEach((s) => said.add(s));
    expect(said.size).toBe(SAYINGS.length);
  });
});
