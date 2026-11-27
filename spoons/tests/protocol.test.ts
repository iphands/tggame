import { describe, expect, it } from 'vitest';
import { defaultWsUrl } from '../client/src/net';
import { isClientMessage } from '../shared/src/protocol';

describe('isClientMessage', () => {
  it('accepts every well-formed message', () => {
    const good = [
      { type: 'join' }, { type: 'join', name: 'Ann', token: 'abc' },
      { type: 'leave' }, { type: 'addBot' }, { type: 'removeBot' },
      { type: 'settings' }, { type: 'settings', rounds: 8 },
      { type: 'start' }, { type: 'pass', card: 'QH' }, { type: 'grab' }, { type: 'heckle' },
      { type: 'skip' }, { type: 'again' }, { type: 'abort' },
    ];
    for (const m of good) expect(isClientMessage(m)).toBe(true);
  });
  it('rejects junk', () => {
    const bad = [
      null, 7, 'join', [], {}, { type: 7 }, { type: 'nope' },
      { type: 'join', name: 7 }, { type: 'join', token: 'x'.repeat(65) },
      { type: 'settings', rounds: '8' },
      { type: 'pass' }, { type: 'pass', card: 7 }, { type: 'pass', card: 'ZZ' }, { type: 'pass', card: 'QHX' },
    ];
    for (const m of bad) expect(isClientMessage(m)).toBe(false);
  });
});

describe('defaultWsUrl', () => {
  const loc = (o: Partial<Location>) => ({ protocol: 'http:', hostname: 'h', host: 'h', port: '', search: '', pathname: '/', ...o }) as Location;
  it('maps the Vite dev port to the game server', () => {
    expect(defaultWsUrl(loc({ port: '5177', host: 'h:5177' }))).toBe('ws://h:8094');
  });
  it('uses the same origin otherwise, wss under https', () => {
    expect(defaultWsUrl(loc({ port: '8094', host: 'h:8094' }))).toBe('ws://h:8094');
    expect(defaultWsUrl(loc({ protocol: 'https:', host: 'play.example' }))).toBe('wss://play.example');
  });
  it('keeps the directory when a proxy mounts the game under a path', () => {
    expect(defaultWsUrl(loc({ host: 'h:8081', port: '8081', pathname: '/play/x/' }))).toBe('ws://h:8081/play/x/');
    expect(defaultWsUrl(loc({ host: 'h:8081', port: '8081', pathname: '/play/x/index.html' }))).toBe('ws://h:8081/play/x/');
  });
  it('honours ?ws=', () => {
    expect(defaultWsUrl(loc({ search: '?ws=ws://x:1' }))).toBe('ws://x:1');
  });
});
