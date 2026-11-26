import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { DOWN, discover, parseManifest, probe, readHealth } from '../server/src/games.js';

describe('parseManifest', () => {
  it('reads a full manifest', () => {
    const g = parseManifest('tele', { title: 'Doodle Telephone', tagline: 'hi', port: 8092, accent: '#ffd23f', order: 3, phases: { lobby: 'Lobby open' } }, 'cover.svg');
    expect(g).toMatchObject({ id: 'tele', title: 'Doodle Telephone', port: 8092, accent: '#ffd23f', order: 3, cover: 'cover.svg' });
    expect(g?.phases).toEqual({ lobby: 'Lobby open' });
  });

  it('fills in what is optional', () => {
    expect(parseManifest('x', { title: 'X', port: 9000 })).toMatchObject({ tagline: '', players: '', accent: '#ffd23f', order: 1000, phases: {}, cover: '' });
  });

  it('refuses a manifest without a title or a real port', () => {
    expect(parseManifest('x', { port: 9000 })).toBeNull();
    expect(parseManifest('x', { title: 'X' })).toBeNull();
    expect(parseManifest('x', { title: 'X', port: '9000' })).toBeNull();
    expect(parseManifest('x', { title: 'X', port: 70000 })).toBeNull();
    expect(parseManifest('x', null)).toBeNull();
    expect(parseManifest('../x', { title: 'X', port: 9000 })).toBeNull();
  });

  it('does not pass along an accent that is not a colour', () => {
    expect(parseManifest('x', { title: 'X', port: 9000, accent: 'red;}' })?.accent).toBe('#ffd23f');
  });
});

describe('readHealth', () => {
  it('counts people apart from bots', () => {
    expect(readHealth({ ok: true, phase: 'draw', players: 5, bots: 2, capacity: 16 })).toEqual({ up: true, phase: 'draw', humans: 3, bots: 2, capacity: 16 });
  });

  it('copes with a game that says little', () => {
    expect(readHealth({ ok: true })).toEqual({ up: true, phase: '', humans: 0, bots: 0, capacity: 0 });
  });

  it('treats anything else as down', () => {
    expect(readHealth({ ok: false, players: 3 })).toEqual(DOWN);
    expect(readHealth('nope')).toEqual(DOWN);
    expect(readHealth(null)).toEqual(DOWN);
  });
});

describe('discover', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
  const game = (dir: string, json: string, cover?: string) => {
    fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, dir, 'game.json'), json);
    if (cover) fs.writeFileSync(path.join(root, dir, cover), '');
  };
  beforeAll(() => {
    game('zeta', JSON.stringify({ title: 'Zeta', port: 9002, order: 1 }), 'cover.png');
    game('alpha', JSON.stringify({ title: 'Alpha', port: 9001, order: 2 }));
    game('broken', '{ not json');
    game('.hidden', JSON.stringify({ title: 'Hidden', port: 9003 }));
    fs.mkdirSync(path.join(root, 'not-a-game'));
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('finds the games with a manifest, in their stated order', () => {
    expect(discover(root).map((g) => g.id)).toEqual(['zeta', 'alpha']);
  });

  it('notices a cover picture', () => {
    const [zeta, alpha] = discover(root);
    expect(zeta.cover).toBe('cover.png');
    expect(alpha.cover).toBe('');
  });

  it('returns nothing for a directory that is not there', () => {
    expect(discover(path.join(root, 'nowhere'))).toEqual([]);
  });
});

describe('probe', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/health') res.end(JSON.stringify({ ok: true, phase: 'lobby', players: 2, bots: 1 }));
      else res.writeHead(404).end();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => server.close());

  it('reports a running game', async () => {
    expect(await probe(port)).toEqual({ up: true, phase: 'lobby', humans: 1, bots: 1, capacity: 0 });
  });

  it('reports a port nobody listens on as down', async () => {
    const free = port;
    await new Promise((done) => server.close(done));
    expect(await probe(free)).toEqual(DOWN);
  });
});

describe('the games in this repo', () => {
  const games = discover(path.resolve(__dirname, '..', '..'));

  it('are all found, each with a cover', () => {
    expect(games.length).toBeGreaterThanOrEqual(4);
    for (const g of games) expect(g.cover, g.id).not.toBe('');
  });

  it('each have their own port, clear of the landing page', () => {
    const ports = games.map((g) => g.port);
    expect(new Set(ports).size).toBe(ports.length);
    expect(ports).not.toContain(8081);
    for (const p of ports) expect(p).toBeGreaterThanOrEqual(8090);
  });

  it('listen on the port their manifest states', () => {
    for (const g of games) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', '..', g.id, 'server', 'src', 'index.ts'), 'utf8');
      expect(src, g.id).toContain(`process.env.PORT ?? ${g.port})`);
    }
  });
});
