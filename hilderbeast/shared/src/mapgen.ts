/**
 * Lays a map out from a plan: a grid of rooms, doorways between them, furniture to run round,
 * then everything a round needs and the traps. Chance comes from the plan's own seed and from
 * nothing else, so the server and every client build the very same map and none of it has to
 * travel. A layout that breaks a rule (a Cousin starting in sight of the den, a room with one
 * way out, spikes with no way round) is thrown away and the next seed tried.
 */
import { START_SPOTS, TASKS_MAX, TILE } from './constants.js';
import { parseMap, type GameMap, type Look, type Room } from './map.js';
import { sees } from './sim.js';

export type Plan = {
  name: string;
  seed: number;
  /** Widths of the columns of rooms and heights of the rows, in squares, walls not counted. */
  cols: number[];
  rows: number[];
  /** Room names, row by row. Left out, rooms are named by where they are. */
  rooms?: string[];
  /** The room (counted row by row from 0) the first Beast waits in, and the ones Cousins start in. */
  den: number;
  halls: number[];
  /** How wide a doorway is. */
  door: number;
  /** The chance that a wall between two rooms has no doorway (never leaving a room fewer than two). */
  shut: number;
  /** Pieces of furniture for every 40 squares of room. */
  clutter: number;
  /** Patches of goo, strips of spikes and creaky boards. */
  goo: number;
  spikes: number;
  creaks: number;
  pills: number;
  look: Look;
};

type Cell = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

/** A small, fast generator that gives the same numbers on every machine. */
function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FURNITURE = [
  [2, 2],
  [1, 3],
  [3, 1],
  [2, 1],
  [1, 2],
  [2, 2],
];
const GOO = [
  [2, 2],
  [3, 2],
  [2, 3],
];
const SPIKES = [
  [1, 2],
  [2, 1],
  [1, 3],
  [3, 1],
];

export function generate(plan: Plan): GameMap {
  for (let attempt = 0; attempt < 400; attempt++) {
    const map = layOut(plan, plan.seed + attempt * 7919);
    if (map) return map;
  }
  throw new Error(`no layout found for ${plan.name}`);
}

function layOut(plan: Plan, seed: number): GameMap | null {
  const rnd = rngOf(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const shuffled = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = pick(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const W = plan.cols.reduce((a, b) => a + b, 0) + plan.cols.length + 1;
  const H = plan.rows.reduce((a, b) => a + b, 0) + plan.rows.length + 1;
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('#'));
  const key = (x: number, y: number): number => y * W + x;

  // ---- rooms
  const rects: Rect[] = [];
  let top = 1;
  for (const h of plan.rows) {
    let left = 1;
    for (const w of plan.cols) {
      rects.push({ x0: left, y0: top, x1: left + w - 1, y1: top + h - 1 });
      for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) g[y][x] = '.';
      left += w + 1;
    }
    top += h + 1;
  }
  const nc = plan.cols.length;
  const nr = plan.rows.length;

  // ---- doorways: every pair of neighbours has one unless it is shut, and no room is left with fewer than two
  type Edge = { a: number; b: number; down: boolean; open: boolean };
  const edges: Edge[] = [];
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      const i = r * nc + c;
      if (c + 1 < nc) edges.push({ a: i, b: i + 1, down: false, open: true });
      if (r + 1 < nr) edges.push({ a: i, b: i + nc, down: true, open: true });
    }
  }
  const degree = rects.map((_, i) => edges.filter((e) => e.a === i || e.b === i).length);
  const joined = (): boolean => {
    const seen = new Set([0]);
    const todo = [0];
    while (todo.length) {
      const at = todo.pop()!;
      for (const e of edges) {
        if (!e.open || (e.a !== at && e.b !== at)) continue;
        const to = e.a === at ? e.b : e.a;
        if (!seen.has(to)) {
          seen.add(to);
          todo.push(to);
        }
      }
    }
    return seen.size === rects.length;
  };
  for (const e of shuffled(edges)) {
    if (rnd() >= plan.shut || degree[e.a] <= 2 || degree[e.b] <= 2) continue;
    e.open = false;
    if (joined()) {
      degree[e.a]--;
      degree[e.b]--;
    } else e.open = true;
  }
  /** Squares in and beside a doorway: nothing is ever put on them. */
  const keep = new Set<number>();
  for (const e of edges) {
    if (!e.open) continue;
    const a = rects[e.a];
    const lo = e.down ? a.x0 : a.y0;
    const len = e.down ? a.x1 - a.x0 + 1 : a.y1 - a.y0 + 1;
    const wide = Math.min(plan.door, Math.max(1, len - 2));
    const at = len >= wide + 2 ? lo + 1 + pick(len - wide - 1) : lo;
    for (let k = at; k < at + wide; k++) {
      for (const d of [-1, 0, 1]) {
        const x = e.down ? k : a.x1 + 1 + d;
        const y = e.down ? a.y1 + 1 + d : k;
        if (d === 0) g[y][x] = '.';
        keep.add(key(x, y));
      }
    }
  }

  // ---- furniture: each piece stands clear of the walls and of every other, so it can always be walked round
  rects.forEach((room) => {
    const w = room.x1 - room.x0 + 1;
    const h = room.y1 - room.y0 + 1;
    const want = Math.round((w * h * plan.clutter) / 40);
    let placed = 0;
    for (let tries = 0; tries < want * 12 && placed < want; tries++) {
      const [bw, bh] = FURNITURE[pick(FURNITURE.length)];
      if (w < bw + 2 || h < bh + 2) continue;
      const px = room.x0 + 1 + pick(w - bw - 1);
      const py = room.y0 + 1 + pick(h - bh - 1);
      let clear = true;
      for (let y = py - 1; y <= py + bh && clear; y++) for (let x = px - 1; x <= px + bw; x++) if (g[y][x] !== '.') clear = false;
      if (!clear) continue;
      for (let y = py; y < py + bh; y++) for (let x = px; x < px + bw; x++) g[y][x] = '#';
      placed++;
    }
  });

  // ---- the things a round needs
  const taken: Cell[] = [];
  const apart = (x: number, y: number, from: Cell[], by: number): boolean => from.every((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) >= by);
  /** A free square of `room`, at least `gap` from everything placed so far; the best by `score`, or any. */
  const spot = (room: Rect, gap: number, score?: (c: Cell) => number): Cell | null => {
    const found: Cell[] = [];
    for (let y = room.y0; y <= room.y1; y++) {
      for (let x = room.x0; x <= room.x1; x++) {
        if (g[y][x] === '.' && !keep.has(key(x, y)) && apart(x, y, taken, gap)) found.push({ x, y });
      }
    }
    if (!found.length) return null;
    if (!score) return found[pick(found.length)];
    return found.reduce((best, c) => (score(c) > score(best) ? c : best));
  };
  const put = (ch: string, c: Cell | null): boolean => {
    if (!c) return false;
    g[c.y][c.x] = ch;
    taken.push(c);
    return true;
  };
  const mid = (r: Rect): Cell => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  const gapBetween = (a: number, b: number): number => Math.hypot(mid(rects[a]).x - mid(rects[b]).x, mid(rects[a]).y - mid(rects[b]).y);

  // the den: as deep in its room as it goes, away from the middle of the map
  const den = rects[plan.den];
  if (!put('B', spot(den, 1, (c) => Math.hypot(c.x - W / 2, c.y - H / 2)))) return null;
  const denAt = taken[0];

  const starts: Cell[] = [];
  for (let i = 0; i < START_SPOTS; i++) {
    const c = spot(rects[plan.halls[i % plan.halls.length]], 2);
    if (c && put('c', c)) starts.push(c);
  }
  if (starts.length < START_SPOTS - 1) return null;

  // Beast doors: three pairs, each joining two rooms far apart, spread over as many rooms as there are
  const used = rects.map(() => 0);
  for (let n = 1; n <= 3; n++) {
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const score = gapBetween(a, b) - 100 * (used[a] + used[b]) + rnd();
        if (score > bestScore) {
          bestScore = score;
          best = [a, b];
        }
      }
    }
    if (!best) return null;
    for (const i of best) {
      used[i]++;
      if (!put(String(n), spot(rects[i], 3))) return null;
    }
  }

  const others = rects.map((_, i) => i).filter((i) => i !== plan.den);
  // exits: two, in rooms as far from each other as can be, each by the outside wall
  let pair: [number, number] = [others[0], others[others.length - 1]];
  for (const a of others) for (const b of others) if (a < b && gapBetween(a, b) > gapBetween(pair[0], pair[1])) pair = [a, b];
  for (const i of pair) {
    if (!put('E', spot(rects[i], 3, (c) => -Math.min(c.x, c.y, W - 1 - c.x, H - 1 - c.y) + rnd() * 0.5))) return null;
  }

  // chores: shared out over the rooms, well apart
  const tasks: Cell[] = [];
  const order = shuffled(others);
  for (let i = 0; tasks.length < TASKS_MAX && i < order.length * 4; i++) {
    const c = spot(rects[order[i % order.length]], 2);
    if (c && apart(c.x, c.y, tasks, 5) && put('T', c)) tasks.push(c);
  }
  if (tasks.length < TASKS_MAX) return null;

  const pills: Cell[] = [];
  const pillRooms = shuffled(others);
  for (let i = 0; pills.length < plan.pills && i < pillRooms.length * 4; i++) {
    const c = spot(rects[pillRooms[i % pillRooms.length]], 2);
    if (c && apart(c.x, c.y, pills, 4) && put('o', c)) pills.push(c);
  }
  if (pills.length < Math.min(plan.pills, 6)) return null;

  // ---- traps
  /** Can every square that is not spikes still be reached without stepping on any? */
  const wayRound = (): boolean => {
    const seen = new Uint8Array(W * H);
    const todo = [key(denAt.x, denAt.y)];
    seen[todo[0]] = 1;
    while (todo.length) {
      const at = todo.pop()!;
      const x = at % W;
      const y = (at - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(x + dx, y + dy);
        const ch = g[y + dy][x + dx];
        if (seen[k] || ch === '#' || ch === '^') continue;
        seen[k] = 1;
        todo.push(k);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] !== '#' && g[y][x] !== '^' && !seen[key(x, y)]) return false;
    return true;
  };
  const patch = (ch: string, shapes: number[][], count: number, check?: () => boolean): void => {
    let placed = 0;
    for (let tries = 0; tries < count * 40 && placed < count; tries++) {
      const room = rects[others[pick(others.length)]];
      const [w, h] = shapes[pick(shapes.length)];
      if (room.x1 - room.x0 + 1 < w || room.y1 - room.y0 + 1 < h) continue;
      const px = room.x0 + pick(room.x1 - room.x0 + 2 - w);
      const py = room.y0 + pick(room.y1 - room.y0 + 2 - h);
      const cells: Cell[] = [];
      for (let y = py; y < py + h; y++) for (let x = px; x < px + w; x++) cells.push({ x, y });
      // never on a doorstep, never where somebody starts, never touching another special square
      if (!cells.every((c) => g[c.y][c.x] === '.' && !keep.has(key(c.x, c.y)) && apart(c.x, c.y, starts, 3) && apart(c.x, c.y, taken, 2))) continue;
      for (const c of cells) g[c.y][c.x] = ch;
      if (check && !check()) {
        for (const c of cells) g[c.y][c.x] = '.';
        continue;
      }
      placed++;
    }
  };
  patch('~', GOO, plan.goo);
  patch('^', SPIKES, plan.spikes, wayRound);
  // creaky boards go anywhere, doorsteps included: that is where they are worst
  for (let placed = 0, tries = 0; placed < plan.creaks && tries < plan.creaks * 40; tries++) {
    const room = rects[others[pick(others.length)]];
    const x = room.x0 + pick(room.x1 - room.x0 + 1);
    const y = room.y0 + pick(room.y1 - room.y0 + 1);
    if (g[y][x] !== '.' || !apart(x, y, starts, 2)) continue;
    g[y][x] = '!';
    placed++;
  }

  // ---- is it a fair map?
  const rowNames = ['North', 'Upper', 'Middle', 'Lower', 'South'];
  const colNames = ['West', 'Mid-West', 'Centre', 'Mid-East', 'East'];
  const nameOf = (r: number, c: number): string =>
    `${nr === 1 ? '' : rowNames[Math.round((r * (rowNames.length - 1)) / (nr - 1))]} ${nc === 1 ? '' : colNames[Math.round((c * (colNames.length - 1)) / (nc - 1))]}`.trim();
  const rooms: Room[] = rects.map((r, i) => ({ name: plan.rooms?.[i] ?? nameOf(Math.floor(i / nc), i % nc), x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }));
  const map = parseMap(g.map((row) => row.join('')), { name: plan.name, rooms, look: plan.look });
  // no Cousin starts where the Beast can see them, or within a few strides of it
  for (const s of map.cousinStarts) {
    if (sees(map, map.den.x, map.den.y, s.x, s.y)) return null;
    if (Math.hypot(s.x - map.den.x, s.y - map.den.y) < 10 * TILE) return null;
  }
  if (map.portals.length !== 6 || map.exits.length !== 2) return null;
  return map;
}
