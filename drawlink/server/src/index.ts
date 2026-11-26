/** HTTP (static client + /health) and WebSocket entrypoint. Sends each player only what they may see. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { ABANDON_MS, MAX_PAYLOAD_BYTES, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8089);
const STATIC_DIR = path.resolve(process.cwd(), process.env.STATIC_DIR ?? path.join('client', 'dist'));
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 60;

type Peer = {
  id: string | null;
  budget: number;
  /** Last payloads sent, so unchanged state is not resent. */
  lastState: string;
  lastTask: string;
  /** The turn whose canvas this socket holds; a different turn means "send the whole canvas". */
  canvasTurn: number;
  /** Newest chat line this socket has. */
  chatSeq: number;
};

const game = new Game();
const peers = new Map<WebSocket, Peer>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    serveHttp(req, res);
  } catch {
    // never let one bad request take the game down
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});

function serveHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
  let route: string;
  try {
    route = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (route.includes('\0')) {
    res.writeHead(400).end();
    return;
  }

  if (route === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, phase: game.phase, players: game.players.size, bots: game.botCount() }));
    return;
  }

  if (!fs.existsSync(STATIC_DIR)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Drawlink</title></head>
<body style="background:#fff8e7;color:#1f2440;font-family:sans-serif;padding:40px;max-width:640px">
<h1>Drawlink: server online</h1>
<p>The game server is running and accepting WebSocket clients on port <b>${PORT}</b>.</p>
<p><b>Static client not found</b> at <code>${STATIC_DIR}</code>. Run <code>npm run dev</code>
(then open port 5176) or <code>npm run build</code> then <code>npm start</code>.</p>
</body></html>`);
    return;
  }

  const rel = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
  const filePath = path.join(STATIC_DIR, rel);
  if (!filePath.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }

  // LAN-friendly caching: the HTML shell is never stored; other files
  // revalidate each load (a cheap 304 when unchanged).
  const isHtml = rel.toLowerCase().endsWith('.html');
  const cacheControl = isHtml ? 'no-store' : 'no-cache, must-revalidate';

  fs.stat(filePath, (statErr, st) => {
    if (statErr || !st.isFile()) {
      // SPA fallback: unknown routes get the shell
      fs.readFile(path.join(STATIC_DIR, 'index.html'), (err, html) => {
        if (err) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
      });
      return;
    }
    const ims = req.headers['if-modified-since'];
    if (!isHtml && ims && Math.floor(st.mtime.getTime() / 1000) <= Math.floor(Date.parse(ims) / 1000)) {
      res.writeHead(304, { 'cache-control': cacheControl, 'last-modified': st.mtime.toUTCString() });
      res.end();
      return;
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': cacheControl,
        'last-modified': st.mtime.toUTCString(),
      });
      res.end(buf);
    });
  });
}

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_PAYLOAD_BYTES,
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
});

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(ws: WebSocket, peer: Peer, msg: ClientMessage): void {
  const now = Date.now();
  if (msg.type === 'join') {
    if (peer.id) game.drop(peer.id, now); // one identity per socket
    peer.id = null;
    const joined = game.join(msg.name, msg.token, now);
    if (joined === 'full' || joined === 'booted') {
      send(ws, { type: joined });
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
    peer.canvasTurn = -1;
    peer.chatSeq = 0;
    send(ws, { type: 'welcome', selfId: joined.id, token: joined.token, now });
    return;
  }

  const id = peer.id;
  if (!id) return; // must join first
  switch (msg.type) {
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
      game.configure(id, msg.rounds, msg.hints);
      break;
    case 'start':
      game.start(id, now);
      break;
    case 'ink':
      game.inkAdd(id, msg.i, msg.c, msg.w, msg.p, msg.f);
      break;
    case 'undo':
      game.inkUndo(id);
      break;
    case 'clear':
      game.inkClear(id);
      break;
    case 'pass':
      game.pass(id, now);
      break;
    case 'chat':
      game.chat(id, msg.text, msg.to, now);
      break;
    case 'boot':
      game.boot(id, msg.playerId, now);
      break;
    case 'again':
      game.again(id);
      break;
    case 'abort':
      game.abort(id);
      break;
  }
}

/** Push whatever changed to every joined socket: task, state, canvas, chat. */
function sync(): void {
  const kicked = game.takeKicked();
  const ink = game.takeInk().filter((e) => e.turn === game.turnNo).map((e) => JSON.stringify(e));
  const resync = game.takeResync();
  const drawing = game.phase === 'draw';
  let canvas = '';
  for (const [ws, peer] of peers) {
    if (peer.id && kicked.includes(peer.id)) {
      peer.id = null;
      send(ws, { type: 'booted' });
    }
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
    // the drawer made the ink, so they are only ever sent whole canvases
    const isDrawer = drawing && peer.id === game.drawerId;
    if (peer.canvasTurn !== game.turnNo || (resync && isDrawer)) {
      peer.canvasTurn = game.turnNo;
      canvas ||= JSON.stringify({ type: 'canvas', turn: game.turnNo, strokes: game.strokes } satisfies ServerMessage);
      ws.send(canvas);
    } else if (!isDrawer) {
      for (const e of ink) ws.send(e);
    }
    const lines = game.chatFor(peer.id, peer.chatSeq);
    if (lines.length) {
      peer.chatSeq = lines[lines.length - 1].seq;
      send(ws, { type: 'chat', lines });
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

// The game has no clock of its own: round time-outs, hints and bots all happen here.
setInterval(() => {
  if (game.phase === 'lobby' || game.phase === 'finale') return;
  game.tick(Date.now());
  sync();
}, TICK_MS);

wss.on('connection', (ws) => {
  const peer: Peer = { id: null, budget: MSG_BUDGET_PER_SEC, lastState: '', lastTask: '', canvasTurn: -1, chatSeq: 0 };
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

server.listen(PORT, () => {
  console.log(`Drawlink: listening on http://0.0.0.0:${PORT} (static dir: ${STATIC_DIR})`);
});
