import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game.js';
import { WORLD } from '../shared/src/constants.js';

const FRAME = 1000 / 60;

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

/** Place both players on the main island, then re-ground them via one physics step. */
function placeOnMainIsland(game: Game, aId: string, bId: string, aX: number, bX: number) {
  const a = game.players.get(aId)!;
  const b = game.players.get(bId)!;
  a.x = aX; a.y = 378; a.facing = 1;
  b.x = bX; b.y = 378; b.facing = -1;
  a.vy = 0; b.vy = 0;
  a.grounded = true; b.grounded = true;
  a.platIdx = -1; b.platIdx = -1;
  game.step(FRAME); // re-ground
  return { a, b };
}

describe('pistol', () => {
  it('a hit deals half the max HP and two hits kill with a gun', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const { a, b } = placeOnMainIsland(game, aId, bId, 500, 660);

    game.shoot(aId);
    for (let i = 0; i < 12; i++) game.step(FRAME);
    expect(b.hp).toBe(WORLD.maxHp - WORLD.pistolDamage); // 50
    expect(b.alive).toBe(true);

    // second shot past the cooldown kills
    for (let i = 0; i < 30; i++) game.step(FRAME);
    game.shoot(aId);
    for (let i = 0; i < 12; i++) game.step(FRAME);
    expect(b.hp).toBe(0);
    expect(b.alive).toBe(false);
    expect(game.events.find((e) => e.id === bId)?.cause).toBe('gun');
  });

  it('enforces the cooldown — a double-fire lands only one bullet', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const { a } = placeOnMainIsland(game, aId, bId, 500, 660);

    game.shoot(aId);
    game.shoot(aId); // immediately — must be swallowed by the cooldown
    expect(game.snapshot(0).bullets.length).toBe(1); // exactly one bullet in flight
    const b = game.players.get(bId)!;
    for (let i = 0; i < 30; i++) game.step(FRAME);
    // exactly one hit landed — the cooldown swallowed the second bullet
    expect(b.hp).toBe(WORLD.maxHp - WORLD.pistolDamage);
    expect(b.alive).toBe(true);
  });

  it('shoots in the facing direction only — a shot away from a target hits nothing', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const { a, b } = placeOnMainIsland(game, aId, bId, 500, 660);
    a.facing = -1; // fire away from Bob (Bob is to the right)

    game.shoot(aId);
    for (let i = 0; i < 20; i++) game.step(FRAME);
    expect(b.hp).toBe(WORLD.maxHp); // untouched
  });

  it('bullets expire / leave the world and are cleaned up', () => {
    const game = new Game();
    const [aId] = joinTwo(game);
    const a = game.players.get(aId)!;
    a.x = 770; a.y = 378; a.facing = 1; // on the right edge of the main island, facing out
    a.vy = 0; a.grounded = true; a.platIdx = -1;
    game.step(FRAME);

    game.shoot(aId);
    expect(game.snapshot(0).bullets.length).toBe(1);
    for (let i = 0; i < 120; i++) game.step(FRAME); // 2s — more than the lifetime
    expect(game.snapshot(0).bullets.length).toBe(0);
  });

  it('waiting spectators cannot shoot', () => {
    const game = new Game();
    joinTwo(game); // playing
    const late = game.join('Latecomer');
    game.shoot(late.id); // must be swallowed (waiting)
    expect(game.snapshot(0).bullets.length).toBe(0);
  });
});
