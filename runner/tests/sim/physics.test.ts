import { describe, it, expect } from 'vitest';
import { ITEMS, PHYS, RUN } from '../../shared/src/constants.js';
import { grantItem } from '../../server/src/sim/items.js';
import { applyHit } from '../../server/src/sim/combat.js';
import { newGame, newCustom, flatWorld, startMatch, run, place, park, hold, P, TICK_MS } from './helpers.js';

function setup(level = 'sky') {
  const g = newGame(level);
  const [a, b] = startMatch(g);
  park(g, b);
  return { g, a, b };
}

/** Lowest y (highest point) reached over `ms`. */
function peak(g: ReturnType<typeof newGame>, id: string, ms: number, each?: (tick: number) => void): number {
  let top = Infinity;
  const n = Math.round(ms / TICK_MS);
  for (let i = 0; i < n; i++) {
    each?.(i);
    g.step(TICK_MS);
    top = Math.min(top, P(g, id).y);
  }
  return top;
}

describe('movement', () => {
  it('gravity lands a player on a platform and keeps them there', () => {
    const { g, a } = setup();
    place(g, a, 640, 300);
    run(g, 800);
    const p = P(g, a);
    expect(p.grounded).toBe(true);
    expect(p.y + PHYS.playerH).toBeCloseTo(440, 5);
    run(g, 500);
    expect(p.y + PHYS.playerH).toBeCloseTo(440, 5);
  });

  it('running accelerates to the ground speed cap and faces the run direction', () => {
    const { g, a, b } = setup();
    place(g, a, 480, 440);
    place(g, b, 430, 440); // close behind: no lead to slow the runner down
    run(g, 50);
    hold(g, a, { right: true });
    run(g, 300);
    const p = P(g, a);
    expect(p.vx).toBeCloseTo(PHYS.maxSpeed, 0);
    expect(p.face).toBe(1);
    hold(g, a, { left: true });
    run(g, 400);
    expect(p.face).toBe(-1);
  });

  it('platforms are one-way: jumping up through one lands on top', () => {
    const { g, a } = setup();
    // stand on the low-center platform (top 590) under the main island (top 440)
    place(g, a, 640, 590);
    run(g, 100);
    hold(g, a, { jump: true });
    run(g, 900);
    const p = P(g, a);
    expect(p.grounded).toBe(true);
    expect(p.y + PHYS.playerH).toBeCloseTo(440, 5);
  });
});

describe('jumping', () => {
  it('a tap hops low, a hold jumps high', () => {
    const { g, a } = setup();
    place(g, a, 640, 440);
    run(g, 100);
    const ground = P(g, a).y;
    const tapTop = peak(g, a, 700, (i) => hold(g, a, { jump: i < 2 }));
    run(g, 400);
    const holdTop = peak(g, a, 700, () => hold(g, a, { jump: true }));
    expect(ground - tapTop).toBeGreaterThan(20);
    expect(ground - holdTop).toBeGreaterThan((ground - tapTop) * 1.8);
  });

  it('double jump adds height once, then no more until landing', () => {
    const { g, a } = setup();
    place(g, a, 640, 440);
    run(g, 100);
    const ground = P(g, a).y;
    const single = peak(g, a, 900, (i) => hold(g, a, { jump: i < 20 }));
    run(g, 600);
    expect(P(g, a).grounded).toBe(true);
    const double = peak(g, a, 1200, (i) => hold(g, a, { jump: i < 20 || (i > 25 && i < 45) }));
    expect(ground - double).toBeGreaterThan((ground - single) * 1.5);
    run(g, 1000);

    // a third press in the air does nothing
    const p = P(g, a);
    hold(g, a, { jump: true });
    run(g, 200);
    hold(g, a, {});
    run(g, 30);
    hold(g, a, { jump: true });
    run(g, 30);
    expect(p.airJumpsLeft).toBe(0);
    hold(g, a, {});
    run(g, 30);
    const vyBefore = p.vy;
    hold(g, a, { jump: true });
    run(g, 20);
    expect(p.vy).toBeGreaterThan(vyBefore - 50);
  });

  it('coyote time: a jump right after walking off an edge still works', () => {
    const { g, a } = setup();
    // right edge of the main island is x=840
    place(g, a, 820, 440);
    run(g, 100);
    hold(g, a, { right: true });
    let walkedOff = false;
    for (let i = 0; i < 60 && !walkedOff; i++) {
      run(g, TICK_MS);
      if (!P(g, a).grounded) walkedOff = true;
    }
    expect(walkedOff).toBe(true);
    hold(g, a, { right: true, jump: true });
    run(g, TICK_MS * 2);
    expect(P(g, a).vy).toBeLessThan(-PHYS.jumpVel * 0.8);
    expect(P(g, a).airJumpsLeft).toBe(PHYS.airJumps); // it was a ground jump
  });
});

describe('platform kinds', () => {
  it('vertical movers carry the player', () => {
    const { g, a } = setup();
    // sky mover #7 spans x 335..445
    place(g, a, 390, 250);
    run(g, 500);
    const p = P(g, a);
    expect(p.grounded).toBe(true);
    const ys = new Set<number>();
    for (let i = 0; i < 60; i++) {
      run(g, 50);
      expect(p.grounded).toBe(true);
      ys.add(Math.round(p.y));
      const pl = g.w.plats[p.platIdx];
      expect(p.y + PHYS.playerH).toBeCloseTo(pl.y, 5);
    }
    expect(ys.size).toBeGreaterThan(10);
  });

  it('horizontal movers carry the player sideways', () => {
    const { g, a } = setup('frost');
    const glider = g.w.plats[3];
    place(g, a, glider.x + glider.w / 2, glider.y - 30);
    run(g, 300);
    const p = P(g, a);
    expect(p.platIdx).toBe(3);
    const startOffset = p.x - g.w.plats[3].x;
    let minX = p.x;
    let maxX = p.x;
    for (let i = 0; i < 60; i++) {
      run(g, 50);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    expect(p.platIdx).toBe(3);
    expect(maxX - minX).toBeGreaterThan(200);
    expect(p.x - g.w.plats[3].x).toBeCloseTo(startOffset, 0);
  });

  it('ice is slippery: you slide much farther after letting go', () => {
    const slide = (level: string, cx: number, feet: number) => {
      const g = newGame(level);
      const [a, b] = startMatch(g);
      park(g, b);
      place(g, a, cx, feet);
      run(g, 100);
      hold(g, a, { right: true });
      run(g, 600);
      hold(g, a, {});
      const x0 = P(g, a).x;
      run(g, 400);
      return P(g, a).x - x0;
    };
    const normal = slide('sky', 470, 440);
    const ice = slide('frost', 420, 470);
    expect(ice).toBeGreaterThan(normal * 3);
  });

  it('bounce pads launch you high and refresh your double jump', () => {
    const { g, a } = setup('forge');
    const pad = g.w.plats[1];
    place(g, a, pad.x + pad.w / 2, pad.y - 120);
    const p = P(g, a);
    p.airJumpsLeft = 0;
    const top = peak(g, a, 900);
    expect(pad.y - (top + PHYS.playerH)).toBeGreaterThan(300);
    expect(p.airJumpsLeft).toBe(PHYS.airJumps);
  });

  it('crumbling platforms fall after being stood on, then come back', () => {
    const { g, a } = setup('temple');
    const idx = 1; // crumble at x 250..370, top 430
    const pl = g.w.plats[idx];
    place(g, a, pl.x + pl.w / 2, pl.y - 10);
    run(g, 100);
    expect(P(g, a).platIdx).toBe(idx);
    expect(pl.state).toBe('shaking');
    run(g, PHYS.crumbleMs + 50);
    expect(pl.state).toBe('gone');
    run(g, 200);
    expect(P(g, a).y + PHYS.playerH).toBeGreaterThan(pl.y + 20); // falling through where it was
    run(g, PHYS.crumbleRespawnMs);
    expect(pl.state).toBe('solid');
  });
});

describe('drop-through', () => {
  it('drops through to the platform below', () => {
    const { g, a } = setup();
    place(g, a, 640, 440);
    run(g, 100);
    g.drop(a);
    run(g, 900);
    const p = P(g, a);
    expect(p.grounded).toBe(true);
    expect(p.y + PHYS.playerH).toBeCloseTo(590, 5);
  });

  it('is refused with nothing below (never a free fall into the pit)', () => {
    const { g, a } = setup();
    place(g, a, 640, 590); // lowest platform
    run(g, 100);
    g.drop(a);
    run(g, 300);
    expect(P(g, a).grounded).toBe(true);
    expect(P(g, a).y + PHYS.playerH).toBeCloseTo(590, 5);
  });

  it('in the air it fast-falls instead (and still lands on the platform below)', () => {
    const { g, a } = setup();
    place(g, a, 640, 300);
    run(g, 30);
    g.drop(a);
    expect(P(g, a).vy).toBeGreaterThanOrEqual(PHYS.fastFallVel);
    run(g, 800);
    expect(P(g, a).y + PHYS.playerH).toBeCloseTo(440, 5);
  });

  it('no fast-fall while still rising', () => {
    const { g, a } = setup();
    place(g, a, 640, 440);
    run(g, 100);
    hold(g, a, { jump: true });
    run(g, 50);
    g.drop(a);
    expect(P(g, a).vy).toBeLessThan(0);
  });
});

describe('low gravity arena', () => {
  it('jumps go higher in the Neon Void', () => {
    const height = (level: string, cx: number, feet: number) => {
      const g = newGame(level);
      const [a, b] = startMatch(g);
      park(g, b);
      place(g, a, cx, feet);
      run(g, 100);
      const ground = P(g, a).y;
      return ground - peak(g, a, 1200, (i) => hold(g, a, { jump: i < 3 }));
    };
    expect(height('neon', 640, 460)).toBeGreaterThan(height('sky', 640, 440) * 1.2);
  });
});

describe('pace', () => {
  /** Top speed reached running right on a flat floor, with the other runner `gap` px behind. */
  function topSpeed(dmg: number, gap: number): number {
    const g = newCustom(flatWorld());
    const [a, b] = startMatch(g);
    const p = place(g, a, 300, 540);
    place(g, b, 300 - gap, 540);
    p.dmg = dmg;
    run(g, 50);
    hold(g, a, { right: true });
    hold(g, b, { right: true });
    run(g, 600);
    return p.vx;
  }

  it('damage slows a runner down, but never by much', () => {
    expect(topSpeed(0, 100)).toBeCloseTo(PHYS.maxSpeed, 0);
    expect(topSpeed(RUN.dmgSlowFull / 2, 100)).toBeCloseTo(PHYS.maxSpeed * (1 - RUN.dmgSlow / 2), 0);
    expect(topSpeed(RUN.dmgSlowFull, 100)).toBeCloseTo(PHYS.maxSpeed * (1 - RUN.dmgSlow), 0);
    expect(topSpeed(RUN.dmgMax, 100)).toBeCloseTo(PHYS.maxSpeed * (1 - RUN.dmgSlow), 0);
  });

  it('a lead over the pack slows the leader, not the chaser', () => {
    expect(topSpeed(0, RUN.leadSlowFrom)).toBeCloseTo(PHYS.maxSpeed, 0);
    const g = newCustom(flatWorld());
    const [a, b] = startMatch(g);
    place(g, a, 300 + RUN.leadSlowFull, 540);
    place(g, b, 300, 540);
    run(g, 50);
    hold(g, a, { right: true });
    hold(g, b, { right: true });
    run(g, 600);
    expect(P(g, b).vx).toBeCloseTo(PHYS.maxSpeed, 0);
    expect(P(g, a).vx).toBeLessThan(PHYS.maxSpeed * (1 - RUN.leadSlow / 2));
    expect(P(g, a).vx).toBeGreaterThanOrEqual(PHYS.maxSpeed * (1 - RUN.leadSlow) - 1);
  });

  it('speed shoes make you faster for a while, then wear off', () => {
    const g = newCustom(flatWorld());
    const [a, b] = startMatch(g);
    const p = place(g, a, 300, 540);
    place(g, b, 250, 540);
    g.w.scrollX = 0;
    grantItem(g.w, p, 'shoes');
    expect(g.snapshot().players.find((s) => s.id === a)!.shoes).toBe(true);
    run(g, 50);
    hold(g, a, { right: true });
    hold(g, b, { right: true });
    run(g, 400);
    expect(p.vx).toBeGreaterThan(PHYS.maxSpeed * 1.1);
    expect(p.vx).toBeLessThanOrEqual(PHYS.maxSpeed * ITEMS.shoesSpeed + 1);
    expect(P(g, b).vx).toBeCloseTo(PHYS.maxSpeed, 0);
    p.shoesUntil = g.w.t; // worn out
    run(g, 300);
    expect(p.vx).toBeLessThanOrEqual(PHYS.maxSpeed + 1);
    expect(g.snapshot().players.find((s) => s.id === a)!.shoes).toBe(false);
  });

  it('hits add damage, and a new life starts clean', () => {
    const g = newCustom(flatWorld());
    const [a, b] = startMatch(g);
    const p = place(g, a, 300, 540);
    place(g, b, 260, 540);
    run(g, 50);
    expect(applyHit(g.w, P(g, b), p, { base: 100, growth: 0, dirX: 1, dirY: -1, how: 'pistol' })).toBe(true);
    expect(p.dmg).toBe(RUN.dmg.pistol);
    expect(g.snapshot().players.find((s) => s.id === a)!.dmg).toBe(RUN.dmg.pistol);
    p.y = 5000; // off the bottom: costs a life
    run(g, 100);
    expect(p.life).toBe('respawning');
    expect(p.dmg).toBe(0);
  });
});
