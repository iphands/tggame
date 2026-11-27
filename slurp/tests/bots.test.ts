import { describe, expect, it } from 'vitest';
import { Game } from '../server/src/game';
import { CLEARED_MS, COUNTDOWN_MS, COURSES, courseTimeMs } from '../shared/src/constants';
import { join, run, runUntil, seeded } from './helpers';

/** A run of one idle human plus bots; the human's hole is steered for them once they drop. */
function botRun(n: number, seed: number): Game {
  const g = new Game(seeded(seed));
  const me = join(g, 'Host');
  for (let i = 1; i < n; i++) g.addBot(me.id);
  g.start(me.id);
  g.drop(me.id);
  return g;
}

describe('bots', () => {
  for (const n of [1, 4, 8]) {
    it(`${n} of them clear the first course with time to spare`, () => {
      for (const seed of [1, 2, 3]) {
        const g = botRun(n, seed);
        run(g, COUNTDOWN_MS);
        const took = runUntil(g, () => g.phase !== 'play', courseTimeMs(1) + 1000);
        expect(g.phase).toBe('cleared');
        expect(took).toBeLessThan(courseTimeMs(1) * 0.8);
      }
    });
  }

  it('report how far a bot team gets (tuning aid)', () => {
    const lines: string[] = [];
    for (const n of [1, 2, 4, 8]) {
      const g = botRun(n, 11);
      const times: string[] = [];
      while (g.phase !== 'finale') {
        runUntil(g, () => g.phase === 'play', CLEARED_MS + COUNTDOWN_MS + 1000);
        const took = runUntil(g, () => g.phase !== 'play', 400_000);
        const v = g.viewFor('p1');
        times.push(`${(took / 1000).toFixed(0)}/${(v.course!.timeMs / 1000).toFixed(0)}s${v.cleared?.no === g.course ? '★'.repeat(v.cleared.stars) : '✗'}`);
      }
      lines.push(`${n} holes: ${times.join('  ')}`);
      expect(g.viewFor('p1').result!.cleared).toBeGreaterThanOrEqual(2);
      expect(g.viewFor('p1').result!.cleared).toBeLessThanOrEqual(COURSES);
    }
    console.log(lines.join('\n'));
  });
});
