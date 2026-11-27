/** Attacks, projectiles, knockback. */
import { ARENA, COMBAT, PHYS } from '../../../shared/src/constants.js';
import type { HitHow } from '../../../shared/src/types.js';
import { findLanding } from './platforms.js';
import type { Player, Projectile, World } from './model.js';

const W = PHYS.playerW;
const H = PHYS.playerH;
const RAD = Math.PI / 180;

export type HitSpec = {
  dmg: number;
  base: number;
  growth: number;
  /** Launch direction (need not be normalized). +y is down. */
  dirX: number;
  dirY: number;
  how: HitHow;
};

/** Knockback speed for a victim who is now at `dmg` percent. */
export function knockSpeed(base: number, growth: number, dmg: number): number {
  return Math.min(COMBAT.maxKnock, base + growth * dmg);
}

/**
 * Deal damage + knockback. Returns false if the hit was blocked
 * (spawn invulnerability or shield) or the victim isn't on stage.
 */
export function applyHit(w: World, attacker: Player | null, victim: Player, spec: HitSpec): boolean {
  if (victim.life !== 'alive') return false;
  if (w.t < victim.invulnUntil || w.t < victim.shieldUntil) {
    w.fx.push({ k: 'block', x: victim.x + W / 2, y: victim.y + H / 2, id: victim.id });
    return false;
  }
  victim.dmg = Math.min(999, victim.dmg + spec.dmg);
  const credited = attacker !== null && attacker !== victim;
  if (credited) attacker.dmgDealt += spec.dmg;

  const speed = knockSpeed(spec.base, spec.growth, victim.dmg);
  const len = Math.hypot(spec.dirX, spec.dirY) || 1;
  let vx = (spec.dirX / len) * speed;
  let vy = (spec.dirY / len) * speed;
  // a downward hit on a grounded player pops them up instead of into the floor
  if (victim.grounded && vy > 0) vy = -vy * 0.4;
  if (Math.abs(vx) < 1 && Math.abs(vy) < 1) vx = speed;

  victim.vx = vx;
  victim.vy = vy;
  victim.cuttable = false;
  victim.grounded = false;
  victim.platIdx = -1;
  victim.coyoteMs = 0;
  victim.launchUntil = w.t + speed * COMBAT.hitstunPerSpeed;
  victim.boostUntil = Math.max(victim.boostUntil, victim.launchUntil);
  if (credited) victim.lastHit = { by: attacker.id, at: w.t, how: spec.how };

  w.fx.push({
    k: 'hit',
    x: victim.x + W / 2,
    y: victim.y + H / 2,
    id: victim.id,
    by: attacker ? attacker.id : null,
    power: Math.round(speed),
    how: spec.how,
  });
  return true;
}

/** Direction for an attack facing `face`, angled `deg` above horizontal. */
export function angled(face: number, deg: number): { dirX: number; dirY: number } {
  return { dirX: face * Math.cos(deg * RAD), dirY: -Math.sin(deg * RAD) };
}

/** Shooting ends spawn invulnerability early. */
function dropInvuln(w: World, p: Player): void {
  if (p.invulnUntil > w.t) p.invulnUntil = w.t;
}

// ------------------------------------------------------------------ stomp

/** a lands on b's head this tick? */
function isStomp(a: Player, b: Player): boolean {
  if (a.vy <= 0 || a.grounded) return false;
  if (a.prevBottom > b.y + 6) return false; // feet must cross the head top this tick
  const feet = a.y + H;
  if (feet < b.y || feet > b.y + H * 0.55) return false;
  const overlap = Math.min(a.x + W, b.x + W) - Math.max(a.x, b.x);
  return overlap >= 8;
}

export function updateStomps(w: World, alive: Player[]): void {
  const S = COMBAT.stomp;
  for (const a of alive) {
    for (const b of alive) {
      if (a === b || a.life !== 'alive' || b.life !== 'alive') continue;
      if (!isStomp(a, b)) continue;
      a.vy = -S.bounceVel;
      a.cuttable = true;
      a.airJumpsLeft = PHYS.airJumps;
      a.y = b.y - H;
      const diff = b.x - a.x;
      const side = diff > 0 ? 1 : diff < 0 ? -1 : a.face;
      // airborne victims get spiked down; grounded ones popped up and away
      const dir = b.grounded ? angled(side, S.angleDeg) : { dirX: side * 0.35, dirY: 1 };
      applyHit(w, a, b, { dmg: S.dmg, base: S.base, growth: S.growth, ...dir, how: 'stomp' });
      break; // one stomp per stomper per tick
    }
  }
}

// ------------------------------------------------------------------ guns

function weaponCooldown(p: Player): number {
  switch (p.weapon) {
    case 'boomstick':
      return COMBAT.boomstick.cooldownMs;
    case 'bombs':
      return COMBAT.bomb.cooldownMs;
    case 'smg':
      return COMBAT.smg.cooldownMs;
    case 'rockets':
      return COMBAT.rocket.cooldownMs;
    case 'railgun':
      return COMBAT.railgun.cooldownMs;
    default:
      return COMBAT.pistol.cooldownMs;
  }
}

function spendAmmo(p: Player): void {
  if (p.ammo < 0) return;
  p.ammo--;
  if (p.ammo <= 0) {
    p.weapon = 'pistol';
    p.ammo = -1;
  }
}

/**
 * Fire button pressed (clients repeat this while it is held). Guns fire at
 * once. Bombs wind up instead: the throw happens on release, or by itself at
 * full strength once the wind-up completes, so a tap lobs short and a hold
 * throws long.
 */
export function pressFire(w: World, p: Player): void {
  if (p.weapon !== 'bombs') {
    fire(w, p);
    return;
  }
  if (p.life !== 'alive' || p.windAt > 0) return;
  if (w.t - p.shotAt < weaponCooldown(p)) return;
  p.windAt = w.t;
}

/** Fire button released: throw a winding-up bomb with the strength built so far. */
export function releaseFire(w: World, p: Player): void {
  if (p.windAt <= 0) return;
  const power = Math.min(1, (w.t - p.windAt) / COMBAT.bomb.holdMs);
  p.windAt = 0;
  if (p.weapon === 'bombs') fire(w, p, power);
}

/** `power` (0..1) scales the bomb throw from a short lob to the full arc. */
export function fire(w: World, p: Player, power = 1): boolean {
  if (p.life !== 'alive') return false;
  if (p.chargeUntil > 0) return false; // railgun already charging
  if (w.t - p.shotAt < weaponCooldown(p)) return false;
  p.shotAt = w.t;
  dropInvuln(w, p);

  const muzzleX = p.x + W / 2 + p.face * (W / 2 + 6);
  const muzzleY = p.y + H * 0.45;
  const weapon = p.weapon;

  if (weapon === 'railgun') {
    // telegraphed: the beam fires after a short charge (see updateCharges)
    p.chargeUntil = w.t + COMBAT.railgun.chargeMs;
    w.fx.push({ k: 'charge', x: muzzleX, y: muzzleY, id: p.id });
    return true;
  }

  const aim = assistAngle(w, p, muzzleX, muzzleY);
  if (weapon === 'pistol') {
    const P = COMBAT.pistol;
    spawn(w, p, 'bullet', muzzleX, muzzleY, p.face * Math.cos(aim) * P.speed, Math.sin(aim) * P.speed, P.ttlMs, P.angleDeg);
  } else if (weapon === 'boomstick') {
    const B = COMBAT.boomstick;
    for (let i = 0; i < B.pellets; i++) {
      const a = aim + (-B.spreadDeg / 2 + (B.spreadDeg * i) / (B.pellets - 1)) * RAD;
      spawn(w, p, 'pellet', muzzleX, muzzleY, p.face * Math.cos(a) * B.speed, Math.sin(a) * B.speed, B.ttlMs, B.angleDeg);
    }
    // recoil kicks the shooter backwards
    p.vx -= p.face * B.recoil;
    p.boostUntil = Math.max(p.boostUntil, w.t + 160);
    spendAmmo(p);
  } else if (weapon === 'smg') {
    const S = COMBAT.smg;
    const a = aim + (w.rng() - 0.5) * S.spreadDeg * RAD;
    spawn(w, p, 'dart', muzzleX, muzzleY, p.face * Math.cos(a) * S.speed, Math.sin(a) * S.speed, S.ttlMs, S.angleDeg);
    spendAmmo(p);
  } else if (weapon === 'rockets') {
    const R = COMBAT.rocket;
    spawn(w, p, 'rocket', muzzleX, muzzleY, p.face * Math.cos(aim) * R.speed, Math.sin(aim) * R.speed, R.ttlMs, 0);
    p.vx -= p.face * R.recoil;
    p.boostUntil = Math.max(p.boostUntil, w.t + 120);
    spendAmmo(p);
  } else {
    const B = COMBAT.bomb;
    const k = Math.max(0, Math.min(1, power));
    const vx = p.face * (B.shortVx + (B.throwVx - B.shortVx) * k) + p.vx * 0.5;
    const vy = B.shortVy + (B.throwVy - B.shortVy) * k + Math.min(0, p.vy * 0.3);
    spawn(w, p, 'bomb', muzzleX, p.y + 10, vx, vy, B.fuseMs, 0);
    spendAmmo(p);
  }
  w.fx.push({ k: 'shot', x: muzzleX, y: muzzleY, id: p.id, weapon, face: p.face });
  return true;
}

/**
 * Aim assist: angle (radians, +down, relative to facing) toward the nearest
 * on-stage foe in front of the shooter within the assist cone, else 0.
 */
export function assistAngle(w: World, p: Player, mx: number, my: number): number {
  const A = COMBAT.aimAssist;
  let best = 0;
  let bestDist = Infinity;
  for (const q of w.players.values()) {
    if (q === p || q.life !== 'alive') continue;
    const dx = (q.x + W / 2 - mx) * p.face;
    const dy = q.y + H / 2 - my;
    if (dx <= 0) continue; // behind
    const dist = Math.hypot(dx, dy);
    if (dist > A.range) continue;
    const a = Math.atan2(dy, dx);
    if (Math.abs(a) > A.maxDeg * RAD) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}

/** Fire railgun beams whose charge has finished, and fully wound-up bombs. Call once per tick. */
export function updateCharges(w: World): void {
  for (const p of w.players.values()) {
    if (p.windAt > 0) {
      if (p.life !== 'alive' || p.weapon !== 'bombs') p.windAt = 0;
      else if (w.t - p.windAt >= COMBAT.bomb.holdMs) releaseFire(w, p);
    }
    if (p.chargeUntil <= 0) continue;
    if (p.life !== 'alive') {
      p.chargeUntil = 0;
      continue;
    }
    if (w.t < p.chargeUntil) continue;
    p.chargeUntil = 0;
    fireRail(w, p);
  }
}

/** Screen-wide piercing beam: hits every foe along the line. */
function fireRail(w: World, p: Player): void {
  const R = COMBAT.railgun;
  const mx = p.x + W / 2 + p.face * (W / 2 + 6);
  const my = p.y + H * 0.45;
  const aim = assistAngle(w, p, mx, my);
  const dx = p.face * Math.cos(aim);
  const dy = Math.sin(aim);
  const x2 = mx + dx * R.range;
  const y2 = my + dy * R.range;
  const pad = R.width / 2;
  for (const q of w.players.values()) {
    if (q === p || q.life !== 'alive') continue;
    if (!segmentHitsBox(mx, my, x2, y2, q.x - pad, q.y - pad, q.x + W + pad, q.y + H + pad)) continue;
    applyHit(w, p, q, { dmg: R.dmg, base: R.base, growth: R.growth, ...angled(p.face, R.angleDeg), how: 'railgun' });
  }
  // big kick back on the shooter
  p.vx -= p.face * R.recoil;
  p.boostUntil = Math.max(p.boostUntil, w.t + 200);
  w.fx.push({ k: 'beam', x: mx, y: my, x2, y2, id: p.id, color: p.color });
  spendAmmo(p);
}

/** Liang–Barsky segment vs axis-aligned box. */
export function segmentHitsBox(x1: number, y1: number, x2: number, y2: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x1 - bx0) && clip(dx, bx1 - x1) && clip(-dy, y1 - by0) && clip(dy, by1 - y1) && t0 <= t1;
}

function spawn(
  w: World,
  owner: Player,
  kind: Projectile['kind'],
  x: number,
  y: number,
  vx: number,
  vy: number,
  ttlMs: number,
  angleDeg: number
): void {
  w.projectiles.push({ id: w.seq.projectile++, kind, owner: owner.id, x, y, vx, vy, ttlMs, bornAt: w.t, angleDeg });
}

export function updateProjectiles(w: World, dtMs: number): void {
  const s = dtMs / 1000;
  const next: Projectile[] = [];
  for (const pr of w.projectiles) {
    pr.ttlMs -= dtMs;
    if (pr.kind === 'bomb') {
      if (updateBomb(w, pr, s)) next.push(pr);
      continue;
    }
    if (pr.kind === 'rocket') {
      if (updateRocket(w, pr, s)) next.push(pr);
      continue;
    }
    const x0 = pr.x;
    const y0 = pr.y;
    const x1 = pr.x + pr.vx * s;
    const y1 = pr.y + pr.vy * s;
    if (pr.ttlMs <= 0 || x1 < -100 || x1 > ARENA.width + 100) continue;

    // swept AABB vs bodies; the first body along the path is hit
    const minX = Math.min(x0, x1) - 3;
    const maxX = Math.max(x0, x1) + 3;
    const minY = Math.min(y0, y1) - 3;
    const maxY = Math.max(y0, y1) + 3;
    let hit: Player | null = null;
    let best = Infinity;
    for (const q of w.players.values()) {
      if (q.life !== 'alive' || q.id === pr.owner) continue;
      if (maxX < q.x || minX > q.x + W || maxY < q.y || minY > q.y + H) continue;
      const d = Math.abs(q.x + W / 2 - x0);
      if (d < best) {
        best = d;
        hit = q;
      }
    }
    if (hit) {
      const owner = w.players.get(pr.owner) ?? null;
      const spec = pr.kind === 'bullet' ? COMBAT.pistol : pr.kind === 'dart' ? COMBAT.smg : COMBAT.boomstick;
      applyHit(w, owner, hit, {
        dmg: spec.dmg,
        base: spec.base,
        growth: spec.growth,
        ...angled(Math.sign(pr.vx) || 1, pr.angleDeg),
        how: pr.kind === 'bullet' ? 'pistol' : pr.kind === 'dart' ? 'smg' : 'boomstick',
      });
      continue; // consumed
    }
    pr.x = x1;
    pr.y = y1;
    next.push(pr);
  }
  w.projectiles = next;
}

/** Returns true if the bomb survives this tick. */
function updateBomb(w: World, b: Projectile, s: number): boolean {
  const B = COMBAT.bomb;
  b.vy = Math.min(b.vy + B.gravity * w.level.gravityScale * s, 1400);
  const prevBottom = b.y + 6;
  b.x += b.vx * s;
  b.y += b.vy * s;
  if (b.y > ARENA.blastBottom) return false;

  if (b.vy >= 0) {
    const idx = findLanding(w.plats, b.x - 6, 12, prevBottom, b.y + 6);
    if (idx >= 0) {
      const pl = w.plats[idx];
      b.y = pl.y - 6;
      if (pl.kind === 'bounce') {
        b.vy = -900;
      } else if (b.vy > 220) {
        b.vy = -b.vy * 0.45;
        b.vx *= 0.7;
      } else {
        b.vy = 0;
        b.vx *= 0.85;
        b.x += pl.x - pl.prevX;
      }
    }
  }

  let direct = false;
  if (w.t - b.bornAt >= B.armMs) {
    for (const q of w.players.values()) {
      if (q.life !== 'alive' || q.id === b.owner) continue;
      if (b.x + 6 > q.x && b.x - 6 < q.x + W && b.y + 6 > q.y && b.y - 6 < q.y + H) {
        direct = true;
        break;
      }
    }
  }
  if (direct || b.ttlMs <= 0) {
    explode(w, b);
    return false;
  }
  return true;
}

/** Rockets fly straight, speed up, and explode on the first body they touch. Returns true if alive. */
function updateRocket(w: World, r: Projectile, s: number): boolean {
  const R = COMBAT.rocket;
  const speed = Math.hypot(r.vx, r.vy) || 1;
  const next = Math.min(R.maxSpeed, speed + R.accel * s);
  r.vx = (r.vx / speed) * next;
  r.vy = (r.vy / speed) * next;
  const x0 = r.x;
  const y0 = r.y;
  r.x += r.vx * s;
  r.y += r.vy * s;
  if (r.x < ARENA.blastLeft || r.x > ARENA.blastRight || r.y > ARENA.blastBottom || r.y < ARENA.blastTop) return false;
  let hit = false;
  for (const q of w.players.values()) {
    if (q.life !== 'alive' || q.id === r.owner) continue;
    if (segmentHitsBox(x0, y0, r.x, r.y, q.x - 4, q.y - 4, q.x + W + 4, q.y + H + 4)) {
      hit = true;
      break;
    }
  }
  if (hit || r.ttlMs <= 0) {
    explode(w, r);
    return false;
  }
  return true;
}

export function explode(w: World, b: Projectile): void {
  const B = b.kind === 'rocket' ? COMBAT.rocket : COMBAT.bomb;
  const how = b.kind === 'rocket' ? 'rocket' : 'bomb';
  w.fx.push({ k: 'boom', x: b.x, y: b.y, r: B.radius });
  const owner = w.players.get(b.owner) ?? null;
  const minA = B.minAngleDeg * RAD;
  for (const q of w.players.values()) {
    if (q.life !== 'alive') continue;
    const dx = q.x + W / 2 - b.x;
    const dy = q.y + H / 2 - b.y;
    const d = Math.hypot(dx, dy);
    if (d > B.radius) continue;
    const f = 1 - (d / B.radius) * 0.5; // 0.5..1 falloff
    const side = Math.abs(dx) < 1 ? (Math.sign(b.vx) || 1) : Math.sign(dx);
    const a = Math.max(Math.atan2(-dy, Math.abs(dx)), minA);
    const self = owner !== null && q === owner;
    applyHit(w, owner, q, {
      dmg: B.dmg * f * (self ? 0.5 : 1),
      base: B.base * f * (self ? 0.7 : 1),
      growth: B.growth * f,
      dirX: side * Math.cos(a),
      dirY: -Math.sin(a),
      how,
    });
  }
}
