/** WebSocket entrypoint (the HTTP side is shared). Sends each player only what they may see. */
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer, pingOf } from '@tggame/base/server/http';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { ABANDON_MS, MAX_PLAYERS, MAX_PAYLOAD_BYTES, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8094);
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 60;

type Peer = {
  id: string | null;
  budget: number;
  /** Last payloads sent, so unchanged state is not resent. */
  lastState: string;
  lastTask: string;
};

const game = new Game();
const peers = new Map<WebSocket, Peer>();

const { wss, listen } = createGameServer({
  title: 'Spoons',
  port: PORT,
  staticDir: process.env.STATIC_DIR ?? path.join('client', 'dist'),
  devPort: 5177,
  bg: '#fffaf0',
  fg: '#1f2440',
  maxPayload: MAX_PAYLOAD_BYTES,
  health: () => ({ phase: game.phase, players: game.players.size, bots: game.botCount(), capacity: MAX_PLAYERS }),
});

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** Tell the game each seat's round trip, so a grab is judged by when the hand moved. */
function notePings(): void {
  for (const [ws, peer] of peers) if (peer.id) game.notePing(peer.id, pingOf(ws));
}

function handle(ws: WebSocket, peer: Peer, msg: ClientMessage): void {
  const now = Date.now();
  if (msg.type === 'join') {
    if (peer.id) game.drop(peer.id, now); // one identity per socket
    peer.id = null;
    const joined = game.join(msg.name, msg.token, now);
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
    peer.lastState = peer.lastTask = '';
    send(ws, { type: 'welcome', selfId: joined.id, token: joined.token, now });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
    case 'rename':
      game.rename(id, msg.name);
      break;
    case 'leave':
      game.leave(id, now);
      peer.id = null;
      break;
    case 'addBot':
      game.addBot(id);
      break;
    case 'removeBot':
      game.removeBot(id);
      break;
    case 'settings':
      game.configure(id, msg.rounds);
      break;
    case 'start':
      game.start(id, now);
      break;
    case 'pass':
      game.pass(id, msg.card, now);
      break;
    case 'grab':
      notePings();
      game.grab(id, now);
      break;
    case 'heckle':
      game.heckle(id, now);
      break;
    case 'skip':
      game.skip(id, now);
      break;
    case 'again':
      game.again(id);
      break;
    case 'abort':
      game.abort(id);
      break;
  }
}

/** Push whatever changed to every joined socket: their cards, then the table. */
function sync(): void {
  for (const [ws, peer] of peers) {
    if (!peer.id || ws.readyState !== WebSocket.OPEN) continue;
    const task = JSON.stringify(game.taskFor(peer.id));
    if (task !== peer.lastTask) {
      peer.lastTask = task;
      ws.send(`{"type":"task","task":${task}}`);
    }
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

// The game has no clock of its own: deals, heckles and bots all happen here.
setInterval(() => {
  if (game.phase === 'lobby' || game.phase === 'finale') return;
  notePings();
  game.tick(Date.now());
  sync();
}, TICK_MS);

wss.on('connection', (ws) => {
  const peer: Peer = { id: null, budget: MSG_BUDGET_PER_SEC, lastState: '', lastTask: '' };
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
    sync();
  });

  const drop = () => {
    if (!peers.delete(ws)) return;
    if (peer.id) game.drop(peer.id, Date.now());
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
