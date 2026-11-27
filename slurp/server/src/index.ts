/** WebSocket entrypoint (the HTTP side is shared), plus the fixed-rate game loop. */
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '@tggame/base/server/http';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { ABANDON_MS, MAX_PLAYERS, MAX_PAYLOAD_BYTES, SNAP_EVERY_TICKS, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8095);
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 120;

type Peer = {
  id: string | null;
  budget: number;
  /** Last state sent, so unchanged state is not resent. */
  lastState: string;
  /** The table this socket has been sent; snapshots only make sense on top of it. */
  courseSeq: number;
};

const game = new Game();
const peers = new Map<WebSocket, Peer>();

const { wss, listen } = createGameServer({
  title: 'Slurp',
  port: PORT,
  staticDir: process.env.STATIC_DIR ?? path.join('client', 'dist'),
  devPort: 5178,
  bg: '#4f9d4a',
  fg: '#fffaf0',
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
    const joined = game.join(msg.name, msg.token, msg.watch);
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
    peer.courseSeq = -1;
    send(ws, { type: 'welcome', selfId: joined.id, token: joined.token });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
    case 'aim':
      game.aim(id, msg.x, msg.y);
      break;
    case 'use':
      game.use(id);
      break;
    case 'rename':
      game.rename(id, msg.name);
      break;
    case 'watch':
      game.watch(id, msg.on);
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
      game.configure(id, msg.difficulty, msg.finale);
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
  const peer: Peer = { id: null, budget: MSG_BUDGET_PER_SEC, lastState: '', courseSeq: -1 };
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
    if (msg.type !== 'aim') sync();
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
let lastPhase = `${game.phase}:${game.courseSeq}`;

/** The table (to sockets that do not have it yet), then one snapshot, serialised once for everybody. */
function broadcast(): void {
  let course = '';
  const snap = JSON.stringify(game.snapshot());
  for (const [ws, peer] of peers) {
    if (!peer.id || ws.readyState !== WebSocket.OPEN) continue;
    if (peer.courseSeq !== game.courseSeq) {
      peer.courseSeq = game.courseSeq;
      ws.send((course ||= JSON.stringify(game.courseMessage())));
    }
    ws.send(snap);
  }
}

function loop(): void {
  const now = performance.now();
  game.step(now - last);
  last = now;
  const phase = `${game.phase}:${game.courseSeq}`;
  if (phase !== lastPhase) {
    lastPhase = phase;
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
