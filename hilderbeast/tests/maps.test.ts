import { describe, expect, it } from 'vitest';
import { BEAST_START_CLEAR, START_SPOTS, TASKS_MAX, TILE } from '../shared/src/constants';
import { T_FLOOR, T_GOO, T_SPIKE, T_WALL, kindAt, outsideAt, wallAt } from '../shared/src/map';
import { MAPS } from '../shared/src/maps';
import { sees } from '../shared/src/sim';
import { FAR, stepsAt, stepsFrom } from '../server/src/path';

describe('the maps', () => {
  it('are eight, each with its own name', () => {
    expect(MAPS).toHaveLength(8);
    expect(new Set(MAPS.map((m) => m.name)).size).toBe(8);
  });
  it('are built the same every time', async () => {
    const again = await import('../shared/src/mapgen');
    expect(again.generate).toBeTypeOf('function');
    // the same module laid them out once already: a second copy of the rows must match
    for (const m of MAPS) expect(m.rows.join('')).toMatch(/^[#.cBo1-3TE~^!]+$/);
  });
  for (const m of MAPS) {
    describe(m.name, () => {
      it('is a closed house of a fair size, and not a box', () => {
        expect(m.cols).toBeGreaterThanOrEqual(36);
        expect(m.cols).toBeLessThanOrEqual(64);
        expect(m.lines).toBeGreaterThanOrEqual(24);
        expect(m.lines).toBeLessThanOrEqual(40);
        // plenty of the outline is outside the house: dark, with nothing in it
        let outside = 0;
        for (let r = 0; r < m.lines; r++) for (let c = 0; c < m.cols; c++) if (outsideAt(m, c, r)) outside++;
        expect(outside / (m.cols * m.lines)).toBeGreaterThan(0.2);
        for (let c = 0; c < m.cols; c++) expect(wallAt(m, c, 0) && wallAt(m, c, m.lines - 1)).toBe(true);
        for (let r = 0; r < m.lines; r++) expect(wallAt(m, 0, r) && wallAt(m, m.cols - 1, r)).toBe(true);
      });
      it('has what a round needs', () => {
        expect(m.cousinStarts.length).toBeGreaterThanOrEqual(START_SPOTS - 1);
        expect(m.pills.length).toBeGreaterThanOrEqual(6);
        expect(m.pills.length).toBeLessThanOrEqual(30);
        expect(m.tasks.length).toBeGreaterThanOrEqual(TASKS_MAX);
        expect(m.exits).toHaveLength(2);
        expect(m.portals).toHaveLength(6);
        expect(m.rooms.length).toBeGreaterThanOrEqual(4);
      });
      it('has traps', () => {
        expect(m.kind.filter((k) => k === T_GOO).length).toBeGreaterThan(0);
        expect(m.kind.filter((k) => k === T_SPIKE).length).toBeGreaterThan(0);
      });
      it('lets every square be reached, and reached without treading on spikes', () => {
        const any = stepsFrom(m, m.den.x, m.den.y);
        const safe = stepsFrom(m, m.den.x, m.den.y, true);
        for (let r = 0; r < m.lines; r++) {
          for (let c = 0; c < m.cols; c++) {
            const k = m.kind[r * m.cols + c];
            if (k === T_WALL) continue;
            expect(any[r * m.cols + c]).not.toBe(FAR);
            if (k !== T_SPIKE) expect(safe[r * m.cols + c]).not.toBe(FAR);
          }
        }
      });
      it('has somewhere new for the Beast to start most rounds', () => {
        // the places the game picks from: the den, the pills and the chores, out of sight of every start
        const fair = [m.den, ...m.pills, ...m.tasks].filter((at) =>
          m.cousinStarts.every((s) => Math.hypot(s.x - at.x, s.y - at.y) >= BEAST_START_CLEAR * TILE && !sees(m, at.x, at.y, s.x, s.y)),
        );
        expect(fair.length).toBeGreaterThanOrEqual(4);
      });
      it('starts no Cousin in sight of the den, or near it', () => {
        const field = stepsFrom(m, m.den.x, m.den.y);
        for (const s of m.cousinStarts) {
          expect(sees(m, m.den.x, m.den.y, s.x, s.y)).toBe(false);
          expect(stepsAt(m, field, s.x, s.y)).toBeGreaterThan(10);
        }
      });
      it('puts nothing a round needs on a trap, and starts nobody beside one', () => {
        for (const s of [...m.cousinStarts, m.den, ...m.pills, ...m.portals, ...m.tasks, ...m.exits]) expect(kindAt(m, s.x, s.y)).toBe(T_FLOOR);
        for (const s of m.cousinStarts) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect([T_GOO, T_SPIKE]).not.toContain(kindAt(m, s.x + dx * TILE, s.y + dy * TILE));
      });
      it('leaves every room at least two ways out, and joins the rooms by passages', () => {
        for (const room of m.rooms) expect(room.ways).toBeGreaterThanOrEqual(2);
        let passage = 0;
        for (let i = 0; i < m.zone.length; i++) if (m.zone[i] < 0 && m.kind[i] !== T_WALL) passage++;
        expect(passage).toBeGreaterThan(40);
      });
      it('has rooms that are not all boxes', () => {
        const odd = m.rooms.filter((room, i) => {
          let n = 0;
          for (let k = 0; k < m.zone.length; k++) if (m.zone[k] === i) n++;
          return n < (room.x1 - room.x0 + 1) * (room.y1 - room.y0 + 1) - 2;
        });
        expect(odd.length).toBeGreaterThan(0);
      });
      it('never leaves a gap between two walls that only touch at a corner', () => {
        for (let r = 0; r + 1 < m.lines; r++) {
          for (let c = 0; c + 1 < m.cols; c++) {
            const a = wallAt(m, c, r);
            const b = wallAt(m, c + 1, r);
            const d = wallAt(m, c, r + 1);
            const e = wallAt(m, c + 1, r + 1);
            expect((!a && !e && b && d) || (!b && !d && a && e)).toBe(false);
          }
        }
      });
    });
  }
});
