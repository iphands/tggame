import { describe, it, expect } from 'vitest';
import { isClientMessage } from '../shared/src/protocol.js';
import { defaultWsUrl } from '../client/src/net.js';

describe('client message validation', () => {
  it('accepts every well-formed message', () => {
    for (const m of [
      { type: 'join', name: 'A' },
      { type: 'join' },
      { type: 'input', left: true, right: false, jump: false },
      { type: 'shoot' },
      { type: 'drop' },
      { type: 'restart' },
      { type: 'leave' },
      { type: 'addBot' },
      { type: 'removeBot' },
      { type: 'pickLevel', dir: 1 },
      { type: 'pickLevel', dir: -1 },
    ]) {
      expect(isClientMessage(m), JSON.stringify(m)).toBe(true);
    }
  });

  it('rejects malformed messages', () => {
    for (const m of [
      null,
      42,
      'join',
      {},
      { type: 'nope' },
      { type: 'join', name: 5 },
      { type: 'input', left: 1, right: false, jump: false },
      { type: 'pickLevel', dir: 2 },
      { type: 'toString' },
      { type: 'punch' }, // removed mechanic
    ]) {
      expect(isClientMessage(m), JSON.stringify(m)).toBe(false);
    }
  });
});

describe('websocket url', () => {
  const loc = (protocol: string, host: string, port: string, search = '') => ({
    protocol,
    hostname: host.split(':')[0],
    host,
    port,
    search,
  });

  it('dev server on 5173 talks to the game server on 8080', () => {
    expect(defaultWsUrl(loc('http:', '192.168.1.5:5173', '5173'))).toBe('ws://192.168.1.5:8080');
  });

  it('otherwise uses the same origin (any port, behind proxies, https → wss)', () => {
    expect(defaultWsUrl(loc('http:', 'game.lan:9000', '9000'))).toBe('ws://game.lan:9000');
    expect(defaultWsUrl(loc('https:', 'arena.example.com', ''))).toBe('wss://arena.example.com');
  });

  it('?ws= overrides', () => {
    expect(defaultWsUrl(loc('http:', 'x:1', '1', '?ws=ws://other:7'))).toBe('ws://other:7');
  });
});
