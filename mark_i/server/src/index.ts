/** HTTP (static client + /health) and WebSocket entrypoint, plus the fixed-rate game loop. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './sim/game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { MATCH, SNAP_EVERY_TICKS, TICK_MS } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = path.resolve(process.cwd(), process.env.STATIC_DIR ?? path.join('client', 'dist'));
/** Max messages a socket may send per second before extras are dropped. */
const MSG_BUDGET_PER_SEC = 240;

const game = new Game();
const peers = new Map<WebSocket, { id: string | null; budget: number }>();

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
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Last Survivor Arena</title></head>
<body style="background:#0b0e1a;color:#e8edf5;font-family:sans-serif;padding:40px;max-width:640px">
<h1>Last Survivor Arena: server online</h1>
<p>The game server is running and accepting WebSocket clients on port <b>${PORT}</b>.</p>
<p><b>Static client not found</b> at <code>${STATIC_DIR}</code>. Run <code>npm run dev</code>
(then open port 5173) or <code>npm run build</code> then <code>npm start</code>.</p>
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

// Snapshots are repetitive JSON: deflate cuts bandwidth ~4-5x (matters for many phones on Wi-Fi).
const wss = new WebSocketServer({
  server,
  maxPayload: 4096,
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
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
    case 'release':
      game.release(id);
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

server.listen(PORT, () => {
  console.log(`Last Survivor Arena: listening on http://0.0.0.0:${PORT} (static dir: ${STATIC_DIR})`);
});

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
