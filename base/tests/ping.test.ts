import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createGameServer, pingOf, shownPingOf } from '../src/server/http.js';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('ping, below the games', () => {
  let close: (() => void) | null = null;
  afterEach(() => close?.());

  async function serve() {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const made = createGameServer({ title: 'Test', port: 0, staticDir: 'tests', devPort: 0, bg: '#000', fg: '#fff', maxPayload: 4096, health: () => ({}) });
    const sockets: WebSocket[] = [];
    let theirs: Parameters<typeof pingOf>[0] | null = null;
    made.wss.on('connection', (ws) => (theirs = ws));
    made.listen();
    await wait(50);
    const port = (made.server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(ws);
    close = () => {
      for (const s of sockets) s.terminate();
      made.wss.close();
      made.server.close();
    };
    await new Promise((r) => ws.on('open', r));
    await wait(100);
    return { ws, server: () => theirs! };
  }

  it('the server measures each line itself, from a ping the page has no say in', async () => {
    const { server } = await serve();
    const rtt = pingOf(server());
    expect(rtt).toBeGreaterThan(0);
    expect(rtt).toBeLessThan(100);
  });

  it('answers a page ping with its clock, and keeps what the page claims apart from what rules use', async () => {
    const { ws, server } = await serve();
    const got: { type: string; t: number; now: number }[] = [];
    ws.on('message', (m) => got.push(JSON.parse(String(m))));
    ws.send(JSON.stringify({ type: 'ping', t: 12.5, rtt: 9000 }));
    await wait(100);
    expect(got[0]).toMatchObject({ type: 'pong', t: 12.5 });
    expect(Math.abs(got[0].now - Date.now())).toBeLessThan(2000);
    expect(shownPingOf(server())).toBe(9000); // what the page says, for show
    expect(pingOf(server())).toBeLessThan(100); // what the server found, for the rules
  });
});
