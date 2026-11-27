import { describe, expect, it } from 'vitest';
import { BOOST_SECONDS, BUST_COST, BUST_MS, EXTRA_MAX, FLAG_BOOST, FLAG_BUST, FLAG_SLIP, PACE_SPEED, TICK_HZ, TICK_MS } from '../shared/src/constants';
import { ALL_ON, PLAIN, floor, line, place, ride, steps } from './helpers';

const base = PACE_SPEED.normal;

describe('boost', () => {
  it('speeds the bike up while held, drains the bar, and wears off after', () => {
    const { w } = floor(['a', 'b'], ALL_ON, 400, 30);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 5, 25, 0);
    w.boost('a', true);
    steps(w, TICK_HZ);
    expect(a.speed).toBeGreaterThan(base * 1.3);
    expect(a.energy).toBeCloseTo(1 - 1 / BOOST_SECONDS, 2);
    expect(w.bikeList()[0][6] & FLAG_BOOST).toBe(FLAG_BOOST);
    // an empty bar is no boost at all, and does not refill while the button is held
    steps(w, TICK_HZ * BOOST_SECONDS);
    expect(a.energy).toBe(0);
    expect(a.speed).toBeLessThanOrEqual(base * (1 + EXTRA_MAX));
    const spent = a.speed;
    steps(w, TICK_HZ);
    expect(a.speed).toBeLessThan(spent);
    expect(a.energy).toBe(0);
    w.boost('a', false);
    steps(w, TICK_HZ * 4);
    expect(a.speed).toBe(base);
    expect(a.energy).toBeGreaterThan(0.3);
  });

  it('does nothing when the host has it off', () => {
    const { w } = floor(['a', 'b'], PLAIN, 400, 30);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 5, 25, 0);
    w.boost('a', true);
    steps(w, TICK_HZ);
    expect(a.speed).toBe(base);
    expect(a.energy).toBe(1);
  });
});

describe('buster', () => {
  it('passes through lines for a moment, at half a bar', () => {
    const { w } = floor(['a', 'b'], ALL_ON);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 2, 28, 0);
    line(w, 'b', 8, 0, 9, 10);
    ride(w, 'a', 1);
    w.bust('a');
    expect(a.energy).toBeCloseTo(1 - BUST_COST);
    expect(w.fx).toContainEqual(['b', 'a']);
    expect(w.bikeList()[0][6] & FLAG_BUST).toBe(FLAG_BUST);
    ride(w, 'a', 5);
    expect(a.alive).toBe(true);
    expect(a.x).toBe(11);
    // the line it went through is still the other rider's
    expect(w.at(8, 5)).toBe(w.bike('b')!.idx + 1);
    expect(w.at(10, 5)).toBe(a.idx + 1);
  });

  it('does not last, cannot be stacked, and needs half a bar', () => {
    const { w } = floor(['a', 'b'], ALL_ON, 200, 30);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 2, 28, 0);
    w.bust('a');
    w.bust('a');
    expect(a.energy).toBeCloseTo(0.5);
    steps(w, Math.ceil(BUST_MS / TICK_MS) + 1);
    expect(a.bustMs).toBeLessThanOrEqual(0);
    a.energy = 0.4;
    w.bust('a');
    expect(a.bustMs).toBeLessThanOrEqual(0);
    line(w, 'b', a.x + 4, 0, a.x + 4, 10);
    ride(w, 'a', 6);
    expect(a.alive).toBe(false);
  });

  it('is no use against a wall', () => {
    const { w } = floor(['a', 'b'], ALL_ON);
    const a = place(w, 'a', 37, 5, 0);
    place(w, 'b', 2, 28, 0);
    w.bust('a');
    ride(w, 'a', 5);
    expect(a.alive).toBe(false);
  });

  it('does nothing when the host has it off', () => {
    const { w } = floor(['a', 'b'], PLAIN);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 2, 28, 0);
    w.bust('a');
    expect(a.bustMs).toBe(0);
    expect(a.energy).toBe(1);
  });
});

describe('slipstream', () => {
  it("speeds a bike up beside somebody else's line", () => {
    const { w, stats } = floor(['a', 'b'], ALL_ON, 200, 30);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 2, 28, 0);
    line(w, 'b', 0, 7, 199, 7); // two lanes over
    steps(w, TICK_HZ);
    expect(a.speed).toBeGreaterThan(base * 1.2);
    expect(stats.get('a')!.shaves).toBe(TICK_HZ);
    expect(w.bikeList()[0][6] & FLAG_SLIP).toBe(FLAG_SLIP);
  });

  it('not beside its own line, a wall, or a line three lanes off', () => {
    const { w } = floor(['a', 'b'], ALL_ON, 200, 30);
    const a = place(w, 'a', 5, 1, 0); // the rim is one lane up
    place(w, 'b', 2, 28, 0);
    line(w, 'a', 0, 3, 199, 3);
    line(w, 'b', 0, 4, 199, 4); // hidden behind a's own line
    steps(w, TICK_HZ);
    expect(a.speed).toBe(base);
    const far = place(w, 'a', 5, 12, 0);
    line(w, 'b', 0, 15, 199, 15);
    steps(w, TICK_HZ);
    expect(far.speed).toBe(base);
  });

  it('is off when the host says so', () => {
    const { w } = floor(['a', 'b'], PLAIN, 200, 30);
    const a = place(w, 'a', 5, 5, 0);
    place(w, 'b', 2, 28, 0);
    line(w, 'b', 0, 6, 199, 6);
    steps(w, TICK_HZ);
    expect(a.speed).toBe(base);
  });
});
