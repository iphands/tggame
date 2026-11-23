/** Regressions found in review of the v2 rewrite. */
import { describe, it, expect } from 'vitest';
import { ARENA, MATCH, PHYS } from '../../shared/src/constants.js';
import type { Game } from '../../server/src/sim/game.js';
import { newGame, startMatch, run, park, P, TICK_MS } from './helpers.js';

function kill(g: Game, id: string): void {
  const p = P(g, id);
  p.grounded = false;
  p.platIdx = -1;
  p.x = 640;
  p.y = ARENA.blastBottom + 10;
  run(g, TICK_MS);
}

function eliminate(g: Game, id: string): void {
  for (let i = 0; i < MATCH.stocks; i++) {
    if (P(g, id).life === 'respawning') run(g, MATCH.respawnDelayMs + 50);
    kill(g, id);
  }
}

describe('review regressions', () => {
  it('places stay contiguous when a player leaves mid-round', () => {
    const g = newGame();
    const [a, b, c, d] = startMatch(g, ['A', 'B', 'C', 'D']);
    eliminate(g, a); // 4th of 4
    g.leave(b); // still in play → A moves up to 3rd
    eliminate(g, c);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(d);
    expect(g.results!.map((r) => [r.name, r.place])).toEqual([
      ['D', 1],
      ['C', 2],
      ['A', 3],
    ]);
  });

  it('a jump tapped during the countdown does not burn the double jump at FIGHT', () => {
    const g = newGame();
    const a = g.join('A')!.id;
    g.join('B');
    g.restart();
    run(g, 500);
    g.setInput(a, { left: false, right: false, jump: true });
    g.setInput(a, { left: false, right: false, jump: false });
    run(g, MATCH.countdownMs);
    expect(g.phase).toBe('playing');
    run(g, 100);
    const p = P(g, a);
    expect(p.grounded).toBe(true);
    expect(p.airJumpsLeft).toBe(PHYS.airJumps);
  });

  it('players start the round standing on their spawn platform', () => {
    const g = newGame();
    const a = g.join('A')!.id;
    g.restart();
    expect(P(g, a).grounded).toBe(true);
    expect(P(g, a).platIdx).toBeGreaterThanOrEqual(0);
  });

  it('the last two going out on the same tick share first place (draw)', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    for (const id of [a, b]) {
      P(g, id).stocks = 1;
    }
    for (const id of [a, b]) {
      const p = P(g, id);
      p.grounded = false;
      p.platIdx = -1;
      p.x = 640;
      p.y = ARENA.blastBottom + 10;
    }
    run(g, TICK_MS);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBeNull();
    expect(g.results!.map((r) => r.place)).toEqual([1, 1]);
  });

  it('mid-match restart is ignored with 2+ humans, allowed solo with bots', () => {
    const g = newGame();
    startMatch(g, ['A', 'B']);
    run(g, 2000);
    g.restart();
    expect(g.phase).toBe('playing');

    const solo = newGame();
    solo.join('Solo');
    solo.addBot();
    solo.restart();
    run(solo, MATCH.countdownMs + 100);
    expect(solo.phase).toBe('playing');
    solo.restart();
    expect(solo.phase).toBe('starting');
  });

  it('survivors who wander off during the victory lap are not marked OUT', () => {
    const g = newGame();
    const [a, b, c] = startMatch(g, ['A', 'B', 'C']);
    park(g, a);
    eliminate(g, b);
    eliminate(g, c);
    expect(g.phase).toBe('ended');
    kill(g, a);
    expect(P(g, a).life).not.toBe('out');
    expect(g.results![0].name).toBe('A');
  });

  it('someone joining a solo practice round restarts it with them in', () => {
    const g = newGame();
    startMatch(g, ['Solo']);
    run(g, 2000);
    const late = g.join('Late')!.id;
    expect(g.phase).toBe('starting');
    expect(P(g, late).life).toBe('alive');
  });
});
