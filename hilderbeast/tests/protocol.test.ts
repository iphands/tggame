import { describe, expect, it } from 'vitest';
import { defaultWsUrl } from '../client/src/net';
import { isClientMessage } from '../shared/src/protocol';

describe('isClientMessage', () => {
  it('accepts every well-formed message', () => {
    const good = [
      { type: 'join' }, { type: 'join', name: 'Ann', token: 'abc' },
      { type: 'leave' }, { type: 'rename', name: 'Mo' }, { type: 'addBot' }, { type: 'removeBot' },
      { type: 'settings' }, { type: 'settings', mode: 'escape' }, { type: 'settings', mode: 'last' }, { type: 'settings', map: -1 }, { type: 'settings', map: 3 },
      { type: 'start' }, { type: 'watch', on: true }, { type: 'watch', on: false }, { type: 'in', x: 0.5, y: -1, b: 0, a: 1 }, { type: 'again' }, { type: 'abort' },
    ];
    for (const m of good) expect(isClientMessage(m)).toBe(true);
  });
  it('rejects junk', () => {
    const bad = [
      null, 7, 'join', [], {}, { type: 7 }, { type: 'nope' }, { type: 'rename' }, { type: 'rename', name: 5 },
      { type: 'join', name: 7 }, { type: 'join', token: 'x'.repeat(65) },
      { type: 'settings', mode: 'tag' }, { type: 'settings', mode: 3 }, { type: 'settings', map: 1.5 }, { type: 'settings', map: -2 }, { type: 'settings', map: 'barn' },
      { type: 'watch' }, { type: 'watch', on: 1 },
      { type: 'in' }, { type: 'in', x: 1, y: 0 }, { type: 'in', x: '1', y: 0, b: 0, a: 0 }, { type: 'in', x: NaN, y: 0, b: 0, a: 0 },
      { type: 'in', x: 5, y: 0, b: 0, a: 0 }, { type: 'in', x: 0, y: 0, b: true, a: 0 }, { type: 'in', x: 0, y: 0, b: 0, a: 2 },
    ];
    for (const m of bad) expect(isClientMessage(m)).toBe(false);
  });
});

describe('defaultWsUrl', () => {
  const loc = (o: Partial<Location>) => ({ protocol: 'http:', hostname: 'h', host: 'h', port: '', search: '', pathname: '/', ...o }) as Location;
  it('maps the Vite dev port to the game server', () => {
    expect(defaultWsUrl(loc({ port: '5180', host: 'h:5180' }))).toBe('ws://h:8097');
  });
  it('stays under the directory it was served from', () => {
    expect(defaultWsUrl(loc({ host: 'h:8081', port: '8081', pathname: '/play/hilderbeast/' }))).toBe('ws://h:8081/play/hilderbeast/');
  });
  it('honours ?ws=', () => {
    expect(defaultWsUrl(loc({ search: '?ws=ws://x:1' }))).toBe('ws://x:1');
  });
});
