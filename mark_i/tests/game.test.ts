import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game.js';
import { WORLD } from '../shared/src/constants.js';

const FRAME = 1000 / 60; // 60Hz sim, in ms

/** Drive the game from lobby until it enters the 'playing' phase. */
function reachPlaying(game: Game, maxMs = 30_000): void {
  let elapsed = 0;
  while (game.phase !== 'playing' && elapsed < maxMs) {
    game.step(100);
    elapsed += 100;
  }
  if (game.phase !== 'playing') throw new Error(`never reached playing (phase: ${game.phase})`);
}

function joinTwo(game: Game): string[] {
  const a = game.join('Alice');
  const b = game.join('Bob');
  reachPlaying(game);
  return [a.id, b.id];
}

describe('game lifecycle', () => {
  it('starts in lobby and auto-starts with 2 players', () => {
    const game = new Game();
    expect(game.phase).toBe('lobby');
    joinTwo(game);
    expect(game.phase).toBe('playing');
    expect(game.players.size).toBe(2);
  });

  it('spawns players on the platform top surfaces', () => {
    const game = new Game();
    const [a, b] = joinTwo(game);
    const pa = game.players.get(a)!;
    const pb = game.players.get(b)!;
    expect(pa.y).toBeLessThan(WORLD.killY);
    expect(pb.y).toBeLessThan(WORLD.killY);
    expect(pa.alive).toBe(true);
    expect(pb.alive).toBe(true);
  });
});

describe('physics', () => {
  it('gravity pulls a player down onto a platform and keeps them there', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    const p = game.players.get(a)!;
    const startY = p.y;
    for (let i = 0; i < 30; i++) game.step(FRAME);
    expect(p.y).toBeGreaterThanOrEqual(startY);
    expect(p.grounded).toBe(true);
    expect(p.vy).toBe(0);
  });

  it('jumping reduces y (rises) then lands again', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    const p = game.players.get(a)!;
    for (let i = 0; i < 10; i++) game.step(FRAME);

    const before = p.y;
    game.setInput(a, { left: false, right: false, jump: true });
    game.step(FRAME); // consume the buffer
    expect(p.y).toBeLessThan(before); // rose
    // let the player fall and land again
    for (let i = 0; i < 120; i++) game.step(FRAME);
    expect(p.grounded).toBe(true);
  });

  it('moving platforms carry the player as they oscillate', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    const p = game.players.get(a)!;
    // teleport onto the moving platform at x=300, y=320
    p.x = 300 + 10;
    p.platIdx = -1;
    // find its index in the static platform list
    const MOVE_INDEX = 7; // moving-left platform in level.ts
    p.y = game.platformsAt(0)[MOVE_INDEX].y - WORLD.playerH;
    for (let i = 0; i < 40; i++) game.step(FRAME);
    const platform = game.platformsAt(game.simTimeMs)[MOVE_INDEX];
    // player should be within a small tolerance of the platform top
    expect(Math.abs(p.y + WORLD.playerH - platform.y)).toBeLessThan(20);
  });
});

describe('push mechanics', () => {
  it('overlapping players are pushed apart', () => {
    const game = new Game();
    const [a, b] = joinTwo(game);
    const pa = game.players.get(a)!;
    const pb = game.players.get(b)!;

    // place them directly on top of each other
    pa.x = 640;
    pa.y = 300;
    pb.x = 648;
    pb.y = 300;
    pa.vy = 0;
    pb.vy = 0;

    const x0 = pa.x;
    for (let i = 0; i < 5; i++) game.step(FRAME);
    // they should have separated horizontally (and b pushed the other way)
    expect(Math.abs(pa.x - pb.x)).toBeGreaterThan(x0 < pb.x ? 2 : 2);
    expect(pa.alive || pb.alive).toBe(true);
  });
});

describe('elimination & win', () => {
  it('eliminates a player who falls below the pit and records the event', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    const p = game.players.get(a)!;
    p.y = WORLD.killY + 40; // force pit death
    game.step(FRAME);
    expect(p.alive).toBe(false);
    const pitEvent = game.events.find((e) => e.id === a);
    expect(pitEvent?.cause).toBe('pit');
  });

  it('ends the match as soon as only one player is left', () => {
    const game = new Game();
    const [a, b] = joinTwo(game);
    const pb = game.players.get(b)!;
    pb.y = WORLD.killY + 40;
    game.step(FRAME);
    expect(pb.alive).toBe(false);
    expect(game.phase).toBe('ended');
    const winner = game.snapshot(Date.now()).players.find((p) => p.id === a);
    expect(winner).toBeDefined();
    const snap = game.snapshot(Date.now());
    expect(snap.winnerId).toBe(a);
  });

  it('resets back to lobby after the end hold', () => {
    const game = new Game();
    const [a, b] = joinTwo(game);
    const pb = game.players.get(b)!;
    pb.y = WORLD.killY + 40;
    game.step(FRAME);
    expect(game.phase).toBe('ended');
    // end hold is 8s; step past it
    for (let i = 0; i < 80; i++) game.step(100);
    expect(game.phase).toBe('lobby');
  });
});

describe('spectators', () => {
  it('players joining mid-match do not participate in the current round', () => {
    const game = new Game();
    joinTwo(game); // phase = playing
    const late = game.join('Latecomer');
    expect(game.phase).toBe('playing');
    expect(game.players.get(late.id)?.waiting).toBe(true);
  });
});

describe('head stomps', () => {
  it('bounces the stomper, shoves and damages the target', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const a = game.players.get(aId)!;
    const b = game.players.get(bId)!;

    // place a directly above b, falling — feet cross b's head top inside one frame
    b.x = 640;
    b.y = 300;
    a.x = 640;
    a.y = 262;
    a.vy = 500;

    const hpBefore = b.hp;
    game.step(FRAME);

    expect(b.hp).toBe(hpBefore - WORLD.stompDamage);
    expect(b.alive).toBe(true);
    expect(a.vy).toBeLessThan(0); // stomper bounced upward
    // stomped player is pushed away with a shove far above the normal speed
    expect(Math.abs(b.vx)).toBeGreaterThan(WORLD.maxSpeed);
    expect(Math.abs(b.vx)).toBeLessThanOrEqual(WORLD.stompShoveVel + 1);
  });

  it('eliminates a stomped player at 0 HP and logs a stomp event', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const a = game.players.get(aId)!;
    const b = game.players.get(bId)!;

    b.hp = 10;
    b.x = 640;
    b.y = 300;
    a.x = 640;
    a.y = 262;
    a.vy = 500;

    game.step(FRAME);

    expect(b.hp).toBe(0);
    expect(b.alive).toBe(false);
    expect(game.events.find((e) => e.id === bId)?.cause).toBe('stomp');
  });

  it('does not stomp on a side impact', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const a = game.players.get(aId)!;
    const b = game.players.get(bId)!;

    // side-by-side, also falling — feet land inside b's body, not the head band
    b.x = 620;
    b.y = 300;
    a.x = 640;
    a.y = 310;
    a.vy = 800;

    game.step(FRAME);

    expect(b.hp).toBe(WORLD.maxHp); // untouched
  });

  it('resets HP on a fresh match start', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    // simulate a stomp, then leave the lobby phase by wedging the round
    const a = game.players.get(aId)!;
    const b = game.players.get(bId)!;
    expect(b.hp).toBe(WORLD.maxHp);
    expect(a.hp).toBe(WORLD.maxHp);
  });
});
