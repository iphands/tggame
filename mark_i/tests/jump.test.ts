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

/**
 * Step from a settled grounded state until the player re-lands after jumping.
 * holdFrames: frames to hold the key before releasing (Infinity = hold until landing).
 * Returns rise height, the max fall speed seen, and the landing frame.
 */
function traceJump(game: Game, id: string, holdFrames: number = Infinity) {
  const p = game.players.get(id)!;
  for (let i = 0; i < 30; i++) game.step(FRAME); // settle on the ground
  const startY = p.y;
  expect(p.grounded).toBe(true);

  game.setInput(id, { left: false, right: false, jump: true });

  let minY = p.y;
  let maxFallSpeed = 0;
  let frames = 0;
  let airborne = false;
  while (frames < 160) {
    game.step(FRAME);
    frames++;
    if (p.y < minY) minY = p.y;
    if (p.vy > maxFallSpeed) maxFallSpeed = p.vy;
    if (!p.grounded) airborne = true;
    if (frames === holdFrames) {
      game.setInput(id, { left: false, right: false, jump: false }); // release the key
    }
    if (airborne && p.grounded) break; // re-landed
  }
  game.setInput(id, { left: false, right: false, jump: false });
  return { rise: startY - minY, maxFallSpeed, frames };
}

describe('variable jump height', () => {
  it('a quick tap produces a small hop', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    const { rise } = traceJump(game, a, 1);
    expect(rise).toBeGreaterThan(30); // still a real hop
    expect(rise).toBeLessThan(85); // but much shorter than a held jump
  });

  it('holding jump produces a high jump', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    const { rise } = traceJump(game, a, 30);
    expect(rise).toBeGreaterThan(120);
  });

  it('holding past peak slows the descent and caps fall speed', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    // hold the key the whole time — never release mid-descent
    const { maxFallSpeed, rise, frames } = traceJump(game, a, 999);
    // rise still tall...
    expect(rise).toBeGreaterThan(120);
    // ...but the fall never exceeds the soft-land cap while held
    expect(maxFallSpeed).toBeLessThanOrEqual(WORLD.descendMaxFallSpeed + 1);
    expect(frames).toBeGreaterThan(30); // hold buys airtime
  });

  it('releasing mid-fall restores a normal fast fall', () => {
    const game = new Game();
    const [a] = joinTwo(game);
    // hold through the rise (~20 frames), then drop the key
    const { maxFallSpeed } = traceJump(game, a, 20);
    expect(maxFallSpeed).toBeGreaterThan(WORLD.descendMaxFallSpeed + 1);
  });
});
