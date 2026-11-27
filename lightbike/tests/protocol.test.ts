import { describe, expect, it } from 'vitest';
import { isClientMessage } from '../shared/src/protocol';
import { defaultWsUrl } from '../client/src/net';

describe('isClientMessage', () => {
  it('accepts every message a client may send', () => {
    for (const m of [
      { type: 'join' },
{ type: 'join', name: 'TV', watch: true }, { type: 'watch', on: true }, { type: 'watch', on: false },       { type: 'join', name: 'Ada', token: 'abc' },
      { type: 'leave' }, { type: 'rename', name: 'Mo' },
      { type: 'addBot' },
      { type: 'removeBot' },
      { type: 'settings' },
      { type: 'settings', pace: 'silly', length: 'short', boost: false, bust: true, slip: false, erase: true },
      { type: 'start' },
      { type: 'turn', d: 0 },
      { type: 'turn', d: 3, at: 12 },
      { type: 'boost', on: true },
      { type: 'bust' },
      { type: 'again' },
      { type: 'abort' },
    ]) {
      expect(isClientMessage(m), JSON.stringify(m)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const m of [
      null,
      3,
      'turn',
      {},
      { type: 7 },
      { type: 'fly' },
      { type: 'join', name: 5 },
{ type: 'join', watch: 1 }, { type: 'watch' }, { type: 'watch', on: 1 },       { type: 'join', token: 'x'.repeat(65) },
      { type: 'settings', pace: 'ludicrous' },
      { type: 'settings', length: 9 },
      { type: 'settings', boost: 'yes' },
      { type: 'turn' },
      { type: 'turn', d: 4 },
      { type: 'turn', d: -1 },
      { type: 'turn', d: 1.5 },
      { type: 'turn', d: 1, at: -1 },
      { type: 'turn', d: 1, at: 2.5 },
      { type: 'turn', d: 1, at: 'soon' },
      { type: 'turn', d: '1' },
      { type: 'boost' },
      { type: 'boost', on: 1 },
    ]) {
      expect(isClientMessage(m), JSON.stringify(m)).toBe(false);
    }
  });
});

describe('where the client looks for the server', () => {
  const loc = (href: string) => {
    const u = new URL(href);
    return { protocol: u.protocol, hostname: u.hostname, host: u.host, port: u.port, search: u.search, pathname: u.pathname };
  };

  it('the dev page talks to the game port', () => {
    expect(defaultWsUrl(loc('http://192.168.1.5:5179/'))).toBe('ws://192.168.1.5:8096');
  });
  it('a served page talks to where it came from, also under a path', () => {
    expect(defaultWsUrl(loc('http://box:8096/'))).toBe('ws://box:8096');
    expect(defaultWsUrl(loc('https://games.example/play/lightbike/'))).toBe('wss://games.example/play/lightbike/');
  });
  it('?ws= overrides', () => {
    expect(defaultWsUrl(loc('http://localhost:5199/?ws=ws://localhost:8196'))).toBe('ws://localhost:8196');
  });
});
