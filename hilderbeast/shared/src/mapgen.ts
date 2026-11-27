/**
 * Lays a map out from a plan. Rooms of all shapes (boxes with corners cut away, L-shapes, plus
 * shapes, rounded halls) are set down on a loose grid with some places left empty, so the house
 * has a ragged outline and dark gaps inside it. Hallways and wide breezeways join the rooms up,
 * every room with at least two ways out and a few loops to run round. Then thin furniture, and
 * everything a round needs, and the traps.
 *
 * Chance comes from the plan's own seed and from nothing else, so the server and every client
 * build the very same map and none of it has to travel. A layout that breaks a rule (a Cousin
 * starting in sight of the den, spikes with no way round) is thrown away and the next seed tried.
 */
import { START_SPOTS, TASKS_MAX, TILE } from './constants.js';
import { parseMap, type GameMap, type Look, type Room } from './map.js';
import { sees } from './sim.js';

/**
 * - `rect` a plain box
 * - `notched` a box with small bites out of some corners
 * - `ell` a box with one big corner gone: an L
 * - `tee` two corners gone on one side: a T
 * - `plus` all four corners gone: a cross
 * - `round` all four corners cut away in steps: near enough a circle
 */
export type Shape = 'rect' | 'notched' | 'ell' | 'tee' | 'plus' | 'round';

export type Plan = {
  name: string;
  seed: number;
  /** Size of the map, in squares. */
  cols: number;
  lines: number;
  /** Rooms are set down on a loose grid of this many places across and down. Places left over stay empty. */
  grid: [number, number];
  /** One name for each room; there are as many rooms as names. */
  rooms: string[];
  /** The shapes rooms may take, picked from at random (list one twice to make it likelier). */
  shapes: Shape[];
  /** How wide the passages between rooms are, picked from for each: 2 a hallway, 3 a breezeway. */
  halls: number[];
  /** Passages beyond those that join everything up and give every room two ways out: loops to run round. */
  loops: number;
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

/** Furniture: thin pieces only, as squares relative to the first. Each becomes a bar, an L or a post. */
const FURNITURE: Cell[][] = [
  [{ x: 0, y: 0 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
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

/** Which squares of a `w` by `h` box a room of this shape keeps. */
function shapeMask(shape: Shape, w: number, h: number, rnd: () => number): boolean[][] {
  const m = Array.from({ length: h }, () => Array<boolean>(w).fill(true));
  const cut = (x0: number, y0: number, cw: number, ch: number): void => {
    for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) if (y >= 0 && y < h && x >= 0 && x < w) m[y][x] = false;
  };
  /** Cut a `cw` by `ch` corner: 0 top left, 1 top right, 2 bottom left, 3 bottom right. */
  const corner = (k: number, cw: number, ch: number): void => cut(k & 1 ? w - cw : 0, k & 2 ? h - ch : 0, cw, ch);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const small = w < 6 || h < 5;
  const kind = small && shape !== 'rect' ? 'notched' : shape;
  if (kind === 'notched') {
    for (let k = 0; k < 4; k++) if (rnd() < 0.55) corner(k, 1 + pick(Math.max(1, Math.floor(w / 4))), 1 + pick(Math.max(1, Math.floor(h / 4))));
  } else if (kind === 'ell') {
    corner(pick(4), Math.floor(w * (0.4 + rnd() * 0.15)), Math.floor(h * (0.4 + rnd() * 0.15)));
  } else if (kind === 'tee') {
    const cw = Math.floor(w * 0.3);
    const ch = Math.floor(h * 0.4);
    // the two corners of one side: top, bottom, left or right
    const side = pick(4);
    const pair = side === 0 ? [0, 1] : side === 1 ? [2, 3] : side === 2 ? [0, 2] : [1, 3];
    for (const k of pair) corner(k, side < 2 ? cw : Math.floor(w * 0.4), side < 2 ? ch : Math.floor(h * 0.3));
  } else if (kind === 'plus') {
    const cw = Math.max(1, Math.floor(w / 3));
    const ch = Math.max(1, Math.floor(h / 3));
    for (let k = 0; k < 4; k++) corner(k, cw, ch);
  } else if (kind === 'round') {
    const s = Math.max(1, Math.floor(Math.min(w, h) / 3));
    for (let k = 0; k < 4; k++) for (let i = 0; i < s; i++) corner(k, s - i, i + 1);
  }
  return m;
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

  const W = plan.cols;
  const H = plan.lines;
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('#'));
  const zone = new Int16Array(W * H).fill(-1);
  const key = (x: number, y: number): number => y * W + x;
  const floor = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '#';

  // ---- rooms: one to a place on the grid, some places left empty
  const [gc, gr] = plan.grid;
  const cw = Math.floor((W - 2) / gc);
  const ch = Math.floor((H - 2) / gr);
  const places = shuffled(Array.from({ length: gc * gr }, (_, i) => i))
    .slice(0, plan.rooms.length)
    .sort((a, b) => a - b);
  if (places.length < plan.rooms.length) return null;
  type Box = { x0: number; y0: number; x1: number; y1: number; lx: number; ly: number; cells: Cell[] };
  const boxes: Box[] = places.map((p, i) => {
    const cx = 1 + (p % gc) * cw;
    const cy = 1 + Math.floor(p / gc) * ch;
    // some rooms fill their place, some are smaller and sit anywhere in it
    const w = Math.max(4, cw - 3 - pick(Math.max(1, Math.floor((cw - 3) * 0.4))));
    const h = Math.max(4, ch - 3 - pick(Math.max(1, Math.floor((ch - 3) * 0.4))));
    const x0 = cx + 1 + pick(cw - 2 - w + 1);
    const y0 = cy + 1 + pick(ch - 2 - h + 1);
    const mask = shapeMask(plan.shapes[pick(plan.shapes.length)], w, h, rnd);
    const cells: Cell[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y][x]) continue;
        g[y0 + y][x0 + x] = '.';
        zone[key(x0 + x, y0 + y)] = i;
        cells.push({ x: x0 + x, y: y0 + y });
      }
    }
    // the square nearest the middle of the box: its name goes there, and passages start there
    const mx = x0 + (w - 1) / 2;
    const my = y0 + (h - 1) / 2;
    const mid = cells.reduce((b, c) => (Math.hypot(c.x - mx, c.y - my) < Math.hypot(b.x - mx, b.y - my) ? c : b));
    return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, lx: mid.x, ly: mid.y, cells };
  });
  const n = boxes.length;
  const gap = (a: number, b: number): number => Math.hypot(boxes[a].lx - boxes[b].lx, boxes[a].ly - boxes[b].ly);

  // ---- which rooms are joined: the shortest set that joins them all, then two ways out of every room, then loops
  const linked = new Set<string>();
  const ways = Array<number>(n).fill(0);
  const link = (a: number, b: number): void => {
    linked.add(`${Math.min(a, b)},${Math.max(a, b)}`);
    ways[a]++;
    ways[b]++;
  };
  const isLinked = (a: number, b: number): boolean => linked.has(`${Math.min(a, b)},${Math.max(a, b)}`);
  const inTree = new Set([0]);
  while (inTree.size < n) {
    let best: [number, number] | null = null;
    for (const a of inTree) for (let b = 0; b < n; b++) if (!inTree.has(b) && (!best || gap(a, b) < gap(best[0], best[1]))) best = [a, b];
    link(best![0], best![1]);
    inTree.add(best![1]);
  }
  for (let a = 0; a < n; a++) {
    while (ways[a] < 2) {
      let b = -1;
      for (let c = 0; c < n; c++) if (c !== a && !isLinked(a, c) && (b < 0 || gap(a, c) < gap(a, b))) b = c;
      if (b < 0) break;
      link(a, b);
    }
  }
  const spare: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!isLinked(a, b)) spare.push([a, b]);
  spare.sort((p, q) => gap(p[0], p[1]) - gap(q[0], q[1]));
  for (const [a, b] of shuffled(spare.slice(0, plan.loops * 2)).slice(0, plan.loops)) link(a, b);

  // ---- the passages: an L from the middle of one room to the middle of the other, two or three wide
  const carve = (x: number, y: number): void => {
    if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return;
    if (g[y][x] === '#') g[y][x] = '.';
  };
  for (const pair of linked) {
    const [a, b] = pair.split(',').map(Number);
    const A = boxes[a];
    const B = boxes[b];
    const wide = plan.halls[pick(plan.halls.length)];
    const lo = -Math.floor((wide - 1) / 2);
    const across = rnd() < 0.5;
    // first along one line, then the other
    const corner = across ? { x: B.lx, y: A.ly } : { x: A.lx, y: B.ly };
    const leg = (from: Cell, to: Cell): void => {
      const flat = from.y === to.y;
      const s0 = flat ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
      const s1 = flat ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
      for (let s = s0 + lo; s <= s1 + lo + wide - 1; s++) {
        for (let k = lo; k < lo + wide; k++) carve(flat ? s : from.x + k, flat ? from.y + k : s);
      }
    };
    leg({ x: A.lx, y: A.ly }, corner);
    leg(corner, { x: B.lx, y: B.ly });
  }

  /** Squares of a passage, and the squares of a room right beside one: nothing is ever put on them. */
  const keep = new Set<number>();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g[y][x] === '#' || zone[key(x, y)] >= 0) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) keep.add(key(x + dx, y + dy));
    }
  }

  // ---- furniture: thin pieces, each with clear floor all round it, so it can always be walked round
  boxes.forEach((room, i) => {
    const want = Math.round((room.cells.length * plan.clutter) / 40);
    let placed = 0;
    for (let tries = 0; tries < want * 15 && placed < want; tries++) {
      const at = room.cells[pick(room.cells.length)];
      const piece = FURNITURE[pick(FURNITURE.length)].map((c) => ({ x: at.x + c.x, y: at.y + c.y }));
      const mine = new Set(piece.map((c) => key(c.x, c.y)));
      let clear = true;
      for (const c of piece) {
        for (let dy = -1; dy <= 1 && clear; dy++) {
          for (let dx = -1; dx <= 1 && clear; dx++) {
            const x = c.x + dx;
            const y = c.y + dy;
            if (mine.has(key(x, y))) continue;
            if (!floor(x, y) || zone[key(x, y)] !== i || keep.has(key(x, y))) clear = false;
          }
        }
        if (!floor(c.x, c.y) || keep.has(key(c.x, c.y)) || zone[key(c.x, c.y)] !== i) clear = false;
      }
      if (!clear) continue;
      for (const c of piece) {
        g[c.y][c.x] = '#';
        zone[key(c.x, c.y)] = -1;
      }
      placed++;
    }
  });

  // ---- no squeezing between two walls that only touch at a corner: open one of them up
  for (let pass = 0, changed = true; changed && pass < 20; pass++) {
    changed = false;
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const a = floor(x, y);
        const b = floor(x + 1, y);
        const c = floor(x, y + 1);
        const d = floor(x + 1, y + 1);
        if (a && d && !b && !c) {
          if (x + 1 <= W - 2 && y >= 1) g[y][x + 1] = '.';
          else g[y + 1][x] = '.';
          changed = true;
        } else if (b && c && !a && !d) {
          if (x >= 1 && y >= 1) g[y][x] = '.';
          else g[y + 1][x + 1] = '.';
          changed = true;
        }
      }
    }
  }

  // ---- steps through the floor from a square
  const stepsFrom = (sx: number, sy: number): Int32Array => {
    const dist = new Int32Array(W * H).fill(-1);
    const todo = [key(sx, sy)];
    dist[todo[0]] = 0;
    for (let head = 0; head < todo.length; head++) {
      const at = todo[head];
      const x = at % W;
      const y = (at - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(x + dx, y + dy);
        if (!floor(x + dx, y + dy) || dist[k] >= 0) continue;
        dist[k] = dist[at] + 1;
        todo.push(k);
      }
    }
    return dist;
  };

  // ---- the things a round needs
  const taken: Cell[] = [];
  const apart = (x: number, y: number, from: Cell[], by: number): boolean => from.every((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) >= by);
  /** A free square of room `i`, at least `gapBy` from everything placed so far; the best by `score`, or any. */
  const spot = (i: number, gapBy: number, score?: (c: Cell) => number): Cell | null => {
    const found = boxes[i].cells.filter((c) => g[c.y][c.x] === '.' && !keep.has(key(c.x, c.y)) && apart(c.x, c.y, taken, gapBy));
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

  // the Cousins start in the biggest room; the Beast's den is the room furthest from it on foot
  const size = boxes.map((b) => b.cells.length);
  const hall = size.indexOf(Math.max(...size));
  const fromHall = stepsFrom(boxes[hall].lx, boxes[hall].ly);
  const far = boxes.map((b) => fromHall[key(b.lx, b.ly)]);
  if (far.some((d) => d < 0)) return null;
  const den = far.indexOf(Math.max(...far));
  if (!put('B', spot(den, 1, (c) => fromHall[key(c.x, c.y)]))) return null;
  const denAt = taken[0];

  // start places: the hall first, then the rooms nearest it
  const byNear = boxes.map((_, i) => i).filter((i) => i !== den).sort((a, b) => far[a] - far[b]);
  const starts: Cell[] = [];
  for (const i of byNear) {
    while (starts.length < START_SPOTS) {
      const c = spot(i, 2);
      if (!c || !put('c', c)) break;
      starts.push(c);
    }
    if (starts.length >= START_SPOTS) break;
  }
  if (starts.length < START_SPOTS - 1) return null;

  // Beast doors: three pairs, each joining two rooms far apart, spread over as many rooms as there are
  const used = boxes.map(() => 0);
  for (let k = 1; k <= 3; k++) {
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const score = gap(a, b) - 100 * (used[a] + used[b]) + rnd();
        if (score > bestScore) {
          bestScore = score;
          best = [a, b];
        }
      }
    }
    if (!best) return null;
    for (const i of best) {
      used[i]++;
      if (!put(String(k), spot(i, 3))) return null;
    }
  }

  const others = boxes.map((_, i) => i).filter((i) => i !== den);
  // exits: two, in rooms as far from each other as can be, each at the far edge of the house
  let pair: [number, number] = [others[0], others[others.length - 1]];
  for (const a of others) for (const b of others) if (a < b && gap(a, b) > gap(pair[0], pair[1])) pair = [a, b];
  for (const i of pair) {
    if (!put('E', spot(i, 3, (c) => Math.hypot(c.x - W / 2, c.y - H / 2) + rnd() * 0.5))) return null;
  }

  // chores: shared out over the rooms, well apart
  const tasks: Cell[] = [];
  const order = shuffled(others);
  for (let i = 0; tasks.length < TASKS_MAX && i < order.length * 4; i++) {
    const c = spot(order[i % order.length], 2);
    if (c && apart(c.x, c.y, tasks, 5) && put('T', c)) tasks.push(c);
  }
  if (tasks.length < TASKS_MAX) return null;

  const pills: Cell[] = [];
  const pillRooms = shuffled(others);
  for (let i = 0; pills.length < plan.pills && i < pillRooms.length * 4; i++) {
    const c = spot(pillRooms[i % pillRooms.length], 2);
    if (c && apart(c.x, c.y, pills, 4) && put('o', c)) pills.push(c);
  }
  if (pills.length < Math.min(plan.pills, 6)) return null;

  // ---- traps: in rooms, and now and then right across a passage
  const passage: Cell[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && zone[key(x, y)] < 0) passage.push({ x, y });
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
        const ch2 = g[y + dy][x + dx];
        if (seen[k] || ch2 === '#' || ch2 === '^') continue;
        seen[k] = 1;
        todo.push(k);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] !== '#' && g[y][x] !== '^' && !seen[key(x, y)]) return false;
    return true;
  };
  const patch = (ch2: string, shapes: number[][], count: number, check?: () => boolean): void => {
    let placed = 0;
    for (let tries = 0; tries < count * 40 && placed < count; tries++) {
      const inPassage = passage.length > 0 && rnd() < 0.3;
      const room = others[pick(others.length)];
      const at = inPassage ? passage[pick(passage.length)] : boxes[room].cells[pick(boxes[room].cells.length)];
      const [w, h] = shapes[pick(shapes.length)];
      const cells: Cell[] = [];
      for (let y = at.y; y < at.y + h; y++) for (let x = at.x; x < at.x + w; x++) cells.push({ x, y });
      // never where somebody starts, never touching another special square, all in the one room or passage
      const where = inPassage ? -1 : room;
      if (!cells.every((c) => floor(c.x, c.y) && g[c.y][c.x] === '.' && zone[key(c.x, c.y)] === where && (inPassage || !keep.has(key(c.x, c.y))) && apart(c.x, c.y, starts, 3) && apart(c.x, c.y, taken, 2))) continue;
      for (const c of cells) g[c.y][c.x] = ch2;
      if (check && !check()) {
        for (const c of cells) g[c.y][c.x] = '.';
        continue;
      }
      placed++;
    }
  };
  patch('~', GOO, plan.goo);
  patch('^', SPIKES, plan.spikes, wayRound);
  // creaky boards go anywhere, passages included: that is where they are worst
  for (let placed = 0, tries = 0; placed < plan.creaks && tries < plan.creaks * 40; tries++) {
    const x = 1 + pick(W - 2);
    const y = 1 + pick(H - 2);
    if (g[y][x] !== '.' || !apart(x, y, starts, 2)) continue;
    g[y][x] = '!';
    placed++;
  }

  // ---- is it a fair map?
  const rooms: Room[] = boxes.map((b, i) => ({ name: plan.rooms[i], x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lx: b.lx, ly: b.ly, ways: ways[i] }));
  // a square opened up between two corner-touching walls belongs to no room
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === '#') zone[key(x, y)] = -1;
  // trim the empty outside down to a single wall all round
  let cx0 = W;
  let cy0 = H;
  let cx1 = 0;
  let cy1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] === '#') continue;
      cx0 = Math.min(cx0, x - 1);
      cy0 = Math.min(cy0, y - 1);
      cx1 = Math.max(cx1, x + 1);
      cy1 = Math.max(cy1, y + 1);
    }
  }
  const cut = new Int16Array((cx1 - cx0 + 1) * (cy1 - cy0 + 1));
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) cut[(y - cy0) * (cx1 - cx0 + 1) + (x - cx0)] = zone[key(x, y)];
  for (const r of rooms) {
    r.x0 -= cx0;
    r.x1 -= cx0;
    r.y0 -= cy0;
    r.y1 -= cy0;
    r.lx! -= cx0;
    r.ly! -= cy0;
  }
  const map = parseMap(
    g.slice(cy0, cy1 + 1).map((row) => row.slice(cx0, cx1 + 1).join('')),
    { name: plan.name, rooms, look: plan.look, zone: cut },
  );
  // no Cousin starts where the Beast can see them, or within a few strides of it
  for (const s of map.cousinStarts) {
    if (sees(map, map.den.x, map.den.y, s.x, s.y)) return null;
    if (Math.hypot(s.x - map.den.x, s.y - map.den.y) < 10 * TILE) return null;
  }
  if (map.portals.length !== 6 || map.exits.length !== 2) return null;
  return map;
}
