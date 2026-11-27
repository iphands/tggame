import { describe, expect, it } from 'vitest';
import { foodCounts, guaranteedMass, makeCourse } from '../server/src/course';
import { COURSES, MAX_PLAYERS, TIERS, tableSize, tiersInCourse } from '../shared/src/constants';
import { massForTier, startRing } from '../shared/src/sim';
import { seeded } from './helpers';

describe('table size', () => {
  it('grows with the number of players and with the course', () => {
    for (let n = 1; n < MAX_PLAYERS; n++) {
      expect(tableSize(n + 1, 1).w).toBeGreaterThan(tableSize(n, 1).w);
      expect(tableSize(n + 1, 1).h).toBeGreaterThan(tableSize(n, 1).h);
    }
    expect(tableSize(1, 1)).toEqual({ w: 1000, h: 700 });
    expect(tableSize(3, 5).w).toBeGreaterThan(tableSize(3, 4).w);
  });
  it('lays more food for more players, at about the same density', () => {
    const density = (n: number) => {
      const { w, h } = tableSize(n, 3);
      return foodCounts(3, n).reduce((a, b) => a + b, 0) / (w * h);
    };
    for (let n = 2; n <= MAX_PLAYERS; n++) {
      expect(foodCounts(3, n).reduce((a, b) => a + b, 0)).toBeGreaterThan(foodCounts(3, n - 1).reduce((a, b) => a + b, 0));
      expect(density(n) / density(1)).toBeGreaterThan(0.85);
      expect(density(n) / density(1)).toBeLessThan(1.25);
    }
  });
});

describe('every course can be cleared', () => {
  it('even split of the smaller food always reaches the next tier', () => {
    for (let no = 1; no <= COURSES; no++) {
      for (let n = 1; n <= MAX_PLAYERS; n++) {
        const counts = foodCounts(no, n);
        expect(counts.length).toBe(tiersInCourse(no));
        let below = 0;
        for (let tier = 0; tier < counts.length; tier++) {
          expect(counts[tier]).toBeGreaterThan(0);
          if (tier > 0) expect(guaranteedMass(below, n)).toBeGreaterThan(massForTier(tier));
          below += counts[tier] * TIERS[tier].value;
        }
      }
    }
  });
});

describe('makeCourse', () => {
  it('is deterministic for a seed', () => {
    expect(makeCourse(4, 3, seeded(5))).toEqual(makeCourse(4, 3, seeded(5)));
    expect(makeCourse(4, 3, seeded(5))).not.toEqual(makeCourse(4, 3, seeded(6)));
  });

  it('lays everything on the table, off the holes, without overlap', () => {
    for (let seed = 1; seed <= 8; seed++) {
      for (const [no, n] of [[1, 1], [3, 2], [5, 4], [8, 8], [8, 1]] as const) {
        const c = makeCourse(no, n, seeded(seed));
        expect(c.foods.length).toBe(foodCounts(no, n).reduce((a, b) => a + b, 0));
        let overlaps = 0;
        c.foods.forEach((f, i) => {
          const r = TIERS[f.tier].r;
          expect(f.x).toBeGreaterThanOrEqual(r);
          expect(f.y).toBeGreaterThanOrEqual(r);
          expect(f.x).toBeLessThanOrEqual(c.w - r);
          expect(f.y).toBeLessThanOrEqual(c.h - r);
          if (Math.hypot(f.x - c.w / 2, f.y - c.h / 2) < startRing(n) + 30) overlaps++;
          for (let j = 0; j < i; j++) {
            const g = c.foods[j];
            if (Math.hypot(f.x - g.x, f.y - g.y) < r + TIERS[g.tier].r) overlaps++;
          }
        });
        expect(overlaps).toBe(0);
      }
    }
  });
});
