import { describe, expect, it } from 'vitest';
import { isClientMessage } from '../shared/src/protocol';
import { defaultWsUrl } from '../client/src/net';

describe('isClientMessage', () => {
  it('accepts every well-formed message', () => {
    const ok: unknown[] = [
      { type: 'join' }, { type: 'join', name: 'TV', watch: true }, { type: 'watch', on: true }, { type: 'watch', on: false }, { type: 'join', name: 'Mo', token: 'abc' }, { type: 'leave' }, { type: 'rename', name: 'Mo' },
      { type: 'addBot' }, { type: 'removeBot' }, { type: 'start' },
      { type: 'settings' }, { type: 'settings', rounds: 5 }, { type: 'settings', hints: false },
      { type: 'ink', i: 0, c: 1, w: 5, p: [1, 2] }, { type: 'ink', i: 1, c: 1, w: 5, p: [1, 2], f: 1 }, { type: 'undo' }, { type: 'clear' }, { type: 'pass' },
      { type: 'chat', text: 'cat' }, { type: 'chat', text: 'psst', to: 'p3' },
      { type: 'boot', playerId: 'p3' }, { type: 'again' }, { type: 'abort' },
    ];
    for (const m of ok) expect(isClientMessage(m)).toBe(true);
  });

  it('rejects junk', () => {
    const bad: unknown[] = [
      null, 3, 'join', [], {}, { type: 7 }, { type: 'hack' },
      { type: 'join', name: 5 }, { type: 'join', watch: 1 }, { type: 'watch' }, { type: 'watch', on: 1 }, { type: 'join', token: 'x'.repeat(65) },
      { type: 'settings', rounds: '5' }, { type: 'settings', hints: 1 },
      { type: 'ink' }, { type: 'ink', i: -1, c: 0, w: 5, p: [] }, { type: 'ink', i: 0.5, c: 0, w: 5, p: [] },
      { type: 'ink', i: 0, c: 0, w: 5, p: 'x' }, { type: 'ink', i: 0, c: '0', w: 5, p: [] }, { type: 'ink', i: 0, c: 0, w: 5, p: [1, 2], f: 2 },
      { type: 'chat' }, { type: 'chat', text: 7 }, { type: 'chat', text: 'x'.repeat(401) },
      { type: 'chat', text: 'hi', to: 3 }, { type: 'chat', text: 'hi', to: '' },
      { type: 'boot' }, { type: 'boot', playerId: 3 }, { type: 'boot', playerId: 'x'.repeat(17) },
    ];
    for (const m of bad) expect(isClientMessage(m)).toBe(false);
  });
});

describe('defaultWsUrl', () => {
  const loc = (o: Partial<Location>) => ({ protocol: 'http:', hostname: 'h', host: 'h', port: '', search: '', pathname: '/', ...o }) as Location;
  it('maps the Vite dev port to the game server', () => {
    expect(defaultWsUrl(loc({ port: '5176', host: 'h:5176' }))).toBe('ws://h:8093');
  });
  it('uses the same origin otherwise, wss under https', () => {
    expect(defaultWsUrl(loc({ port: '8093', host: 'h:8093' }))).toBe('ws://h:8093');
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
