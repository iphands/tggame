/** WebSocket entrypoint (the HTTP side is shared), plus the fixed-rate game loop. */
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '@tggame/base/server/http';
import { Game } from './sim/game.js';
import { loadRecords, saveRecords } from './records.js';
import { isClientMessage, stampOf, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { MATCH, SNAP_EVERY_TICKS, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8091);
/** A socket with this much still unsent is skipped until it catches up (a snapshot is a few kB). */
const BACKED_UP_BYTES = 48 * 1024;
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 240;

/** Where the best time on each course is kept between restarts. */
const RECORDS_FILE = path.resolve(process.cwd(), process.env.RECORDS_FILE ?? 'records.json');

const game = new Game({
  records: loadRecords(RECORDS_FILE),
  onRecord: (records) => {
    saveRecords(RECORDS_FILE, records);
    const msg = JSON.stringify({ type: 'records', records } satisfies ServerMessage);
    for (const ws of peers.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  },
});
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
    const joined = game.join(msg.name, msg.token);
    if (peer.id && peer.id !== joined?.id) game.leave(peer.id); // one identity per socket
    if (!joined) {
      peer.id = null;
      send(ws, { type: 'full', capacity: MATCH.capacity });
      return;
    }
    // a seat reclaimed from another socket (a reconnect racing the old one's close): that one lets go
    for (const [otherWs, other] of peers) {
      if (other !== peer && other.id === joined.id) {
        other.id = null;
        otherWs.close(4000, 'replaced');
      }
    }
    peer.id = joined.id;
    send(ws, { type: 'welcome', selfId: joined.id, token: joined.token, capacity: MATCH.capacity, serverTimeMs: Date.now() });
    send(ws, { type: 'records', records: game.records });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
    case 'input':
      game.setInput(id, msg, stampOf(msg));
      break;
    case 'shoot':
      game.shoot(id, stampOf(msg));
      break;
    case 'drop':
      game.drop(id, stampOf(msg));
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
    case 'rename': {
      const name = game.rename(id, msg.name);
      if (name === null) break;
      const told = JSON.stringify({ type: 'renamed', id, name } satisfies ServerMessage);
      for (const other of peers.keys()) if (other.readyState === WebSocket.OPEN) other.send(told);
      break;
    }
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
    if (peer.id) game.disconnect(peer.id);
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
  // splice what is each client's own (its id, its own runner's hidden state) into the shared
  // payload instead of re-serializing it all
  const tail = body.slice(1);
  for (const [ws, peer] of peers) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    // a line that has not taken the last ones yet gets none it would only read late: the next
    // snapshot it can take says everything this one does, and newer
    if (ws.bufferedAmount > BACKED_UP_BYTES) continue;
    const you = JSON.stringify(game.selfState(peer.id));
    ws.send(`{"type":"snapshot","selfId":${JSON.stringify(peer.id ?? '')},"you":${you},${tail}`);
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
