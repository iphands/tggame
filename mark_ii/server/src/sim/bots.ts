/**
 * Bot brains. Bots produce the same inputs a human would (left/right/jump
 * plus fire / drop actions) — they get no special powers. A runner bot heads
 * right, jumps pits and blocks, and shoots boxes and gates out of its way.
 */
import { PHYS } from '../../../shared/src/constants.js';
import { isBreakable } from './boxes.js';
import { isSolid } from './platforms.js';
import { activeGate, type BotBrain, type Player, type Plat, type World } from './model.js';

const W = PHYS.playerW;
const H = PHYS.playerH;

export type BotActions = {
  fire: (p: Player) => void;
  drop: (p: Player) => void;
  input: (p: Player, input: { left: boolean; right: boolean; jump: boolean }) => void;
};

export function makeBrain(rng: () => number): BotBrain {
  return {
    skill: 0.55 + rng() * 0.45,
    jumpHold: 0,
    pressQueued: false,
    pressHold: 0,
    jumpCd: 0,
    calmUntil: 0,
    stuckX: 0,
    stuckAt: 0,
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

/** The nearest box whose side blocks the way ahead (within `reach` px of the bot's front). */
function boxAhead(w: World, p: Player, reach: number): Plat | null {
  const front = p.x + W;
  let best: Plat | null = null;
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isSolid(pl)) continue;
    if (pl.x + pl.w <= p.x || pl.x - front > reach) continue;
    if (pl.y >= p.y + H - 4 || pl.y + pl.h <= p.y - 150) continue; // under our feet / far overhead
    if (!best || pl.x < best.x) best = pl;
  }
  return best;
}

/** Top of the stack that `box` belongs to: the highest box surface in its column. */
function stackTop(w: World, box: Plat): number {
  let top = box.y;
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (isSolid(pl) && pl.x < box.x + box.w && pl.x + pl.w > box.x) top = Math.min(top, pl.y);
  }
  return top;
}

export function thinkBot(w: World, p: Player, act: BotActions): void {
  const b = p.brain;
  if (!b) return;
  if (p.life !== 'alive' || p.finishMs >= 0) {
    act.input(p, { left: false, right: false, jump: false });
    return;
  }
  b.jumpCd = Math.max(0, b.jumpCd - 1);

  const cx = p.x + W / 2;
  const feet = p.y + H;
  const launched = w.t < p.launchUntil;
  const reach = 150 * (w.level.gravityScale < 1 ? 1.35 : 1); // comfortable single-jump height
  let move = 1;
  let floatHold = false;
  let shoot = false;

  // reaction time off the line, and the odd moment of hesitation on safe ground
  if (w.t < b.calmUntil) move = 0;
  else if (p.grounded && w.rng() < 0.0025 * (1.15 - b.skill)) b.calmUntil = w.t + 120 + w.rng() * 260;

  const support = platformUnder(w.plats, cx, feet);
  const overPit = !p.grounded && !support;

  if (overPit) {
    // ---- in the air over nothing: steer for the best platform ahead
    let goal: Plat | null = null;
    let bestScore = Infinity;
    for (const pl of w.plats) {
      // nothing is under us, so every platform either starts ahead or ended behind: only look ahead
      if (!isSolid(pl) || pl.x < cx - 10) continue;
      const hx = Math.max(0, pl.x - cx);
      if (hx > 520) continue;
      const tooHigh = Math.max(0, feet - pl.y - 110);
      const score = hx + tooHigh * 2.5 - (pl.x + pl.w > cx + 200 ? 30 : 0);
      if (score < bestScore) {
        bestScore = score;
        goal = pl;
      }
    }
    move = 1;
    if (goal) {
      const gx = Math.max(cx, goal.x + 26);
      if (!launched && p.vy > 40 && p.airJumpsLeft > 0 && (feet > goal.y - 40 || gx - cx > 150)) queueJump(b, 20, 10);
      if (p.vy > 0 && gx - cx > 30) floatHold = true;
    } else if (!launched && p.vy > 40 && p.airJumpsLeft > 0) {
      queueJump(b, 20, 10);
    }
  } else if (move !== 0) {
    // ---- the gate: stand at it and shoot
    const gate = activeGate(w);
    if (gate && gate.x - (p.x + W) < 520) shoot = true;

    // ---- a box in the way: shoot it if it breaks, otherwise jump it
    const box = boxAhead(w, p, 460);
    if (box) {
      const dist = box.x - (p.x + W);
      const top = stackTop(w, box);
      const climb = feet - top;
      if (isBreakable(box)) {
        shoot = true;
        // low stacks are quicker to hop than to shoot
        if (climb <= reach * 0.7 && dist < 70 && p.grounded) queueJump(b, 20, 16);
      } else if (dist < 78 && p.grounded) {
        queueJump(b, 22, 14);
      }
      // pressed against something taller than this jump: use the air jump
      if (!p.grounded && !launched && dist < 6 && feet > top && p.vy > -120 && p.airJumpsLeft > 0 && climb < reach * 1.9) {
        queueJump(b, 20, 10);
      }
    }

    // ---- the edge of the floor: jump unless something catches us just below
    if (p.grounded && p.platIdx >= 0) {
      const pl = w.plats[p.platIdx];
      const ahead = cx + 10 + Math.max(0, p.vx) * 0.04;
      if (ahead > pl.x + pl.w) {
        const catcher = platformUnder(w.plats, ahead + 20, feet - 1, 90);
        if (!catcher) queueJump(b, 26, 12);
      }
    }
    // falling short of the ledge ahead: air jump
    if (!p.grounded && !launched && p.vy > 250 && p.airJumpsLeft > 0 && support && support.y - feet > 220) queueJump(b, 18, 10);

    // ---- stuck (wedged under a ledge, facing a wall): hop and shoot
    if (Math.abs(p.x - b.stuckX) > 6) {
      b.stuckX = p.x;
      b.stuckAt = w.t;
    } else if (w.t - b.stuckAt > 900 && !(gate && gate.x - (p.x + W) < 60)) {
      queueJump(b, 22, 20);
      shoot = true;
    }
  }

  if (shoot && !launched && p.face === 1 && w.rng() < 0.18 + 0.3 * b.skill) act.fire(p);

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
