import { describe, it, expect } from 'vitest';
import { ARENA, MATCH } from '../../shared/src/constants.js';
import { LEVELS } from '../../shared/src/levels.js';
import { newGame, run, place, park, P } from './helpers.js';

describe('bots', () => {
  it('need a human host; can be added and removed', () => {
    const g = newGame();
    expect(g.addBot()).toBeNull();
    g.join('Host');
    const bot = g.addBot()!;
    expect(bot.bot).toBe(true);
    expect(g.botCount()).toBe(1);
    expect(g.removeBot()).toBe(true);
    expect(g.botCount()).toBe(0);
    expect(g.removeBot()).toBe(false);
  });

  it('are cleared when the last human leaves', () => {
    const g = newGame();
    const host = g.join('Host')!.id;
    g.addBot();
    g.addBot();
    g.leave(host);
    expect(g.players.size).toBe(0);
    expect(g.phase).toBe('lobby');
  });

  it('ignore remote input (only their brain drives them)', () => {
    const g = newGame();
    g.join('Host');
    const bot = g.addBot()!;
    g.setInput(bot.id, { left: true, right: false, jump: false });
    expect(bot.input.left).toBe(false);
  });

  for (const level of LEVELS) {
    it(`brawl to a finish on ${level.name}`, () => {
      const g = newGame(level.id, 7);
      const host = g.join('Host')!.id;
      for (let i = 0; i < 3; i++) g.addBot();
      g.restart();
      run(g, MATCH.countdownMs + 20);
      // the human idles safely out of the way and is not part of the fight
      park(g, host);
      P(g, host).stocks = 1;
      let kos = 0;
      for (let t = 0; t < MATCH.durationMs + 2000 && g.phase === 'playing'; t += 500) {
        run(g, 500);
        for (const p of g.players.values()) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        }
        kos = [...g.players.values()].reduce((s, p) => s + p.falls, 0);
      }
      expect(g.phase).toBe('ended');
      const dealt = [...g.players.values()].filter((p) => p.bot).reduce((s, p) => s + p.dmgDealt, 0);
      expect(dealt).toBeGreaterThan(30);
      expect(kos).toBeGreaterThan(0);
    });
  }

  it('recover to the stage after being knocked off the side', () => {
    let recovered = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const g = newGame('sky', seed);
      const host = g.join('Host')!.id;
      const bot = g.addBot()!;
      g.restart();
      run(g, MATCH.countdownMs + 20);
      park(g, host);
      // flung past the right island's edge (x 960..1190), at platform height
      place(g, bot.id, 1250, 360);
      bot.vx = 200;
      run(g, 2500);
      if (bot.life === 'alive' && bot.stocks === MATCH.stocks && bot.y < ARENA.height) recovered++;
    }
    expect(recovered).toBeGreaterThanOrEqual(8);
  });
});
