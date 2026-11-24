import { describe, it, expect } from 'vitest';
import { BOX, MATCH } from '../../shared/src/constants.js';
import { LEVELS } from '../../shared/src/levels.js';
import { flatWorld, newCustom, newGame, newRun, run, runToEnd, P } from './helpers.js';

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
    it(`run ${level.name} to the finish`, () => {
      let finishers = 0;
      for (const seed of [3, 7]) {
        const g = newRun(level.id, seed);
        const host = g.join('Host')!.id;
        for (let i = 0; i < 4; i++) g.addBot();
        g.restart();
        run(g, MATCH.countdownMs + 20);
        P(g, host).lives = 0; // the idle human gets swept up by the screen and just watches
        for (let t = 0; t < MATCH.durationMs + 2000 && g.phase === 'playing'; t += 500) {
          run(g, 500);
          for (const p of g.players.values()) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          }
        }
        expect(g.phase).toBe('ended');
        const rows = g.results!.filter((r) => r.bot);
        finishers += rows.filter((r) => r.timeMs !== null).length;
        // both gates came down, and the pack did the smashing
        expect(g.w.gateIdx).toBe(level.gates.length);
        expect(rows.reduce((n, r) => n + r.smash, 0)).toBeGreaterThan(30);
        // a winner finished, in a sensible time
        expect(g.winnerId).not.toBeNull();
        expect(rows[0].timeMs!).toBeGreaterThan(20_000);
        expect(rows[0].timeMs!).toBeLessThan(120_000);
      }
      expect(finishers).toBeGreaterThanOrEqual(6); // of 8
    });
  }

  it('a lone bot shoots its way through a crate wall and a gate', () => {
    const g = newCustom(
      flatWorld({
        boxes: [0, 1, 2, 3, 4, 5].map((i) => ({ x: 900, y: 540 - BOX.size * (i + 1), w: BOX.size, h: BOX.size, hp: 4 })),
        gates: [{ x: 1700, w: BOX.gateW }],
      })
    );
    const host = g.join('Host')!.id;
    const bot = g.addBot()!;
    g.restart();
    run(g, MATCH.countdownMs + 20);
    P(g, host).lives = 0;
    runToEnd(g, 60_000);
    expect(g.phase).toBe('ended');
    expect(g.w.gateIdx).toBe(1);
    expect(bot.finishMs).toBeGreaterThan(0);
    expect(bot.smash).toBeGreaterThan(20);
  });

  it('jump permanent blocks, even ones that need the double jump', () => {
    const g = newCustom(
      flatWorld({
        boxes: [
          { x: 900, y: 540 - BOX.size * 2, w: BOX.size, h: BOX.size * 2 },
          { x: 1500, y: 540 - BOX.size * 4, w: BOX.size, h: BOX.size * 4 },
        ],
      })
    );
    const host = g.join('Host')!.id;
    const bot = g.addBot()!;
    g.restart();
    run(g, MATCH.countdownMs + 20);
    P(g, host).lives = 0;
    runToEnd(g, 40_000);
    expect(g.phase).toBe('ended');
    expect(bot.finishMs).toBeGreaterThan(0);
    expect(bot.deaths).toBe(0);
  });

  it('stand still once across the line', () => {
    const g = newCustom(flatWorld({ length: 1900 }));
    g.join('Host'); // idles behind the bot, still racing
    const bot = g.addBot()!;
    g.restart();
    run(g, MATCH.countdownMs + 20);
    run(g, 6000);
    expect(bot.finishMs).toBeGreaterThan(0);
    expect(bot.input).toEqual({ left: false, right: false, jump: false });
    expect(g.phase).toBe('playing'); // the human hasn't finished
  });
});
