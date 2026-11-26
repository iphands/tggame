/** The landing page: serves the page itself, the games' cover pictures and their live status. */
import http from 'node:http';
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

type Listing = { games: (Omit<Manifest, 'cover'> & Status & { cover: string })[] };

let cached: { at: number; body: Promise<string> } | null = null;

/** The games and how each is doing, as JSON. Concurrent callers share one round of probes. */
function listing(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < STATUS_TTL_MS) return cached.body;
  const games = discover(GAMES_DIR);
  const body = Promise.all(games.map((g) => probe(g.port, PROBE_HOST))).then((statuses) => {
    const out: Listing = {
      games: games.map((g, i) => ({ ...g, ...statuses[i], cover: g.cover ? `/covers/${g.id}` : '' })),
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
    const game = discover(GAMES_DIR).find((g) => g.id === route.slice('/covers/'.length));
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

server.listen(PORT, () => {
  const found = discover(GAMES_DIR).map((g) => `${g.title} :${g.port}`);
  console.log(`Game Night: listening on http://0.0.0.0:${PORT}`);
  console.log(`Games in ${GAMES_DIR}: ${found.join(', ') || 'none'}`);
});
