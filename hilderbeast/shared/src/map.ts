/**
 * The house. Nine rooms in a three by three grid, every wall between neighbours has a doorway,
 * so there is always a second way out. Both sides read this file: nothing about the walls ever
 * travels over the socket.
 *
 * `#` wall, `.` floor, `c` a Cousin's start, `B` the Beast's den, `o` an energy pill,
 * `1` `2` `3` the two ends of a Beast door, `T` a chore, `E` an exit; and the traps, which only
 * ever trouble Cousins: `~` goo, `^` spikes, `!` a creaky board.
 *
 * This file holds what a map is and the one map laid out by hand, the Old House. The others are
 * laid out from plans by `mapgen.ts`; `maps.ts` lists them all.
 */
import { SPIKE_CYCLE_MS, SPIKE_UP_AT_MS, SPIKE_WARN_AT_MS, TILE, WALL_T } from './constants.js';

/** Each room is 12 squares wide; the top and bottom rows of rooms are 7 tall, the middle row 8. */
const ROOMS: { name: string; rows: string[] }[][] = [
  [
    {
      name: 'Kitchen',
      rows: ['......~~....', '.1....~~....', '....##...T..', '....##......', '........##..', '..o.....##..', '............'],
    },
    {
      name: 'Library',
      rows: ['......E.....', '..####..o...', '....^^......', '......####..', '..........^.', '..####...T..', '............'],
    },
    {
      name: 'Nursery',
      rows: ['............', '...T......2.', '..##........', '..##...##...', '.......##...', '....o.......', '.....!......'],
    },
  ],
  [
    {
      name: 'Workshop',
      rows: ['............', '..##....o...', '..##........', '.......##...', '.......##...', '..T....~~~..', '.........3..', '............'],
    },
    {
      name: 'Hall',
      rows: ['............', '..c..c..c...', '............', '.c..####..c.', '.c..####..c.', '......o.....', '..c..c..c...', '.....!!.....'],
    },
    {
      name: 'Parlour',
      rows: ['......!.....', '...o....##..', '........##..', '..##........', '..##........', '.......T....', '.1..........', '............'],
    },
  ],
  [
    {
      name: 'Cellar',
      rows: ['............', '..2.....##..', '........##..', '...##.......', '...##....o..', '.B..........', '............'],
    },
    {
      name: 'Porch',
      rows: ['............', '....o.......', '..##....##..', '..##....##..', '.....T......', '...^....^...', '......E.....'],
    },
    {
      name: 'Greenhouse',
      rows: ['....~~~.....', '..##...o....', '..##........', '.......##...', '..T....##...', '.........3..', '............'],
    },
  ],
];

const ROOM_W = 12;
/** Rows (within a room) where the wall to the next room east has its doorway. */
const SIDE_DOOR = [
  [2, 3],
  [3, 4],
  [3, 4],
];
/** Columns (within a room) where the wall to the next room south has its doorway. */
const DOWN_DOOR = [5, 6];

function build(): string[] {
  const out: string[] = [];
  const solid = '#'.repeat(ROOM_W * 3 + 4);
  out.push(solid);
  ROOMS.forEach((band, r) => {
    band[0].rows.forEach((_, i) => {
      const gap = SIDE_DOOR[r].includes(i) ? '.' : '#';
      out.push(`#${band[0].rows[i]}${gap}${band[1].rows[i]}${gap}${band[2].rows[i]}#`);
    });
    if (r < ROOMS.length - 1) {
      const wall = [...'#'.repeat(ROOM_W)].map((c, i) => (DOWN_DOOR.includes(i) ? '.' : c)).join('');
      out.push(`#${wall}#${wall}#${wall}#`);
    }
  });
  out.push(solid);
  return out;
}

export type Spot = { x: number; y: number };
/** A room, in squares: `x0..x1` and `y0..y1` inclusive. */
/**
 * A room, in squares: `x0..x1` and `y0..y1` inclusive are the box it fits in (it need not fill
 * it). `lx`, `ly` is a square inside it, where its name is written; `ways` is how many passages
 * lead out of it, when the map was laid out from a plan.
 */
export type Room = { name: string; x0: number; y0: number; x1: number; y1: number; lx?: number; ly?: number; ways?: number };

/** What a square is. */
export const T_FLOOR = 0;
export const T_WALL = 1;
/** Slows a Cousin who stands in it. */
export const T_GOO = 2;
/** Up and down by the clock: hurts a Cousin who is on it when it is up. */
export const T_SPIKE = 3;
/** Creaks under a Cousin, and the Beasts hear it. */
export const T_CREAK = 4;

/** The colours a map is drawn in. */
/** `hall`: the floor of the passages between rooms. */
export type Look = { floors: string[]; wall: string; wallTop: string; hall?: string };

export type GameMap = {
  name: string;
  rows: string[];
  /** Squares across and down. */
  cols: number;
  lines: number;
  /** World size. */
  w: number;
  h: number;
  /** 1 where a square is wall, row by row. */
  solid: Uint8Array;
  /** What each square is (`T_…`), row by row. */
  kind: Uint8Array;
  /**
   * The solid parts of each square, row by row, each `[x0, y0, x1, y1]` in world units: none for
   * floor, and for a wall square the thin bars that make it up (see `WALL_T`). This, not the
   * square, is what bodies bump into and sight stops at.
   */
  walls: number[][][];
  cousinStarts: Spot[];
  den: Spot;
  pills: Spot[];
  /** Beast doors: `portals[i]` leads to `portals[i ^ 1]`. */
  portals: Spot[];
  tasks: Spot[];
  exits: Spot[];
  rooms: Room[];
  /** Which room each square is in (an index into `rooms`), row by row; -1 for passages and walls. */
  zone: Int16Array;
  look: Look;
};

export const OLD_HOUSE_LOOK: Look = {
  floors: ['#5a4a3a', '#4b4458', '#5b4a55', '#4a4f47', '#5f5540', '#57424a', '#3d3f52', '#4f5a4c', '#46584f'],
  wall: '#2a2440',
  wallTop: '#544a78',
};

const centre = (c: number, r: number): Spot => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });

export function parseMap(rows: string[], meta: { name?: string; rooms?: Room[]; look?: Look; zone?: Int16Array } = {}): GameMap {
  const cols = rows[0].length;
  const lines = rows.length;
  const solid = new Uint8Array(cols * lines);
  const kind = new Uint8Array(cols * lines);
  const cousinStarts: Spot[] = [];
  const pills: Spot[] = [];
  const tasks: Spot[] = [];
  const exits: Spot[] = [];
  const ends = new Map<string, Spot[]>();
  let den: Spot = centre(1, 1);
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`map row ${r} is ${row.length} wide, not ${cols}`);
    [...row].forEach((ch, c) => {
      if (ch === '#') solid[r * cols + c] = kind[r * cols + c] = T_WALL;
      else if (ch === '~') kind[r * cols + c] = T_GOO;
      else if (ch === '^') kind[r * cols + c] = T_SPIKE;
      else if (ch === '!') kind[r * cols + c] = T_CREAK;
      else if (ch === 'c') cousinStarts.push(centre(c, r));
      else if (ch === 'B') den = centre(c, r);
      else if (ch === 'o') pills.push(centre(c, r));
      else if (ch === 'T') tasks.push(centre(c, r));
      else if (ch === 'E') exits.push(centre(c, r));
      else if (ch >= '1' && ch <= '9') ends.set(ch, [...(ends.get(ch) ?? []), centre(c, r)]);
    });
  });
  const portals: Spot[] = [];
  for (const key of [...ends.keys()].sort()) {
    const pair = ends.get(key)!;
    if (pair.length !== 2) throw new Error(`Beast door ${key} has ${pair.length} ends`);
    portals.push(pair[0], pair[1]);
  }
  // a wall square is a post in its middle, an arm to each neighbouring wall square, and a
  // filled corner wherever it is part of a solid block of four
  const isWall = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < lines && solid[r * cols + c] === 1;
  // a wall square with no floor anywhere round it is outside the house: nothing, not even a bar
  // (off the map counts as wall: the map's own edge is no reason to draw one)
  const outside = (c: number, r: number): boolean => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const x = c + dc;
        const y = r + dr;
        if (x >= 0 && y >= 0 && x < cols && y < lines && !isWall(x, y)) return false;
      }
    }
    return true;
  };
  /** A wall square on the edge of the floor somewhere: the only kind that is drawn and bumped into. */
  const edge = (c: number, r: number): boolean => isWall(c, r) && !outside(c, r);
  const half = WALL_T / 2;
  const walls: number[][][] = [];
  for (let r = 0; r < lines; r++) {
    for (let c = 0; c < cols; c++) {
      const out: number[][] = [];
      walls.push(out);
      if (!edge(c, r)) continue;
      const cx = (c + 0.5) * TILE;
      const cy = (r + 0.5) * TILE;
      out.push([cx - half, cy - half, cx + half, cy + half]);
      if (edge(c + 1, r)) out.push([cx, cy - half, (c + 1) * TILE, cy + half]);
      if (edge(c - 1, r)) out.push([c * TILE, cy - half, cx, cy + half]);
      if (edge(c, r + 1)) out.push([cx - half, cy, cx + half, (r + 1) * TILE]);
      if (edge(c, r - 1)) out.push([cx - half, r * TILE, cx + half, cy]);
      for (const dc of [-1, 1]) {
        for (const dr of [-1, 1]) {
          if (!edge(c + dc, r) || !edge(c, r + dr) || !edge(c + dc, r + dr)) continue;
          out.push([dc < 0 ? c * TILE : cx, dr < 0 ? r * TILE : cy, dc < 0 ? cx : (c + 1) * TILE, dr < 0 ? cy : (r + 1) * TILE]);
        }
      }
    }
  }
  return {
    name: meta.name ?? 'A yard',
    rows,
    cols,
    lines,
    w: cols * TILE,
    h: lines * TILE,
    solid,
    kind,
    walls,
    cousinStarts,
    den,
    pills,
    portals,
    tasks,
    exits,
    rooms: meta.rooms ?? [],
    zone: meta.zone ?? zoneOf(meta.rooms ?? [], cols, lines, solid),
    look: meta.look ?? OLD_HOUSE_LOOK,
  };
}

function rooms(): Room[] {
  const out: Room[] = [];
  let y0 = 1;
  for (const band of ROOMS) {
    band.forEach((room, i) => {
      const x0 = 1 + i * (ROOM_W + 1);
      out.push({ name: room.name, x0, y0, x1: x0 + ROOM_W - 1, y1: y0 + room.rows.length - 1 });
    });
    y0 += band[0].rows.length + 1;
  }
  return out;
}

/** The first map, and the only one laid out by hand. */
export const oldHouse = (): GameMap => parseMap(build(), { name: 'The Old House', rooms: rooms(), look: OLD_HOUSE_LOOK });

/**
 * Is the square at column `c`, row `r` a wall square? Everything off the map is. A wall square
 * is only partly solid (`GameMap.walls`); this is for things that go by squares, like the bots.
 */
export function wallAt(map: GameMap, c: number, r: number): boolean {
  return c < 0 || r < 0 || c >= map.cols || r >= map.lines || map.solid[r * map.cols + c] === 1;
}

/** What the square under the world point `(x, y)` is. */
export function kindAt(map: GameMap, x: number, y: number): number {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  return wallAt(map, c, r) ? T_WALL : map.kind[r * map.cols + c];
}

/** `SPIKES_DOWN`, `SPIKES_WARN` (about to come up: harmless, but look out) or `SPIKES_UP`. */
export const SPIKES_DOWN = 0;
export const SPIKES_WARN = 1;
export const SPIKES_UP = 2;

/**
 * What the spikes at column `c`, row `r` are doing `timeMs` into the round. Every set runs by
 * the same clock, with neighbours half a cycle apart, so a strip of them goes in waves and
 * there is always a moment to cross.
 */
export function spikesAt(timeMs: number, c: number, r: number): number {
  const t = (timeMs + ((c + r) % 2) * (SPIKE_CYCLE_MS / 2)) % SPIKE_CYCLE_MS;
  return t >= SPIKE_UP_AT_MS ? SPIKES_UP : t >= SPIKE_WARN_AT_MS ? SPIKES_WARN : SPIKES_DOWN;
}

/** Which room each floor square is in, for a map whose rooms are plain boxes. */
function zoneOf(rooms: Room[], cols: number, lines: number, solid: Uint8Array): Int16Array {
  const zone = new Int16Array(cols * lines).fill(-1);
  rooms.forEach((room, i) => {
    for (let r = room.y0; r <= room.y1; r++) for (let c = room.x0; c <= room.x1; c++) if (!solid[r * cols + c]) zone[r * cols + c] = i;
  });
  return zone;
}

/** Is the square at column `c`, row `r` outside the house: wall with no floor anywhere round it? */
export function outsideAt(map: GameMap, c: number, r: number): boolean {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (!wallAt(map, c + dc, r + dr)) return false;
  return true;
}

/** The room a point is in, or the nearest one when it stands in a doorway. */
export function roomAt(map: GameMap, x: number, y: number): Room {
  const c = x / TILE;
  const r = y / TILE;
  const ci = Math.floor(c);
  const ri = Math.floor(r);
  const z = ci >= 0 && ri >= 0 && ci < map.cols && ri < map.lines ? map.zone[ri * map.cols + ci] : -1;
  if (z >= 0) return map.rooms[z];
  let best = map.rooms[0];
  let bestD = Infinity;
  for (const room of map.rooms) {
    const dx = Math.max(room.x0 - c, 0, c - (room.x1 + 1));
    const dy = Math.max(room.y0 - r, 0, r - (room.y1 + 1));
    const d = dx + dy;
    if (d < bestD) {
      bestD = d;
      best = room;
    }
  }
  return best;
}
