/** Finds the games that live next to this project and asks each one how it is doing. */
import fs from 'node:fs';
import path from 'node:path';

/** What a game says about itself in its `game.json`. */
export type Manifest = {
  /** The game's directory name. */
  id: string;
  title: string;
  tagline: string;
  port: number;
  /** Free text such as "3–12 players". */
  players: string;
  /** A hex colour for the game's card. */
  accent: string;
  order: number;
  /** Friendly names for the phases the game's `/health` reports. */
  phases: Record<string, string>;
  /** File name of the cover picture inside the game's directory, or '' when there is none. */
  cover: string;
};

export type Status = {
  up: boolean;
  phase: string;
  /** People, not counting bots. */
  humans: number;
  bots: number;
  /** Most players the game seats; 0 when the game does not say. */
  capacity: number;
};

export const DOWN: Status = { up: false, phase: '', humans: 0, bots: 0, capacity: 0 };

const COVER_NAMES = ['cover.svg', 'cover.png', 'cover.webp', 'cover.jpg'];

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Turns the contents of a `game.json` into a manifest, or null when it is not usable. */
export function parseManifest(id: string, raw: unknown, cover = ''): Manifest | null {
  if (!/^[\w-]+$/.test(id) || typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = text(r.title, 60);
  const port = r.port;
  if (!title || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const accent = text(r.accent, 9);
  const phases: Record<string, string> = {};
  if (typeof r.phases === 'object' && r.phases !== null) {
    for (const [k, v] of Object.entries(r.phases)) if (text(v, 40)) phases[k] = text(v, 40);
  }
  return {
    id,
    title,
    tagline: text(r.tagline, 200),
    port,
    players: text(r.players, 40),
    accent: /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : '#ffd23f',
    order: typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : 1000,
    phases,
    cover,
  };
}

/** Every directory under `root` that has a usable `game.json`, in display order. */
export function discover(root: string): Manifest[] {
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const games: Manifest[] = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    const dir = path.join(root, d.name);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
    } catch {
      continue; // not a game, or its manifest is broken
    }
    const cover = COVER_NAMES.find((name) => fs.existsSync(path.join(dir, name))) ?? '';
    const game = parseManifest(d.name, raw, cover);
    if (game) games.push(game);
  }
  return games.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** Reads a game's `/health` reply. Anything that is not a healthy reply counts as down. */
export function readHealth(body: unknown): Status {
  if (typeof body !== 'object' || body === null) return DOWN;
  const h = body as Record<string, unknown>;
  if (h.ok !== true) return DOWN;
  const bots = count(h.bots);
  return {
    up: true,
    phase: text(h.phase, 20),
    humans: Math.max(0, count(h.players) - bots),
    bots,
    capacity: count(h.capacity),
  };
}

/** Asks the game server on `port` how it is doing. Never rejects. */
export async function probe(port: number, host = '127.0.0.1', timeoutMs = 800): Promise<Status> {
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return DOWN;
    return readHealth(await res.json());
  } catch {
    return DOWN;
  }
}
