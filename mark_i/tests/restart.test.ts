import { describe, it, expect } from 'vitest';
import { Game } from '../server/src/game.js';
import { WORLD } from '../shared/src/constants.js';
import { isClientMessage } from '../shared/src/protocol.js';

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

describe('force restart', () => {
  it('resets the round and starts a new one immediately', () => {
    const game = new Game();
    joinTwo(game);
    game.events.push({ id: 'x', name: 'X', cause: 'pit', atMs: 0 });
    // advance a bit so spawn positions differ
    for (let i = 0; i < 60; i++) game.step(FRAME);

    game.restart();

    expect(game.phase).toBe('starting');
    expect(game.countdownMs).toBe(WORLD.countdownMs);
    expect(game.events).toEqual([]);
    expect(game.winnerId).toBeNull();
    for (const p of game.players.values()) {
      expect(p.waiting).toBe(false);
      expect(p.hp).toBe(WORLD.maxHp);
    }
    // the fresh countdown leads straight back to a playing round
    let elapsed = 0;
    while (game.phase !== 'playing' && elapsed < 10_000) {
      game.step(100);
      elapsed += 100;
    }
    expect(game.phase).toBe('playing');
  });

  it('works from the ended phase (the win-hang case)', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const pb = game.players.get(bId)!;
    pb.y = WORLD.killY + 40;
    game.step(FRAME);
    expect(game.phase).toBe('ended');

    game.restart();

    expect(game.phase).toBe('starting');
    expect(game.countdownMs).toBe(WORLD.countdownMs);
    // after the countdown, a fresh match is live with everyone back on the field
    let elapsed = 0;
    while (game.phase !== 'playing' && elapsed < 10_000) {
      game.step(100);
      elapsed += 100;
    }
    expect(game.phase).toBe('playing');
    expect(game.players.get(aId)?.alive).toBe(true);
    expect(game.players.get(bId)?.alive).toBe(true);
  });

  it('does not auto-start with fewer than 2 active players', () => {
    const game = new Game();
    game.join('Solo');
    game.restart();
    expect(game.phase).toBe('lobby');
  });

  it('is accepted by the wire protocol', () => {
    expect(isClientMessage({ type: 'restart' })).toBe(true);
    expect(isClientMessage({ type: 'restart', unknown: 1 })).toBe(true);
  });
});

describe('auto-restart after a win (fallback re-arms)', () => {
  it('a new match starts on its own after the end hold + fallback grace', () => {
    const game = new Game();
    const [aId, bId] = joinTwo(game);
    const pb = game.players.get(bId)!;
    pb.y = WORLD.killY + 40;
    game.step(FRAME);
    expect(game.phase).toBe('ended');

    // end hold (8s) then fallback grace (10s) — do NOT restart manually
    for (let i = 0; i < 200; i++) game.step(100);
    expect(game.phase).toBe('starting');
  });
});
