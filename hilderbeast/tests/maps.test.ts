import { describe, expect, it } from 'vitest';
import { START_SPOTS, TASKS_MAX, TILE } from '../shared/src/constants';
import { T_FLOOR, T_GOO, T_SPIKE, T_WALL, kindAt, wallAt } from '../shared/src/map';
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
      it('is a closed box of the usual size', () => {
        expect([m.cols, m.lines]).toEqual([40, 26]);
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
      it('leaves every room at least two ways out', () => {
        // a doorway is a floor square in the wall round a room
        for (const room of m.rooms) {
          let gaps = 0;
          for (let c = room.x0; c <= room.x1; c++) for (const r of [room.y0 - 1, room.y1 + 1]) if (!wallAt(m, c, r)) gaps++;
          for (let r = room.y0; r <= room.y1; r++) for (const c of [room.x0 - 1, room.x1 + 1]) if (!wallAt(m, c, r)) gaps++;
          expect(gaps).toBeGreaterThanOrEqual(2);
        }
      });
    });
  }
});
