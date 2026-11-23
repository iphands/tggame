/**
 * The authoritative game: lobby → starting (countdown on the arena) →
 * playing (stocks, KOs, items) → ended (results) → lobby.
 *
 * Time only advances through step(); the sim runs in fixed 60 Hz ticks so
 * it's deterministic for a given seed and input sequence.
 */
import { ARENA, BOT_NAMES, COLORS, COMBAT, ITEMS, MATCH, PHYS, TICK_MS } from '../../../shared/src/constants.js';
import { LEVELS, levelAt } from '../../../shared/src/levels.js';
import type { SnapshotBody } from '../../../shared/src/protocol.js';
import type { HitHow, Phase, ResultRow } from '../../../shared/src/types.js';
import { makeBrain, thinkBot } from './bots.js';
import { fire, startPunch, updateProjectiles, updatePunches, updateStomps } from './combat.js';
import { scheduleFirstCrate, updateCrates } from './items.js';
import { createPlayer, resetBody, resetForRound, type Input, type Player, type World } from './model.js';
import { applyInput, separateBodies, stepPlayer, tryDrop } from './physics.js';
import { buildPlats, updatePlats } from './platforms.js';
import { makeRng } from './rng.js';

export type GameOptions = { seed?: number };


const FEED_MAX = 6;

export class Game {
  readonly w: World;
  tick = 0;
  countdownMs: number | null = null;
  timeLeftMs: number | null = null;
  winnerId: string | null = null;
  results: ResultRow[] | null = null;
  levelIndex = 0;
  nextLevelIndex = 0;
  private endHoldMs: number | null = null;
  private fallbackSince: number | null = null;
  private startCount = 0;
  private acc = 0;
  private idSeq = 1;

  constructor(opts: GameOptions = {}) {
    const rng = makeRng(opts.seed ?? Date.now());
    this.nextLevelIndex = Math.floor(rng() * LEVELS.length);
    this.levelIndex = this.nextLevelIndex;
    const level = levelAt(this.levelIndex);
    this.w = {
      t: 0,
      phase: 'lobby',
      level,
      plats: buildPlats(level, 0),
      players: new Map(),
      projectiles: [],
      crates: [],
      nextCrateAt: Infinity,
      fx: [],
      feed: [],
      rng,
      seq: { projectile: 1, crate: 1, feed: 1 },
    };
  }

  get phase(): Phase {
    return this.w.phase;
  }

  get players(): Map<string, Player> {
    return this.w.players;
  }

  get simTimeMs(): number {
    return this.w.t;
  }

  humanCount(): number {
    let n = 0;
    for (const p of this.w.players.values()) if (!p.bot) n++;
    return n;
  }

  botCount(): number {
    return this.w.players.size - this.humanCount();
  }

  // ------------------------------------------------------------ roster

  /** Add a human. Returns null when the arena is full of humans. */
  join(name?: string): { id: string; name: string; color: string } | null {
    if (this.w.players.size >= MATCH.capacity) {
      // humans take priority over bots
      if (!this.removeBot()) return null;
    }
    const p = this.addPlayer(uniqueName(this.w.players, sanitizeName(name) ?? `Player ${this.idSeq}`), false);
    return { id: p.id, name: p.name, color: p.color };
  }

  addBot(): Player | null {
    if (this.w.players.size >= MATCH.capacity || this.humanCount() === 0) return null;
    const used = new Set([...this.w.players.values()].map((p) => p.name));
    const pool = BOT_NAMES.filter((n) => !used.has(n));
    const name = pool.length ? pool[Math.floor(this.w.rng() * pool.length)] : uniqueName(this.w.players, 'Bot');
    const p = this.addPlayer(name, true);
    p.brain = makeBrain(this.w.rng);
    return p;
  }

  /** Remove the most recently added bot. */
  removeBot(): boolean {
    const bots = [...this.w.players.values()].filter((p) => p.bot);
    const last = bots[bots.length - 1];
    if (!last) return false;
    this.leave(last.id);
    return true;
  }

  private addPlayer(name: string, bot: boolean): Player {
    const id = `${bot ? 'b' : 'p'}${this.idSeq++}`;
    const used = new Set([...this.w.players.values()].map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[this.idSeq % COLORS.length];
    const p = createPlayer(id, name, color, bot);
    this.w.players.set(id, p);
    const phase = this.w.phase;
    if (phase === 'playing' || phase === 'ended') {
      p.life = 'waiting'; // watch this round, play the next
    } else if (phase === 'starting') {
      this.placeAtSpawn(p, this.w.players.size - 1);
    }
    return p;
  }

  leave(id: string): void {
    const p = this.w.players.get(id);
    if (!p) return;
    const inPlay = this.w.phase === 'playing' && (p.life === 'alive' || p.life === 'respawning');
    if (inPlay) this.pushFeed(p, null, 'left');
    this.w.players.delete(id);
    if (this.humanCount() === 0) {
      // nobody left to play with: clear the bots and idle in the lobby
      for (const q of [...this.w.players.values()]) this.w.players.delete(q.id);
      this.resetToLobby();
      this.fallbackSince = null;
      return;
    }
    if (inPlay) this.checkMatchEnd();
  }

  // ------------------------------------------------------------ commands

  setInput(id: string, input: Input): void {
    const p = this.w.players.get(id);
    if (!p || p.bot) return;
    applyInput(p, input);
  }

  punch(id: string): void {
    const p = this.w.players.get(id);
    if (p && this.w.phase === 'playing') startPunch(this.w, p);
  }

  shoot(id: string): void {
    const p = this.w.players.get(id);
    if (p && this.w.phase === 'playing') fire(this.w, p);
  }

  drop(id: string): void {
    const p = this.w.players.get(id);
    if (p && (this.w.phase === 'playing' || this.w.phase === 'ended')) tryDrop(this.w, p);
  }

  /** Change the arena for the next round (lobby / results screen only). */
  pickLevel(dir: 1 | -1): void {
    if (this.w.phase !== 'lobby' && this.w.phase !== 'ended') return;
    const n = LEVELS.length;
    this.nextLevelIndex = (((this.nextLevelIndex + dir) % n) + n) % n;
  }

  /** Force a fresh round right now (lobby GO / restart button). */
  restart(): void {
    if (this.humanCount() === 0) return;
    this.resetToLobby();
    this.beginCountdown();
  }

  // ------------------------------------------------------------ time

  /** Advance real time; the sim runs as many fixed ticks as fit. */
  step(dtMs: number): void {
    this.acc += Math.min(dtMs, 250);
    while (this.acc >= TICK_MS - 1e-6) {
      this.acc -= TICK_MS;
      this.runTick();
    }
  }

  private runTick(): void {
    const w = this.w;
    w.t += TICK_MS;
    this.tick++;
    switch (w.phase) {
      case 'lobby':
        this.tickLobby();
        break;
      case 'starting':
        updatePlats(w, TICK_MS);
        this.countdownMs = Math.max(0, (this.countdownMs ?? 0) - TICK_MS);
        if (this.countdownMs <= 0) this.startPlaying();
        break;
      case 'playing':
        this.timeLeftMs = Math.max(0, (this.timeLeftMs ?? 0) - TICK_MS);
        this.simulate(true);
        this.checkMatchEnd();
        break;
      case 'ended':
        this.simulate(false); // victory lap: movement only
        this.endHoldMs = Math.max(0, (this.endHoldMs ?? 0) - TICK_MS);
        if (this.endHoldMs <= 0) this.resetToLobby();
        break;
    }
  }

  private tickLobby(): void {
    const count = this.w.players.size;
    if (count < MATCH.fallbackStartPlayers) {
      this.fallbackSince = null;
      return;
    }
    if (this.fallbackSince === null) this.fallbackSince = this.w.t;
    if (this.humanCount() === 0) return;
    const quick = count >= MATCH.quickStartPlayers;
    const waited = this.w.t - this.fallbackSince >= MATCH.fallbackWaitMs;
    if (quick || waited) this.beginCountdown();
  }

  /** lobby → starting: build the arena and place everyone on it. */
  private beginCountdown(): void {
    const w = this.w;
    this.levelIndex = this.nextLevelIndex;
    w.level = levelAt(this.levelIndex);
    w.plats = buildPlats(w.level, w.t);
    w.projectiles = [];
    w.crates = [];
    w.feed = [];
    w.nextCrateAt = Infinity;
    w.phase = 'starting';
    this.countdownMs = MATCH.countdownMs;
    this.timeLeftMs = null;
    this.winnerId = null;
    this.results = null;
    this.fallbackSince = null;
    let i = 0;
    for (const p of w.players.values()) {
      resetForRound(p);
      this.placeAtSpawn(p, i++);
      // bots take a moment to size everyone up after "FIGHT!"
      if (p.brain) p.brain.calmUntil = w.t + MATCH.countdownMs + 700 + w.rng() * 1100;
    }
  }

  private startPlaying(): void {
    const w = this.w;
    w.phase = 'playing';
    this.countdownMs = null;
    this.timeLeftMs = MATCH.durationMs;
    this.startCount = [...w.players.values()].filter((p) => p.life === 'alive').length;
    scheduleFirstCrate(w);
  }

  private resetToLobby(): void {
    const w = this.w;
    w.phase = 'lobby';
    this.countdownMs = null;
    this.timeLeftMs = null;
    this.winnerId = null;
    this.endHoldMs = null;
    w.projectiles = [];
    w.crates = [];
    w.nextCrateAt = Infinity;
    for (const p of w.players.values()) resetForRound(p);
    // re-arm the auto-start grace period so rounds keep flowing
    this.fallbackSince = w.players.size >= MATCH.fallbackStartPlayers ? w.t : null;
  }

  // ------------------------------------------------------------ simulation

  private simulate(combat: boolean): void {
    const w = this.w;
    if (combat) {
      const actions = {
        punch: (p: Player) => startPunch(w, p),
        fire: (p: Player) => fire(w, p),
        drop: (p: Player) => tryDrop(w, p),
        input: (p: Player, i: Input) => applyInput(p, i),
      };
      for (const p of w.players.values()) if (p.bot) thinkBot(w, p, actions);
    }

    updatePlats(w, TICK_MS);
    if (combat) this.respawnDue();

    const alive = [...w.players.values()].filter((p) => p.life === 'alive');
    for (const p of alive) stepPlayer(w, p, TICK_MS);

    if (combat) {
      updateStomps(w, alive);
      updatePunches(w, alive);
    }
    separateBodies(alive);
    if (combat) {
      updateProjectiles(w, TICK_MS);
      updateCrates(w, TICK_MS, this.timeLeftMs ?? 0);
    }

    for (const p of alive) {
      if (!outOfBounds(p)) continue;
      if (combat) this.knockOut(p);
      else p.life = 'out';
    }
  }

  private respawnDue(): void {
    for (const p of this.w.players.values()) {
      if (p.life !== 'respawning' || this.w.t < p.respawnAt) continue;
      resetBody(p);
      p.dmg = 0;
      p.life = 'alive';
      const s = this.pickRespawn(p);
      p.x = s.x - PHYS.playerW / 2;
      p.y = s.y - PHYS.playerH;
      p.invulnUntil = this.w.t + MATCH.invulnMs;
      this.w.fx.push({ k: 'spawn', x: s.x, y: s.y, id: p.id });
    }
  }

  /** The spawn point farthest from everyone else (a little random among the best two). */
  private pickRespawn(p: Player): { x: number; y: number } {
    const others = [...this.w.players.values()].filter((q) => q !== p && q.life === 'alive');
    const scored = this.w.level.spawns
      .map((s) => {
        let d = 2000;
        for (const q of others) d = Math.min(d, Math.hypot(q.x + PHYS.playerW / 2 - s.x, q.y + PHYS.playerH - s.y));
        return { s, d };
      })
      .sort((a, b) => b.d - a.d);
    const pick = scored.length > 1 && this.w.rng() < 0.35 ? scored[1] : scored[0];
    return pick.s;
  }

  private knockOut(p: Player): void {
    const w = this.w;
    const cx = Math.min(Math.max(p.x + PHYS.playerW / 2, 24), ARENA.width - 24);
    const cy = Math.min(Math.max(p.y + PHYS.playerH / 2, 24), ARENA.height - 24);
    const dirX = p.x < 0 ? 1 : p.x > ARENA.width ? -1 : 0;
    const dirY = p.y > ARENA.height ? -1 : p.y < 0 ? 1 : 0;
    w.fx.push({ k: 'ko', x: cx, y: cy, id: p.id, color: p.color, dirX, dirY });

    const hit = p.lastHit;
    const killer = hit && w.t - hit.at <= COMBAT.koCreditMs ? w.players.get(hit.by) ?? null : null;
    if (killer && killer !== p) {
      killer.kos++;
      killer.totalKos++;
      this.pushFeed(p, killer, hit!.how);
    } else {
      this.pushFeed(p, null, 'fall');
    }

    p.stocks--;
    p.falls++;
    resetBody(p);
    p.x = -9999;
    p.y = -9999;
    if (p.stocks > 0) {
      p.life = 'respawning';
      p.respawnAt = w.t + MATCH.respawnDelayMs;
    } else {
      p.life = 'out';
      const remaining = [...w.players.values()].filter((q) => q.life === 'alive' || q.life === 'respawning').length;
      p.place = remaining + 1;
    }
  }

  private pushFeed(victim: Player, killer: Player | null, how: HitHow | 'fall' | 'left'): void {
    this.w.feed.unshift({
      n: this.w.seq.feed++,
      victim: victim.name,
      victimColor: victim.color,
      killer: killer ? killer.name : null,
      killerColor: killer ? killer.color : null,
      how,
    });
    if (this.w.feed.length > FEED_MAX) this.w.feed.length = FEED_MAX;
  }

  private checkMatchEnd(): void {
    if (this.w.phase !== 'playing') return;
    const remaining = [...this.w.players.values()].filter((p) => p.life === 'alive' || p.life === 'respawning');
    const lastStanding = this.startCount >= 2 && remaining.length <= 1;
    if (lastStanding || remaining.length === 0) {
      this.endMatch(remaining, false);
    } else if ((this.timeLeftMs ?? 1) <= 0) {
      this.endMatch(remaining, true);
    }
  }

  private endMatch(remaining: Player[], timeout: boolean): void {
    const w = this.w;
    // rank survivors: more stocks first, then less damage
    const ranked = [...remaining].sort((a, b) => b.stocks - a.stocks || a.dmg - b.dmg);
    ranked.forEach((p, i) => (p.place = i + 1));
    let winner: Player | null = ranked[0] ?? null;
    if (timeout && ranked.length > 1) {
      const [a, b] = ranked;
      if (a.stocks === b.stocks && Math.abs(a.dmg - b.dmg) < 1) winner = null; // dead heat → draw
    }
    if (winner) winner.wins++;
    for (const p of w.players.values()) if (p.bot) applyInput(p, { left: false, right: false, jump: false });
    this.winnerId = winner ? winner.id : null;

    this.results = [...w.players.values()]
      .filter((p) => p.place > 0)
      .sort((a, b) => a.place - b.place)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot,
        place: p.place,
        kos: p.kos,
        falls: p.falls,
        dmgDealt: Math.round(p.dmgDealt),
      }));

    w.phase = 'ended';
    w.projectiles = [];
    this.endHoldMs = MATCH.endHoldMs;
    this.timeLeftMs = timeout ? 0 : this.timeLeftMs;
    this.nextLevelIndex = (this.levelIndex + 1) % LEVELS.length;
  }

  private placeAtSpawn(p: Player, i: number): void {
    const spawns = this.w.level.spawns;
    const s = spawns[i % spawns.length];
    const layer = Math.floor(i / spawns.length);
    let x = s.x;
    if (layer > 0) {
      const host = this.w.level.platforms.find((pl) => !pl.move && pl.y === s.y && s.x >= pl.x && s.x <= pl.x + pl.w);
      x += (layer % 2 ? 1 : -1) * Math.ceil(layer / 2) * 38;
      if (host) x = Math.min(Math.max(x, host.x + PHYS.playerW / 2), host.x + host.w - PHYS.playerW / 2);
    }
    resetBody(p);
    p.life = 'alive';
    p.x = x - PHYS.playerW / 2;
    p.y = s.y - PHYS.playerH;
    p.face = x < ARENA.width / 2 ? 1 : -1;
  }

  // ------------------------------------------------------------ snapshot

  /** ms until the lobby auto-starts, or null if it isn't armed. */
  autoStartMs(): number | null {
    if (this.w.phase !== 'lobby' || this.fallbackSince === null || this.humanCount() === 0) return null;
    if (this.w.players.size >= MATCH.quickStartPlayers) return 0;
    return Math.max(0, Math.round(MATCH.fallbackWaitMs - (this.w.t - this.fallbackSince)));
  }

  /** Build the broadcast payload. Drains the pending fx queue. */
  snapshot(): SnapshotBody {
    const w = this.w;
    const t = w.t;
    const fx = w.fx;
    w.fx = [];
    const onArena = w.phase !== 'lobby';
    return {
      tick: this.tick,
      simTimeMs: Math.round(t),
      phase: w.phase,
      countdownMs: this.w.phase === 'ended' ? Math.round(this.endHoldMs ?? 0) : this.countdownMs,
      autoStartMs: this.autoStartMs(),
      timeLeftMs: this.timeLeftMs === null ? null : Math.round(this.timeLeftMs),
      winnerId: this.winnerId,
      level: this.levelIndex,
      nextLevel: this.nextLevelIndex,
      players: [...w.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot,
        x: r1(p.x),
        y: r1(p.y),
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        face: p.face,
        grounded: p.grounded,
        life: p.life,
        dmg: r1(p.dmg),
        stocks: p.stocks,
        weapon: p.weapon,
        ammo: p.ammo,
        invuln: t < p.invulnUntil,
        shield: t < p.shieldUntil,
        launched: t < p.launchUntil,
        punchAt: p.punchAt < 0 ? -1 : Math.round(p.punchAt),
        shotAt: p.shotAt < 0 ? -1 : Math.round(p.shotAt),
        airJumps: p.airJumpsLeft,
        wins: p.wins,
        kos: p.totalKos,
      })),
      platforms: onArena
        ? w.plats.map((pl) => ({ x: r1(pl.x), y: r1(pl.y), w: pl.w, h: pl.h, kind: pl.kind, state: pl.state }))
        : [],
      projectiles: w.projectiles.map((pr) => ({
        id: pr.id,
        kind: pr.kind,
        owner: pr.owner,
        x: r1(pr.x),
        y: r1(pr.y),
        vx: Math.round(pr.vx),
        vy: Math.round(pr.vy),
      })),
      crates: w.crates.map((c) => ({
        id: c.id,
        item: c.item,
        x: r1(c.x),
        y: r1(c.y),
        blink: t - c.bornAt > ITEMS.lifeMs - ITEMS.blinkMs,
      })),
      fx,
      feed: w.feed,
      results: this.results,
    };
  }
}

function outOfBounds(p: Player): boolean {
  return (
    p.x + PHYS.playerW < ARENA.blastLeft ||
    p.x > ARENA.blastRight ||
    p.y > ARENA.blastBottom ||
    p.y + PHYS.playerH < ARENA.blastTop
  );
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function sanitizeName(name?: string): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return cleaned.length > 0 ? cleaned : null;
}

function uniqueName(players: Map<string, Player>, base: string): string {
  const used = new Set([...players.values()].map((p) => p.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, 13)} ${i}`;
    if (!used.has(n)) return n;
  }
}
