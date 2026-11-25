/** HTTP (static client + /health) and WebSocket entrypoint. Sends each player only what they may see. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { ABANDON_MS, BOT_DELAY_MS, MAX_PAYLOAD_BYTES } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8088);
const STATIC_DIR = path.resolve(process.cwd(), process.env.STATIC_DIR ?? path.join('client', 'dist'));
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
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Doodle Telephone</title></head>
<body style="background:#fff8e7;color:#1f2440;font-family:sans-serif;padding:40px;max-width:640px">
<h1>Doodle Telephone: server online</h1>
<p>The game server is running and accepting WebSocket clients on port <b>${PORT}</b>.</p>
<p><b>Static client not found</b> at <code>${STATIC_DIR}</code>. Run <code>npm run dev</code>
(then open port 5175) or <code>npm run build</code> then <code>npm start</code>.</p>
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

server.listen(PORT, () => {
  console.log(`Doodle Telephone: listening on http://0.0.0.0:${PORT} (static dir: ${STATIC_DIR})`);
});
