import { describe, expect, it } from 'vitest';
import { BASE_SPEED, BODY_R, F_BEAST, F_BOOST, F_CONVERT, F_DASH, ROLE, TILE } from '../shared/src/constants';
import { MAP, roomAt, wallAt } from '../shared/src/map';
import { moveBody, rayDist, sees, speedOf, unit } from '../shared/src/sim';
import { stepsFrom, stepsAt, FAR } from '../server/src/path';
import { YARD } from './helpers';

describe('the house', () => {
  it('is a closed box of nine rooms', () => {
    expect(MAP.cols).toBe(40);
    expect(MAP.lines).toBe(26);
    expect(MAP.rooms.map((r) => r.name)).toHaveLength(9);
    for (let c = 0; c < MAP.cols; c++) expect(wallAt(MAP, c, 0) && wallAt(MAP, c, MAP.lines - 1)).toBe(true);
    for (let r = 0; r < MAP.lines; r++) expect(wallAt(MAP, 0, r) && wallAt(MAP, MAP.cols - 1, r)).toBe(true);
  });
  it('has what a round needs', () => {
    expect(MAP.cousinStarts.length).toBeGreaterThanOrEqual(9);
    expect(MAP.pills.length).toBe(9);
    expect(MAP.portals.length).toBe(6);
    expect(MAP.tasks.length).toBe(7);
    expect(MAP.exits.length).toBe(2);
  });
  it('lets every square of floor be reached from the den', () => {
    const field = stepsFrom(MAP, MAP.den.x, MAP.den.y);
    for (let r = 0; r < MAP.lines; r++) for (let c = 0; c < MAP.cols; c++) if (!wallAt(MAP, c, r)) expect(field[r * MAP.cols + c]).not.toBe(FAR);
  });
  it('starts no Cousin in sight of the den', () => {
    for (const s of MAP.cousinStarts) expect(sees(MAP, MAP.den.x, MAP.den.y, s.x, s.y)).toBe(false);
    for (const s of MAP.cousinStarts) expect(stepsAt(MAP, stepsFrom(MAP, MAP.den.x, MAP.den.y), s.x, s.y)).toBeGreaterThan(10);
  });
  it('names the room a point is in', () => {
    expect(roomAt(MAP, MAP.den.x, MAP.den.y).name).toBe('Cellar');
    expect(roomAt(MAP, MAP.cousinStarts[0].x, MAP.cousinStarts[0].y).name).toBe('Hall');
  });
});

describe('moving', () => {
  it('is no faster on a diagonal', () => {
    const u = unit(1, 1);
    expect(Math.hypot(u.x, u.y)).toBeCloseTo(1);
    expect(unit(0.3, 0)).toEqual({ x: 0.3, y: 0 });
    expect(unit(0, 0)).toEqual({ x: 0, y: 0 });
  });
  it('stops at a wall', () => {
    const p = { x: 2.5 * TILE, y: 2.5 * TILE };
    moveBody(p, 500, 0, YARD);
    expect(p.x).toBeCloseTo(5 * TILE - BODY_R);
    expect(p.y).toBeCloseTo(2.5 * TILE);
  });
  it('slides along a wall', () => {
    const p = { x: 5 * TILE - BODY_R, y: 2.5 * TILE };
    moveBody(p, 30, 30, YARD);
    expect(p.x).toBeCloseTo(5 * TILE - BODY_R);
    expect(p.y).toBeCloseTo(2.5 * TILE + 30);
  });
  it('rounds a corner instead of sticking on it', () => {
    // heading right, a little too high to clear the end of the middle wall
    const p = { x: 4 * TILE, y: 4 * TILE + 8 };
    for (let i = 0; i < 60; i++) moveBody(p, 3, 0, YARD);
    expect(p.x).toBeGreaterThan(6 * TILE);
  });
  it('ends in the same place whatever the size of the steps', () => {
    const a = { x: 1.5 * TILE, y: 1.5 * TILE };
    const b = { ...a };
    for (let i = 0; i < 120; i++) moveBody(a, 1, 2, YARD);
    for (let i = 0; i < 12; i++) moveBody(b, 10, 20, YARD);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1);
  });
  it('cannot be thrown through a wall by one huge step', () => {
    const p = { x: 2.5 * TILE, y: 2.5 * TILE };
    moveBody(p, 4000, 0, YARD);
    expect(p.x).toBeLessThan(5 * TILE);
  });
});

describe('speed', () => {
  it('gives the Beast a sharper burst and a Cousin a gentler one', () => {
    expect(speedOf(0)).toBe(BASE_SPEED);
    expect(speedOf(F_BEAST)).toBeCloseTo(BASE_SPEED * ROLE.beast.speed);
    expect(speedOf(F_BEAST | F_BOOST)).toBeGreaterThan(speedOf(F_BOOST));
    expect(speedOf(F_BOOST)).toBeGreaterThan(speedOf(F_BEAST));
    expect(speedOf(F_BEAST | F_DASH)).toBeGreaterThan(speedOf(F_BEAST | F_BOOST));
    expect(speedOf(F_BEAST | F_CONVERT)).toBe(0);
  });
});

describe('seeing', () => {
  it('is blocked by a wall and not by floor', () => {
    expect(sees(YARD, 1.5 * TILE, 1.5 * TILE, 4.5 * TILE, 3.5 * TILE)).toBe(true);
    expect(sees(YARD, 2.5 * TILE, 2.5 * TILE, 7.5 * TILE, 2.5 * TILE)).toBe(false);
    expect(sees(YARD, 2.5 * TILE, 4.5 * TILE, 7.5 * TILE, 4.5 * TILE)).toBe(true);
  });
  it('has a range', () => {
    expect(sees(YARD, 2.5 * TILE, 4.5 * TILE, 7.5 * TILE, 4.5 * TILE, 100)).toBe(false);
  });
  it('measures the way to a wall', () => {
    expect(rayDist(YARD, 2.5 * TILE, 2.5 * TILE, 1, 0, 1000)).toBeCloseTo(2.5 * TILE);
    expect(rayDist(YARD, 2.5 * TILE, 2.5 * TILE, 0, -1, 1000)).toBeCloseTo(1.5 * TILE);
    expect(rayDist(YARD, 2.5 * TILE, 2.5 * TILE, 1, 0, 50)).toBe(50);
  });
});
