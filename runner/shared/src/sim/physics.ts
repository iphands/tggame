/** Player movement: gravity, running, jumping, landing, drop-through, body push. */
import { ARENA, BOX, ITEMS, PHYS, RUN } from '../constants.js';
import { findLanding, isSolid } from './platforms.js';
import { activeGate, type Input, type Player, type World } from './model.js';

/** Store new input; a released→pressed jump edge buffers a jump. */
export function applyInput(p: Player, input: Input): void {
  p.input = { left: !!input.left, right: !!input.right, jump: !!input.jump };
  if (p.input.jump && !p.prevJump) p.jumpBufferMs = PHYS.jumpBufferMs;
  p.prevJump = p.input.jump;
}

/** Advance one living player by one tick. */
/**
 * Sets every runner's max-speed multiplier for this tick: damage taken slows
 * you, and so does running ahead of the rest of the pack (RUN.dmgSlow,
 * RUN.leadSlow); speed shoes make you faster (ITEMS.shoesSpeed).
 */
export function updatePace(alive: Player[], now: number): void {
  let n = 0;
  let sum = 0;
  for (const p of alive) {
    if (p.finishMs >= 0) continue;
    n++;
    sum += p.x;
  }
  const span = RUN.leadSlowFull - RUN.leadSlowFrom;
  for (const p of alive) {
    if (p.finishMs >= 0) {
      p.speedMul = now < p.shoesUntil ? ITEMS.shoesSpeed : 1;
      continue;
    }
    const hurt = Math.min(1, p.dmg / RUN.dmgSlowFull);
    const lead = n > 1 ? p.x - (sum - p.x) / (n - 1) : 0;
    const ahead = Math.min(1, Math.max(0, (lead - RUN.leadSlowFrom) / span));
    p.speedMul = (1 - RUN.dmgSlow * hurt) * (1 - RUN.leadSlow * ahead) * (now < p.shoesUntil ? ITEMS.shoesSpeed : 1);
  }
}

export function stepPlayer(w: World, p: Player, dtMs: number): void {
  const s = dtMs / 1000;
  const now = w.t;
  const gs = w.level.gravityScale;
  const W = PHYS.playerW;
  const H = PHYS.playerH;

  // ride the platform we stand on (snap to its top, follow its motion)
  let ground = p.grounded && p.platIdx >= 0 ? w.plats[p.platIdx] : null;
  if (ground && !isSolid(ground)) {
    ground = null;
    p.grounded = false;
    p.platIdx = -1;
  }
  if (ground) {
    p.x += ground.x - ground.prevX;
    p.y = ground.y - H;
  }

  const launched = now < p.launchUntil;

  // ---- gravity (variable-height jump + floaty held descent)
  const held = p.input.jump;
  const rising = p.vy < 0;
  let g = PHYS.gravity * gs;
  let maxFall: number = PHYS.maxFallSpeed;
  if (!launched) {
    if (rising && !held && p.cuttable) {
      g = (PHYS.gravity + PHYS.jumpCutGravity) * gs;
    } else if (!rising && held) {
      g = PHYS.descendGravity * gs;
      maxFall = PHYS.descendMaxFall;
    }
  }
  p.vy = Math.min(p.vy + g * s, maxFall);

  // ---- horizontal
  const onIce = ground !== null && ground.kind === 'ice';
  let accel: number = p.grounded ? PHYS.accel : PHYS.airAccel;
  let maxSpeed: number = p.grounded ? PHYS.maxSpeed : PHYS.airMaxSpeed;
  let friction: number = PHYS.friction;
  maxSpeed *= p.speedMul;
  if (onIce) {
    accel *= PHYS.iceAccelMul;
    friction *= PHYS.iceFrictionMul;
    maxSpeed *= PHYS.iceMaxSpeedMul;
  }
  if (launched) accel *= PHYS.launchControl;

  const dir = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
  if (dir !== 0) {
    p.vx += dir * accel * s;
    p.face = dir as 1 | -1;
  } else if (p.grounded) {
    const f = friction * s * (launched ? 0.5 : 1);
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
  }
  if (launched) p.vx *= Math.exp(-PHYS.launchDrag * s);
  if (now >= p.boostUntil && Math.abs(p.vx) > maxSpeed) {
    // bleed excess speed quickly but smoothly back to the cap
    const excess = Math.abs(p.vx) - maxSpeed;
    p.vx -= Math.sign(p.vx) * Math.min(excess, 4200 * s);
  }

  // ---- jumping (coyote time, buffer, double jump)
  p.coyoteMs = Math.max(0, p.coyoteMs - dtMs);
  p.jumpBufferMs = Math.max(0, p.jumpBufferMs - dtMs);
  if (p.jumpBufferMs > 0 && !launched) {
    if (p.grounded || p.coyoteMs > 0) {
      p.vy = -PHYS.jumpVel;
      p.cuttable = true;
      p.grounded = false;
      p.platIdx = -1;
      p.coyoteMs = 0;
      p.jumpBufferMs = 0;
      w.fx.push({ k: 'jump', x: p.x + W / 2, y: p.y + H, id: p.id });
    } else if (p.airJumpsLeft > 0) {
      p.vy = -PHYS.airJumpVel;
      p.cuttable = true;
      p.airJumpsLeft--;
      p.jumpBufferMs = 0;
      w.fx.push({ k: 'airjump', x: p.x + W / 2, y: p.y + H, id: p.id });
    }
  }

  // ---- integrate
  const wasGrounded = p.grounded;
  const prevBottom = p.y + H;
  p.prevBottom = prevBottom;
  const x0 = p.x;
  const y0 = p.y;
  p.x += p.vx * s;
  clampToView(w, p);
  blockSides(w, p, x0, y0);
  p.y += p.vy * s;
  bumpHead(w, p, y0);

  // ---- landing (one-way platform tops and box tops)
  p.grounded = false;
  p.platIdx = -1;
  if (p.vy >= 0) {
    const skip = now < p.dropUntil ? p.dropFrom : -1;
    const idx = findLanding(w.plats, p.x, W, prevBottom, p.y + H, skip);
    if (idx >= 0) {
      const pl = w.plats[idx];
      p.y = pl.y - H;
      p.airJumpsLeft = PHYS.airJumps;
      if (pl.kind === 'bounce') {
        p.vy = -PHYS.bounceVel;
        p.cuttable = false;
        w.fx.push({ k: 'bounce', x: p.x + W / 2, y: pl.y, id: p.id });
      } else {
        const impact = p.vy;
        p.vy = 0;
        p.grounded = true;
        p.platIdx = idx;
        p.coyoteMs = PHYS.coyoteMs;
        if (!wasGrounded && impact > 380) w.fx.push({ k: 'land', x: p.x + W / 2, y: pl.y, id: p.id });
        if (pl.kind === 'crumble' && pl.state === 'solid') {
          pl.state = 'shaking';
          pl.timer = 0;
        }
      }
    }
  }
  // walked off an edge: coyote time still allows a ground jump
  if (wasGrounded && !p.grounded && p.vy >= 0) p.coyoteMs = Math.max(p.coyoteMs, PHYS.coyoteMs);
}

/**
 * Down: on a platform, drop through it — refused unless another platform is
 * somewhere below you (never a free fall into the pit). In the air past the
 * top of a jump, fast-fall instead.
 */
export function tryDrop(w: World, p: Player): boolean {
  if (p.life !== 'alive') return false;
  if (!p.grounded) {
    if (p.vy < -150 || w.t < p.launchUntil) return false; // still rising / in hitstun
    p.vy = Math.max(p.vy, PHYS.fastFallVel);
    p.cuttable = false;
    return true;
  }
  if (p.platIdx < 0 || w.plats[p.platIdx].box) return false; // boxes are solid all the way through
  const feet = p.y + PHYS.playerH;
  let hasBelow = false;
  for (let i = 0; i < w.plats.length; i++) {
    if (i === p.platIdx) continue;
    const pl = w.plats[i];
    if (!isSolid(pl) || pl.y <= feet) continue;
    if (p.x + PHYS.playerW > pl.x && p.x < pl.x + pl.w) {
      hasBelow = true;
      break;
    }
  }
  if (!hasBelow) return false;
  p.dropFrom = p.platIdx;
  p.dropUntil = w.t + PHYS.dropThroughMs;
  p.grounded = false;
  p.platIdx = -1;
  p.coyoteMs = 0;
  return true;
}

/** Overlapping bodies gently slide apart so players never stack inside each other. */
export function separateBodies(alive: Player[]): void {
  const W = PHYS.playerW;
  const H = PHYS.playerH;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const overlapX = Math.min(a.x + W, b.x + W) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + H, b.y + H) - Math.max(a.y, b.y);
      if (overlapX <= 0 || overlapY <= 8) continue;
      const d = a.x + W / 2 <= b.x + W / 2 ? -1 : 1; // direction a moves
      const push = Math.min(overlapX, W) * 0.25;
      a.x += d * push;
      b.x -= d * push;
      a.vx += d * PHYS.bodyPush * 0.1;
      b.vx -= d * PHYS.bodyPush * 0.1;
    }
  }
}

/** The standing gate and the right screen edge are walls. */
function clampToView(w: World, p: Player): void {
  const W = PHYS.playerW;
  let maxX = w.scrollX + ARENA.width - W;
  const gate = activeGate(w);
  if (gate) maxX = Math.min(maxX, gate.x - W);
  if (p.x > maxX) {
    p.x = maxX;
    if (p.vx > 0) p.vx = 0;
  }
}

/** Does the body (top at `top`) overlap this box's side, i.e. sit too low to simply step onto it? */
function besideBox(top: number, by: number, bh: number): boolean {
  return top + PHYS.playerH > by + BOX.stepUp && top < by + bh;
}

/** Stop horizontal motion into box sides. `x0`/`y0` is the body before this tick's move. */
function blockSides(w: World, p: Player, x0: number, y0: number): void {
  const W = PHYS.playerW;
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isSolid(pl) || !besideBox(y0, pl.y, pl.h)) continue;
    if (p.x + W <= pl.x || p.x >= pl.x + pl.w) continue;
    const fromLeft = x0 + W <= pl.x + 1;
    const fromRight = x0 >= pl.x + pl.w - 1;
    if (fromLeft || (!fromRight && x0 + W / 2 < pl.x + pl.w / 2)) {
      p.x = pl.x - W;
      if (p.vx > 0) p.vx = 0;
    } else {
      p.x = pl.x + pl.w;
      if (p.vx < 0) p.vx = 0;
    }
  }
}

/** Rising into the underside of a box stops the jump. `y0` is the body top before the move. */
function bumpHead(w: World, p: Player, y0: number): void {
  if (p.vy >= 0) return;
  const W = PHYS.playerW;
  for (const i of w.solids) {
    const pl = w.plats[i];
    if (!isSolid(pl)) continue;
    if (p.x + W <= pl.x || p.x >= pl.x + pl.w) continue;
    const under = pl.y + pl.h;
    if (y0 >= under - 1 && p.y < under) {
      p.y = under;
      p.vy = 0;
      p.cuttable = false;
    }
  }
}

/**
 * Final pass after body pushes: nobody ends the tick inside a box, past the
 * standing gate or off the right edge of the screen.
 */
export function resolveSolids(w: World, alive: Player[]): void {
  const W = PHYS.playerW;
  for (const p of alive) {
    clampToView(w, p);
    for (const i of w.solids) {
      const pl = w.plats[i];
      if (!isSolid(pl) || !besideBox(p.y, pl.y, pl.h)) continue;
      if (p.x + W <= pl.x || p.x >= pl.x + pl.w) continue;
      if (p.x + W / 2 < pl.x + pl.w / 2) {
        p.x = pl.x - W;
        if (p.vx > 0) p.vx = 0;
      } else {
        p.x = pl.x + pl.w;
        if (p.vx < 0) p.vx = 0;
      }
    }
  }
}
