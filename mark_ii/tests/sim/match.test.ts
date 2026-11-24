import { describe, it, expect } from 'vitest';
import { ARENA, COLORS, ITEMS, MATCH, PHYS, RUN } from '../../shared/src/constants.js';
import { LEVELS } from '../../shared/src/levels.js';
import { Game } from '../../server/src/sim/game.js';
import { spawnCrate } from '../../server/src/sim/items.js';
import { ARENAS } from '../fixtures/arenas.js';
import { flatWorld, newCustom, newGame, startMatch, run, place, park, hold, P, TICK_MS } from './helpers.js';

/** Drop a player into the pit (below the bottom of the screen). */
function kill(g: Game, id: string): void {
  const p = P(g, id);
  p.grounded = false;
  p.platIdx = -1;
  p.y = ARENA.height + RUN.fallBelow + 10;
  run(g, TICK_MS);
}

/** Lose every life. */
function eliminate(g: Game, id: string): void {
  for (let i = 0; i < RUN.lives; i++) {
    if (P(g, id).life === 'respawning') run(g, MATCH.respawnDelayMs + 50);
    kill(g, id);
  }
}

/** A short flat course whose finish line (x=1200) is on screen from the start. */
function sprint(names: string[] = ['Alice', 'Bob']): { g: Game; ids: string[] } {
  const g = newCustom(flatWorld({ length: 1900 }));
  const ids = startMatch(g, names);
  // stand everyone mid-screen so the scrolling screen never catches them
  ids.forEach((id, i) => place(g, id, 700 + i * 40, 540));
  run(g, 100);
  return { g, ids };
}

/** Carry a player across the finish line. */
function finish(g: Game, id: string): void {
  place(g, id, g.w.level.finishX + 20, 540);
  run(g, TICK_MS * 2);
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

  it('lines everyone up on the course during the countdown, frozen and facing the run', () => {
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
    expect(pa.y + PHYS.playerH).toBe(ARENAS[1].spawns[0].y);
    expect(pa.face).toBe(1);
    expect(g.w.scrollX).toBe(0);
  });

  it('restart forces a round even solo, but never with zero humans', () => {
    const g = newGame();
    g.restart();
    expect(g.phase).toBe('lobby');
    g.join('Solo');
    g.restart();
    expect(g.phase).toBe('starting');
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

describe('lives and respawns', () => {
  it('falling into the pit costs a life, then you drop back in invulnerable', () => {
    const g = newGame();
    const [a, b] = startMatch(g, ['Alice', 'Bob', 'Cara']);
    park(g, b);
    const pa = P(g, a);
    kill(g, a);
    expect(pa.lives).toBe(RUN.lives - 1);
    expect(pa.life).toBe('respawning');
    expect(pa.deaths).toBe(1);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Alice', killer: null, how: 'fall' });
    run(g, MATCH.respawnDelayMs + 50);
    expect(pa.life).toBe('alive');
    expect(pa.invulnUntil).toBeGreaterThan(g.simTimeMs);
    run(g, 600);
    expect(pa.grounded).toBe(true);
  });

  it('respawns land ahead of the left screen edge, never past a standing gate', () => {
    const g = newCustom(flatWorld({ gates: [{ x: 2000, w: 96 }] }));
    const [a] = startMatch(g, ['Alice', 'Bob']);
    g.w.scrollX = 600;
    kill(g, a);
    run(g, MATCH.respawnDelayMs + 50);
    const pa = P(g, a);
    expect(pa.life).toBe('alive');
    expect(pa.x).toBeGreaterThanOrEqual(g.w.scrollX + RUN.respawnAheadFrac * ARENA.width - PHYS.playerW);
    expect(pa.x + PHYS.playerW).toBeLessThan(2000);
    // right up against the gate there is no spot far enough ahead: take the last one before it
    g.w.scrollX = 2000 - RUN.gateHoldFrac * ARENA.width;
    place(g, a, 1900, 540);
    kill(g, a);
    run(g, MATCH.respawnDelayMs + 50);
    expect(pa.life).toBe('alive');
    expect(pa.x + PHYS.playerW).toBeLessThan(2000);
    expect(pa.x).toBeGreaterThan(g.w.scrollX);
  });

  it('losing your last life puts you out; the round goes on for the others', () => {
    const g = newGame();
    const [, b] = startMatch(g, ['Alice', 'Bob', 'Cara']);
    eliminate(g, b);
    expect(P(g, b).life).toBe('out');
    expect(g.phase).toBe('playing');
    run(g, MATCH.respawnDelayMs + 500);
    expect(P(g, b).life).toBe('out');
  });

  it('when everyone is out the round ends with no winner', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    eliminate(g, a);
    eliminate(g, b);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBeNull();
    expect(g.results?.every((r) => r.timeMs === null)).toBe(true);
  });

  it('after the results screen, everyone returns to the lobby and the next round auto-arms', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    eliminate(g, a);
    eliminate(g, b);
    expect(g.phase).toBe('ended');
    run(g, MATCH.endHoldMs + 100);
    expect(g.phase).toBe('lobby');
    for (const p of g.players.values()) {
      expect(p.life).toBe('alive');
      expect(p.lives).toBe(RUN.lives);
    }
    run(g, MATCH.fallbackWaitMs + 200);
    expect(g.phase).toBe('starting');
  });
});

describe('the finish', () => {
  it('crossing the line records your place and time; the first across wins', () => {
    const { g, ids } = sprint(['Alice', 'Bob', 'Cara']);
    const [a, b, c] = ids;
    run(g, 1000);
    finish(g, b);
    expect(P(g, b).place).toBe(1);
    expect(P(g, b).finishMs).toBeGreaterThan(900);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Bob', how: 'finish' });
    expect(g.phase).toBe('playing'); // the others are still racing
    expect(g.graceMs()).toBeGreaterThan(RUN.finishGraceMs - 200);
    run(g, 500);
    finish(g, a);
    finish(g, c);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(b);
    expect(P(g, b).wins).toBe(1);
    expect(g.results?.map((r) => r.name)).toEqual(['Bob', 'Alice', 'Cara']);
    expect(g.results?.[0].timeMs).toBeLessThan(g.results![1].timeMs!);
    expect(g.results?.every((r) => r.progress === 100)).toBe(true);
  });

  it('every life lost adds a time penalty, which can cost you your place', () => {
    const { g, ids } = sprint(['Alice', 'Bob', 'Cara']);
    const [a, b, c] = ids;
    run(g, 1000);
    P(g, b).deaths = 2;
    finish(g, b);
    const raw = g.w.t - g.w.roundStartT;
    // crossed within the last two ticks
    expect(P(g, b).finishMs).toBeLessThanOrEqual(raw + 2 * RUN.deathPenaltyMs);
    expect(P(g, b).finishMs).toBeGreaterThan(raw + 2 * RUN.deathPenaltyMs - 3 * TICK_MS);
    expect(P(g, b).place).toBe(1); // first across, for now
    run(g, 500);
    finish(g, a); // later, but a clean run
    expect(P(g, a).place).toBe(1);
    expect(P(g, b).place).toBe(2);
    P(g, c).deaths = 1;
    finish(g, c);
    expect(g.phase).toBe('ended');
    expect(g.results?.map((r) => r.name)).toEqual(['Alice', 'Cara', 'Bob']);
    expect(g.winnerId).toBe(a);
    expect(P(g, a).wins).toBe(1);
    expect(P(g, b).wins).toBe(0);
  });

  it('finished runners are done: no more shoves, shots, or lost lives', () => {
    const { g, ids } = sprint();
    const [a, b] = ids;
    finish(g, a);
    const pa = P(g, a);
    place(g, b, pa.x - 20, 540);
    run(g, 100);
    P(g, b).face = 1;
    g.shoot(b);
    run(g, 100);
    expect(pa.lastHit).toBeNull();
    g.shoot(a);
    expect(pa.shotAt).toBeLessThan(0);
    kill(g, a);
    expect(pa.life).toBe('alive');
    expect(pa.lives).toBe(RUN.lives);
    expect(pa.x).toBeGreaterThan(g.w.level.finishX);
  });

  it('stragglers get a grace period after the first finisher, then rank by distance', () => {
    const { g, ids } = sprint(['Alice', 'Bob', 'Cara', 'Dan']);
    const [a, b, c, d] = ids;
    place(g, c, 1000, 540);
    place(g, d, 1100, 540);
    run(g, 200);
    eliminate(g, d); // went farthest, but is out
    place(g, b, 800, 540);
    run(g, 200);
    finish(g, a);
    run(g, RUN.finishGraceMs - 500);
    expect(g.phase).toBe('playing');
    run(g, 600);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(a);
    // finisher, then runners still going by distance, then the eliminated
    expect(g.results?.map((r) => r.name)).toEqual(['Alice', 'Cara', 'Bob', 'Dan']);
    expect(g.results?.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    expect(g.results?.[1].timeMs).toBeNull();
    expect(g.results?.[1].progress).toBeGreaterThan(g.results![2].progress);
  });

  it('the clock running out ends the round with no winner if nobody finished', () => {
    const g = newCustom(flatWorld());
    startMatch(g);
    g.timeLeftMs = 50;
    run(g, 100);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBeNull();
    expect(g.timeLeftMs).toBe(0);
  });

  it('a solo run works: finish alone and win', () => {
    const { g, ids } = sprint(['Solo']);
    const [a] = ids;
    run(g, 3000);
    expect(g.phase).toBe('playing');
    hold(g, a, { right: true });
    run(g, 800);
    expect(P(g, a).x).toBeGreaterThan(800);
    finish(g, a);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(a);
  });
});

describe('joining and leaving', () => {
  it('mid-round joiners wait, then play the next round', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    const late = g.join('Late')!.id;
    expect(P(g, late).life).toBe('waiting');
    eliminate(g, a);
    eliminate(g, b);
    expect(g.results?.some((r) => r.name === 'Late')).toBe(false);
    run(g, MATCH.endHoldMs + 100);
    g.restart();
    expect(P(g, late).life).toBe('alive');
  });

  it('a leaver is announced; the round ends once nobody is left racing', () => {
    const { g, ids } = sprint(['Alice', 'Bob', 'Cara']);
    const [a, b, c] = ids;
    g.leave(b);
    expect(g.phase).toBe('playing');
    expect(g.w.feed[0]).toMatchObject({ victim: 'Bob', how: 'left' });
    finish(g, a);
    g.leave(c);
    expect(g.phase).toBe('ended');
    expect(g.winnerId).toBe(a);
    expect(g.results?.map((r) => r.place)).toEqual([1]);
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

describe('course selection', () => {
  it('pickLevel cycles the next course in the lobby, and the round uses it', () => {
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

  it('the course rotates after each round', () => {
    const g = newGame('sky');
    const [a, b] = startMatch(g);
    eliminate(g, a);
    eliminate(g, b);
    expect(g.nextLevelIndex).toBe(1);
  });
});

describe('item crates', () => {
  it('drop from the sky ahead of the pack, land on the floor, and grant their item on touch', () => {
    const g = newGame();
    const [a, b] = startMatch(g);
    park(g, b);
    const crate = spawnCrate(g.w, 'boomstick')!;
    expect(crate.x).toBeGreaterThan(P(g, a).x + 100);
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
  it('drains fx and reports course state', () => {
    const g = newCustom(flatWorld({ boxes: [{ x: 700, y: 492, w: 48, h: 48, hp: 3 }], gates: [{ x: 1500, w: 96 }] }));
    const [a] = startMatch(g);
    place(g, a, 640, 540);
    run(g, 100);
    g.setInput(a, { left: false, right: false, jump: true });
    run(g, 50);
    const s1 = g.snapshot();
    expect(s1.fx.some((f) => f.k === 'jump')).toBe(true);
    expect(g.snapshot().fx.length).toBe(0);
    expect(s1.players[0]).toMatchObject({ lives: RUN.lives, place: 0, finishMs: -1 });
    expect(s1.phase).toBe('playing');
    expect(s1.round).toBe(1);
    expect(s1.scrollX).toBe(0);
    expect(s1.boxes).toEqual([]); // untouched boxes aren't sent
    expect(s1.gate).toMatchObject({ i: 0 });
    expect(s1.gate!.hp).toBeGreaterThan(0);
    // every snapshot must survive JSON (no Infinity, no NaN)
    expect(JSON.parse(JSON.stringify(s1))).toEqual(s1);
  });

  it('the round counter bumps on every (re)start, even on the same course', () => {
    const g = newCustom(flatWorld());
    g.join('Solo');
    g.restart();
    const r1 = g.snapshot().round;
    run(g, MATCH.countdownMs + 500);
    g.restart();
    expect(g.snapshot().round).toBe(r1 + 1);
    expect(g.snapshot().scrollX).toBe(0);
  });
});
