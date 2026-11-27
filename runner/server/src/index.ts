/** WebSocket entrypoint (the HTTP side is shared), plus the fixed-rate game loop. */
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '@tggame/base/server/http';
import { Game } from './sim/game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { MATCH, SNAP_EVERY_TICKS, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8091);
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 240;

const game = new Game();
const peers = new Map<WebSocket, { id: string | null; budget: number }>();

const { wss, listen } = createGameServer({
  title: 'Last Survivor Run',
  port: PORT,
  staticDir: process.env.STATIC_DIR ?? path.join('client', 'dist'),
  devPort: 5174,
  bg: '#0b0e1a',
  fg: '#e8edf5',
  maxPayload: 4096,
  health: () => ({ phase: game.phase, players: game.players.size, bots: game.botCount(), capacity: MATCH.capacity }),
});

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(ws: WebSocket, peer: { id: string | null }, msg: ClientMessage): void {
  if (msg.type === 'join') {
    if (peer.id) game.leave(peer.id); // one identity per socket
    const joined = game.join(msg.name);
    if (!joined) {
      peer.id = null;
      send(ws, { type: 'full', capacity: MATCH.capacity });
      return;
    }
    peer.id = joined.id;
    send(ws, { type: 'welcome', selfId: joined.id, capacity: MATCH.capacity, serverTimeMs: Date.now() });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
    case 'input':
      game.setInput(id, msg);
      break;
    case 'shoot':
      game.shoot(id);
      break;
    case 'drop':
      game.drop(id);
      break;
    case 'restart':
      game.restart();
      break;
    case 'addBot':
      game.addBot();
      break;
    case 'removeBot':
      game.removeBot();
      break;
    case 'pickLevel':
      game.pickLevel(msg.dir);
      break;
    case 'leave':
      game.leave(id);
      peer.id = null;
      break;
  }
}

wss.on('connection', (ws) => {
  const peer = { id: null as string | null, budget: MSG_BUDGET_PER_SEC };
  peers.set(ws, peer);

  ws.on('message', (raw) => {
    if (peer.budget <= 0) return;
    peer.budget--;
    let msg: unknown;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (isClientMessage(msg)) handle(ws, peer, msg);
  });

  const drop = () => {
    if (peer.id) game.leave(peer.id);
    peer.id = null;
    peers.delete(ws);
  };
  ws.on('close', drop);
  ws.on('error', drop);
});

setInterval(() => {
  for (const peer of peers.values()) peer.budget = MSG_BUDGET_PER_SEC;
}, 1000);

listen();

// -------------------------------------------------------------- game loop

let last = performance.now();
let lastSnapTick = 0;

function broadcast(): void {
  const body = JSON.stringify(game.snapshot());
  // splice the per-client selfId into the shared payload instead of re-serializing
  const tail = body.slice(1);
  for (const [ws, peer] of peers) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(`{"type":"snapshot","selfId":${JSON.stringify(peer.id ?? '')},${tail}`);
  }
}

function loop(): void {
  const now = performance.now();
  game.step(now - last);
  last = now;
  if (game.tick - lastSnapTick >= SNAP_EVERY_TICKS) {
    lastSnapTick = game.tick;
    broadcast();
  }
  const behind = performance.now() - now;
  setTimeout(loop, Math.max(1, TICK_MS / 2 - behind));
}

loop();
