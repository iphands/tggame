import { describe, expect, it } from 'vitest';
import {
  BASE_SPEED, BEAST_BOOST_COOLDOWN_MS, BEAST_BOOST_MS, CATCH_COOLDOWN_MS, CONVERT_MS, ENERGY_MAX, ENERGY_START,
  DASH_COOLDOWN_MS, DASH_MS, DASH_SPEED, F_BOOST, F_CONVERT, F_DASH, F_HURT, F_SLOW, GOO_SPEED, HURT_SPEED, SPIKE_CYCLE_MS, SPIKE_ENERGY, SPIKE_UP_AT_MS, SPIKE_WARN_AT_MS, NOISE_EVERY_MS, PILL_BACK_MS, PILL_ENERGY, PORTAL_COOLDOWN_MS, PORTAL_TRANSIT_MS, ROLE,
  TASK_WORK_MS, TICK_MS, TILE,
} from '../shared/src/constants';
import { parseMap, spikesAt } from '../shared/src/map';
import { MAP } from '../shared/src/maps';
import { speedOf } from '../shared/src/sim';
import { place, seeded, steps, world, YARD } from './helpers';

const at = (c: number, r: number) => [(c + 0.5) * TILE, (r + 0.5) * TILE] as const;

describe('boosts', () => {
  it('a Cousin boosts while the energy lasts, then walks', () => {
    const w = world(['beast', 'a'], 'last', YARD);
    const a = place(w, 'a', ...at(1, 4));
    a.energy = 25;
    w.setInput('a', 1, 0, true, false);
    steps(w, 500);
    expect(w.flags(a) & F_BOOST).toBeTruthy();
    expect(a.energy).toBeCloseTo(12.5, 0);
    steps(w, 700);
    expect(a.energy).toBe(0);
    expect(w.flags(a) & F_BOOST).toBeFalsy();
  });
  it('a Cousin standing still spends nothing', () => {
    const w = world(['beast', 'a'], 'last', YARD);
    const a = w.body('a')!;
    w.setInput('a', 0, 0, true, false);
    steps(w, 1000);
    expect(a.energy).toBe(ENERGY_START);
  });
  it("a Beast's burst is faster, shorter, and waits out a cooldown", () => {
    const w = world(['beast', 'a'], 'last', MAP);
    const b = place(w, 'beast', ...at(2, 1));
    place(w, 'a', ...at(30, 20));
    w.setInput('beast', 1, 0, true, false);
    const x0 = b.x;
    steps(w, 600);
    expect(b.x - x0).toBeCloseTo((BASE_SPEED * ROLE.beast.speed * ROLE.beast.boost * 600) / 1000, -1);
    steps(w, BEAST_BOOST_MS - 500);
    expect(w.flags(b) & F_BOOST).toBeFalsy();
    // holding the button does not start another
    steps(w, BEAST_BOOST_COOLDOWN_MS);
    expect(w.flags(b) & F_BOOST).toBeFalsy();
    w.setInput('beast', 0, 0, false, false);
    steps(w, TICK_MS);
    w.setInput('beast', 0, 0, true, false);
    steps(w, TICK_MS);
    expect(w.flags(b) & F_BOOST).toBeTruthy();
  });
  it('the Beast cannot burst again before the cooldown is over', () => {
    const w = world(['beast', 'a'], 'last', YARD);
    const b = w.body('beast')!;
    w.setInput('beast', 0, 0, true, false);
    steps(w, BEAST_BOOST_MS + 200);
    w.setInput('beast', 0, 0, false, false);
    steps(w, TICK_MS);
    w.setInput('beast', 0, 0, true, false);
    steps(w, TICK_MS);
    expect(w.flags(b) & F_BOOST).toBeFalsy();
  });
});

describe('pills', () => {
  it('fill a Cousin once, up to the cap, and come back later', () => {
    const w = world(['beast', 'a', 'c'], 'last', MAP);
    const pill = MAP.pills[0];
    const a = place(w, 'a', pill.x, pill.y);
    const c = place(w, 'c', pill.x, pill.y);
    a.energy = 80;
    c.energy = 10;
    steps(w, TICK_MS);
    expect(a.energy).toBe(ENERGY_MAX);
    expect(c.energy).toBe(10);
    expect(w.pillBits() & 1).toBe(0);
    expect(w.fx.filter((e) => e[0] === 'p')).toHaveLength(1);
    steps(w, PILL_BACK_MS + 50);
    expect(c.energy).toBe(10 + PILL_ENERGY);
  });
  it('are left alone by Beasts and by Cousins who are full', () => {
    const w = world(['beast', 'a'], 'last', MAP);
    const pill = MAP.pills[0];
    place(w, 'beast', pill.x, pill.y);
    place(w, 'a', pill.x, pill.y).energy = ENERGY_MAX;
    steps(w, 100);
    expect(w.pillBits() & 1).toBe(1);
  });
});

describe('catching', () => {
  it('is by touch: a Beast that reaches a Cousin has caught them, and they turn', () => {
    const w = world(['beast', 'a', 'c'], 'last', YARD);
    place(w, 'beast', ...at(1, 4));
    const a = place(w, 'a', ...at(3, 4));
    place(w, 'c', ...at(8, 1));
    steps(w, 200);
    expect(a.role).toBe('cousin');
    w.setInput('beast', 1, 0, false, false);
    steps(w, 400);
    expect(a.role).toBe('beast');
    expect(w.flags(a) & F_CONVERT).toBeTruthy();
    expect(w.catches).toEqual([expect.objectContaining({ by: 'beast', who: 'a' })]);
    // frozen and harmless while it turns
    w.setInput('a', 1, 0, false, true);
    const x = a.x;
    steps(w, CONVERT_MS - 600);
    expect(a.x).toBe(x);
    steps(w, 700);
    expect(w.flags(a) & F_CONVERT).toBeFalsy();
    expect(w.catches).toHaveLength(1);
  });
  it('does not reach through a wall', () => {
    const w = world(['beast', 'a'], 'last', YARD);
    place(w, 'beast', 5 * TILE - 14, 2.5 * TILE);
    const a = place(w, 'a', 6 * TILE + 14, 2.5 * TILE);
    w.setInput('beast', 1, 0, false, false);
    steps(w, 500);
    expect(a.role).toBe('cousin');
  });
  it('takes one Cousin at a time from a huddle, the nearest first', () => {
    const w = world(['beast', 'a', 'c', 'd'], 'last', YARD);
    place(w, 'beast', 3.5 * TILE - 20, 4.5 * TILE);
    place(w, 'a', 3.5 * TILE + 4, 4.5 * TILE);
    place(w, 'c', 3.5 * TILE, 4.5 * TILE);
    place(w, 'd', 3.5 * TILE + 2, 4.5 * TILE);
    steps(w, TICK_MS);
    expect(w.catches.map((c) => c.who)).toEqual(['c']);
    steps(w, CATCH_COOLDOWN_MS - 100);
    expect(w.catches).toHaveLength(1);
    steps(w, 200);
    expect(w.catches.map((c) => c.who)).toEqual(['c', 'd']);
  });
  it('is not open to a Beast still held in its den, or still turning', () => {
    const w = world(['beast', 'a', 'c'], 'last', YARD);
    const b = place(w, 'beast', ...at(2, 4));
    const a = place(w, 'a', b.x + 10, b.y);
    b.heldMs = 300;
    steps(w, 200);
    expect(a.role).toBe('cousin');
    steps(w, 200);
    expect(a.role).toBe('beast');
    // the new Beast is standing on another Cousin
    const c = place(w, 'c', a.x + 5, a.y);
    place(w, 'beast', ...at(8, 1));
    steps(w, CONVERT_MS - 600);
    expect(c.role).toBe('cousin');
    steps(w, 800);
    expect(c.role).toBe('beast');
  });
});

describe('the dash', () => {
  it('is a quick extra burst on its own cooldown', () => {
    const w = world(['beast', 'a'], 'last', MAP);
    const b = place(w, 'beast', ...at(15, 1));
    place(w, 'a', ...at(30, 20));
    w.setInput('beast', 1, 0, false, true);
    const x0 = b.x;
    steps(w, DASH_MS);
    expect(w.flags(b) & F_DASH).toBeTruthy();
    expect(b.x - x0).toBeCloseTo((BASE_SPEED * ROLE.beast.speed * DASH_SPEED * DASH_MS) / 1000, -1);
    expect(w.fx).toContainEqual(['l', 'beast']);
    steps(w, 100);
    expect(w.flags(b) & F_DASH).toBeFalsy();
    // not again until the cooldown is over
    w.setInput('beast', 0, 0, false, false);
    steps(w, TICK_MS);
    w.setInput('beast', 0, 0, false, true);
    steps(w, TICK_MS * 2);
    expect(w.flags(b) & F_DASH).toBeFalsy();
    w.setInput('beast', 0, 0, false, false);
    steps(w, DASH_COOLDOWN_MS);
    w.setInput('beast', 0, 0, false, true);
    steps(w, TICK_MS * 2);
    expect(w.flags(b) & F_DASH).toBeTruthy();
  });
  it('can be used together with the big boost', () => {
    const w = world(['beast', 'a'], 'last', YARD);
    const b = w.body('beast')!;
    place(w, 'a', ...at(8, 1));
    w.setInput('beast', 0, 0, true, true);
    steps(w, TICK_MS * 2);
    expect(w.flags(b) & F_DASH).toBeTruthy();
    expect(w.flags(b) & F_BOOST).toBeTruthy();
  });
});

describe('Beast doors', () => {
  it('carry a Beast to the other end, once per cooldown', () => {
    const w = world(['beast', 'a'], 'last', MAP);
    const [from, to] = MAP.portals;
    const b = place(w, 'beast', from.x, from.y);
    steps(w, TICK_MS);
    expect([b.x, b.y]).toEqual([to.x, to.y]);
    expect(b.portalMs).toBeGreaterThan(0);
    expect(w.fx).toContainEqual(['t', 'beast', 0, 1]);
    // out of sight and out of action on the way
    w.setInput('beast', 1, 0, false, true);
    steps(w, PORTAL_TRANSIT_MS - 100);
    expect([b.x, b.y]).toEqual([to.x, to.y]);
    expect(b.dashMs).toBe(0);
    w.setInput('beast', 0, 0, false, false);
    steps(w, PORTAL_COOLDOWN_MS - 200);
    expect([b.x, b.y]).toEqual([to.x, to.y]);
    steps(w, 400);
    expect([b.x, b.y]).toEqual([from.x, from.y]);
  });
  it('do nothing for a Cousin', () => {
    const w = world(['beast', 'a'], 'last', MAP);
    const from = MAP.portals[0];
    const a = place(w, 'a', from.x, from.y);
    steps(w, 500);
    expect([a.x, a.y]).toEqual([from.x, from.y]);
  });
});

describe('chores and exits', () => {
  function escapeWorld(ids = ['beast', 'a', 'c']) {
    const w = world(ids, 'escape', MAP, [0, 1]);
    place(w, 'beast', MAP.den.x, MAP.den.y);
    return w;
  }
  it('get done by standing still with the action held, and stay done', () => {
    const w = escapeWorld();
    const t = w.tasks[0];
    place(w, 'a', t.x + 20, t.y);
    w.setInput('a', 0, 0, false, true);
    steps(w, TASK_WORK_MS / 2);
    expect(t.progress).toBeCloseTo(0.5, 1);
    // walking off keeps what was done
    w.setInput('a', 1, 0, false, true);
    steps(w, 200);
    const kept = t.progress;
    expect(kept).toBeCloseTo(0.5, 1);
    w.setInput('a', 0, 0, false, false);
    steps(w, 500);
    expect(t.progress).toBe(kept);
  });
  it('go faster with help, but not twice as fast', () => {
    const w = escapeWorld();
    const t = w.tasks[0];
    place(w, 'a', t.x + 20, t.y);
    place(w, 'c', t.x - 20, t.y);
    w.setInput('a', 0, 0, false, true);
    w.setInput('c', 0, 0, false, true);
    steps(w, TASK_WORK_MS / 2);
    expect(t.progress).toBeGreaterThan(0.75);
    expect(t.progress).toBeLessThan(0.85);
  });
  it('are heard by the Beasts: at once, then every few seconds, never exactly', () => {
    const w = escapeWorld();
    const t = w.tasks[0];
    place(w, 'a', t.x, t.y);
    w.setInput('a', 0, 0, false, true);
    steps(w, TICK_MS);
    expect(w.fx.filter((e) => e[0] === 'n')).toHaveLength(1);
    steps(w, NOISE_EVERY_MS * 2 + 100);
    const noises = w.fx.filter((e) => e[0] === 'n');
    expect(noises).toHaveLength(3);
    expect(noises.some((e) => e[1] !== Math.round(t.x) || e[2] !== Math.round(t.y))).toBe(true);
  });
  it('open the exits only when every chore is done; then a Cousin can get out', () => {
    const w = escapeWorld();
    const exit = MAP.exits[0];
    const a = place(w, 'a', exit.x, exit.y);
    steps(w, 500);
    expect(a.out).toBe(false);
    w.tasks[0].progress = 1;
    w.tasks[1].progress = 0.999;
    const c = place(w, 'c', w.tasks[1].x, w.tasks[1].y);
    w.setInput('c', 0, 0, false, true);
    steps(w, 100, seeded(3));
    expect(w.exitsOpen).toBe(true);
    expect(w.fx).toContainEqual(['o']);
    expect(c.out).toBe(false);
    // a touch is enough: nothing to hold
    expect(a.out).toBe(true);
    expect(w.escaped).toEqual(['a']);
    expect(w.cousins().map((b) => b.id)).toEqual(['c']);
  });
  it('are not for Beasts', () => {
    const w = escapeWorld();
    const t = w.tasks[0];
    place(w, 'beast', t.x, t.y);
    w.setInput('beast', 0, 0, false, true);
    steps(w, 1000);
    expect(t.progress).toBe(0);
  });
});

describe('traps', () => {
  // goo at columns 3 and 4 of the walkway, spikes at 6 and 7, a creaky board at 8
  const TRAPS = parseMap(['############', '#..........#', '#..~~.^^!..#', '############']);
  const row = 2.5 * TILE;
  it('goo slows a Cousin and not a Beast', () => {
    const w = world(['beast', 'a'], 'last', TRAPS);
    const a = place(w, 'a', 3.2 * TILE, row);
    const b = place(w, 'beast', 3.2 * TILE, 1.5 * TILE);
    b.catchWaitMs = 1e9;
    w.setInput('a', 1, 0, false, false);
    steps(w, 200);
    expect(w.flags(a) & F_SLOW).toBeTruthy();
    expect(a.x - 3.2 * TILE).toBeCloseTo(BASE_SPEED * GOO_SPEED * 0.2, -1);
    place(w, 'beast', 3.2 * TILE, row);
    w.setInput('beast', 1, 0, false, false);
    const x0 = b.x;
    steps(w, 200);
    expect(w.flags(b) & F_SLOW).toBeFalsy();
    expect(b.x - x0).toBeCloseTo(BASE_SPEED * 0.2, -1);
  });
  it('spikes hurt a Cousin who is on them when they are up, once, and cost energy and the boost', () => {
    const w = world(['beast', 'a'], 'last', TRAPS);
    const a = place(w, 'a', 6.5 * TILE, row);
    a.energy = 100;
    // (6 + 2) is even: this square is down until SPIKE_UP_AT_MS
    steps(w, SPIKE_WARN_AT_MS);
    expect(a.energy).toBe(100);
    expect(spikesAt(w.timeMs, 6, 2)).toBe(1);
    steps(w, SPIKE_UP_AT_MS - SPIKE_WARN_AT_MS + 50);
    expect(a.energy).toBe(100 - SPIKE_ENERGY);
    expect(w.flags(a) & F_HURT).toBeTruthy();
    expect(w.fx.filter((e) => e[0] === 's')).toHaveLength(1);
    // limping: no boost, and the spikes cannot hurt again yet
    w.setInput('a', 0, 0, true, false);
    steps(w, 300);
    expect(w.flags(a) & F_BOOST).toBeFalsy();
    expect(a.energy).toBe(100 - SPIKE_ENERGY);
    expect(speedOf(w.flags(a))).toBeCloseTo(BASE_SPEED * HURT_SPEED);
  });
  it('spikes next to each other take turns', () => {
    for (let t = 0; t < SPIKE_CYCLE_MS; t += 50) expect(spikesAt(t, 6, 2) === 2 && spikesAt(t, 7, 2) === 2).toBe(false);
  });
  it('spikes do nothing to a Beast', () => {
    const w = world(['beast', 'a'], 'last', TRAPS);
    const b = place(w, 'beast', 6.5 * TILE, row);
    place(w, 'a', 1.5 * TILE, 1.5 * TILE);
    steps(w, SPIKE_CYCLE_MS);
    expect(w.flags(b) & F_HURT).toBeFalsy();
    expect(w.fx.filter((e) => e[0] === 's')).toHaveLength(0);
  });
  it('a creaky board gives a moving Cousin away to the Beasts', () => {
    const w = world(['beast', 'a'], 'last', TRAPS);
    place(w, 'a', 8.5 * TILE, row);
    steps(w, 300);
    expect(w.fx.filter((e) => e[0] === 'n')).toHaveLength(0);
    w.setInput('a', 0, -0.1, false, false);
    steps(w, 100);
    expect(w.fx.filter((e) => e[0] === 'n')).toHaveLength(1);
  });
});

describe('leaving', () => {
  it('turns a Cousin when the last Beast walks out', () => {
    const w = world(['beast', 'a', 'c', 'd'], 'last', MAP);
    w.remove('beast', seeded(2));
    expect(w.beasts()).toHaveLength(1);
    expect(w.cousins()).toHaveLength(2);
  });
});
