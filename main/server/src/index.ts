/**
 * The landing page: serves the page itself, the games' cover pictures and their live status, and
 * passes `/play/<game>/` through to that game's own server so one port reaches everything.
 */
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';
import { discover, probe, type Manifest, type Status } from './games.js';

const PORT = Number(process.env.PORT ?? 8081);
/** The directory whose sub-directories are the games. */
const GAMES_DIR = path.resolve(process.cwd(), process.env.GAMES_DIR ?? '..');
const STATIC_DIR = path.resolve(process.cwd(), process.env.STATIC_DIR ?? 'client');
const FONT_DIR = path.resolve(process.cwd(), 'node_modules', '@fontsource');
/** Where the game servers are reached from this process. */
const PROBE_HOST = process.env.PROBE_HOST ?? '127.0.0.1';
/** How long one round of answers is reused, so many open phones cost the games one request each. */
const STATUS_TTL_MS = 1500;

const FONTS: Record<string, string> = {
  'chewy.woff2': path.join('chewy', 'files', 'chewy-latin-400-normal.woff2'),
  'patrick-hand.woff2': path.join('patrick-hand', 'files', 'patrick-hand-latin-400-normal.woff2'),
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

type Listing = { games: (Omit<Manifest, 'cover'> & Status & { cover: string; url: string })[] };

let cached: { at: number; body: Promise<string> } | null = null;
let found: { at: number; games: Manifest[] } | null = null;

/** The games on disk. Re-read at most once per `STATUS_TTL_MS`, so a new game shows up by itself. */
function manifests(): Manifest[] {
  const now = Date.now();
  if (!found || now - found.at >= STATUS_TTL_MS) found = { at: now, games: discover(GAMES_DIR) };
  return found.games;
}

/** Splits `/play/<game>/rest?query` into the game and the path its own server should see. */
function playTarget(url: string | undefined): { game: Manifest | undefined; id: string; rest: string } | null {
  const m = /^\/play\/([\w-]+)(\/[^]*)?$/.exec(url ?? '');
  if (!m) return null;
  return { game: manifests().find((g) => g.id === m[1]), id: m[1], rest: m[2] ?? '' };
}

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** A bare page for when there is no game to show. `title` and `text` must already be safe HTML. */
const page = (title: string, text: string): string => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="background:#0f1230;color:#fffaf0;font-family:sans-serif;text-align:center;padding:60px 20px">
<h1>${title}</h1><p>${text}</p><p><a href="/" style="color:#ffd23f">Back to the games</a></p></body></html>`;

/** Hands an ordinary request to the game's server and streams the answer back. */
function proxyHttp(req: http.IncomingMessage, res: http.ServerResponse, game: Manifest, rest: string): void {
  const up = http.request(
    { host: PROBE_HOST, port: game.port, method: req.method, path: rest, headers: req.headers },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(res);
    },
  );
  up.on('error', () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page(`${esc(game.title)} is offline`, 'Its server is not running right now.'));
  });
  req.pipe(up);
}

/** Joins a WebSocket to the game's server: replays the handshake, then copies bytes both ways. */
function proxyUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
  const target = playTarget(req.url);
  if (!target?.game || !target.rest) {
    socket.destroy();
    return;
  }
  const up = net.connect(target.game.port, PROBE_HOST, () => {
    let handshake = `${req.method} ${target.rest} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) handshake += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(handshake + '\r\n');
    if (head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.setNoDelay(true); // the action games send many tiny frames
  if (socket instanceof net.Socket) socket.setNoDelay(true);
  const close = (): void => {
    up.destroy();
    socket.destroy();
  };
  up.on('error', close);
  up.on('close', close);
  socket.on('error', close);
  socket.on('close', close);
}

/** The games and how each is doing, as JSON. Concurrent callers share one round of probes. */
function listing(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < STATUS_TTL_MS) return cached.body;
  const games = manifests();
  const body = Promise.all(games.map((g) => probe(g.port, PROBE_HOST))).then((statuses) => {
    const out: Listing = {
      games: games.map((g, i) => ({ ...g, ...statuses[i], cover: g.cover ? `covers/${g.id}` : '', url: `play/${g.id}/` })),
    };
    return JSON.stringify(out);
  });
  cached = { at: now, body };
  return body;
}

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, cacheControl: string): void {
  fs.stat(filePath, (statErr, st) => {
    if (statErr || !st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const ims = req.headers['if-modified-since'];
    if (ims && Math.floor(st.mtime.getTime() / 1000) <= Math.floor(Date.parse(ims) / 1000)) {
      res.writeHead(304, { 'cache-control': cacheControl, 'last-modified': st.mtime.toUTCString() }).end();
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
        // a cover is another project's file: it may be shown as a picture and nothing more
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'x-content-type-options': 'nosniff',
      });
      res.end(buf);
    });
  });
}

function serveHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
  const target = playTarget(req.url);
  if (target) {
    if (!target.game) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(page('No such game', 'Nothing lives at this address.'));
    } else if (!target.rest) {
      // the game's files are linked relative to its directory, so the address must end in a slash
      res.writeHead(308, { location: `/play/${target.id}/` }).end();
    } else {
      proxyHttp(req, res, target.game, target.rest);
    }
    return;
  }

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

  if (route === '/api/games') {
    listing().then(
      (body) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(body);
      },
      () => res.writeHead(500).end(),
    );
    return;
  }

  if (route === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (route.startsWith('/covers/')) {
    const game = manifests().find((g) => g.id === route.slice('/covers/'.length));
    if (!game?.cover) {
      res.writeHead(404).end('not found');
      return;
    }
    sendFile(req, res, path.join(GAMES_DIR, game.id, game.cover), 'no-cache, must-revalidate');
    return;
  }

  if (route.startsWith('/fonts/')) {
    const font = FONTS[route.slice('/fonts/'.length)];
    if (!font) {
      res.writeHead(404).end('not found');
      return;
    }
    sendFile(req, res, path.join(FONT_DIR, font), 'public, max-age=604800');
    return;
  }

  const rel = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
  const filePath = path.join(STATIC_DIR, rel);
  if (!filePath.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    const isHtml = rel.endsWith('.html');
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': isHtml ? 'no-store' : 'no-cache, must-revalidate',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  try {
    serveHttp(req, res);
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});

server.on('upgrade', proxyUpgrade);

server.listen(PORT, () => {
  const found = discover(GAMES_DIR).map((g) => `${g.title} :${g.port}`);
  console.log(`Game Night: listening on http://0.0.0.0:${PORT}`);
  console.log(`Games in ${GAMES_DIR}: ${found.join(', ') || 'none'}`);
});
