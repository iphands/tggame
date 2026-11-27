/** WebSocket entrypoint (the HTTP side is shared). Sends each player only what they may see. */
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '@tggame/base/server/http';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { ABANDON_MS, MAX_PLAYERS, BOT_DELAY_MS, MAX_PAYLOAD_BYTES } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8092);
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 40;

type Peer = {
  id: string | null;
  budget: number;
  /** Last payloads sent, so unchanged state is not resent. */
  lastState: string;
  lastTask: string;
  /** Which revealed pages this socket already has (`book:index`), for game `sentGame`. */
  sentGame: number;
  sent: Set<string>;
};

const game = new Game();
const peers = new Map<WebSocket, Peer>();

const { wss, listen } = createGameServer({
  title: 'Doodle Telephone',
  port: PORT,
  staticDir: process.env.STATIC_DIR ?? path.join('client', 'dist'),
  devPort: 5175,
  bg: '#fff8e7',
  fg: '#1f2440',
  maxPayload: MAX_PAYLOAD_BYTES,
  health: () => ({ phase: game.phase, players: game.players.size, bots: game.botCount(), capacity: MAX_PLAYERS }),
});

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(ws: WebSocket, peer: Peer, msg: ClientMessage): void {
  if (msg.type === 'join') {
    if (peer.id) game.drop(peer.id); // one identity per socket
    const joined = game.join(msg.name, msg.token);
    if (!joined) {
      peer.id = null;
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
    peer.sentGame = -1;
    send(ws, { type: 'welcome', selfId: joined.id, token: joined.token });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
    case 'leave':
      game.drop(id);
      peer.id = null;
      break;
    case 'addBot':
      game.addBot(id);
      break;
    case 'removeBot':
      game.removeBot(id);
      break;
    case 'start':
      game.start(id);
      break;
    case 'pick':
      game.pick(id, msg.index);
      break;
    case 'write':
      game.write(id, msg.text);
      break;
    case 'draw':
      game.draw(id, msg.strokes);
      break;
    case 'guess':
      game.guess(id, msg.text);
      break;
    case 'skip':
      game.skip(id, msg.playerId);
      break;
    case 'next':
      game.next(id);
      break;
    case 'heart':
      game.heart(id, msg.book, msg.page);
      break;
    case 'again':
      game.again(id);
      break;
    case 'abort':
      game.abort(id);
      break;
  }
}

/** Push whatever changed to every joined socket: newly revealed pages, then the task, then the state. */
function sync(): void {
  const visible = game.visiblePages();
  for (const [ws, peer] of peers) {
    if (!peer.id || ws.readyState !== WebSocket.OPEN) continue;
    if (peer.sentGame !== game.gameNo) {
      peer.sentGame = game.gameNo;
      peer.sent.clear();
    }
    const fresh = visible.filter((ref) => !peer.sent.has(`${ref.book}:${ref.index}`));
    if (fresh.length) {
      for (const ref of fresh) peer.sent.add(`${ref.book}:${ref.index}`);
      send(ws, { type: 'pages', game: game.gameNo, pages: fresh });
    }
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
  scheduleBots();
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

// Bots hand their pages in one at a time after a short "thinking" pause.
let botTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBots(): void {
  if (botTimer || !game.botsPending()) return;
  const delay = BOT_DELAY_MS.min + Math.random() * (BOT_DELAY_MS.max - BOT_DELAY_MS.min);
  botTimer = setTimeout(() => {
    botTimer = null;
    if (game.humansConnected() === 0) return; // nobody to play for
    game.stepBot();
    sync();
  }, delay);
}

wss.on('connection', (ws) => {
  const peer: Peer = { id: null, budget: MSG_BUDGET_PER_SEC, lastState: '', lastTask: '', sentGame: -1, sent: new Set() };
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
