/**
 * Bot brains. Bots produce the same inputs a human would (left/right/jump
 * plus punch / fire / drop actions) — they get no special powers.
 */
import { PHYS } from '../../../shared/src/constants.js';
import { isSolid } from './platforms.js';
import type { BotBrain, Player, Plat, World } from './model.js';

const W = PHYS.playerW;
const H = PHYS.playerH;

export type BotActions = {
  punch: (p: Player) => void;
  fire: (p: Player) => void;
  drop: (p: Player) => void;
  input: (p: Player, input: { left: boolean; right: boolean; jump: boolean }) => void;
};

export function makeBrain(rng: () => number): BotBrain {
  return {
    skill: 0.55 + rng() * 0.45,
    targetId: null,
    retargetAt: 0,
    jumpHold: 0,
    pressQueued: false,
    pressHold: 0,
    jumpCd: 0,
    dropCd: 0,
    calmUntil: 0,
  };
}

/** Highest solid platform directly under x at or below `feet`. */
function platformUnder(plats: Plat[], x: number, feet: number, maxDepth = 2000): Plat | null {
  let best: Plat | null = null;
  for (const pl of plats) {
    if (!isSolid(pl)) continue;
    if (x < pl.x || x > pl.x + pl.w) continue;
    if (pl.y < feet - 2 || pl.y - feet > maxDepth) continue;
    if (!best || pl.y < best.y) best = pl;
  }
  return best;
}

function queueJump(b: BotBrain, holdTicks: number, cd: number): void {
  if (b.jumpCd > 0 || b.pressQueued) return;
  b.pressQueued = true;
  b.pressHold = holdTicks;
  b.jumpCd = cd;
}

export function thinkBot(w: World, p: Player, act: BotActions): void {
  const b = p.brain;
  if (!b) return;
  if (p.life !== 'alive') {
    act.input(p, { left: false, right: false, jump: false });
    return;
  }
  b.jumpCd = Math.max(0, b.jumpCd - 1);
  b.dropCd = Math.max(0, b.dropCd - 1);

  const cx = p.x + W / 2;
  const feet = p.y + H;
  const launched = w.t < p.launchUntil;
  let move = 0;
  let floatHold = false;

  const support = platformUnder(w.plats, cx, feet);
  const overPit = !p.grounded && !support;

  if (overPit) {
    // ---- recovery: steer back toward the nearest reachable platform
    let goal: Plat | null = null;
    let bestScore = Infinity;
    for (const pl of w.plats) {
      if (!isSolid(pl)) continue;
      const hx = cx < pl.x ? pl.x - cx : cx > pl.x + pl.w ? cx - (pl.x + pl.w) : 0;
      const tooHigh = Math.max(0, feet - pl.y - 120);
      const score = hx + tooHigh * 2.5;
      if (score < bestScore) {
        bestScore = score;
        goal = pl;
      }
    }
    if (goal) {
      const gx = Math.min(Math.max(cx, goal.x + 24), goal.x + goal.w - 24);
      move = Math.abs(gx - cx) > 4 ? Math.sign(gx - cx) : 0;
      if (!launched && p.vy > 60 && p.airJumpsLeft > 0 && feet > goal.y - 40) queueJump(b, 18, 10);
      if (p.vy > 0 && Math.abs(gx - cx) > 40) floatHold = true;
    }
  } else {
    // ---- pick a target: a nearby crate when unarmed, else the nearest foe
    let tx = cx;
    let tFeet = feet;
    let foe: Player | null = null;
    if (w.t >= b.retargetAt || (b.targetId && w.players.get(b.targetId)?.life !== 'alive')) {
      b.retargetAt = w.t + 700 + w.rng() * 900;
      // spread out: a foe other bots already chase looks farther away
      const chasers = new Map<string, number>();
      for (const o of w.players.values()) {
        if (o !== p && o.brain?.targetId) chasers.set(o.brain.targetId, (chasers.get(o.brain.targetId) ?? 0) + 1);
      }
      let best = Infinity;
      b.targetId = null;
      for (const q of w.players.values()) {
        if (q === p || q.life !== 'alive') continue;
        const d = Math.hypot(q.x - p.x, (q.y - p.y) * 1.5) + (chasers.get(q.id) ?? 0) * 260 + w.rng() * 120;
        if (d < best) {
          best = d;
          b.targetId = q.id;
        }
      }
    }
    foe = b.targetId ? w.players.get(b.targetId) ?? null : null;
    if (foe && foe.life !== 'alive') foe = null;

    const crate = p.weapon === 'pistol' ? nearestCrate(w, p, 380) : null;
    if (crate) {
      tx = crate.x + 14;
      tFeet = crate.y + 28;
    } else if (foe) {
      tx = foe.x + W / 2;
      tFeet = foe.y + H;
    } else if (support) {
      tx = support.x + support.w / 2;
    }

    const dx = tx - cx;
    const dy = tFeet - feet; // negative: target is higher
    move = Math.abs(dx) > 18 ? Math.sign(dx) : 0;

    // edge safety: don't stroll off a ledge unless a platform catches us
    if (p.grounded && move !== 0 && p.platIdx >= 0) {
      const pl = w.plats[p.platIdx];
      const ahead = cx + move * 26;
      if (ahead < pl.x || ahead > pl.x + pl.w) {
        const catcher = platformUnder(w.plats, ahead, feet + 1, 320);
        if (!catcher) {
          // jump the gap if something solid lies that way, else hold the edge
          const across = w.plats.some(
            (o) =>
              isSolid(o) &&
              o !== pl &&
              o.y > feet - 230 &&
              (move > 0 ? o.x > pl.x + pl.w - 10 && o.x - (pl.x + pl.w) < 280 : o.x + o.w < pl.x + 10 && pl.x - (o.x + o.w) < 280)
          );
          const wantsAcross = Math.abs(dx) > 60;
          if (across && wantsAcross) queueJump(b, 20, 24);
          else move = 0;
        }
      }
    }

    // vertical pursuit
    if (dy < -70 && Math.abs(dx) < 200 && p.grounded) queueJump(b, 20, 20);
    if (!p.grounded && !launched && p.vy > -80 && dy < -50 && p.airJumpsLeft > 0 && Math.abs(dx) < 220) {
      queueJump(b, 16, 14);
    }
    if (dy > 70 && Math.abs(dx) < 150 && p.grounded && b.dropCd === 0) {
      b.dropCd = 40;
      act.drop(p);
    }

    // ---- combat
    if (foe && !crate && !launched) {
      const fdx = foe.x + W / 2 - cx;
      const fdy = foe.y - p.y;
      const adx = Math.abs(fdx);
      const ady = Math.abs(fdy);
      const facing = Math.sign(fdx) === p.face || adx < 4;
      if (adx < 52 && ady < 40) {
        if (!facing) move = Math.sign(fdx); // turn around first
        else if (w.t >= b.calmUntil && w.rng() < 0.035 + 0.06 * b.skill) {
          act.punch(p);
          // breathe between flurries so bots don't juggle anyone to death
          if (w.rng() < 0.3) b.calmUntil = w.t + 350 + w.rng() * 700;
        }
      } else if (facing) {
        const r = w.rng();
        if (p.weapon === 'bombs' && adx < 430 && ady < 140 && r < 0.07) act.fire(p);
        else if (p.weapon === 'boomstick' && adx < 240 && ady < 40 && r < 0.25) act.fire(p);
        else if (p.weapon === 'pistol' && adx < 650 && ady < 22 && r < 0.035 * b.skill) act.fire(p);
      }
    }
  }

  // ---- jump button state machine (needs a released→pressed edge)
  let jump = false;
  if (b.jumpHold > 0) {
    b.jumpHold--;
    jump = true;
  } else if (b.pressQueued) {
    if (p.prevJump) {
      jump = false; // release first
    } else {
      jump = true;
      b.pressQueued = false;
      b.jumpHold = b.pressHold;
    }
  } else if (floatHold) {
    jump = true;
  }
  act.input(p, { left: move < 0, right: move > 0, jump });
}

function nearestCrate(w: World, p: Player, maxDist: number) {
  let best = null;
  let bestD = maxDist;
  for (const c of w.crates) {
    if (c.platIdx < 0) continue; // only grounded crates are worth chasing
    const d = Math.hypot(c.x - p.x, (c.y - p.y) * 1.5);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
