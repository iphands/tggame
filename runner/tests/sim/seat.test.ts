import { describe, expect, it } from 'vitest';
import { newGame, startMatch, run } from './helpers.js';

describe('a seat held for a dropped connection', () => {
  it('mid-round the player is kept, standing idle, and gets the same one back with the token', () => {
    const g = newGame();
    const a = g.join('A')!;
    const b = g.join('B')!;
    g.restart();
    run(g, 3500);
    expect(g.phase).toBe('playing');
    g.setInput(a.id, { left: false, right: true, jump: false });
    run(g, 100);
    g.disconnect(a.id);
    expect(g.players.get(a.id)!.input.right).toBe(false);
    run(g, 5000);
    expect(g.players.has(a.id)).toBe(true);
    const back = g.join('whoever', a.token);
    expect(back).toMatchObject({ id: a.id, name: 'A', token: a.token, resumed: true });
    run(g, 30_000);
    expect(g.players.has(a.id)).toBe(true); // back in time: the seat is theirs again
    expect(b.resumed).toBe(false);
  });

  it('is given up when they do not come back', () => {
    const g = newGame();
    const [a] = startMatch(g, ['A', 'B']);
    g.disconnect(a);
    run(g, 19_000);
    expect(g.players.has(a)).toBe(true);
    run(g, 2000);
    expect(g.players.has(a)).toBe(false);
  });

  it('is not held in the lobby, and a stranger\'s token gets a new seat', () => {
    const g = newGame();
    const a = g.join('A')!;
    g.join('B');
    g.disconnect(a.id);
    expect(g.players.has(a.id)).toBe(false);
    const c = g.join('C', a.token)!;
    expect(c.resumed).toBe(false);
    expect(c.id).not.toBe(a.id);
  });
});
