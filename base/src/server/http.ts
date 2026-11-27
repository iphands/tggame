/** What every game server does besides its game: serve the built client, answer /health, host the WebSocket. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';

export type GameServerOptions = {
  /** Shown in the log line and on the placeholder page. */
  title: string;
  port: number;
  /** The built client, relative to the working directory unless absolute. */
  staticDir: string;
  /** The Vite dev port the placeholder page points at. */
  devPort: number;
  /** Placeholder page colours. */
  bg: string;
  fg: string;
  /** Largest WebSocket message accepted, in bytes. */
  maxPayload: number;
  /** What `/health` reports besides `ok`: `phase`, `players`, `bots`, `capacity`. The landing page reads it. */
  health: () => Record<string, unknown>;
};

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

/**
 * Names the client this server is handing out: a short hash of its index.html, which lists the
 * hashed script and style files, so it changes exactly when the client does. A page compares it
 * across reconnects to notice that it has been left behind by an update (see `SocketClient`).
 */
export function buildId(staticDir: string): string {
  try {
    return createHash('sha1').update(fs.readFileSync(path.join(staticDir, 'index.html'))).digest('hex').slice(0, 12);
  } catch {
    return 'none';
  }
}

/** Builds the HTTP server and its WebSocket server. Nothing listens until `listen()` is called. */
export function createGameServer(opts: GameServerOptions) {
  const STATIC_DIR = path.resolve(process.cwd(), opts.staticDir);
  const BUILD = buildId(STATIC_DIR);

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
      res.end(JSON.stringify({ ok: true, build: BUILD, ...opts.health() }));
      return;
    }

    if (!fs.existsSync(STATIC_DIR)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${opts.title}</title></head>
  <body style="background:${opts.bg};color:${opts.fg};font-family:sans-serif;padding:40px;max-width:640px">
  <h1>${opts.title}: server online</h1>
  <p>The game server is running and accepting WebSocket clients on port <b>${opts.port}</b>.</p>
  <p><b>Static client not found</b> at <code>${STATIC_DIR}</code>. Run <code>npm run dev</code>
  (then open port ${opts.devPort}) or <code>npm run build</code> then <code>npm start</code>.</p>
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

  // Repetitive JSON deflates ~4-5x, which matters for many phones on Wi-Fi.
  const wss = new WebSocketServer({
    server,
    maxPayload: opts.maxPayload,
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
  });

  const listen = (): void => {
    server.listen(opts.port, () => {
      console.log(`${opts.title}: listening on http://0.0.0.0:${opts.port} (static dir: ${STATIC_DIR})`);
    });
  };

  return { server, wss, listen };
}
