/**
 * The house. Nine rooms in a three by three grid, every wall between neighbours has a doorway,
 * so there is always a second way out. Both sides read this file: nothing about the walls ever
 * travels over the socket.
 *
 * `#` wall, `.` floor, `c` a Cousin's start, `B` the Beast's den, `o` an energy pill,
 * `1` `2` `3` the two ends of a Beast door, `T` a chore, `E` an exit.
 */
import { TILE } from './constants.js';

/** Each room is 12 squares wide; the top and bottom rows of rooms are 7 tall, the middle row 8. */
const ROOMS: { name: string; rows: string[] }[][] = [
  [
    {
      name: 'Kitchen',
      rows: ['............', '.1..........', '....##...T..', '....##......', '........##..', '..o.....##..', '............'],
    },
    {
      name: 'Library',
      rows: ['......E.....', '..####..o...', '............', '......####..', '............', '..####...T..', '............'],
    },
    {
      name: 'Nursery',
      rows: ['............', '...T......2.', '..##........', '..##...##...', '.......##...', '....o.......', '............'],
    },
  ],
  [
    {
      name: 'Workshop',
      rows: ['............', '..##....o...', '..##........', '.......##...', '.......##...', '..T.........', '.........3..', '............'],
    },
    {
      name: 'Hall',
      rows: ['............', '..c..c..c...', '............', '.c..####..c.', '.c..####..c.', '......o.....', '..c..c..c...', '............'],
    },
    {
      name: 'Parlour',
      rows: ['............', '...o....##..', '........##..', '..##........', '..##........', '.......T....', '.1..........', '............'],
    },
  ],
  [
    {
      name: 'Cellar',
      rows: ['............', '..2.....##..', '........##..', '...##.......', '...##....o..', '.B..........', '............'],
    },
    {
      name: 'Porch',
      rows: ['............', '....o.......', '..##....##..', '..##....##..', '.....T......', '............', '......E.....'],
    },
    {
      name: 'Greenhouse',
      rows: ['............', '..##...o....', '..##........', '.......##...', '..T....##...', '.........3..', '............'],
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
export type Room = { name: string; x0: number; y0: number; x1: number; y1: number };

export type GameMap = {
  rows: string[];
  /** Squares across and down. */
  cols: number;
  lines: number;
  /** World size. */
  w: number;
  h: number;
  /** 1 where a square is wall, row by row. */
  solid: Uint8Array;
  cousinStarts: Spot[];
  den: Spot;
  pills: Spot[];
  /** Beast doors: `portals[i]` leads to `portals[i ^ 1]`. */
  portals: Spot[];
  tasks: Spot[];
  exits: Spot[];
  rooms: Room[];
};

const centre = (c: number, r: number): Spot => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });

export function parseMap(rows: string[]): GameMap {
  const cols = rows[0].length;
  const lines = rows.length;
  const solid = new Uint8Array(cols * lines);
  const cousinStarts: Spot[] = [];
  const pills: Spot[] = [];
  const tasks: Spot[] = [];
  const exits: Spot[] = [];
  const ends = new Map<string, Spot[]>();
  let den: Spot = centre(1, 1);
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`map row ${r} is ${row.length} wide, not ${cols}`);
    [...row].forEach((ch, c) => {
      if (ch === '#') solid[r * cols + c] = 1;
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
  return { rows, cols, lines, w: cols * TILE, h: lines * TILE, solid, cousinStarts, den, pills, portals, tasks, exits, rooms: [] };
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

export const MAP: GameMap = { ...parseMap(build()), rooms: rooms() };

/** Is the square at column `c`, row `r` a wall? Everything off the map is. */
export function wallAt(map: GameMap, c: number, r: number): boolean {
  return c < 0 || r < 0 || c >= map.cols || r >= map.lines || map.solid[r * map.cols + c] === 1;
}

/** The room a point is in, or the nearest one when it stands in a doorway. */
export function roomAt(map: GameMap, x: number, y: number): Room {
  const c = x / TILE;
  const r = y / TILE;
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
