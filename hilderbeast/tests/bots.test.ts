import { describe, expect, it } from 'vitest';
import { ESCAPE_CLOCK_MS, LAST_CLOCK_MS } from '../shared/src/constants';
import { Game } from '../server/src/game';
import { MAPS } from '../shared/src/maps';
import type { Mode } from '../shared/src/types';
import { join, runUntil, seeded } from './helpers';

/** A whole round played by bots. One human sits in so there is a host; they are dropped at once. */
function botRound(mode: Mode, bots: number, seed: number, map = 0) {
  const g = new Game(seeded(seed));
  const host = join(g, 'Host');
  for (let i = 0; i < bots - 1; i++) g.addBot(host.id);
  g.configure(host.id, mode, map);
  g.start(host.id);
  g.drop(host.id);
  const tookMs = runUntil(g, () => g.phase === 'finale', (mode === 'escape' ? ESCAPE_CLOCK_MS : LAST_CLOCK_MS) + 60_000);
  return { result: g.viewFor(host.id).result!, tookMs, world: g.world! };
}

describe('bot rounds', () => {
  it('always end, and the Beasts catch somebody', { timeout: 120_000 }, () => {
    const lines: string[] = [];
    let caught = 0;
    for (const mode of ['last', 'escape'] as const) {
      for (const n of [2, 4, 8]) {
        for (const seed of [1, 2]) {
          const { result, tookMs } = botRound(mode, n, seed);
          caught += result.catches.length;
          lines.push(`${mode} x${n} seed ${seed}: ${result.winner} (${result.why}) after ${(tookMs / 1000).toFixed(0)} s, ${result.catches.length} caught`);
        }
      }
    }
    console.log(lines.join('\n'));
    expect(caught).toBeGreaterThan(5);
  });
  it('can finish the chores and get out', { timeout: 120_000 }, () => {
    const wins = [1, 2, 3, 4, 5, 6].map((seed) => botRound('escape', 5, seed)).filter((r) => r.result.why === 'escaped');
    expect(wins.length).toBeGreaterThan(0);
  });
  it('end on every map, in both modes', { timeout: 240_000 }, () => {
    const lines: string[] = [];
    MAPS.forEach((m, i) => {
      for (const mode of ['last', 'escape'] as const) {
        const { result, tookMs, world } = botRound(mode, 6, 3 + i, i);
        expect(world.map).toBe(m);
        lines.push(`${m.name}, ${mode}: ${result.winner} (${result.why}) after ${(tookMs / 1000).toFixed(0)} s, ${result.catches.length} caught, ${result.escaped.length} out`);
      }
    });
    console.log(lines.join('\n'));
  });
});
