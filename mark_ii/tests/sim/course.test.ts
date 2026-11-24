import { describe, it, expect } from 'vitest';
import { ARENA, BOX, COMBAT, MATCH, PHYS, RUN } from '../../shared/src/constants.js';
import type { BoxDef } from '../../shared/src/levels.js';
import { grantItem } from '../../server/src/sim/items.js';
import type { Game } from '../../server/src/sim/game.js';
import { flatWorld, newCustom, startMatch, run, place, hold, P, TICK_MS } from './helpers.js';

const W = PHYS.playerW;
const FLOOR = 540;
const crate = (x: number, up = 0, hp: number = BOX.hp): BoxDef => ({ x, y: FLOOR - BOX.size * (up + 1), w: BOX.size, h: BOX.size, hp });
/** A permanent (unbreakable) block. */
const block = (x: number, up = 0): BoxDef => ({ x, y: FLOOR - BOX.size * (up + 1), w: BOX.size, h: BOX.size });

/** A flat course with everyone standing mid-screen (clear of the left edge). */
function course(over: Parameters<typeof flatWorld>[0] = {}, names = ['Alice', 'Bob']): { g: Game; ids: string[] } {
  const g = newCustom(flatWorld(over));
  const ids = startMatch(g, names);
  ids.forEach((id, i) => place(g, id, 500 + i * 60, FLOOR));
  run(g, 50);
  return { g, ids };
}

/** Fire the pistol `n` times as fast as it allows. */
function shots(g: Game, id: string, n: number): void {
  for (let i = 0; i < n; i++) {
    P(g, id).face = 1;
    g.shoot(id);
    run(g, COMBAT.pistol.cooldownMs + 20);
  }
}

describe('the scrolling screen', () => {
  it('waits a moment after GO, then creeps forward at the base pace', () => {
    const { g } = course();
    run(g, RUN.scrollDelayMs - 200);
    expect(g.w.scrollX).toBe(0);
    run(g, 1150);
    expect(g.w.scrollX).toBeGreaterThan(RUN.scrollBase * 0.8);
    expect(g.w.scrollX).toBeLessThan(RUN.scrollBase * 1.2);
  });

  it('chases the leader, but only so fast', () => {
    const { g, ids } = course();
    place(g, ids[0], 1200, FLOOR);
    run(g, 200);
    expect(g.w.scrollX).toBeGreaterThan(50);
    expect(g.w.scrollX).toBeLessThanOrEqual(RUN.catchup * 0.25);
    run(g, 800);
    // caught up to the lead line; from there it only creeps on at the base pace
    const line = 1200 - RUN.leadFrac * ARENA.width;
    expect(g.w.scrollX).toBeGreaterThanOrEqual(line);
    expect(g.w.scrollX).toBeLessThan(line + RUN.scrollBase * 0.8);
  });

  it('never moves backwards and stops at the end of the course', () => {
    const { g, ids } = course({ length: 2000 });
    place(g, ids[0], 1200, FLOOR);
    run(g, 1000);
    const before = g.w.scrollX;
    place(g, ids[0], before + 300, FLOOR);
    run(g, 100);
    expect(g.w.scrollX).toBeGreaterThanOrEqual(before);
    g.w.scrollX = 2000 - ARENA.width - 1;
    for (const id of ids) place(g, id, 1100, FLOOR);
    run(g, 3000);
    expect(g.w.scrollX).toBe(2000 - ARENA.width);
  });

  it('the left edge of the screen catches stragglers', () => {
    const { g, ids } = course();
    const [a, b] = ids;
    place(g, b, 1100, FLOOR);
    g.w.scrollX = 400;
    place(g, a, 500, FLOOR);
    run(g, TICK_MS * 2);
    expect(P(g, a).life).toBe('alive'); // still on screen
    place(g, a, 400 - W - RUN.killMargin - 5, FLOOR);
    run(g, TICK_MS * 2);
    expect(P(g, a).life).toBe('respawning');
    expect(P(g, a).lives).toBe(RUN.lives - 1);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Alice', how: 'scroll' });
  });

  it('the right edge of the screen is a wall', () => {
    const { g, ids } = course();
    place(g, ids[0], 1600, FLOOR);
    run(g, TICK_MS);
    expect(P(g, ids[0]).x).toBeLessThanOrEqual(g.w.scrollX + ARENA.width - W);
  });

  it('holds still during the countdown and the results', () => {
    const g = newCustom(flatWorld());
    g.join('Solo');
    g.restart();
    run(g, MATCH.countdownMs - 100);
    expect(g.w.scrollX).toBe(0);
  });
});

describe('boxes', () => {
  it('are solid from the side', () => {
    const { g, ids } = course({ boxes: [crate(700)] });
    place(g, ids[1], 300, FLOOR); // out of the way
    hold(g, ids[0], { right: true });
    run(g, 1500);
    expect(P(g, ids[0]).x + W).toBe(700);
    expect(P(g, ids[0]).vx).toBe(0);
  });

  it('can be jumped onto and stood on', () => {
    const { g, ids } = course({ boxes: [crate(700)] });
    place(g, ids[0], 724, 420);
    run(g, 500);
    const p = P(g, ids[0]);
    expect(p.grounded).toBe(true);
    expect(p.y + PHYS.playerH).toBe(FLOOR - BOX.size);
    expect(g.w.plats[p.platIdx].box).toBeDefined();
    g.drop(ids[0]); // no dropping through a box
    run(g, 200);
    expect(p.y + PHYS.playerH).toBe(FLOOR - BOX.size);
  });

  it('stop a jump from underneath', () => {
    const { g, ids } = course({ boxes: [{ x: 700, y: 400, w: 96, h: 48 }] });
    place(g, ids[0], 748, FLOOR);
    run(g, 100);
    let top = Infinity;
    hold(g, ids[0], { jump: true });
    for (let i = 0; i < 40; i++) {
      run(g, TICK_MS);
      top = Math.min(top, P(g, ids[0]).y);
    }
    expect(top).toBe(448); // head stopped at the box's underside
  });

  it('a body push never shoves anyone into a box', () => {
    const { g, ids } = course({ boxes: [block(700, 0), block(700, 1)] });
    const [a, b] = ids;
    place(g, a, 700 - W / 2, FLOOR);
    place(g, b, 700 - W / 2 - 10, FLOOR);
    hold(g, b, { right: true });
    run(g, 1000);
    expect(P(g, a).x + W).toBeLessThanOrEqual(700);
    expect(P(g, b).x + W).toBeLessThanOrEqual(700);
  });

  it('break after enough shots, credit the shooter, and let you through', () => {
    const { g, ids } = course({ boxes: [crate(700)] });
    const [a] = ids;
    place(g, a, 600, FLOOR);
    run(g, 100);
    shots(g, a, BOX.hp - 1);
    const snap = g.snapshot();
    expect(snap.boxes).toEqual([[0, 1]]);
    expect(snap.fx.filter((f) => f.k === 'boxhit').length).toBe(BOX.hp - 1);
    shots(g, a, 1);
    expect(g.snapshot().fx.some((f) => f.k === 'boxbreak')).toBe(true);
    expect(P(g, a).smash).toBe(BOX.hp);
    expect(g.snapshot().boxes).toEqual([[0, 0]]);
    hold(g, a, { right: true });
    run(g, 800);
    expect(P(g, a).x).toBeGreaterThan(760);
  });

  it('shooting out the bottom of a stack brings the whole stack down', () => {
    const { g, ids } = course({ boxes: [crate(700, 0), crate(700, 1), crate(700, 2), crate(900, 0)] });
    place(g, ids[0], 600, FLOOR);
    run(g, 100);
    shots(g, ids[0], BOX.hp);
    const gone = g.w.solids.map((i) => g.w.plats[i].state === 'gone');
    expect(gone).toEqual([true, true, true, false]);
  });

  it('a box shot out from under you drops you', () => {
    const { g, ids } = course({ boxes: [crate(700)] });
    const [a, b] = ids;
    place(g, b, 724, FLOOR - BOX.size);
    place(g, a, 600, FLOOR);
    run(g, 100);
    expect(P(g, b).grounded).toBe(true);
    shots(g, a, BOX.hp);
    run(g, 300);
    expect(P(g, b).y + PHYS.playerH).toBe(FLOOR);
  });

  it('permanent blocks soak up shots forever and shield whoever is behind them', () => {
    const { g, ids } = course({ boxes: [block(700)] });
    const [a, b] = ids;
    place(g, a, 600, FLOOR);
    place(g, b, 800, FLOOR);
    run(g, 100);
    shots(g, a, 6);
    expect(g.w.plats[g.w.solids[0]].state).toBe('solid');
    expect(P(g, b).lastHit).toBeNull();
    expect(P(g, a).smash).toBe(0);
    expect(g.snapshot().boxes).toEqual([]);
  });

  it('rockets explode on the first box and smash everything nearby', () => {
    const { g, ids } = course({ boxes: [crate(800, 0, 10), crate(848, 0, 10), crate(1100, 0, 10)] });
    const [a] = ids;
    place(g, a, 500, FLOOR);
    run(g, 100);
    P(g, a).face = 1;
    grantItem(g.w, P(g, a), 'rockets');
    g.shoot(a);
    run(g, 1200);
    expect(g.w.projectiles.length).toBe(0);
    const gone = g.w.solids.map((i) => g.w.plats[i].state === 'gone');
    expect(gone).toEqual([true, true, false]);
  });

  it('aim assist bends shots toward a box before any runner', () => {
    const { g, ids } = course({ boxes: [{ x: 900, y: 420, w: 48, h: 48, hp: 3 }] });
    const [a, b] = ids;
    place(g, a, 600, FLOOR);
    place(g, b, 800, FLOOR); // straight ahead, closer than the box
    run(g, 100);
    P(g, a).face = 1;
    g.shoot(a);
    expect(g.w.projectiles[0].vy).toBeLessThan(0); // aimed up at the box, not level at Bob
  });
});

describe('gates', () => {
  const GATE = 1500;
  const gated = (names = ['Alice', 'Bob']) => course({ gates: [{ x: GATE, w: BOX.gateW }] }, names);
  const HOLD = GATE - RUN.gateHoldFrac * ARENA.width;

  it('are a wall across the whole screen: no going over', () => {
    const { g, ids } = gated();
    g.w.scrollX = HOLD;
    const p = place(g, ids[0], 1400, -400); // dropped in from way above
    p.vx = 600;
    hold(g, ids[0], { right: true });
    run(g, 1500);
    expect(P(g, ids[0]).x + W).toBeLessThanOrEqual(GATE);
  });

  it('hold the screen until they come down', () => {
    const { g, ids } = gated();
    for (const id of ids) place(g, id, 1400, FLOOR);
    run(g, 6000);
    expect(g.w.scrollX).toBeCloseTo(HOLD, 5);
    expect(g.w.gateIdx).toBe(0);
  });

  it('have health for the whole pack, and everybody’s shots count', () => {
    const { g, ids } = gated();
    const [a, b] = ids;
    expect(g.w.gateMax).toBe(BOX.gateHpPerPlayer * 2);
    g.w.scrollX = HOLD;
    place(g, a, 1300, FLOOR);
    place(g, b, 1200, FLOOR); // behind Alice: bullets pass through her
    run(g, 100);
    const hp0 = g.w.gateHp;
    P(g, a).face = 1;
    P(g, b).face = 1;
    g.shoot(a);
    g.shoot(b);
    run(g, 300);
    expect(hp0 - g.w.gateHp).toBeGreaterThanOrEqual(2 * BOX.dmg.bullet);
    expect(P(g, b).smash).toBe(BOX.dmg.bullet);
    expect(g.snapshot().gate).toMatchObject({ i: 0, max: BOX.gateHpPerPlayer * 2 });
  });

  it('come down when the health runs out; then the way is open and the screen moves on', () => {
    const { g, ids } = gated();
    const [a, b] = ids;
    g.w.scrollX = HOLD;
    place(g, a, 1440, FLOOR);
    place(g, b, 1380, FLOOR);
    run(g, 100);
    g.w.gateHp = 1;
    shots(g, a, 1);
    expect(g.w.gateIdx).toBe(1);
    const snap = g.snapshot();
    expect(snap.fx.some((f) => f.k === 'gatebreak')).toBe(true);
    expect(snap.gate).toBeNull();
    hold(g, a, { right: true });
    run(g, 1500);
    expect(P(g, a).x).toBeGreaterThan(GATE + BOX.gateW);
    expect(g.w.scrollX).toBeGreaterThan(HOLD);
  });

  it('get weaker when racers drop out', () => {
    const { g, ids } = gated(['Alice', 'Bob', 'Cara', 'Dan']);
    expect(g.w.gateMax).toBe(BOX.gateHpPerPlayer * 4);
    g.w.gateHp = g.w.gateMax / 2;
    g.leave(ids[3]);
    g.leave(ids[2]);
    run(g, TICK_MS * 2);
    expect(g.w.gateMax).toBe(BOX.gateHpPerPlayer * 2);
    expect(g.w.gateHp).toBeCloseTo(BOX.gateHpPerPlayer, 0);
  });

  it('crumble on their own if the pack just stands there', () => {
    const { g, ids } = gated();
    for (const id of ids) place(g, id, 1400, FLOOR);
    run(g, 3000);
    expect(g.w.gateIdx).toBe(0);
    run(g, BOX.gateDecayMs + 1000);
    expect(g.w.gateIdx).toBe(1);
  });

  it('stop the railgun beam (and take its damage)', () => {
    const { g, ids } = gated();
    const [a] = ids;
    g.w.scrollX = HOLD;
    place(g, a, 1000, FLOOR);
    run(g, 100);
    P(g, a).face = 1;
    grantItem(g.w, P(g, a), 'railgun');
    const hp0 = g.w.gateHp;
    g.shoot(a);
    run(g, COMBAT.railgun.chargeMs + 40);
    const beam = g.snapshot().fx.find((f) => f.k === 'beam');
    expect(beam && 'x2' in beam && beam.x2).toBeCloseTo(GATE, 0);
    expect(hp0 - g.w.gateHp).toBeGreaterThanOrEqual(BOX.dmg.railgun);
  });
});
