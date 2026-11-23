import { WORLD, TICK_HZ, PLAYER_COLORS, nextPlayerId } from '../../shared/src/constants.js';
import type { Phase, Cause, EventItem, PlayerSnapshot, PlatformSnapshot, BulletSnapshot } from '../../shared/src/protocol.js';
import { PLATFORMS, SPAWNS, KILL_Y } from './level.js';

export type PlayerInputMsg = { left: boolean; right: boolean; jump: boolean };

type Player = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  waiting: boolean; // joined mid-match (spectator) — becomes active on next match
  grounded: boolean;
  platIdx: number; // index of the platform we're standing on, -1 = none
  coyoteMs: number;
  jumpBufferMs: number;
  lastPushedAt: number; // sim ms
  prevJump: boolean;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  prevBottom: number; // bottom of the feet at the start of the tick (px)
  boostUntil: number; // sim ms — while active, the max-speed clamp is skipped (stomp shoves)
  lastShotAt: number; // sim ms — last pistol shot
  dropFromIdx: number; // platform index being dropped through (-1 = none)
  dropThroughUntil: number; // sim ms — ignore that platform until this time
  input: { left: boolean; right: boolean; jump: boolean };
};

const PLAYERS = WORLD.capacity;

type Bullet = {
  id: string;
  ownerId: string;
  x: number; // center x
  y: number; // center y
  vx: number; // px/s, sign = facing
  ttlMs: number; // remaining lifetime in sim ms
};

let bulletSeq = 1;

export class Game {
  phase: Phase = 'lobby';
  tickCount = 0;
  countdownMs: number | null = null;
  timeLeftMs: number | null = null;
  winnerId: string | null = null;
  players = new Map<string, Player>();
  events: EventItem[] = [];
  private endHoldMs: number | null = null;
  private bullets: Bullet[] = [];
  private secondPlayerJoinedAt: number | null = null;
  private _simTimeMs = 0;
  private matchStartAtMs = 0;

  /** Current sim clock (ms). */
  get simTimeMs(): number {
    return this._simTimeMs;
  }

  // ------------------------------------------------------------- lifecycle

  join(name?: string): { id: string; name: string; color: string } {
    const id = nextPlayerId();
    const n = sanitizeName(name) ?? `Adventurer-${Math.floor(1000 + Math.random() * 9000)}`;
    const color = PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
    const p: Player = {
      id,
      name: n,
      color,
      x: -9999,
      y: -9999,
      vx: 0,
      vy: 0,
      alive: true,
      waiting: this.phase !== 'lobby', // spectate the current round, then join next
      grounded: false,
      platIdx: -1,
      coyoteMs: 0,
      jumpBufferMs: 0,
      lastPushedAt: -1e9,
      prevJump: false,
      facing: 1,
      hp: WORLD.maxHp,
      maxHp: WORLD.maxHp,
      prevBottom: -1e9,
      boostUntil: 0,
      lastShotAt: 0,
      dropFromIdx: -1,
      dropThroughUntil: 0,
      input: { left: false, right: false, jump: false },
    };
    this.players.set(id, p);
    if (this.secondPlayerJoinedAt === null && this.activeCount() >= WORLD.fallbackStartPlayers) {
      this.secondPlayerJoinedAt = this._simTimeMs;
    }
    return { id, name: n, color };
  }

  leave(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    const playing = this.phase === 'playing' && p.alive && !p.waiting;
    if (playing) this.emitEvent(p, 'left');
    this.players.delete(id);
    if (this.phase === 'lobby' && this.players.size < 2) this.secondPlayerJoinedAt = null;
    if (playing) this.checkMatchEnd();
  }

  /**
   * Force-restart the level: drop the current round and start a new one
   * immediately (fresh countdown) as soon as anyone is connected.
   * This is the force button — it overrides the lobby grace timers entirely.
   */
  restart(): void {
    this.resetToLobby();
    if (this.activeCount() > 0) {
      this.phase = 'starting';
      this.countdownMs = WORLD.countdownMs;
      this.secondPlayerJoinedAt = null; // the restart is explicit — no grace period
    }
  }

  /** Default pistol: fire a horizontal shot in the player's facing direction. */
  shoot(id: string): void {
    const p = this.players.get(id);
    if (!p || !p.alive || p.waiting) return;
    if (this.phase !== 'playing') return;
    const now = this._simTimeMs;
    if (now - p.lastShotAt < WORLD.shootCooldownMs) return;
    p.lastShotAt = now;
    const dir = p.facing;
    this.bullets.push({
      id: `b_${bulletSeq++}`,
      ownerId: p.id,
      x: p.x + WORLD.playerW / 2 + dir * (WORLD.playerW / 2 + 4),
      y: p.y + WORLD.playerH * 0.45,
      vx: dir * WORLD.bulletSpeed,
      ttlMs: WORLD.bulletTtlMs,
    });
  }

  /**
   * Drop through the current platform — allowed only when a platform exists
   * below (the drop leads to a lower level, never straight into the pit).
   */
  drop(id: string): void {
    const p = this.players.get(id);
    if (!p || !p.alive || p.waiting) return;
    if (this.phase !== 'playing') return;
    if (!p.grounded || p.platIdx < 0) return;

    const now = this._simTimeMs;
    const plats = PLATFORMS.map((def) => this.platformAt(def, now));
    const feet = p.y + WORLD.playerH;
    let hasBelow = false;
    for (let i = 0; i < plats.length; i++) {
      if (i === p.platIdx) continue; // the platform we're dropping through
      const pl = plats[i];
      if (pl.y <= feet) continue; // must be BELOW the player's feet
      const overlapX = p.x + WORLD.playerW > pl.x && p.x < pl.x + pl.w;
      if (overlapX) { hasBelow = true; break; }
    }
    if (!hasBelow) return; // lowest level or nothing below — refuse

    p.dropFromIdx = p.platIdx;
    p.dropThroughUntil = now + WORLD.dropThroughMs;
    p.grounded = false;
    p.platIdx = -1;
  }

  setInput(id: string, input: PlayerInputMsg): void {
    const p = this.players.get(id);
    if (!p) return;
    p.input = input;
    if (input.jump && !p.prevJump) p.jumpBufferMs = WORLD.jumpBufferMs;
    p.prevJump = input.jump;
  }

  // ---------------------------------------------------------------- tick

  step(dtMs: number): void {
    this._simTimeMs += dtMs;
    this.tickCount = Math.round(this._simTimeMs / (1000 / TICK_HZ));

    switch (this.phase) {
      case 'lobby': {
        const count = this.activeCount();
        const canStartQuick = count >= WORLD.quickStartPlayers;
        const canStartFallback =
          count >= WORLD.fallbackStartPlayers &&
          this.secondPlayerJoinedAt !== null &&
          this._simTimeMs - this.secondPlayerJoinedAt >= WORLD.fallbackWaitMs;
        if (canStartQuick || canStartFallback) {
          this.phase = 'starting';
          this.countdownMs = WORLD.countdownMs;
        }
        break;
      }
      case 'starting': {
        this.countdownMs = Math.max(0, (this.countdownMs ?? 0) - dtMs);
        if (this.countdownMs <= 0) this.startMatch();
        break;
      }
      case 'playing': {
        this.timeLeftMs = Math.max(0, (this.timeLeftMs ?? 0) - dtMs);
        this.simulate(dtMs / 1000);
        this.checkMatchEnd();
        break;
      }
      case 'ended': {
        this.endHoldMs = Math.max(0, (this.endHoldMs ?? 0) - dtMs);
        if (this.endHoldMs <= 0) this.resetToLobby();
        break;
      }
    }
  }

  private startMatch(): void {
    this.phase = 'playing';
    this.countdownMs = null;
    this.timeLeftMs = WORLD.matchDurationMs;
    this.matchStartAtMs = this._simTimeMs;
    this.events = [];
    this.winnerId = null;
    this.secondPlayerJoinedAt = null;
    let i = 0;
    for (const p of this.players.values()) {
      const spawn = SPAWNS[i % SPAWNS.length];
      p.waiting = false;
      p.alive = true;
      p.x = spawn.x - WORLD.playerW / 2;
      p.y = spawn.y - WORLD.playerH;
      p.vx = 0;
      p.vy = 0;
      p.grounded = false;
      p.platIdx = -1;
      p.coyoteMs = 0;
      p.jumpBufferMs = 0;
      p.prevJump = false;
      p.facing = 1;
      p.hp = WORLD.maxHp;
      p.maxHp = WORLD.maxHp;
      p.prevBottom = -1e9;
      p.boostUntil = 0;
      p.lastShotAt = 0;
      p.dropFromIdx = -1;
      p.dropThroughUntil = 0;
      i++;
    }
  }

  private resetToLobby(): void {
    this.phase = 'lobby';
    this.countdownMs = null;
    this.timeLeftMs = null;
    this.winnerId = null;
    this.events = [];
    this.endHoldMs = null;
    this.bullets = [];
    this.secondPlayerJoinedAt =
      this.activeCount() >= WORLD.fallbackStartPlayers ? this._simTimeMs : null;
    for (const p of this.players.values()) {
      p.alive = true;
      p.waiting = false;
      p.x = -9999;
      p.y = -9999;
      p.vx = 0;
      p.vy = 0;
      p.grounded = false;
      p.platIdx = -1;
      p.prevBottom = -1e9;
      p.boostUntil = 0;
      p.lastShotAt = 0;
      p.dropFromIdx = -1;
      p.dropThroughUntil = 0;
      p.hp = WORLD.maxHp;
      p.maxHp = WORLD.maxHp;
      p.input = { left: false, right: false, jump: false };
    }
  }

  private simulate(dt: number): void {
    const t = this._simTimeMs;
    const prevT = t - 1000 / TICK_HZ;
    const plats = PLATFORMS.map((def) => this.platformAt(def, t));
    const prevPlats = PLATFORMS.map((def) => this.platformAt(def, prevT));

    for (const p of this.players.values()) {
      if (!p.alive || p.waiting) continue;
      this.updatePlayer(p, dt, plats, prevPlats, t);
    }

    // head-stomp pass (before the push pass so a stomp isn't double-counted)
    const stompedIds = new Set<string>();
    const alive = [...this.players.values()].filter((p) => p.alive && !p.waiting);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        if (this.tryStomp(a, b)) {
          stompedIds.add(a.id);
          stompedIds.add(b.id);
          continue;
        }
        if (this.tryStomp(b, a)) {
          stompedIds.add(a.id);
          stompedIds.add(b.id);
        }
      }
    }

    // player-vs-player push (skip pairs involved in a stomp this tick)
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        if (!alive[i].alive || !alive[j].alive) continue;
        if (stompedIds.has(alive[i].id) || stompedIds.has(alive[j].id)) continue;
        this.resolvePush(alive[i], alive[j]);
      }
    }

    // pistol bullets
    this.updateBullets(dt);

    // pit elimination
    for (const p of this.players.values()) {
      if (p.alive && !p.waiting && p.y > KILL_Y) {
        p.alive = false;
        p.platIdx = -1;
        this.emitEvent(p, 'pit');
      }
    }
  }

  private updateBullets(dt: number): void {
    if (this.bullets.length === 0) return;
    const next: Bullet[] = [];
    for (const b of this.bullets) {
      const prevX = b.x;
      const nx = b.x + b.vx * dt;
      const ttl = b.ttlMs - dt * 1000;
      if (nx < -60 || nx > WORLD.width + 60 || ttl <= 0) continue; // expired / off-world
      const x0 = Math.min(prevX, nx);
      const x1 = Math.max(prevX, nx);
      let hit: Player | null = null;
      for (const p of this.players.values()) {
        if (!p.alive || p.waiting || p.id === b.ownerId) continue;
        const overlapX = x1 >= p.x && x0 <= p.x + WORLD.playerW;
        const overlapY = b.y >= p.y - 6 && b.y <= p.y + WORLD.playerH + 6;
        if (overlapX && overlapY) {
          hit = p;
          break;
        }
      }
      if (hit) {
        hit.hp = Math.max(0, hit.hp - WORLD.pistolDamage);
        if (hit.hp <= 0) {
          hit.alive = false;
          hit.platIdx = -1;
          this.emitEvent(hit, 'gun');
        }
        continue; // bullet consumed
      }
      next.push({ ...b, x: nx, ttlMs: ttl });
    }
    this.bullets = next;
  }

  private updatePlayer(
    p: Player,
    dt: number,
    plats: { x: number; y: number; w: number; h: number; moving: boolean }[],
    prevPlats: { x: number; y: number; w: number; h: number; moving: boolean }[],
    t: number
  ): void {
    // carry by a moving platform the player stands on
    if (p.grounded && p.platIdx >= 0 && p.platIdx < plats.length) {
      const plat = plats[p.platIdx];
      const prevPlat = prevPlats[p.platIdx];
      if (plat.moving && prevPlat) {
        const delta = plat.y - prevPlat.y;
        if (delta !== 0) p.y += delta; // carried even if platform descends faster
      }
    }

    // Variable-height jump: release while rising cuts the jump short;
    // holding past peak floats the descent and caps the fall speed.
    const held = p.input.jump;
    const rising = p.vy < 0;
    let gravity: number = WORLD.gravity;
    let maxFall: number = WORLD.maxFallSpeed;
    if (rising && !held) {
      gravity = WORLD.gravity + WORLD.jumpCutGravity;
    } else if (!rising && held) {
      gravity = WORLD.descendGravity;
      maxFall = WORLD.descendMaxFallSpeed;
    }
    p.vy = Math.min(p.vy + gravity * dt, maxFall);

    const grounded = p.grounded;
    const accel = grounded ? WORLD.accel : WORLD.airAccel;
    const maxSpeed = grounded ? WORLD.maxSpeed : WORLD.airMaxSpeed;
    const { left, right } = p.input;
    if (left && !right) {
      p.vx -= accel * dt;
      p.facing = -1;
    } else if (right && !left) {
      p.vx += accel * dt;
      p.facing = 1;
    } else if (grounded) {
      const f = WORLD.friction * dt;
      if (Math.abs(p.vx) <= f) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * f;
    }
    if (t >= p.boostUntil) {
      p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
    }

    // jump (coyote time + buffer)
    p.coyoteMs = Math.max(0, p.coyoteMs - dt * 1000);
    p.jumpBufferMs = Math.max(0, p.jumpBufferMs - dt * 1000);
    if (p.jumpBufferMs > 0 && (p.grounded || p.coyoteMs > 0)) {
      p.vy = -WORLD.jumpVel;
      p.grounded = false;
      p.platIdx = -1;
      p.coyoteMs = 0;
      p.jumpBufferMs = 0;
    }

    const prevBottom = p.y + WORLD.playerH;
    p.prevBottom = prevBottom;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // one-way landing (top surface only)
    let landed = false;
    let landedIdx = -1;
    if (p.vy >= 0) {
      const skipPlatIdx = t < p.dropThroughUntil ? p.dropFromIdx : -1;
      for (let i = 0; i < plats.length; i++) {
        if (i === skipPlatIdx) continue; // dropped through this platform
        const plat = plats[i];
        const newBottom = p.y + WORLD.playerH;
        const overlapX = p.x + WORLD.playerW > plat.x && p.x < plat.x + plat.w;
        if (overlapX && prevBottom <= plat.y + 8 && newBottom >= plat.y) {
          p.y = plat.y - WORLD.playerH;
          p.vy = 0;
          landed = true;
          landedIdx = i;
          break;
        }
      }
    }

    p.grounded = landed;
    p.platIdx = landed ? landedIdx : -1;
    if (landed) p.coyoteMs = WORLD.coyoteMs;

    // safety margin on the sides (let pit kills do the rest)
    p.x = Math.max(-600, Math.min(WORLD.width + 600 - WORLD.playerW, p.x));
  }

  private resolvePush(a: Player, b: Player): void {
    const now = this._simTimeMs;
    const aLeft = a.x + WORLD.playerW / 2;
    const bLeft = b.x + WORLD.playerW / 2;
    const aRight = a.x + WORLD.playerW;
    const bRight = b.x + WORLD.playerW;
    const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
    const overlapY = Math.min(a.y + WORLD.playerH, b.y + WORLD.playerH) - Math.max(a.y, b.y);
    if (overlapX <= 0 || overlapY <= 0) return;

    // push apart: player on the left gets pushed left (dx<0), player on the right gets pushed right
    const delta = bLeft > aLeft ? 1 : -1; // direction from a to b
    const pushStrength = WORLD.knockbackImpulse;

    if (now - a.lastPushedAt >= WORLD.pushCooldownMs) {
      a.vx -= delta * pushStrength;
      a.lastPushedAt = now;
    } else {
      a.vx -= delta * pushStrength * 0.35;
    }
    if (now - b.lastPushedAt >= WORLD.pushCooldownMs) {
      b.vx += delta * pushStrength;
      b.lastPushedAt = now;
    } else {
      b.vx += delta * pushStrength * 0.35;
    }

    // positionally separate so they don't stick together while both alive
    const sep = overlapX * 0.5;
    a.x -= delta * sep;
    b.x += delta * sep;
  }

  /**
   * Head stomp: player a falls and crosses the top of player b's head.
   * a rebounds hard, b is shoved away and takes damage.
   * Returns true if a stomp happened.
   */
  private tryStomp(a: Player, b: Player): boolean {
    if (a.vy <= 0) return false; // stomper must be falling
    if (!b.alive || b.waiting) return false;
    if (a.prevBottom > b.y + 6) return false; // feet must have crossed the head top this tick

    const feet = a.y + WORLD.playerH;
    const headTop = b.y;
    if (feet < headTop) return false;
    if (feet > headTop + WORLD.playerH * 0.65) return false; // must be in the head/upper-body band

    const horizontalOverlap = a.x + WORLD.playerW > b.x && a.x < b.x + WORLD.playerW;
    if (!horizontalOverlap) return false;

    // stomper rebounds way up
    a.vy = -WORLD.stompBounceVel;

    // stomped player is shoved away from the stomper's center
    const diff = b.x + WORLD.playerW / 2 - (a.x + WORLD.playerW / 2);
    const dir = diff > 0 ? 1 : diff < 0 ? -1 : Math.abs(a.vx) > 20 ? Math.sign(a.vx) : a.facing;
    b.vx = dir * WORLD.stompShoveVel;
    b.vy = -WORLD.stompPopVel;
    b.boostUntil = this._simTimeMs + WORLD.stompBoostMs;

    // damage
    b.hp = Math.max(0, b.hp - WORLD.stompDamage);
    if (b.hp <= 0) {
      b.alive = false;
      b.platIdx = -1;
      this.emitEvent(b, 'stomp');
    }
    return true;
  }

  private platformAt(def: (typeof PLATFORMS)[number], t: number) {
    if (!def.move) return { x: def.x, y: def.y, w: def.w, h: def.h, moving: false };
    const dy = Math.sin(2 * Math.PI * (t / def.move.periodMs + def.move.phase)) * def.move.amplitude;
    return { x: def.x, y: def.y + dy, w: def.w, h: def.h, moving: true };
  }

  private checkMatchEnd(): void {
    if (this.phase !== 'playing') return;
    const alive = [...this.players.values()].filter((p) => p.alive && !p.waiting);
    if (alive.length <= 1 || (this.timeLeftMs !== null && this.timeLeftMs <= 0)) {
      this.phase = 'ended';
      this.endHoldMs = WORLD.endHoldMs;
      this.winnerId = alive.length === 1 ? alive[0].id : null;
    }
  }

  private emitEvent(p: Player, cause: Cause): void {
    this.events.unshift({ id: p.id, name: p.name, cause, atMs: Math.max(0, this._simTimeMs - this.matchStartAtMs) });
    if (this.events.length > 8) this.events.pop();
  }

  private activeCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.waiting) n++;
    return n;
  }

  platformsAt(t: number): PlatformSnapshot[] {
    return PLATFORMS.map((def) => {
      const pos = this.platformAt(def, t);
      return { x: pos.x, y: pos.y, w: pos.w, h: pos.h, moving: pos.moving };
    });
  }

  snapshot(serverTimeMs: number) {
    return {
      tick: this.tickCount,
      phase: this.phase,
      countdownMs: this.countdownMs,
      timeLeftMs: this.timeLeftMs,
      winnerId: this.winnerId,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        alive: p.alive,
        waiting: p.waiting,
        hp: p.hp,
        maxHp: p.maxHp,
        lastShotAtMs: p.lastShotAt || -1,
      })),
      platforms: this.platformsAt(this._simTimeMs),
      bullets: this.bullets.map(
        (b): BulletSnapshot => ({ id: b.id, ownerId: b.ownerId, x: b.x, y: b.y, vx: b.vx })
      ),
      events: this.events.slice(0, 8),
      simTimeMs: this._simTimeMs,
      serverTimeMs,
    };
  }
}

function sanitizeName(name?: string): string | null {
  if (!name) return null;
  const cleaned = name.replace(/[^\w\s-]/gu, '').trim().slice(0, 18);
  return cleaned.length > 0 ? cleaned : null;
}
