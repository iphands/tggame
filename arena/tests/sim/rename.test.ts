import { describe, expect, it } from 'vitest';
import { Game } from '../../server/src/sim/game';

describe('changing your name', () => {
  it('takes the cleaned name and shows it in the next snapshot', () => {
    const g = new Game();
    const a = g.join('A')!.id;
    expect(g.rename(a, ' <Zed> ')).toBe('Zed');
    expect(g.snapshot().players.find((p) => p.id === a)!.name).toBe('Zed');
  });

  it('keeps names unique and reports no change as null', () => {
    const g = new Game();
    const a = g.join('A')!.id;
    g.join('B');
    expect(g.rename(a, 'B')).toBe('B 2');
    expect(g.rename(a, 'B 2')).toBeNull();
    expect(g.rename(a, '***')).toBeNull();
    expect(g.rename('nobody', 'X')).toBeNull();
  });

  it('does not rename bots', () => {
    const g = new Game();
    g.join('A');
    const bot = g.addBot()!;
    expect(g.rename(bot.id, 'X')).toBeNull();
  });
});
