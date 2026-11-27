/** WebSocket entrypoint (the HTTP side is shared), plus the fixed-rate game loop. */
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '@tggame/base/server/http';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { ABANDON_MS, MAX_PLAYERS, MAX_PAYLOAD_BYTES, SNAP_EVERY_TICKS, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8097);
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 120;

type Peer = {
  id: string | null;
  budget: number;
  /** Last state sent, so unchanged state is not resent. */
  lastState: string;
};

const game = new Game();
const peers = new Map<WebSocket, Peer>();

const { wss, listen } = createGameServer({
  title: 'Hilder Beast',
  port: PORT,
  staticDir: process.env.STATIC_DIR ?? path.join('client', 'dist'),
  devPort: 5180,
  bg: '#1d1a2b',
  fg: '#f4ecd8',
  maxPayload: MAX_PAYLOAD_BYTES,
  health: () => ({ phase: game.phase, players: game.players.size, bots: game.botCount(), capacity: MAX_PLAYERS }),
});

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(ws: WebSocket, peer: Peer, msg: ClientMessage): void {
  if (msg.type === 'join') {
    if (peer.id) game.drop(peer.id); // one identity per socket
    peer.id = null;
    const joined = game.join(msg.name, msg.token);
    if (joined === 'full') {
      send(ws, { type: 'full' });
      return;
    }
    // a seat reclaimed from another tab: the old socket lets go of it
    for (const [otherWs, other] of peers) {
      if (other !== peer && other.id === joined.id) {
        other.id = null;
        otherWs.close(4000, 'replaced');
      }
    }
    peer.id = joined.id;
    peer.lastState = '';
    send(ws, { type: 'welcome', selfId: joined.id, token: joined.token });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
    case 'in':
      game.input(id, msg.x, msg.y, msg.b === 1, msg.a === 1);
      break;
    case 'watch':
      game.watch(id, msg.on);
      break;
    case 'rename':
      game.rename(id, msg.name);
      break;
    case 'leave':
      game.leave(id);
      peer.id = null;
      break;
    case 'addBot':
      game.addBot(id);
      break;
    case 'removeBot':
      game.removeBot(id);
      break;
    case 'settings':
      game.configure(id, msg.mode);
      break;
    case 'start':
      game.start(id);
      break;
    case 'again':
      game.again(id);
      break;
    case 'abort':
      game.abort(id);
      break;
  }
}

/** Send each joined socket the game state, if it changed. */
function sync(): void {
  for (const [ws, peer] of peers) {
    if (!peer.id || ws.readyState !== WebSocket.OPEN) continue;
    const state = JSON.stringify(game.viewFor(peer.id));
    if (state !== peer.lastState) {
      peer.lastState = state;
      ws.send(`{"type":"state","state":${state}}`);
    }
  }
  watchAbandoned();
}

// An abandoned table (everyone closed the tab) must not strand the next visitor in a dead game.
let abandonTimer: ReturnType<typeof setTimeout> | null = null;
function watchAbandoned(): void {
  const empty = game.humansConnected() === 0 && game.players.size > 0;
  if (!empty) {
    if (abandonTimer) clearTimeout(abandonTimer);
    abandonTimer = null;
  } else if (!abandonTimer) {
    abandonTimer = setTimeout(() => {
      abandonTimer = null;
      if (game.humansConnected() === 0) game.reset();
    }, ABANDON_MS);
  }
}

wss.on('connection', (ws) => {
  const peer: Peer = { id: null, budget: MSG_BUDGET_PER_SEC, lastState: '' };
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
    if (!isClientMessage(msg)) return;
    handle(ws, peer, msg);
    if (msg.type !== 'in') sync();
  });

  const drop = () => {
    if (!peers.delete(ws)) return;
    if (peer.id) game.drop(peer.id);
    peer.id = null;
    sync();
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
let lastRev = game.rev;

/** One snapshot each: a player is sent only what they can see. */
function broadcast(): void {
  const frame = game.frame();
  if (!frame) return;
  for (const [ws, peer] of peers) {
    if (!peer.id || ws.readyState !== WebSocket.OPEN) continue;
    const snap = game.snapFor(peer.id, frame);
    if (snap) ws.send(JSON.stringify(snap));
  }
}

function loop(): void {
  const now = performance.now();
  game.step(now - last);
  last = now;
  if (game.rev !== lastRev) {
    lastRev = game.rev;
    sync();
  }
  if (game.live && game.tick - lastSnapTick >= SNAP_EVERY_TICKS) {
    lastSnapTick = game.tick;
    broadcast();
  }
  const behind = performance.now() - now;
  setTimeout(loop, Math.max(1, TICK_MS / 2 - behind));
}

loop();
