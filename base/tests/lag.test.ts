import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LagLine, lagSettings } from '../src/client/lag.js';

describe('lagSettings', () => {
  it('reads the address, and is null when nothing is asked for', () => {
    expect(lagSettings('?lag=125&jitter=20&stall=300')).toEqual({ lag: 125, jitter: 20, stall: 300 });
    expect(lagSettings('?lag=125')).toEqual({ lag: 125, jitter: 0, stall: 0 });
    expect(lagSettings('?fps=1')).toBeNull();
    expect(lagSettings('?lag=abc&jitter=-4')).toBeNull();
  });
});

describe('LagLine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const line = (lag: number, jitter: number, randoms: number[] = []) => {
    const out: string[] = [];
    let i = 0;
    const l = new LagLine<string>({
      lag,
      jitter,
      deliver: (s) => out.push(s),
      now: () => Date.now(),
      random: () => randoms[i++ % Math.max(1, randoms.length)] ?? 0,
    });
    return { l, out };
  };

  it('holds each message for the lag', () => {
    const { l, out } = line(125, 0);
    l.push('a');
    vi.advanceTimersByTime(124);
    expect(out).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(out).toEqual(['a']);
  });

  it('keeps order even when jitter would swap two messages', () => {
    const { l, out } = line(100, 50, [1, 0]);
    l.push('slow'); // due at 150
    vi.advanceTimersByTime(10);
    l.push('fast'); // would be due at 110: must wait for the one ahead
    vi.advanceTimersByTime(139);
    expect(out).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(out).toEqual(['slow', 'fast']);
  });

  it('a stall holds everything, then lets it go in one burst', () => {
    const { l, out } = line(50, 0);
    l.push('a');
    l.stall(300);
    vi.advanceTimersByTime(100);
    l.push('b');
    vi.advanceTimersByTime(199);
    expect(out).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(out).toEqual(['a', 'b']);
  });

  it('clear drops what is on the line', () => {
    const { l, out } = line(50, 0);
    l.push('a');
    l.clear();
    vi.advanceTimersByTime(500);
    expect(out).toEqual([]);
  });
});
