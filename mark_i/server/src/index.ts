import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './game.js';
import { isClientMessage, type ClientMessage, type ServerMessage } from '../../shared/src/protocol.js';
import { WORLD, SNAP_HZ, TICK_HZ } from '../../shared/src/constants.js';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(process.cwd(), 'client', 'dist');

const game = new Game();
const peers = new Map<WebSocket, { id: string }>();

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
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = decodeURIComponent(url.pathname);

  if (route === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, phase: game.phase, players: game.players.size }));
    return;
  }

  // static client (only present in prod builds, not in dev)
  const staticDir = STATIC_DIR;
  if (!fs.existsSync(staticDir)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Last Survivor Arena</title></head>
<body style="background:#0b0e1a;color:#e8edf5;font-family:sans-serif;padding:40px;max-width:640px">
<h1>⚔️ Last Survivor Arena — server online</h1>
<p>The Node.js + TypeScript game server is running and accepting WebSocket clients on port <b>${PORT}</b>.</p>
<p><b>Static client not found</b> at <code>${staticDir}</code>. Run <code>npm run dev</code> (or <code>npm run build</code> then <code>npm start</code>) to start the client.</p>
</body></html>`);
    return;
  }

  const rel = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
  const filePath = path.join(staticDir, rel);
  if (!filePath.startsWith(path.resolve(staticDir))) {
    res.writeHead(403).end();
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA fallback: serve index.html for unknown routes
      fs.readFile(path.join(staticDir, 'index.html'), (err2, html) => {
        if (err2) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let playerId: string | null = null;

  const send = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!isClientMessage(msg)) return;

    if (msg.type === 'join') {
      // a peer may only hold one match identity; drop any previous one
      if (playerId) game.leave(playerId);
      const { id, name } = game.join(msg.name);
      playerId = id;
      peers.set(ws, { id });
      send({ type: 'welcome', selfId: id, capacity: WORLD.capacity, serverTimeMs: Date.now() });
      return;
    }

    if (!playerId) return; // not joined yet — ignore

    if (msg.type === 'input') {
      game.setInput(playerId, { left: msg.left, right: msg.right, jump: msg.jump });
    } else if (msg.type === 'restart') {
      game.restart();
    } else if (msg.type === 'leave') {
      game.leave(playerId);
      playerId = null;
      peers.delete(ws);
    }
  });

  ws.on('close', () => {
    if (playerId) game.leave(playerId);
    peers.delete(ws);
  });
  ws.on('error', () => {
    if (playerId) game.leave(playerId);
    peers.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Last Survivor Arena — listening on http://0.0.0.0:${PORT} (static dir: ${STATIC_DIR})`);
});

// -------------------------------------------------------------- game loop

const FRAME = 1000 / TICK_HZ;
let last = performance.now();
let snapAccum = 0;
const SNAP_INTERVAL = 1000 / SNAP_HZ;

function loop(): void {
  const now = performance.now();
  const dt = Math.min(100, now - last);
  last = now;

  game.step(dt);

  snapAccum += dt;
  if (snapAccum >= SNAP_INTERVAL) {
    snapAccum = 0;
    const snap = game.snapshot(Date.now());

    for (const [ws, { id }] of peers) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const msg: ServerMessage = {
        type: 'snapshot',
        tick: snap.tick,
        phase: snap.phase,
        selfId: id,
        countdownMs: snap.countdownMs,
        timeLeftMs: snap.timeLeftMs,
        winnerId: snap.winnerId,
        players: snap.players,
        platforms: snap.platforms,
        events: snap.events,
        serverTimeMs: snap.serverTimeMs,
      };
      ws.send(JSON.stringify(msg));
    }
  }

  setTimeout(loop, Math.max(1, FRAME - (performance.now() - now)));
}

loop();
