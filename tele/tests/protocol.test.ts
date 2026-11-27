import { describe, expect, it } from 'vitest';
import { isClientMessage } from '../shared/src/protocol';
import { defaultWsUrl } from '../client/src/net';

describe('isClientMessage', () => {
  it('accepts every well-formed message', () => {
    const ok: unknown[] = [
      { type: 'join' }, { type: 'join', name: 'TV', watch: true }, { type: 'watch', on: true }, { type: 'watch', on: false }, { type: 'join', name: 'Mo', token: 'abc' }, { type: 'leave' }, { type: 'rename', name: 'Mo' },
      { type: 'addBot' }, { type: 'removeBot' }, { type: 'start' },
      { type: 'pick', index: 2 }, { type: 'write', text: 'my cat Bob' }, { type: 'draw', strokes: [] }, { type: 'guess', text: 'cat' },
      { type: 'skip', playerId: 'p3' }, { type: 'next' }, { type: 'heart', book: 0, page: 4 },
      { type: 'again' }, { type: 'abort' },
    ];
    for (const m of ok) expect(isClientMessage(m)).toBe(true);
  });

  it('rejects junk', () => {
    const bad: unknown[] = [
      null, 3, 'join', [], {}, { type: 7 }, { type: 'hack' },
      { type: 'join', name: 5 }, { type: 'join', watch: 1 }, { type: 'watch' }, { type: 'watch', on: 1 }, { type: 'join', token: 'x'.repeat(65) },
      { type: 'pick' }, { type: 'pick', index: -1 }, { type: 'pick', index: 1.5 }, { type: 'pick', index: '1' },
      { type: 'draw' }, { type: 'draw', strokes: 'x' },
      { type: 'guess' }, { type: 'write' }, { type: 'write', text: 7 }, { type: 'write', text: 'x'.repeat(401) }, { type: 'guess', text: 'x'.repeat(401) },
      { type: 'skip' }, { type: 'skip', playerId: 3 },
      { type: 'heart', book: 0 }, { type: 'heart', book: -1, page: 0 },
    ];
    for (const m of bad) expect(isClientMessage(m)).toBe(false);
  });
});

describe('defaultWsUrl', () => {
  const loc = (o: Partial<Location>) => ({ protocol: 'http:', hostname: 'h', host: 'h', port: '', search: '', pathname: '/', ...o }) as Location;
  it('maps the Vite dev port to the game server', () => {
    expect(defaultWsUrl(loc({ port: '5175', host: 'h:5175' }))).toBe('ws://h:8092');
  });
  it('uses the same origin otherwise, wss under https', () => {
    expect(defaultWsUrl(loc({ port: '8092', host: 'h:8092' }))).toBe('ws://h:8092');
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
