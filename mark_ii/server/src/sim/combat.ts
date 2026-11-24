/** Attacks, projectiles, knockback. */
import { ARENA, BOX, COMBAT, PHYS, RUN } from '../../../shared/src/constants.js';
import type { HitHow } from '../../../shared/src/types.js';
import { damageBox, damageGate, isBreakable, type ShotKind } from './boxes.js';
import { findLanding, isSolid } from './platforms.js';
import { activeGate, type Player, type Projectile, type World } from './model.js';

const W = PHYS.playerW;
const H = PHYS.playerH;
const RAD = Math.PI / 180;

export type HitSpec = {
  base: number;
  growth: number;
  /** Launch direction (need not be normalized). +y is down. */
  dirX: number;
  dirY: number;
  how: HitHow;
};

/** Knockback speed for a victim at `dmg` percent. Runners always count as RUN.shovePct: hits shove, they never build up. */
export function knockSpeed(base: number, growth: number, dmg: number): number {
  return Math.min(COMBAT.maxKnock, base + growth * dmg);
}

/**
 * Shove a runner. Returns false if the hit was blocked (spawn
 * invulnerability or shield) or the victim isn't running (off the course, or
 * already across the line).
 */
export function applyHit(w: World, attacker: Player | null, victim: Player, spec: HitSpec): boolean {
  if (victim.life !== 'alive' || victim.finishMs >= 0) return false;
  if (w.t < victim.invulnUntil || w.t < victim.shieldUntil) {
    w.fx.push({ k: 'block', x: victim.x + W / 2, y: victim.y + H / 2, id: victim.id });
    return false;
  }
  const credited = attacker !== null && attacker !== victim;
  const speed = knockSpeed(spec.base, spec.growth, RUN.shovePct);
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
      if (a.finishMs >= 0 || b.finishMs >= 0) continue;
      if (!isStomp(a, b)) continue;
      a.vy = -S.bounceVel;
      a.cuttable = true;
      a.airJumpsLeft = PHYS.airJumps;
      a.y = b.y - H;
      const diff = b.x - a.x;
      const side = diff > 0 ? 1 : diff < 0 ? -1 : a.face;
      // airborne victims get spiked down; grounded ones popped up and away
      const dir = b.grounded ? angled(side, S.angleDeg) : { dirX: side * 0.35, dirY: 1 };
      applyHit(w, a, b, { base: S.base, growth: S.growth, ...dir, how: 'stomp' });
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

export function fire(w: World, p: Player): boolean {
  if (p.life !== 'alive' || p.finishMs >= 0) return false;
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
    const vx = p.face * B.throwVx + p.vx * 0.5;
    const vy = B.throwVy + Math.min(0, p.vy * 0.3);
    spawn(w, p, 'bomb', muzzleX, p.y + 10, vx, vy, B.fuseMs, 0);
    spendAmmo(p);
  }
  w.fx.push({ k: 'shot', x: muzzleX, y: muzzleY, id: p.id, weapon, face: p.face });
  return true;
}

/**
 * Aim assist: angle (radians, +down, relative to facing) toward the nearest
 * breakable box in front of the shooter within the assist cone; with no box
 * to shoot, toward the nearest runner. 0 if nothing qualifies (or the gate is
 * the nearest thing: it fills the whole screen height).
 */
export function assistAngle(w: World, p: Player, mx: number, my: number): number {
  const A = COMBAT.aimAssist;
  let best = 0;
  let bestDist = Infinity;
  const consider = (dx: number, dy: number) => {
    if (dx <= 0) return; // behind
    const dist = Math.hypot(dx, dy);
    if (dist > A.range || dist >= bestDist) return;
    const a = Math.atan2(dy, dx);
    if (Math.abs(a) > A.maxDeg * RAD) return;
    bestDist = dist;
    best = a;
  };
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isBreakable(pl)) continue;
    const nearX = p.face > 0 ? pl.x : pl.x + pl.w;
    const ty = Math.min(Math.max(my, pl.y + 8), pl.y + pl.h - 8);
    consider((nearX - mx) * p.face, ty - my);
  }
  const gate = activeGate(w);
  if (gate && p.face > 0) consider(gate.x - mx, 0);
  if (bestDist < Infinity) return best;
  for (const q of w.players.values()) {
    if (q === p || q.life !== 'alive' || q.finishMs >= 0) continue;
    consider((q.x + W / 2 - mx) * p.face, q.y + H / 2 - my);
  }
  return best;
}

/** Fire railgun beams whose charge has finished. Call once per tick. */
export function updateCharges(w: World): void {
  for (const p of w.players.values()) {
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

/** Where along (x1,y1)→(x2,y2), as 0..1, a shot is stopped by a box or the gate. Infinity = flies free. */
function firstBlock(w: World, x1: number, y1: number, x2: number, y2: number, onlyPermanent = false): { t: number; box: number; gate: boolean } {
  let t = Infinity;
  let box = -1;
  let gateHit = false;
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isSolid(pl)) continue;
    if (onlyPermanent && isBreakable(pl)) continue;
    const e = segmentEntry(x1, y1, x2, y2, pl.x, pl.y, pl.x + pl.w, pl.y + pl.h);
    if (e >= 0 && e < t) {
      t = e;
      box = i;
    }
  }
  const gate = activeGate(w);
  if (gate) {
    let e = -1;
    if (x1 >= gate.x) e = 0; // muzzle pressed into the gate
    else if (x2 >= gate.x) e = (gate.x - x1) / (x2 - x1);
    if (e >= 0 && e < t) {
      t = e;
      box = -1;
      gateHit = true;
    }
  }
  return { t, box, gate: gateHit };
}

/** Piercing beam: shoves every runner and smashes every box along the line, until a permanent block or the gate stops it. */
function fireRail(w: World, p: Player): void {
  const R = COMBAT.railgun;
  const mx = p.x + W / 2 + p.face * (W / 2 + 6);
  const my = p.y + H * 0.45;
  const aim = assistAngle(w, p, mx, my);
  const dx = p.face * Math.cos(aim);
  const dy = Math.sin(aim);
  let x2 = mx + dx * R.range;
  let y2 = my + dy * R.range;
  const stop = firstBlock(w, mx, my, x2, y2, true);
  if (stop.t <= 1) {
    x2 = mx + (x2 - mx) * stop.t;
    y2 = my + (y2 - my) * stop.t;
  }
  const pad = R.width / 2;
  for (const q of w.players.values()) {
    if (q === p || q.life !== 'alive') continue;
    if (!segmentHitsBox(mx, my, x2, y2, q.x - pad, q.y - pad, q.x + W + pad, q.y + H + pad)) continue;
    applyHit(w, p, q, { base: R.base, growth: R.growth, ...angled(p.face, R.angleDeg), how: 'railgun' });
  }
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isBreakable(pl)) continue;
    if (segmentHitsBox(mx, my, x2, y2, pl.x - pad, pl.y - pad, pl.x + pl.w + pad, pl.y + pl.h + pad)) damageBox(w, i, BOX.dmg.railgun, p);
  }
  if (stop.gate) damageGate(w, BOX.dmg.railgun, p);
  if (stop.t <= 1) w.fx.push({ k: 'boxhit', x: x2, y: y2 });
  // big kick back on the shooter
  p.vx -= p.face * R.recoil;
  p.boostUntil = Math.max(p.boostUntil, w.t + 200);
  w.fx.push({ k: 'beam', x: mx, y: my, x2, y2, id: p.id, color: p.color });
  spendAmmo(p);
}

/** Liang–Barsky segment vs axis-aligned box. */
export function segmentHitsBox(x1: number, y1: number, x2: number, y2: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  return segmentEntry(x1, y1, x2, y2, bx0, by0, bx1, by1) >= 0;
}

/** Where (0..1) the segment enters the box, or -1 if it misses. 0 when it starts inside. */
export function segmentEntry(x1: number, y1: number, x2: number, y2: number, bx0: number, by0: number, bx1: number, by1: number): number {
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
  const hit = clip(-dx, x1 - bx0) && clip(dx, bx1 - x1) && clip(-dy, y1 - by0) && clip(dy, by1 - y1) && t0 <= t1;
  return hit ? t0 : -1;
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
  w.projectiles.push({ id: w.seq.projectile++, kind, owner: owner.id, x, y, vx, vy, ttlMs, bornAt: w.t, angleDeg, hit: [] });
}

/** Has the shot left the neighbourhood of the screen? */
function offScreen(w: World, x: number, y: number, margin: number): boolean {
  return x < w.scrollX - margin || x > w.scrollX + ARENA.width + margin || y > ARENA.height + RUN.fallBelow || y < -500;
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
    if (pr.ttlMs <= 0 || offScreen(w, x1, y1, 100)) continue;

    // bullets fly through runners (shoving each once) and stop on the first box or the gate
    const stop = firstBlock(w, x0, y0, x1, y1);
    const owner = w.players.get(pr.owner) ?? null;
    const spec = pr.kind === 'bullet' ? COMBAT.pistol : pr.kind === 'dart' ? COMBAT.smg : COMBAT.boomstick;
    for (const q of w.players.values()) {
      if (q.life !== 'alive' || q.id === pr.owner || pr.hit.includes(q.id)) continue;
      const e = segmentEntry(x0, y0, x1, y1, q.x - 3, q.y - 3, q.x + W + 3, q.y + H + 3);
      if (e < 0 || e > stop.t) continue;
      pr.hit.push(q.id);
      applyHit(w, owner, q, {
        base: spec.base,
        growth: spec.growth,
        ...angled(Math.sign(pr.vx) || 1, pr.angleDeg),
        how: pr.kind === 'bullet' ? 'pistol' : pr.kind === 'dart' ? 'smg' : 'boomstick',
      });
    }
    if (stop.t <= 1) {
      const dmg = BOX.dmg[pr.kind as ShotKind];
      w.fx.push({ k: 'boxhit', x: x0 + (x1 - x0) * stop.t, y: y0 + (y1 - y0) * stop.t });
      if (stop.gate) damageGate(w, dmg, owner);
      else damageBox(w, stop.box, dmg, owner);
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
  if (offScreen(w, b.x, b.y, 300)) return false;

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

  // touching the gate or the side of a breakable box sets it off; permanent blocks bounce it back
  let contact = false;
  if (w.t - b.bornAt >= B.armMs) {
    const gate = activeGate(w);
    if (gate && b.x + 6 >= gate.x) {
      b.x = gate.x - 6;
      contact = true;
    }
    for (const i of w.solids) {
      const pl = w.plats[i];
      if (!isSolid(pl)) continue;
      if (b.x + 6 <= pl.x || b.x - 6 >= pl.x + pl.w || b.y + 6 <= pl.y || b.y - 6 >= pl.y + pl.h) continue;
      if (isBreakable(pl)) {
        contact = true;
      } else {
        b.x = b.vx >= 0 ? pl.x - 6 : pl.x + pl.w + 6;
        b.vx = -b.vx * 0.5;
      }
    }
  }
  if (contact || b.ttlMs <= 0) {
    explode(w, b);
    return false;
  }
  return true;
}

/** Rockets fly straight through runners, speed up, and explode on the first box or gate (or when they burn out). Returns true if alive. */
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
  const stop = firstBlock(w, x0, y0, r.x, r.y);
  if (stop.t <= 1) {
    r.x = x0 + (r.x - x0) * stop.t;
    r.y = y0 + (r.y - y0) * stop.t;
    explode(w, r);
    return false;
  }
  if (offScreen(w, r.x, r.y, 200)) return false;
  if (r.ttlMs <= 0) {
    explode(w, r);
    return false;
  }
  return true;
}

/** Blast: shoves every runner in the radius (the thrower too) and smashes boxes and the gate. */
export function explode(w: World, b: Projectile): void {
  const B = b.kind === 'rocket' ? COMBAT.rocket : COMBAT.bomb;
  const how = b.kind === 'rocket' ? 'rocket' : 'bomb';
  const boxDmg = b.kind === 'rocket' ? BOX.dmg.rocket : BOX.dmg.bomb;
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
      base: B.base * f * (self ? 0.7 : 1),
      growth: B.growth * f,
      dirX: side * Math.cos(a),
      dirY: -Math.sin(a),
      how,
    });
  }
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isBreakable(pl)) continue;
    const nx = Math.min(Math.max(b.x, pl.x), pl.x + pl.w);
    const ny = Math.min(Math.max(b.y, pl.y), pl.y + pl.h);
    if (Math.hypot(nx - b.x, ny - b.y) <= B.radius) damageBox(w, i, boxDmg, owner);
  }
  const gate = activeGate(w);
  if (gate && b.x + B.radius >= gate.x) damageGate(w, boxDmg, owner);
}
