import { describe, it, expect } from 'vitest';
import { COMBAT, MATCH, PHYS } from '../../shared/src/constants.js';
import { knockSpeed } from '../../server/src/sim/combat.js';
import { grantItem } from '../../server/src/sim/items.js';
import { newGame, startMatch, run, place, park, P, TICK_MS } from './helpers.js';

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

describe('punch', () => {
  it('hits a foe in front: damage + knockback away from the puncher', () => {
    const { g, a, b } = duel(10);
    g.punch(a);
    run(g, TICK_MS * 3);
    const pb = P(g, b);
    expect(pb.dmg).toBe(COMBAT.punch.dmg);
    expect(pb.vx).toBeGreaterThan(200);
    expect(pb.vy).toBeLessThan(0);
    expect(pb.lastHit?.by).toBe(a);
    expect(P(g, a).dmgDealt).toBe(COMBAT.punch.dmg);
  });

  it('misses someone behind you', () => {
    const { g, a, b } = duel(10);
    P(g, a).face = -1;
    g.punch(a);
    run(g, 200);
    expect(P(g, b).dmg).toBe(0);
  });

  it('one punch hits a target only once, and respects the cooldown', () => {
    const { g, a, b } = duel(10);
    g.punch(a);
    run(g, TICK_MS);
    g.punch(a); // still cooling down
    run(g, COMBAT.punch.activeMs + 20);
    expect(P(g, b).dmg).toBe(COMBAT.punch.dmg);
  });

  it('knockback grows with damage', () => {
    expect(knockSpeed(330, 5.4, 100)).toBeGreaterThan(knockSpeed(330, 5.4, 10) * 2);
    const launch = (startDmg: number) => {
      const { g, a, b } = duel(10);
      P(g, b).dmg = startDmg;
      g.punch(a);
      run(g, TICK_MS * 2);
      return Math.hypot(P(g, b).vx, P(g, b).vy);
    };
    expect(launch(120)).toBeGreaterThan(launch(0) * 2);
  });

  it('a heavily damaged player gets punched clean off the stage', () => {
    const { g, a, b } = duel(10);
    place(g, a, 760, 440);
    place(g, b, 790, 440);
    run(g, 50);
    P(g, a).face = 1;
    P(g, b).dmg = 180;
    g.punch(a);
    run(g, 4000);
    expect(P(g, b).stocks).toBe(MATCH.stocks - 1);
    expect(P(g, a).kos).toBe(1);
    expect(g.w.feed[0]).toMatchObject({ victim: 'Bob', killer: 'Alice', how: 'punch' });
  });
});

describe('stomp', () => {
  it('bounces the stomper and damages the stomped', () => {
    const { g, a, b } = duel(200);
    const pb = P(g, b);
    const pa = place(g, a, pb.x + PHYS.playerW / 2, pb.y - 40);
    pa.vy = 600;
    run(g, TICK_MS * 4);
    expect(pa.vy).toBeLessThan(-500);
    expect(pb.dmg).toBe(COMBAT.stomp.dmg);
    expect(pb.lastHit?.how).toBe('stomp');
  });

  it('side contact is not a stomp', () => {
    const { g, a, b } = duel(0);
    run(g, 300);
    expect(P(g, a).dmg).toBe(0);
    expect(P(g, b).dmg).toBe(0);
  });
});

describe('guns', () => {
  it('pistol bullets fly, hit, and nudge the target', () => {
    const { g, a, b } = duel(150);
    g.shoot(a);
    expect(g.w.projectiles.length).toBe(1);
    run(g, 400);
    expect(P(g, b).dmg).toBe(COMBAT.pistol.dmg);
    expect(P(g, b).lastHit?.how).toBe('pistol');
    expect(g.w.projectiles.length).toBe(0);
  });

  it('pistol has a cooldown and never hits its owner', () => {
    const { g, a } = duel(300);
    g.shoot(a);
    g.shoot(a);
    expect(g.w.projectiles.length).toBe(1);
    run(g, 800);
    expect(P(g, a).dmg).toBe(0);
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
    expect(P(g, b).dmg).toBeGreaterThanOrEqual(COMBAT.boomstick.dmg * 3);
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
    expect(P(g, b).dmg).toBe(0);
  });

  it('a bomb explosion damages and launches players inside the radius', () => {
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
    expect(pb.dmg).toBeGreaterThan(COMBAT.bomb.dmg * 0.5);
    expect(pb.vy).toBeLessThan(0);
    expect(pb.lastHit?.how).toBe('bomb');
  });
});

describe('defense', () => {
  it('a shield blocks hits', () => {
    const { g, a, b } = duel(10);
    grantItem(g.w, P(g, b), 'shield');
    g.punch(a);
    run(g, 200);
    expect(P(g, b).dmg).toBe(0);
    expect(g.snapshot().players.find((p) => p.id === b)?.shield).toBe(true);
  });

  it('heal cuts damage but never below zero', () => {
    const { g, b } = duel(10);
    const pb = P(g, b);
    pb.dmg = 55;
    grantItem(g.w, pb, 'heal');
    expect(pb.dmg).toBe(55 - COMBAT.heal);
    grantItem(g.w, pb, 'heal');
    expect(pb.dmg).toBe(0);
  });

  it('spawn invulnerability blocks hits until you attack', () => {
    const { g, a, b } = duel(10);
    const pb = P(g, b);
    pb.invulnUntil = g.simTimeMs + 5000;
    g.punch(a);
    run(g, 200);
    expect(pb.dmg).toBe(0);
    pb.face = 1;
    g.punch(b); // attacking ends invulnerability
    expect(pb.invulnUntil).toBeLessThanOrEqual(g.simTimeMs);
  });

  it('players who are not on stage cannot attack', () => {
    const { g, a } = duel(10);
    const pa = P(g, a);
    pa.life = 'respawning';
    g.punch(a);
    g.shoot(a);
    expect(pa.punchAt).toBeLessThan(0);
    expect(g.w.projectiles.length).toBe(0);
  });
});

describe('outside of play', () => {
  it('attacks do nothing in the lobby', () => {
    const g = newGame('sky');
    const a = g.join('Alice')!.id;
    g.join('Bob');
    g.punch(a);
    g.shoot(a);
    expect(g.w.projectiles.length).toBe(0);
    expect(P(g, a).punchAt).toBeLessThan(0);
  });
});

describe('pistol aim assist', () => {
  it('bends shots toward a foe on a different level in front of you', () => {
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
    expect(P(g, b).dmg).toBe(COMBAT.pistol.dmg);
  });

  it('ignores foes behind you or outside the cone', () => {
    const g = newGame('sky');
    const [a, b] = startMatch(g);
    place(g, a, 640, 440);
    place(g, b, 640, 205); // straight above: way outside the cone
    run(g, 100);
    g.shoot(a);
    expect(g.w.projectiles[0].vy).toBe(0);
  });
});
