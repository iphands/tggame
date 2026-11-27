import { describe, it, expect } from 'vitest';
import { LEVELS, platformPos, levelAt, safeSpots, type LevelDef, type PlatformDef } from '../shared/src/levels.js';
import { ARENA, BOX, PHYS, RUN } from '../shared/src/constants.js';

/** Platforms a runner can rest on: static and not about to vanish or launch them. */
const isFirm = (p: PlatformDef) => !p.move && (p.kind ?? 'normal') !== 'crumble' && (p.kind ?? 'normal') !== 'bounce';

/** Widest stretch of x with nothing at all to stand on (boxes count as footing). */
function widestPit(level: LevelDef): { w: number; at: number } {
  const spans = [
    ...level.platforms.map((p) => [p.x - (p.move?.ax ?? 0), p.x + p.w + (p.move?.ax ?? 0)] as [number, number]),
    ...level.boxes.map((b) => [b.x, b.x + b.w] as [number, number]),
  ].sort((a, b) => a[0] - b[0]);
  let reach = spans[0][1];
  let worst = { w: 0, at: 0 };
  for (const [from, to] of spans) {
    if (from - reach > worst.w) worst = { w: from - reach, at: reach };
    reach = Math.max(reach, to);
  }
  return worst;
}

describe('courses', () => {
  it('has one course per theme, with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.theme)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    describe(level.name, () => {
      it('starts on a wide, firm start pad with every spawn on it', () => {
        const pad = level.platforms[0];
        expect(pad.x).toBe(0);
        expect(isFirm(pad)).toBe(true);
        expect(level.spawns.length).toBeGreaterThanOrEqual(6);
        for (const s of level.spawns) {
          expect(s.y).toBe(pad.y);
          expect(s.x - PHYS.playerW / 2).toBeGreaterThanOrEqual(pad.x);
          expect(s.x + PHYS.playerW / 2).toBeLessThanOrEqual(pad.x + pad.w);
          // nobody starts off screen or inside a box
          expect(s.x).toBeLessThan(ARENA.width * RUN.leadFrac);
          expect(level.boxes.some((b) => s.x + 20 > b.x && s.x - 20 < b.x + b.w)).toBe(false);
        }
      });

      it('is a proper course: long, with a reachable finish on solid ground', () => {
        expect(level.length).toBeGreaterThan(ARENA.width * 6);
        expect(level.finishX).toBeGreaterThan(level.length - ARENA.width);
        expect(level.finishX).toBeLessThan(level.length - 300);
        // the finish pad runs from before the line to the end of the course
        const under = (x: number) => level.platforms.some((p) => isFirm(p) && x >= p.x && x <= p.x + p.w);
        for (let x = level.finishX - 100; x < level.length; x += 40) expect(under(x), `floor at ${x}`).toBe(true);
        // nothing is left hanging past the end
        for (const p of level.platforms) expect(p.x + p.w).toBeLessThanOrEqual(level.length);
      });

      it('keeps every platform small enough to texture and inside the playable height', () => {
        for (const p of level.platforms) {
          expect(p.w).toBeLessThanOrEqual(640);
          for (let t = 0; t < 10_000; t += 50) {
            const pos = platformPos(p, t);
            expect(pos.x).toBeGreaterThanOrEqual(0);
            expect(pos.y).toBeGreaterThan(120);
            expect(pos.y + p.h).toBeLessThanOrEqual(ARENA.height - 60); // clear of the HUD cards
          }
        }
      });

      it('has no pit wider than a double jump can cross', () => {
        // ~280 px at normal gravity; low gravity stretches every jump
        const limit = 285 / level.gravityScale;
        const pit = widestPit(level);
        expect(pit.w, `pit at x=${pit.at}`).toBeLessThanOrEqual(limit);
      });

      it('has blue weapon boxes, all breakable', () => {
        const arms = level.boxes.filter((b) => b.arms);
        expect(arms.length).toBeGreaterThanOrEqual(2);
        for (const b of arms) expect(b.hp).toBeGreaterThan(0);
      });

      it('sits its boxes on something solid, clear of the start', () => {
        for (const b of level.boxes) {
          expect(b.x).toBeGreaterThan(ARENA.width * 0.55);
          const bottom = b.y + b.h;
          const floorAt = (x: number) => level.platforms.some((p) => isFirm(p) && p.y === bottom && x >= p.x && x <= p.x + p.w);
          const onFloor = floorAt(b.x) && floorAt(b.x + b.w); // may straddle two floor tiles
          const onBox = level.boxes.some((o) => o !== b && o.y === bottom && o.x < b.x + b.w && o.x + o.w > b.x);
          expect(onFloor || onBox, `box at ${b.x},${b.y}`).toBe(true);
        }
      });

      it('builds its gates on firm floor with room for the pack, in order, before the finish', () => {
        expect(level.gates.length).toBeGreaterThanOrEqual(2);
        let prev = 0;
        for (const g of level.gates) {
          expect(g.x).toBeGreaterThan(prev);
          expect(g.x + g.w).toBeLessThan(level.finishX - 300);
          expect(g.w).toBe(BOX.gateW);
          // firm floor under the gate and for a good stretch in front of it
          for (let x = g.x - 400; x <= g.x + g.w; x += 40) {
            expect(level.platforms.some((p) => isFirm(p) && x >= p.x && x <= p.x + p.w), `floor at ${x}`).toBe(true);
          }
          // at least one respawn spot on screen while the gate holds the scroll
          const holdX = g.x - RUN.gateHoldFrac * ARENA.width;
          expect(safeSpots(level).some((s) => s.x > holdX + 50 && s.x < g.x - 70)).toBe(true);
          prev = g.x;
        }
      });

      it('always has a safe respawn spot on screen', () => {
        const spots = safeSpots(level);
        expect(spots[0].x).toBeLessThan(ARENA.width / 2);
        // the respawn window is the screen minus its margins: there must always be a spot inside it
        for (let i = 1; i < spots.length; i++) expect(spots[i].x - spots[i - 1].x, `after x=${spots[i - 1].x}`).toBeLessThan(1050);
        expect(spots[spots.length - 1].x).toBeGreaterThan(level.finishX - 200);
        // never inside a box or a gate
        for (const s of spots) {
          expect(level.boxes.some((b) => s.x + 16 > b.x && s.x - 16 < b.x + b.w && b.y + b.h > s.y - PHYS.playerH && b.y < s.y)).toBe(false);
          expect(level.gates.some((g) => s.x + 16 > g.x && s.x - 16 < g.x + g.w)).toBe(false);
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
