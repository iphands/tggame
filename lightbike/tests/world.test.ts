import { describe, expect, it } from 'vitest';
import { PACE_SPEED, SHRINK_AFTER_MS, SHRINK_EVERY_MS, TICK_HZ, TICK_MS } from '../shared/src/constants';
import { WALL } from '../server/src/world';
import { ALL_ON, PLAIN, floor, line, place, ride, steps } from './helpers';

/** Far from everything, so a bike that is not part of a test rides on undisturbed. */
const park = (w: Parameters<typeof place>[0], id: string) => place(w, id, 2, 28, 0);

describe('riding', () => {
  it('moves at the pace, one cell at a time, leaving a line behind', () => {
    const { w, stats } = floor();
    const a = place(w, 'a', 5, 5, 0);
    park(w, 'b');
    steps(w, TICK_HZ);
    expect(a.x).toBeGreaterThanOrEqual(5 + PACE_SPEED.normal - 1);
    expect(a.x).toBeLessThanOrEqual(5 + PACE_SPEED.normal);
    expect(a.y).toBe(5);
    for (let x = 5; x <= a.x; x++) expect(w.at(x, 5)).toBe(a.idx + 1);
    expect(stats.get('a')!.cells).toBe(a.x - 5);
  });

  it('turns in the next cell it reaches, never sooner', () => {
    const { w } = floor();
    const a = place(w, 'a', 5, 5, 0);
    park(w, 'b');
    w.turn('a', 1);
    expect(a.dir).toBe(0);
    ride(w, 'a', 1);
    expect([a.x, a.y, a.dir]).toEqual([6, 5, 1]);
    ride(w, 'a', 1);
    expect([a.x, a.y]).toEqual([6, 6]);
    expect(a.pts).toEqual([5, 5, 6, 5]);
    expect(a.turns).toBe(1);
  });

  it('cannot reverse or "turn" straight on', () => {
    const { w } = floor();
    const a = place(w, 'a', 5, 5, 0);
    park(w, 'b');
    w.turn('a', 2);
    w.turn('a', 0);
    expect(a.queue).toEqual([]);
  });

  it('makes a U-turn from two quick taps, one cell apart', () => {
    const { w } = floor();
    const a = place(w, 'a', 5, 5, 0);
    park(w, 'b');
    w.turn('a', 1);
    w.turn('a', 2);
    w.turn('a', 3); // a third is one too many
    expect(a.queue).toEqual([1, 2]);
    ride(w, 'a', 3);
    expect(a.alive).toBe(true);
    expect([a.x, a.y, a.dir]).toEqual([5, 6, 2]);
  });
});

describe('crashing', () => {
  it('into the rim', () => {
    const { w, stats } = floor();
    const a = place(w, 'a', 37, 5, 0);
    park(w, 'b');
    ride(w, 'a', 5);
    expect(a.alive).toBe(false);
    expect([a.x, a.y]).toEqual([39, 5]);
    expect(stats.get('a')!.walls).toBe(1);
    expect(w.out).toEqual([{ id: 'a', by: '' }]);
  });

  it("into somebody's line gives them the cut-off, and every survivor a point", () => {
    const { w, stats } = floor(['a', 'b', 'c']);
    const a = place(w, 'a', 5, 5, 0);
    line(w, 'b', 8, 0, 8, 10);
    place(w, 'b', 2, 28, 0);
    place(w, 'c', 2, 20, 0);
    ride(w, 'a', 5);
    expect(a.alive).toBe(false);
    expect(a.x).toBe(7);
    expect(w.out).toEqual([{ id: 'a', by: 'b' }]);
    expect(stats.get('b')).toMatchObject({ score: 2, cuts: 1 });
    expect(stats.get('c')).toMatchObject({ score: 1, cuts: 0 });
    expect(stats.get('a')).toMatchObject({ score: 0, firsts: 1 });
    expect(w.gained.get('b')).toBe(2);
  });

  it('into your own line is nobody else\'s doing', () => {
    const { w, stats } = floor();
    const a = place(w, 'a', 5, 5, 0);
    park(w, 'b');
    line(w, 'a', 8, 0, 8, 10);
    ride(w, 'a', 5);
    expect(w.out).toEqual([{ id: 'a', by: 'a' }]);
    expect(stats.get('a')!.own).toBe(1);
    expect(stats.get('b')).toMatchObject({ score: 1, cuts: 0 });
  });

  it('nose to nose takes both out, with no credit', () => {
    for (const gap of [1, 2]) {
      const { w, stats } = floor();
      const a = place(w, 'a', 10, 5, 0);
      const b = place(w, 'b', 10 + gap + 1, 5, 2);
      steps(w, 30);
      expect([a.alive, b.alive], `gap ${gap}`).toEqual([false, false]);
      expect(w.out.map((o) => o.by)).toEqual(['', '']);
      expect(stats.get('a')!.cuts + stats.get('b')!.cuts).toBe(0);
    }
  });

  it('two bikes into one cell in the same instant both go', () => {
    const { w } = floor();
    const a = place(w, 'a', 9, 5, 0);
    const b = place(w, 'b', 10, 4, 1);
    steps(w, 10);
    expect([a.alive, b.alive]).toEqual([false, false]);
  });

  it('a line stays as an obstacle unless the host has erase on', () => {
    const kept = floor(['a', 'b'], PLAIN);
    place(kept.w, 'a', 36, 5, 0);
    park(kept.w, 'b');
    ride(kept.w, 'a', 5);
    expect(kept.w.at(37, 5)).toBe(1);
    expect(kept.w.trails().map((t) => [t[0], t[1]])).toEqual([['a', 1], ['b', 0]]);

    const wiped = floor(['a', 'b'], { ...PLAIN, erase: true });
    place(wiped.w, 'a', 36, 5, 0);
    park(wiped.w, 'b');
    ride(wiped.w, 'a', 5);
    expect(wiped.w.at(37, 5)).toBe(0);
    expect(wiped.w.fx).toContainEqual(['e', 'a']);
    expect(wiped.w.trails().map((t) => t[0])).toEqual(['b']);
  });

  it('a rider who leaves takes bike and line along, and nobody scores', () => {
    const { w, stats } = floor(['a', 'b'], PLAIN);
    const a = place(w, 'a', 5, 5, 0);
    park(w, 'b');
    ride(w, 'a', 3);
    w.retire('a');
    expect(a.alive).toBe(false);
    expect(w.at(6, 5)).toBe(0);
    expect(stats.get('b')!.score).toBe(0);
    expect(w.out).toEqual([]);
    expect(w.bikeList().map((b) => b[0])).toEqual(['b']);
  });
});

describe('the rim closes in', () => {
  it('one cell at a time once the round has gone on long enough', () => {
    const { w } = floor();
    const a = place(w, 'a', 5, 0, 0);
    const b = place(w, 'b', 5, 15, 0);
    w.stop();
    // stand still: only the clock matters here
    const tick = (): void => {
      a.p = b.p = 0;
      w.step();
    };
    for (let t = 0; t < SHRINK_AFTER_MS - TICK_MS * 2; t += TICK_MS) tick();
    expect(w.ring).toBe(0);
    for (let i = 0; i < 4; i++) tick();
    expect(w.ring).toBe(1);
    expect(w.at(20, 0)).toBe(WALL);
    expect(w.at(20, 1)).toBe(0);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    for (let t = 0; t < SHRINK_EVERY_MS + TICK_MS; t += TICK_MS) tick();
    expect(w.ring).toBe(2);
    expect(w.fx).toContainEqual(['s', 2]);
  });
});

describe('snapshots', () => {
  it('carry cell, heading, progress, speed and flags', () => {
    const { w } = floor(['a', 'b'], ALL_ON);
    place(w, 'a', 5, 5, 0);
    park(w, 'b');
    steps(w, 3);
    const [id, x, y, dir, p, speed, flags, energy, turns] = w.bikeList()[0];
    expect([id, x, y, dir, flags, energy, turns]).toEqual(['a', 5, 5, 0, 0, 100, 0]);
    expect(p).toBe(75);
    expect(speed).toBe(PACE_SPEED.normal * 10);
  });
});
