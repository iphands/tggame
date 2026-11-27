/**
 * Every map there is. The Old House is laid out by hand (`map.ts`); the rest are laid out from
 * the plans below (`mapgen.ts`). All are 40 squares by 26, and built the same on both sides.
 */
import { oldHouse, type GameMap } from './map.js';
import { generate, type Plan } from './mapgen.js';

const PLANS: Plan[] = [
  {
    // four big rooms full of bales: long sight lines, plenty to dodge round
    name: 'The Barn',
    seed: 11,
    cols: [18, 19],
    rows: [11, 12],
    rooms: ['Hayloft', 'Stalls', 'Tack Room', 'Threshing Floor'],
    den: 0,
    halls: [3],
    door: 3,
    shut: 0,
    clutter: 3.2,
    goo: 4,
    spikes: 5,
    creaks: 6,
    pills: 9,
    look: { floors: ['#6b5433', '#73603a', '#5f4c2e', '#7a6540'], wall: '#3a2a1a', wallTop: '#8a5c32' },
  },
  {
    // twelve small vaults and not every wall has a way through
    name: 'The Wine Cellars',
    seed: 23,
    cols: [9, 9, 9, 8],
    rows: [7, 8, 7],
    rooms: ['Reds', 'Whites', 'Casks', 'Cork Room', 'Press', 'Tasting Room', 'Vault', 'Bottling', 'Crates', 'Racks', 'Coal Hole', 'Ice Room'],
    den: 0,
    halls: [6, 7],
    door: 2,
    shut: 0.35,
    clutter: 1.6,
    goo: 4,
    spikes: 6,
    creaks: 8,
    pills: 10,
    look: { floors: ['#3f3a44', '#463f3a', '#3a4046', '#40384a'], wall: '#1d1a22', wallTop: '#5a5560' },
  },
  {
    // twenty little clearings: a maze, with spikes in the hedges
    name: 'The Hedge Maze',
    seed: 37,
    cols: [7, 7, 7, 7, 6],
    rows: [5, 5, 5, 6],
    den: 0,
    halls: [12, 13, 7],
    door: 2,
    shut: 0.45,
    clutter: 1,
    goo: 5,
    spikes: 8,
    creaks: 6,
    pills: 12,
    look: { floors: ['#4a5a3a', '#506040', '#445536'], wall: '#16321c', wallTop: '#2f7a3a' },
  },
  {
    // six long rooms under the roof, and every board creaks
    name: 'The Attic',
    seed: 41,
    cols: [19, 18],
    rows: [7, 8, 7],
    rooms: ['Trunk Room', 'Dormer', 'Rafters', 'Dust Sheets', 'Toy Loft', 'Water Tank'],
    den: 0,
    halls: [3],
    door: 2,
    shut: 0,
    clutter: 2.6,
    goo: 2,
    spikes: 4,
    creaks: 16,
    pills: 9,
    look: { floors: ['#5c4a3e', '#665244', '#54443a'], wall: '#2e2420', wallTop: '#8a6a52' },
  },
  {
    // six rooms on the water: slippery
    name: 'The Boathouse',
    seed: 53,
    cols: [12, 12, 12],
    rows: [11, 12],
    rooms: ['Slipway', 'Net Loft', 'Rope Store', 'Workbench', 'Dry Dock', 'Jetty'],
    den: 0,
    halls: [4],
    door: 2,
    shut: 0,
    clutter: 2.4,
    goo: 9,
    spikes: 3,
    creaks: 5,
    pills: 9,
    look: { floors: ['#3d5560', '#44606a', '#375058'], wall: '#162a33', wallTop: '#3f7f95' },
  },
  {
    // eight stalls with wide open fronts: nowhere to hide for long
    name: 'The Fairground',
    seed: 67,
    cols: [9, 9, 9, 8],
    rows: [11, 12],
    rooms: ['Carousel', 'Coconut Shy', 'Helter Skelter', 'Ghost Train', 'Big Top', 'Dodgems', 'Candy Floss', 'Hall of Mirrors'],
    den: 0,
    halls: [6],
    door: 4,
    shut: 0,
    clutter: 2,
    goo: 4,
    spikes: 7,
    creaks: 4,
    pills: 10,
    look: { floors: ['#5a3d55', '#604a3a', '#3d4f60', '#5a5a3a'], wall: '#2a1430', wallTop: '#c0507a' },
  },
  {
    // grand rooms in the middle, narrow back stairs down both sides
    name: 'The Old Hotel',
    seed: 79,
    cols: [5, 12, 12, 6],
    rows: [7, 8, 7],
    rooms: ['West Stair', 'Lobby', 'Dining Room', 'East Stair', 'Linen', 'Ballroom', 'Bar', 'Lift', 'Boot Room', 'Kitchens', 'Laundry', 'Coal Store'],
    den: 8,
    halls: [5, 6],
    door: 2,
    shut: 0.3,
    clutter: 2,
    goo: 4,
    spikes: 6,
    creaks: 8,
    pills: 10,
    look: { floors: ['#5a2f3a', '#4f3340', '#5f3a34'], wall: '#241018', wallTop: '#9a7a3a' },
  },
];

export const MAPS: GameMap[] = [oldHouse(), ...PLANS.map(generate)];

/** The Old House: the map the rules are tested on. */
export const MAP = MAPS[0];
