import { describe, it, expect } from 'vitest';
import { COMBAT, PHYS, RUN } from '../../shared/src/constants.js';
import { knockSpeed } from '../../server/src/sim/combat.js';
import { grantItem } from '../../server/src/sim/items.js';
import { newGame, startMatch, run, place, park, P, TICK_MS } from './helpers.js';

/** Was `id` shoved by `by`? */
const hitBy = (g: ReturnType<typeof newGame>, id: string) => P(g, id).lastHit?.by ?? null;

/** Two players facing each other on the sky main island (top 440). */
function duel(gap = 30) {
  const g = newGame('sky');
  const [a, b] = startMatch(g);
  place(g, a, 600, 440);
  place(g, b, 600 + PHYS.playerW + gap, 440); // `gap` px between the bodies
  run(g, 100);
  P(g, a).face = 1;
  P(g, b).face = -1;
  return { g, a, b };
}

describe('shoves', () => {
  it('a point-blank pistol shot launches the target away and credits the shooter', () => {
    const { g, a, b } = duel(10);
    g.shoot(a);
    run(g, TICK_MS * 3);
    const pb = P(g, b);
    expect(pb.vx).toBeGreaterThan(200);
    expect(pb.vy).toBeLessThan(0);
    expect(pb.lastHit?.by).toBe(a);
    expect(pb.lastHit?.how).toBe('pistol');
  });

  it('never build up: the tenth hit shoves exactly as hard as the first', () => {
    expect(knockSpeed(330, 5.4, 100)).toBeGreaterThan(knockSpeed(330, 5.4, 10) * 2); // the formula still scales...
    const { g, a, b } = duel(10);
    const speeds: number[] = [];
    for (let i = 0; i < 10; i++) {
      place(g, a, 600, 440);
      place(g, b, 600 + PHYS.playerW + 10, 440);
      run(g, COMBAT.pistol.cooldownMs + 50);
      P(g, a).face = 1;
      g.shoot(a);
      run(g, TICK_MS);
      speeds.push(Math.hypot(P(g, b).vx, P(g, b).vy));
    }
    // ...but every runner is always treated as sitting at the same percent
    expect(speeds[9]).toBeCloseTo(speeds[0], 5);
    expect(speeds[0]).toBeCloseTo(knockSpeed(COMBAT.pistol.base, COMBAT.pistol.growth, RUN.shovePct), 5);
  });

  it('shoving someone into the pit is credited in the feed', () => {
    const { g, a, b } = duel(10);
    place(g, a, 790, 440);
    place(g, b, 826, 440); // right at the edge of the island
    run(g, 50);
    P(g, a).face = 1;
    grantItem(g.w, P(g, a), 'railgun');
    g.shoot(a);
    run(g, 3000);
    expect(P(g, b).deaths).toBe(1);
    expect(P(g, b).lives).toBe(RUN.lives - 1);
    expect(P(g, a).kos).toBe(1);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Bob', killer: 'Alice', how: 'railgun' });
  });
});

describe('stomp', () => {
  it('bounces the stomper and shoves the stomped', () => {
    const { g, a, b } = duel(200);
    const pb = P(g, b);
    const pa = place(g, a, pb.x + PHYS.playerW / 2, pb.y - 40);
    pa.vy = 600;
    run(g, TICK_MS * 4);
    expect(pa.vy).toBeLessThan(-500);
    expect(pb.lastHit?.how).toBe('stomp');
  });

  it('side contact is not a stomp', () => {
    const { g, a, b } = duel(0);
    run(g, 300);
    expect(hitBy(g, a)).toBeNull();
    expect(hitBy(g, b)).toBeNull();
  });
});

describe('guns', () => {
  it('pistol bullets fly, hit, and nudge the target', () => {
    const { g, a, b } = duel(150);
    g.shoot(a);
    expect(g.w.projectiles.length).toBe(1);
    run(g, 150);
    expect(P(g, b).lastHit?.how).toBe('pistol');
  });

  it('bullets fly on through runners, shoving each of them once', () => {
    const g = newGame('sky');
    const [a, b, c] = startMatch(g, ['A', 'B', 'C']);
    place(g, a, 470, 440);
    place(g, b, 600, 440);
    place(g, c, 720, 440);
    run(g, 100);
    P(g, a).face = 1;
    g.shoot(a);
    run(g, 250);
    expect(hitBy(g, b)).toBe(a);
    expect(hitBy(g, c)).toBe(a);
    expect(g.w.fx.filter((f) => f.k === 'hit').length).toBe(2);
  });

  it('pistol has a cooldown and never hits its owner', () => {
    const { g, a } = duel(300);
    g.shoot(a);
    g.shoot(a);
    expect(g.w.projectiles.length).toBe(1);
    run(g, 800);
    expect(hitBy(g, a)).toBeNull();
  });

  it('bullets expire when they hit nothing', () => {
    const { g, a } = duel(300);
    P(g, a).face = -1;
    g.shoot(a);
    run(g, COMBAT.pistol.ttlMs + 100);
    expect(g.w.projectiles.length).toBe(0);
  });

  it('boomstick: a pellet spread, recoil, and it runs out back to the pistol', () => {
    const { g, a, b } = duel(120);
    const pa = P(g, a);
    grantItem(g.w, pa, 'boomstick');
    expect(pa.weapon).toBe('boomstick');
    g.shoot(a);
    expect(g.w.projectiles.filter((p) => p.kind === 'pellet').length).toBe(COMBAT.boomstick.pellets);
    expect(pa.vx).toBeLessThan(0); // kicked backwards
    run(g, 300);
    expect(P(g, b).lastHit?.how).toBe('boomstick');
    for (let i = 1; i < COMBAT.boomstick.ammo; i++) {
      run(g, COMBAT.boomstick.cooldownMs + 20);
      g.shoot(a);
    }
    expect(pa.weapon).toBe('pistol');
    expect(pa.ammo).toBe(-1);
  });

  it('bombs arc, explode on a fuse, and blast everyone nearby', () => {
    const { g, a, b } = duel(400);
    const pa = P(g, a);
    grantItem(g.w, pa, 'bombs');
    park(g, b); // far away on the left island: out of the blast
    run(g, 50);
    pa.face = 1;
    g.shoot(a);
    const bomb = g.w.projectiles[0];
    expect(bomb.kind).toBe('bomb');
    expect(bomb.vy).toBeLessThan(0); // lobbed upward
    run(g, COMBAT.bomb.fuseMs + 100);
    expect(g.w.projectiles.length).toBe(0);
    expect(pa.ammo).toBe(COMBAT.bomb.ammo - 1);
    expect(hitBy(g, b)).toBeNull();
  });

  it('a bomb explosion launches players inside the radius', () => {
    const { g, a, b } = duel(60);
    const pa = P(g, a);
    const pb = P(g, b);
    grantItem(g.w, pa, 'bombs');
    g.shoot(a);
    // fast-forward the fuse with the bomb sitting just beside the target
    const bomb = g.w.projectiles[0];
    bomb.x = pb.x - 20;
    bomb.y = pb.y + PHYS.playerH / 2;
    bomb.vx = 0;
    bomb.vy = 0;
    bomb.ttlMs = 1;
    run(g, TICK_MS * 2);
    expect(pb.vy).toBeLessThan(0);
    expect(pb.lastHit?.how).toBe('bomb');
  });
});

describe('defense', () => {
  it('a shield blocks hits', () => {
    const { g, a, b } = duel(10);
    grantItem(g.w, P(g, b), 'shield');
    g.shoot(a);
    run(g, 200);
    expect(hitBy(g, b)).toBeNull();
    expect(g.snapshot().players.find((p) => p.id === b)?.shield).toBe(true);
  });

  it('an extra life tops you up, never past the starting count', () => {
    const { g, b } = duel(10);
    const pb = P(g, b);
    pb.lives = 1;
    grantItem(g.w, pb, 'life');
    expect(pb.lives).toBe(2);
    for (let i = 0; i < RUN.lives; i++) grantItem(g.w, pb, 'life');
    expect(pb.lives).toBe(RUN.lives);
  });

  it('spawn invulnerability blocks hits until you attack', () => {
    const { g, a, b } = duel(10);
    const pb = P(g, b);
    pb.invulnUntil = g.simTimeMs + 5000;
    g.shoot(a);
    run(g, 200);
    expect(pb.lastHit).toBeNull();
    pb.face = 1;
    g.shoot(b); // attacking ends invulnerability
    expect(pb.invulnUntil).toBeLessThanOrEqual(g.simTimeMs);
  });

  it('players who are not on stage cannot attack', () => {
    const { g, a } = duel(10);
    const pa = P(g, a);
    pa.life = 'respawning';
    g.shoot(a);
    expect(pa.shotAt).toBeLessThan(0);
    expect(g.w.projectiles.length).toBe(0);
  });
});

describe('outside of play', () => {
  it('attacks do nothing in the lobby', () => {
    const g = newGame('sky');
    const a = g.join('Alice')!.id;
    g.join('Bob');
    g.shoot(a);
    expect(g.w.projectiles.length).toBe(0);
    expect(P(g, a).shotAt).toBeLessThan(0);
  });
});

describe('pistol aim assist', () => {
  it('with no box to shoot, bends shots toward a runner on a different level in front of you', () => {
    const g = newGame('sky');
    const [a, b] = startMatch(g);
    // shooter on the main island (top 440); target up on the right island (top 390)
    place(g, a, 800, 440);
    place(g, b, 1060, 390);
    run(g, 100);
    P(g, a).face = 1;
    g.shoot(a);
    expect(g.w.projectiles[0].vy).toBeLessThan(0);
    run(g, 500);
    expect(hitBy(g, b)).toBe(a);
  });

  it('ignores runners behind you or outside the cone', () => {
    const g = newGame('sky');
    const [a, b] = startMatch(g);
    place(g, a, 640, 440);
    place(g, b, 640, 205); // straight above: way outside the cone
    run(g, 100);
    g.shoot(a);
    expect(g.w.projectiles[0].vy).toBe(0);
  });
});

describe('crate weapons', () => {
  it('SMG: rapid fire, small hits, runs dry back to the pistol', () => {
    const { g, a, b } = duel(150);
    const pa = P(g, a);
    grantItem(g.w, pa, 'smg');
    for (let i = 0; i < 6; i++) {
      g.shoot(a);
      run(g, COMBAT.smg.cooldownMs + 5);
    }
    run(g, 300);
    expect(P(g, b).lastHit?.how).toBe('smg');
    pa.ammo = 1;
    g.shoot(a);
    expect(pa.weapon).toBe('pistol');
  });

  it('rockets fly through runners and blast everyone near where they burn out', () => {
    const { g, a, b } = duel(150);
    grantItem(g.w, P(g, a), 'rockets');
    g.shoot(a);
    const rocket = g.w.projectiles[0];
    expect(rocket.kind).toBe('rocket');
    run(g, 150);
    expect(hitBy(g, b)).toBeNull(); // went straight through
    expect(g.w.projectiles.length).toBe(1);
    // let it burn out right beside Bob
    rocket.x = P(g, b).x - 20;
    rocket.y = P(g, b).y + 20;
    rocket.ttlMs = 1;
    run(g, TICK_MS * 2);
    expect(g.w.projectiles.length).toBe(0);
    expect(P(g, b).lastHit?.how).toBe('rocket');
  });

  it('railgun: telegraphed charge, then a piercing beam that launches everyone in line', () => {
    const g = newGame('sky');
    const [a, b, c] = startMatch(g, ['A', 'B', 'C']);
    place(g, a, 470, 440);
    place(g, b, 640, 440);
    place(g, c, 800, 440);
    run(g, 100);
    const pa = P(g, a);
    pa.face = 1;
    grantItem(g.w, pa, 'railgun');
    g.shoot(a);
    expect(g.snapshot().players.find((p) => p.id === a)?.charging).toBe(true);
    expect(hitBy(g, b)).toBeNull(); // nothing yet: it's charging
    run(g, COMBAT.railgun.chargeMs + 40);
    for (const id of [b, c]) {
      expect(P(g, id).lastHit?.how).toBe('railgun');
      expect(Math.hypot(P(g, id).vx, P(g, id).vy)).toBeGreaterThan(900);
    }
    expect(pa.ammo).toBe(COMBAT.railgun.ammo - 1);
  });

  it('railgun charge fizzles if the shooter is lost mid-charge', () => {
    const { g, a, b } = duel(100);
    grantItem(g.w, P(g, a), 'railgun');
    g.shoot(a);
    P(g, a).life = 'respawning';
    run(g, COMBAT.railgun.chargeMs + 40);
    expect(hitBy(g, b)).toBeNull();
  });
});
