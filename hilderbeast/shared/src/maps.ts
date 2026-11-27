/**
 * Every map there is, laid out from the plans below (`mapgen.ts`) and built the same on both
 * sides. The hand-laid Old House in `map.ts` is not played any more: it is the house the rules
 * are tested on (`MAP`), where the tests know their way about.
 */
import { oldHouse, type GameMap } from './map.js';
import { generate, type Plan } from './mapgen.js';

const PLANS: Plan[] = [
  {
    // nine rooms of an old family house, round a big hall
    name: 'The Old House',
    seed: 101,
    cols: 52,
    lines: 34,
    grid: [4, 3],
    rooms: ['Kitchen', 'Library', 'Nursery', 'Workshop', 'Hall', 'Parlour', 'Cellar', 'Porch', 'Greenhouse'],
    shapes: ['rect', 'notched', 'notched', 'ell', 'tee', 'round'],
    halls: [2, 2, 3],
    loops: 3,
    clutter: 1.4,
    goo: 4,
    spikes: 4,
    creaks: 8,
    pills: 10,
    look: { floors: ['#5a4a3a', '#4b4458', '#5b4a55', '#4a4f47', '#5f5540', '#57424a', '#3d3f52', '#4f5a4c', '#46584f'], wall: '#2a2440', wallTop: '#544a78', hall: '#3a3346' },
  },
  {
    // a few big rooms and wide breezeways: long sight lines, plenty to dodge round
    name: 'The Barn',
    seed: 211,
    cols: 54,
    lines: 34,
    grid: [3, 3],
    rooms: ['Hayloft', 'Stalls', 'Tack Room', 'Threshing Floor', 'Grain Store', 'Pig Pen', 'Cart Shed'],
    shapes: ['rect', 'rect', 'ell', 'notched', 'tee'],
    halls: [3, 3, 2],
    loops: 2,
    clutter: 2.2,
    goo: 5,
    spikes: 5,
    creaks: 6,
    pills: 10,
    look: { floors: ['#6b5433', '#73603a', '#5f4c2e', '#7a6540'], wall: '#3a2a1a', wallTop: '#8a5c32', hall: '#4e3c24' },
  },
  {
    // many small vaults off narrow passages
    name: 'The Wine Cellars',
    seed: 307,
    cols: 54,
    lines: 36,
    grid: [5, 4],
    rooms: ['Reds', 'Whites', 'Casks', 'Cork Room', 'Press', 'Tasting Room', 'Vault', 'Bottling', 'Crates', 'Racks', 'Coal Hole', 'Ice Room', 'Sherry Store'],
    shapes: ['rect', 'notched', 'round', 'round', 'ell'],
    halls: [2],
    loops: 4,
    clutter: 1.2,
    goo: 4,
    spikes: 6,
    creaks: 8,
    pills: 12,
    look: { floors: ['#3f3a44', '#463f3a', '#3a4046', '#40384a'], wall: '#1d1a22', wallTop: '#5a5560', hall: '#2c2830' },
  },
  {
    // little clearings joined by green lanes, with loops everywhere
    name: 'The Hedge Maze',
    seed: 401,
    cols: 56,
    lines: 36,
    grid: [5, 4],
    rooms: ['Fountain', 'Sundial', 'Rose Bed', 'Topiary', 'Bench', 'Statue', 'Gazebo', 'Pond', 'Arbour', 'Birdbath', 'Herb Patch', 'Folly', 'Lily Pool', 'Yew Walk'],
    shapes: ['round', 'plus', 'notched', 'round'],
    halls: [2, 2, 3],
    loops: 6,
    clutter: 0.8,
    goo: 5,
    spikes: 7,
    creaks: 6,
    pills: 13,
    look: { floors: ['#4a5a3a', '#506040', '#445536'], wall: '#16321c', wallTop: '#2f7a3a', hall: '#3a4a2c' },
  },
  {
    // long rooms under the roof, and every board creaks
    name: 'The Attic',
    seed: 503,
    cols: 54,
    lines: 32,
    grid: [3, 3],
    rooms: ['Trunk Room', 'Dormer', 'Rafters', 'Dust Sheets', 'Toy Loft', 'Water Tank', 'Chimney Breast'],
    shapes: ['rect', 'ell', 'ell', 'tee', 'notched'],
    halls: [2],
    loops: 2,
    clutter: 1.8,
    goo: 2,
    spikes: 4,
    creaks: 18,
    pills: 10,
    look: { floors: ['#5c4a3e', '#665244', '#54443a'], wall: '#2e2420', wallTop: '#8a6a52', hall: '#4a3a30' },
  },
  {
    // rooms out on the water, joined by jetties: slippery
    name: 'The Boathouse',
    seed: 601,
    cols: 54,
    lines: 34,
    grid: [4, 3],
    rooms: ['Slipway', 'Net Loft', 'Rope Store', 'Workbench', 'Dry Dock', 'Jetty', 'Lock Keeper', 'Bait Shed'],
    shapes: ['rect', 'ell', 'notched', 'tee'],
    halls: [2, 3],
    loops: 3,
    clutter: 1.4,
    goo: 10,
    spikes: 3,
    creaks: 5,
    pills: 10,
    look: { floors: ['#3d5560', '#44606a', '#375058'], wall: '#162a33', wallTop: '#3f7f95', hall: '#2c4048' },
  },
  {
    // round tents and wide midways between them: nowhere to hide for long
    name: 'The Fairground',
    seed: 701,
    cols: 56,
    lines: 36,
    grid: [4, 3],
    rooms: ['Carousel', 'Coconut Shy', 'Helter Skelter', 'Ghost Train', 'Big Top', 'Dodgems', 'Candy Floss', 'Hall of Mirrors', 'Strongman'],
    shapes: ['round', 'round', 'plus', 'notched'],
    halls: [3],
    loops: 4,
    clutter: 1.2,
    goo: 4,
    spikes: 7,
    creaks: 4,
    pills: 12,
    look: { floors: ['#5a3d55', '#604a3a', '#3d4f60', '#5a5a3a'], wall: '#2a1430', wallTop: '#c0507a', hall: '#3a2a3a' },
  },
  {
    // grand rooms and long, narrow corridors between them
    name: 'The Old Hotel',
    seed: 809,
    cols: 56,
    lines: 34,
    grid: [5, 3],
    rooms: ['Lobby', 'Dining Room', 'Ballroom', 'Bar', 'Linen', 'Lift', 'Boot Room', 'Kitchens', 'Laundry', 'Coal Store', 'Suite'],
    shapes: ['rect', 'rect', 'tee', 'notched', 'ell'],
    halls: [2],
    loops: 3,
    clutter: 1.4,
    goo: 4,
    spikes: 6,
    creaks: 10,
    pills: 12,
    look: { floors: ['#5a2f3a', '#4f3340', '#5f3a34'], wall: '#241018', wallTop: '#9a7a3a', hall: '#3a2228' },
  },
];

export const MAPS: GameMap[] = PLANS.map(generate);

/** The hand-laid house the rules are tested on. Not one of `MAPS`: nobody plays it. */
export const MAP = oldHouse();
