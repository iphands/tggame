import { describe, it, expect } from 'vitest';
import { ARENA, COLORS, ITEMS, MATCH, PHYS } from '../../shared/src/constants.js';
import { LEVELS } from '../../shared/src/levels.js';
import { Game } from '../../server/src/sim/game.js';
import { spawnCrate } from '../../server/src/sim/items.js';
import { newGame, startMatch, run, place, park, P, TICK_MS } from './helpers.js';

/** Throw a player out of the arena (past the bottom blast line). */
function kill(g: Game, id: string): void {
  const p = P(g, id);
  p.grounded = false;
  p.platIdx = -1;
  p.x = 640;
  p.y = ARENA.blastBottom + 10;
  run(g, TICK_MS);
}

/** Lose every stock. */
function eliminate(g: Game, id: string): void {
  for (let i = 0; i < MATCH.stocks; i++) {
    if (P(g, id).life === 'respawning') run(g, MATCH.respawnDelayMs + 50);
    kill(g, id);
  }
}

describe('lobby & start', () => {
  it('auto-starts after the grace period once two players are in', () => {
    const g = newGame();
    g.join('Alice');
    run(g, MATCH.fallbackWaitMs + 1000);
    expect(g.phase).toBe('lobby'); // one player never auto-starts
    g.join('Bob');
    run(g, MATCH.fallbackWaitMs - 500);
    expect(g.phase).toBe('lobby');
    run(g, 600);
    expect(g.phase).toBe('starting');
    run(g, MATCH.countdownMs + 20);
    expect(g.phase).toBe('playing');
  });

  it('quick-starts at the quick-start head count', () => {
    const g = newGame();
    for (let i = 0; i < MATCH.quickStartPlayers; i++) g.join(`P${i}`);
    run(g, 100);
    expect(g.phase).toBe('starting');
  });

  it('places everyone on the arena during the countdown, frozen', () => {
    const g = newGame('frost');
    const a = g.join('Alice')!.id;
    g.join('Bob');
    g.restart();
    expect(g.phase).toBe('starting');
    expect(g.w.level.id).toBe('frost');
    const pa = P(g, a);
    const y0 = pa.y;
    g.setInput(a, { left: false, right: true, jump: false });
    run(g, 1000);
    expect(pa.y).toBe(y0);
    expect(pa.x).toBeGreaterThan(0);
    expect(pa.y + PHYS.playerH).toBe(LEVELS[1].spawns[0].y);
  });

  it('restart forces a round even solo, but never with zero humans', () => {
    const g = newGame();
    g.restart();
    expect(g.phase).toBe('lobby');
    g.join('Solo');
    g.restart();
    expect(g.phase).toBe('starting');
  });

  it('a solo practice round does not end instantly', () => {
    const g = newGame();
    const [a] = startMatch(g, ['Solo']);
    run(g, 5000);
    expect(g.phase).toBe('playing');
    eliminate(g, a);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBeNull();
  });

  it('players joining during the countdown get into the round', () => {
    const g = newGame();
    g.join('Alice');
    g.restart();
    const late = g.join('Late')!.id;
    expect(P(g, late).life).toBe('alive');
    expect(P(g, late).x).toBeGreaterThan(0);
  });
});

describe('stocks, KOs and respawns', () => {
  it('leaving the blast zone costs a stock, then you respawn invulnerable at 0%', () => {
    const g = newGame();
    const [a, b] = startMatch(g, ['Alice', 'Bob', 'Cara']);
    park(g, b);
    const pa = P(g, a);
    pa.dmg = 77;
    kill(g, a);
    expect(pa.stocks).toBe(MATCH.stocks - 1);
    expect(pa.life).toBe('respawning');
    expect(pa.falls).toBe(1);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Alice', killer: null, how: 'fall' });
    run(g, MATCH.respawnDelayMs + 50);
    expect(pa.life).toBe('alive');
    expect(pa.dmg).toBe(0);
    expect(pa.invulnUntil).toBeGreaterThan(g.simTimeMs);
    run(g, 600);
    expect(pa.grounded).toBe(true);
  });

  it('all four blast lines count', () => {
    const g = newGame();
    const [a] = startMatch(g, ['Alice', 'Bob', 'Cara']);
    const pa = P(g, a);
    const spots: [number, number][] = [
      [ARENA.blastLeft - 100, 300],
      [ARENA.blastRight + 10, 300],
      [640, ARENA.blastTop - 100],
    ];
    let stocks = pa.stocks;
    for (const [x, y] of spots.slice(0, MATCH.stocks - 1)) {
      if (pa.life === 'respawning') run(g, MATCH.respawnDelayMs + 50);
      pa.grounded = false;
      pa.platIdx = -1;
      pa.x = x;
      pa.y = y;
      run(g, TICK_MS);
      expect(pa.stocks).toBe(--stocks);
    }
  });

  it('the last player to hit you within the credit window gets the KO', () => {
    const g = newGame();
    const [a, b] = startMatch(g, ['Alice', 'Bob', 'Cara']);
    const pb = P(g, b);
    pb.lastHit = { by: a, at: g.simTimeMs, how: 'bomb' };
    kill(g, b);
    expect(P(g, a).kos).toBe(1);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Bob', killer: 'Alice', how: 'bomb' });

    run(g, MATCH.respawnDelayMs + 50);
    pb.lastHit = { by: a, at: g.simTimeMs, how: 'pistol' };
    run(g, 5200); // credit expires
    kill(g, b);
    expect(P(g, a).kos).toBe(1);
    expect(g.w.feed[0].how).toBe('fall');
  });

  it('losing your last stock puts you out and the last one standing wins', () => {
    const g = newGame();
    const [a, b, c] = startMatch(g, ['Alice', 'Bob', 'Cara']);
    eliminate(g, b);
    expect(P(g, b).life).toBe('out');
    expect(P(g, b).place).toBe(3);
    expect(g.phase).toBe('playing');
    eliminate(g, c);
    expect(P(g, c).place).toBe(2);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(a);
    expect(P(g, a).wins).toBe(1);
    expect(g.results?.map((r) => r.name)).toEqual(['Alice', 'Cara', 'Bob']);
  });

  it('timeout: more stocks wins, then less damage', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    park(g, a);
    place(g, b, 640, 440);
    kill(g, a);
    run(g, MATCH.respawnDelayMs + 50);
    g.timeLeftMs = 50;
    run(g, 100);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(b);
  });

  it('timeout with identical standing is a draw', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    park(g, a);
    place(g, b, 640, 440);
    g.timeLeftMs = 50;
    run(g, 100);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBeNull();
  });

  it('after the results screen, everyone returns to the lobby and the next round auto-arms', () => {
    const g = newGame();
    const [, b] = startMatch(g);
    eliminate(g, b);
    expect(g.phase).toBe('ended');
    run(g, MATCH.endHoldMs + 100);
    expect(g.phase).toBe('lobby');
    for (const p of g.players.values()) {
      expect(p.life).toBe('alive');
      expect(p.stocks).toBe(MATCH.stocks);
    }
    run(g, MATCH.fallbackWaitMs + 200);
    expect(g.phase).toBe('starting');
  });
});

describe('joining and leaving', () => {
  it('mid-round joiners wait, then play the next round', () => {
    const g = newGame();
    const [, b] = startMatch(g);
    const late = g.join('Late')!.id;
    expect(P(g, late).life).toBe('waiting');
    eliminate(g, b);
    run(g, MATCH.endHoldMs + 100);
    g.restart();
    expect(P(g, late).life).toBe('alive');
  });

  it('a leaver ends the match when only one player remains', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    g.leave(b);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(a);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Bob', how: 'left' });
  });

  it('colors stay unique, names are cleaned and de-duplicated', () => {
    const g = newGame();
    const a = g.join('Alice')!;
    const b = g.join('Alice')!;
    const c = g.join('<b>Hax</b>!!')!;
    const d = g.join('')!;
    expect(b.name).not.toBe(a.name);
    expect(c.name).toBe('bHaxb');
    expect(d.name.length).toBeGreaterThan(0);
    g.leave(a.id);
    const e = g.join('Eve')!;
    expect(e.color).toBe(COLORS[0]); // freed color is reused
    const colors = [...g.players.values()].map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('caps the arena at capacity, but humans bump bots', () => {
    const g = newGame();
    g.join('Host');
    for (let i = 0; i < 20; i++) g.addBot();
    expect(g.players.size).toBe(MATCH.capacity);
    const human = g.join('Human');
    expect(human).not.toBeNull();
    expect(g.players.size).toBe(MATCH.capacity);
    expect(g.botCount()).toBe(MATCH.capacity - 2);
  });
});

describe('arena selection', () => {
  it('pickLevel cycles the next arena in the lobby, and the round uses it', () => {
    const g = new Game({ seed: 3 });
    g.join('Alice');
    g.nextLevelIndex = 0;
    g.pickLevel(-1);
    expect(g.nextLevelIndex).toBe(LEVELS.length - 1);
    g.pickLevel(1);
    g.pickLevel(1);
    expect(g.nextLevelIndex).toBe(1);
    g.restart();
    expect(g.w.level.id).toBe(LEVELS[1].id);
    g.pickLevel(1); // ignored mid-countdown
    expect(g.nextLevelIndex).toBe(1);
  });

  it('the arena rotates after each round', () => {
    const g = newGame('sky');
    const [, b] = startMatch(g);
    eliminate(g, b);
    expect(g.nextLevelIndex).toBe(1);
  });
});

describe('item crates', () => {
  it('drop from the sky, land on a platform, and grant their item on touch', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    park(g, b);
    const crate = spawnCrate(g.w, 'boomstick')!;
    run(g, 2000);
    expect(crate.platIdx).toBeGreaterThanOrEqual(0);
    const pl = g.w.plats[crate.platIdx];
    expect(crate.y + ITEMS.size).toBeCloseTo(pl.y, 5);
    place(g, a, crate.x + ITEMS.size / 2, pl.y);
    run(g, 100);
    expect(g.w.crates.length).toBe(0);
    expect(P(g, a).weapon).toBe('boomstick');
  });

  it('spawn on a timer during play and expire if ignored', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    park(g, a);
    place(g, b, 200, 390);
    g.w.nextCrateAt = g.simTimeMs + 100;
    run(g, 200);
    expect(g.w.crates.length).toBe(1);
    g.w.nextCrateAt = Infinity;
    run(g, ITEMS.lifeMs + 200);
    // it either expired or was picked up by a parked player — never lingers
    expect(g.w.crates.length).toBe(0);
  });
});

describe('snapshot', () => {
  it('drains fx and reports arena state', () => {
    const g = newGame();
    const [a] = startMatch(g);
    place(g, a, 640, 440);
    run(g, 100);
    g.setInput(a, { left: false, right: false, jump: true });
    run(g, 50);
    const s1 = g.snapshot();
    expect(s1.fx.some((f) => f.k === 'jump')).toBe(true);
    expect(g.snapshot().fx.length).toBe(0);
    expect(s1.platforms.length).toBe(g.w.plats.length);
    expect(s1.players[0]).toHaveProperty('dmg');
    expect(s1.phase).toBe('playing');
  });
});
