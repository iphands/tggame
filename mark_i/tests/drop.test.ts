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

/** Place a player standing exactly on the target platform and re-ground via one step. */
function settleOn(game: Game, id: string, x: number, targetTop: number) {
  const p = game.players.get(id)!;
  p.x = x;
  p.y = targetTop - WORLD.playerH;
  p.vy = 0;
  p.grounded = true;
  p.platIdx = -1;
  game.step(FRAME); // physics re-grounds the player on the platform
  expect(p.grounded).toBe(true);
  return p;
}

describe('drop-through (▼)', () => {
  it('drops through a platform onto the one below', () => {
    const game = new Game();
    const [aId] = joinTwo(game);
    const p = settleOn(game, aId, 600, 420); // main island top

    game.drop(aId);
    expect(p.grounded).toBe(false); // airborne right after the drop

    // falls through the main island and lands on the low-center platform below
    for (let i = 0; i < 200 && !(p.grounded && p.y > 450); i++) game.step(FRAME);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(560 - WORLD.playerH, 0);
  });

  it('is refused on the lowest level (nothing below)', () => {
    const game = new Game();
    const [aId] = joinTwo(game);
    const p = settleOn(game, aId, 600, 560); // low-center — the lowest platform

    game.drop(aId);
    for (let i = 0; i < 30; i++) game.step(FRAME);
    // player must NOT have fallen through — still grounded on the lowest platform
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(560 - WORLD.playerH, 0);
  });

  it('is refused when dropping would fall into the pit', () => {
    const game = new Game();
    const [aId] = joinTwo(game);
    const p = settleOn(game, aId, 175, 380); // left island — no platform below it

    game.drop(aId);
    for (let i = 0; i < 30; i++) game.step(FRAME);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(380 - WORLD.playerH, 0);
  });

  it('is refused while airborne', () => {
    const game = new Game();
    const [aId] = joinTwo(game);
    const p = game.players.get(aId)!;
    p.x = 600; p.y = 60; p.vy = 0; p.grounded = false; p.platIdx = -1;

    game.drop(aId); // must be a no-op — player is not grounded
    for (let i = 0; i < 5; i++) game.step(FRAME);
    expect(p.grounded).toBe(false); // still falling
  });
});
