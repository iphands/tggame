/** Item crates: they drop from the sky just ahead of the pack, land on platforms, and grant power-ups on touch. */
import { ARENA, COMBAT, ITEMS, PHYS, RUN } from '../../../shared/src/constants.js';
import type { ItemKind } from '../../../shared/src/types.js';
import { findLanding, isSolid } from './platforms.js';
import { randRange } from './rng.js';
import { activeGate, centerX, type Crate, type Player, type World } from './model.js';

const ITEM_WEIGHTS: [ItemKind, number][] = [
  ['boomstick', 3],
  ['bombs', 3],
  ['smg', 3],
  ['rockets', 2],
  ['railgun', 1], // rare and devastating
  ['shield', 2],
  ['life', 2],
];

export function rollItem(rng: () => number): ItemKind {
  const total = ITEM_WEIGHTS.reduce((s, [, n]) => s + n, 0);
  let r = rng() * total;
  for (const [item, n] of ITEM_WEIGHTS) {
    r -= n;
    if (r < 0) return item;
  }
  return 'life';
}

/** A weapon (never a shield or a life), weighted like the crates. */
export function rollWeapon(rng: () => number): ItemKind {
  const weapons = ITEM_WEIGHTS.filter(([item]) => item !== 'shield' && item !== 'life');
  const total = weapons.reduce((s, [, n]) => s + n, 0);
  let r = rng() * total;
  for (const [item, n] of weapons) {
    r -= n;
    if (r < 0) return item;
  }
  return 'boomstick';
}

/** A blue weapon box broke at (x, y): every runner still racing gets the same weapon, fully loaded. */
export function armEveryone(w: World, x: number, y: number, item: ItemKind = rollWeapon(w.rng)): void {
  for (const p of w.players.values()) if (p.life === 'alive' && p.finishMs < 0) grantItem(w, p, item);
  w.fx.push({ k: 'arms', x, y, item });
}

export function scheduleFirstCrate(w: World): void {
  w.nextCrateAt = w.t + randRange(w.rng, ITEMS.firstCrateMinMs, ITEMS.firstCrateMaxMs);
}

/**
 * Drop a crate onto plain floor between the leader and just past the right
 * edge of the screen (never behind a standing gate or past the finish).
 */
export function spawnCrate(w: World, item: ItemKind = rollItem(w.rng)): Crate | null {
  const S = ITEMS.size;
  let leader = w.scrollX + ARENA.width * 0.3;
  for (const p of w.players.values()) if (p.life === 'alive' && p.finishMs < 0) leader = Math.max(leader, centerX(p));
  const lo = Math.max(leader + 120, w.scrollX + 60);
  let hi = Math.min(w.scrollX + ARENA.width + 160, w.level.finishX - 80);
  const gate = activeGate(w);
  if (gate) hi = Math.min(hi, gate.x - 50);

  // candidate stretches: [from, to] ranges of crate x on solid, plain, static platforms
  const spans: [number, number][] = [];
  for (const pl of w.plats) {
    if (pl.box || !isSolid(pl) || pl.def.move || pl.kind === 'crumble' || pl.kind === 'bounce') continue;
    const from = Math.max(pl.x, lo);
    const to = Math.min(pl.x + pl.w - S, hi - S);
    if (to >= from) spans.push([from, to]);
  }
  if (spans.length === 0) return null;
  const total = spans.reduce((n, [a, b]) => n + (b - a) + 1, 0);
  let r = w.rng() * total;
  let x = spans[0][0];
  for (const [a, b] of spans) {
    const len = b - a + 1;
    if (r < len) {
      x = a + r;
      break;
    }
    r -= len;
  }
  const crate: Crate = { id: w.seq.crate++, item, x, y: -S - 10, vy: 0, platIdx: -1, bornAt: w.t };
  w.crates.push(crate);
  w.fx.push({ k: 'crate', x: x + S / 2, y: 0 });
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
    p.lives = Math.min(RUN.lives, p.lives + 1);
  }
}

/** Spawn timer, falling, riding platforms, expiry and pickup. */
export function updateCrates(w: World, dtMs: number): void {
  const s = dtMs / 1000;
  const S = ITEMS.size;

  if (w.t >= w.nextCrateAt) {
    if (w.crates.length < ITEMS.maxCrates) spawnCrate(w);
    w.nextCrateAt = w.t + randRange(w.rng, ITEMS.intervalMinMs, ITEMS.intervalMaxMs);
  }

  const keep: Crate[] = [];
  for (const c of w.crates) {
    if (w.t - c.bornAt > ITEMS.lifeMs) continue;
    if (c.x + S < w.scrollX) continue; // left behind by the screen

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
      if (c.y > ARENA.height + RUN.fallBelow) continue;
    }

    let taker: Player | null = null;
    for (const p of w.players.values()) {
      if (p.life !== 'alive' || p.finishMs >= 0) continue;
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
