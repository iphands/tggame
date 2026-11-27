/** Item crates: they drop from the sky, land on platforms, and grant power-ups on touch. */
import { ARENA, COMBAT, ITEMS, PHYS } from '../../../shared/src/constants.js';
import type { ItemKind } from '../../../shared/src/types.js';
import { findLanding, isSolid } from '../../../shared/src/sim/platforms.js';
import { randRange } from '@tggame/base/shared/rng';
import type { Crate, Player, World } from '../../../shared/src/sim/model.js';

const ITEM_WEIGHTS: [ItemKind, number][] = [
  ['boomstick', 3],
  ['bombs', 3],
  ['smg', 3],
  ['rockets', 2],
  ['railgun', 1], // rare and devastating
  ['shield', 2],
  ['heal', 2],
];

export function rollItem(rng: () => number): ItemKind {
  const total = ITEM_WEIGHTS.reduce((s, [, n]) => s + n, 0);
  let r = rng() * total;
  for (const [item, n] of ITEM_WEIGHTS) {
    r -= n;
    if (r < 0) return item;
  }
  return 'heal';
}

export function scheduleFirstCrate(w: World): void {
  w.nextCrateAt = w.t + randRange(w.rng, ITEMS.firstCrateMinMs, ITEMS.firstCrateMaxMs);
}

export function spawnCrate(w: World, item: ItemKind = rollItem(w.rng)): Crate | null {
  const solid = w.plats.filter(isSolid);
  if (solid.length === 0) return null;
  const pl = solid[Math.floor(w.rng() * solid.length)];
  const x = pl.x + w.rng() * Math.max(0, pl.w - ITEMS.size);
  const crate: Crate = { id: w.seq.crate++, item, x, y: -ITEMS.size - 10, vy: 0, platIdx: -1, bornAt: w.t };
  w.crates.push(crate);
  w.fx.push({ k: 'crate', x: x + ITEMS.size / 2, y: 0 });
  return crate;
}

export function grantItem(w: World, p: Player, item: ItemKind): void {
  if (item === 'boomstick') {
    p.weapon = 'boomstick';
    p.ammo = COMBAT.boomstick.ammo;
  } else if (item === 'bombs') {
    p.weapon = 'bombs';
    p.ammo = COMBAT.bomb.ammo;
  } else if (item === 'smg') {
    p.weapon = 'smg';
    p.ammo = COMBAT.smg.ammo;
  } else if (item === 'rockets') {
    p.weapon = 'rockets';
    p.ammo = COMBAT.rocket.ammo;
  } else if (item === 'railgun') {
    p.weapon = 'railgun';
    p.ammo = COMBAT.railgun.ammo;
    p.chargeUntil = 0;
  } else if (item === 'shield') {
    p.shieldUntil = w.t + COMBAT.shieldMs;
  } else {
    p.dmg = Math.max(0, p.dmg - COMBAT.heal);
  }
}

/** Spawn timer, falling, riding platforms, expiry and pickup. */
export function updateCrates(w: World, dtMs: number, timeLeftMs: number): void {
  const s = dtMs / 1000;
  const S = ITEMS.size;

  if (w.t >= w.nextCrateAt) {
    if (w.crates.length < ITEMS.maxCrates) spawnCrate(w);
    const mul = timeLeftMs <= ITEMS.finaleMs ? ITEMS.finaleMul : 1;
    w.nextCrateAt = w.t + randRange(w.rng, ITEMS.intervalMinMs, ITEMS.intervalMaxMs) * mul;
  }

  const keep: Crate[] = [];
  for (const c of w.crates) {
    if (w.t - c.bornAt > ITEMS.lifeMs) continue;

    const ride = c.platIdx >= 0 ? w.plats[c.platIdx] : null;
    if (ride && isSolid(ride)) {
      c.x += ride.x - ride.prevX;
      c.y = ride.y - S;
    } else {
      c.platIdx = -1;
      c.vy = Math.min(c.vy + ITEMS.gravity * s, ITEMS.maxFall);
      const prevBottom = c.y + S;
      c.y += c.vy * s;
      if (c.vy >= 0) {
        const idx = findLanding(w.plats, c.x, S, prevBottom, c.y + S);
        if (idx >= 0) {
          c.y = w.plats[idx].y - S;
          c.vy = 0;
          c.platIdx = idx;
        }
      }
      if (c.y > ARENA.blastBottom) continue;
    }

    let taker: Player | null = null;
    for (const p of w.players.values()) {
      if (p.life !== 'alive') continue;
      if (p.x < c.x + S && p.x + PHYS.playerW > c.x && p.y < c.y + S && p.y + PHYS.playerH > c.y) {
        taker = p;
        break;
      }
    }
    if (taker) {
      grantItem(w, taker, c.item);
      w.fx.push({ k: 'pickup', x: c.x + S / 2, y: c.y + S / 2, id: taker.id, item: c.item });
      continue;
    }
    keep.push(c);
  }
  w.crates = keep;
}
