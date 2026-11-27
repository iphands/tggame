import { describe, expect, it } from 'vitest';
import { defaultWsUrl } from '../client/src/net';
import { isClientMessage } from '../shared/src/protocol';

describe('isClientMessage', () => {
  it('accepts every well-formed message', () => {
    const good = [
      { type: 'join' }, { type: 'join', name: 'Ann', token: 'abc' },
      { type: 'leave' }, { type: 'addBot' }, { type: 'removeBot' },
      { type: 'settings' }, { type: 'settings', difficulty: 'chill' },
      { type: 'start' }, { type: 'aim', x: 1.5, y: -3 }, { type: 'again' }, { type: 'abort' },
    ];
    for (const m of good) expect(isClientMessage(m)).toBe(true);
  });
  it('rejects junk', () => {
    const bad = [
      null, 7, 'join', [], {}, { type: 7 }, { type: 'nope' },
      { type: 'join', name: 7 }, { type: 'join', token: 'x'.repeat(65) },
      { type: 'settings', difficulty: 'brutal' }, { type: 'settings', difficulty: 3 },
      { type: 'aim' }, { type: 'aim', x: 1 }, { type: 'aim', x: '1', y: 2 }, { type: 'aim', x: NaN, y: 2 }, { type: 'aim', x: 1, y: Infinity },
    ];
    for (const m of bad) expect(isClientMessage(m)).toBe(false);
  });
});

describe('defaultWsUrl', () => {
  const loc = (o: Partial<Location>) => ({ protocol: 'http:', hostname: 'h', host: 'h', port: '', search: '', pathname: '/', ...o }) as Location;
  it('maps the Vite dev port to the game server', () => {
    expect(defaultWsUrl(loc({ port: '5178', host: 'h:5178' }))).toBe('ws://h:8095');
  });
  it('stays under the directory it was served from', () => {
    expect(defaultWsUrl(loc({ host: 'h:8081', port: '8081', pathname: '/play/slurp/' }))).toBe('ws://h:8081/play/slurp/');
  });
  it('honours ?ws=', () => {
    expect(defaultWsUrl(loc({ search: '?ws=ws://x:1' }))).toBe('ws://x:1');
  });
});
