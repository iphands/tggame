import { describe, it, expect } from 'vitest';
import { LEVELS, platformPos, levelAt } from '../shared/src/levels.js';
import { ARENA, PHYS } from '../shared/src/constants.js';

describe('levels', () => {
  it('has several arenas with unique ids and themes', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.theme)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    describe(level.name, () => {
      it('every spawn stands on a static, solid platform', () => {
        expect(level.spawns.length).toBeGreaterThanOrEqual(6);
        for (const s of level.spawns) {
          const host = level.platforms.find(
            (p) =>
              !p.move &&
              (p.kind ?? 'normal') !== 'crumble' &&
              (p.kind ?? 'normal') !== 'bounce' &&
              p.y === s.y &&
              s.x - PHYS.playerW / 2 >= p.x &&
              s.x + PHYS.playerW / 2 <= p.x + p.w
          );
          expect(host, `spawn ${s.x},${s.y}`).toBeDefined();
        }
      });

      it('platforms stay on screen through their whole motion', () => {
        for (const p of level.platforms) {
          for (let t = 0; t < 10_000; t += 50) {
            const pos = platformPos(p, t);
            expect(pos.x).toBeGreaterThanOrEqual(0);
            expect(pos.x + p.w).toBeLessThanOrEqual(ARENA.width);
            expect(pos.y).toBeGreaterThan(80);
            expect(pos.y + p.h).toBeLessThan(ARENA.height);
          }
        }
      });

      it('has a sane gravity scale', () => {
        expect(level.gravityScale).toBeGreaterThan(0.4);
        expect(level.gravityScale).toBeLessThanOrEqual(1.2);
      });
    });
  }

  it('levelAt wraps in both directions', () => {
    expect(levelAt(0)).toBe(LEVELS[0]);
    expect(levelAt(LEVELS.length)).toBe(LEVELS[0]);
    expect(levelAt(-1)).toBe(LEVELS[LEVELS.length - 1]);
  });

  it('platformPos moves only platforms that declare motion', () => {
    const still = { x: 10, y: 20, w: 50, h: 10 };
    expect(platformPos(still, 1234)).toEqual({ x: 10, y: 20 });
    const mover = { x: 10, y: 200, w: 50, h: 10, move: { ay: 40, periodMs: 1000 } };
    expect(platformPos(mover, 250).y).toBeCloseTo(240);
  });
});
