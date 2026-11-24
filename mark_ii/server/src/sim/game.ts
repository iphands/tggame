/**
 * The authoritative game: lobby → starting (countdown on the start pad) →
 * playing (the screen scrolls, runners race to the finish) → ended (results)
 * → lobby.
 *
 * Time only advances through step(); the sim runs in fixed 60 Hz ticks so
 * it's deterministic for a given seed and input sequence.
 */
import { ARENA, BOT_NAMES, COLORS, COMBAT, ITEMS, MATCH, PHYS, RUN, TICK_MS } from '../../../shared/src/constants.js';
import { LEVELS, levelAt, safeSpots, type LevelDef } from '../../../shared/src/levels.js';
import type { SnapshotBody } from '../../../shared/src/protocol.js';
import type { FeedEntry, Phase, ResultRow } from '../../../shared/src/types.js';
import { makeBrain, thinkBot } from './bots.js';
import { fire, updateCharges, updateProjectiles, updateStomps } from './combat.js';
import { scheduleFirstCrate, updateCrates } from './items.js';
import { activeGate, centerX, createPlayer, isRacing, resetBody, resetForRound, type Input, type Player, type World } from './model.js';
import { applyInput, resolveSolids, separateBodies, stepPlayer, tryDrop, updatePace } from './physics.js';
import { buildPlats, solidIndices, updatePlats } from './platforms.js';
import { makeRng } from './rng.js';
import { armGate, updateScroll } from './scroll.js';

/** `levels` swaps the course list (tests use small static worlds). */
export type GameOptions = { seed?: number; levels?: LevelDef[] };


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
  /** Bumps whenever a round is built. */
  round = 0;
  readonly levels: LevelDef[];
  private endHoldMs: number | null = null;
  private fallbackSince: number | null = null;
  private startCount = 0;
  private acc = 0;
  private idSeq = 1;

  constructor(opts: GameOptions = {}) {
    const rng = makeRng(opts.seed ?? Date.now());
    this.levels = opts.levels ?? LEVELS;
    this.nextLevelIndex = Math.floor(rng() * this.levels.length);
    this.levelIndex = this.nextLevelIndex;
    const level = levelAt(this.levelIndex, this.levels);
    const plats = buildPlats(level, 0);
    this.w = {
      t: 0,
      phase: 'lobby',
      level,
      plats,
      solids: solidIndices(plats),
      spots: safeSpots(level),
      scrollX: 0,
      gateIdx: 0,
      gateHp: 0,
      gateMax: 0,
      roundStartT: 0,
      firstFinishAt: -1,
      finishCount: 0,
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
    this.endPracticeIfJoined();
    return { id: p.id, name: p.name, color: p.color };
  }

  addBot(): Player | null {
    if (this.w.players.size >= MATCH.capacity || this.humanCount() === 0) return null;
    const used = new Set([...this.w.players.values()].map((p) => p.name));
    const pool = BOT_NAMES.filter((n) => !used.has(n));
    const name = pool.length ? pool[Math.floor(this.w.rng() * pool.length)] : uniqueName(this.w.players, 'Bot');
    const p = this.addPlayer(name, true);
    p.brain = makeBrain(this.w.rng);
    this.endPracticeIfJoined();
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

  /** A solo practice round restarts with company as soon as someone joins. */
  private endPracticeIfJoined(): void {
    if (this.w.phase === 'playing' && this.startCount < 2) {
      this.resetToLobby();
      this.beginCountdown();
    }
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
    const inPlay = this.w.phase === 'playing' && isRacing(p);
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

  shoot(id: string): void {
    const p = this.w.players.get(id);
    if (p && this.w.phase === 'playing') fire(this.w, p);
  }

  drop(id: string): void {
    const p = this.w.players.get(id);
    if (p && (this.w.phase === 'playing' || this.w.phase === 'ended')) tryDrop(this.w, p);
  }

  /** Change the course for the next round (lobby / results screen only). */
  pickLevel(dir: 1 | -1): void {
    if (this.w.phase !== 'lobby' && this.w.phase !== 'ended') return;
    const n = this.levels.length;
    this.nextLevelIndex = (((this.nextLevelIndex + dir) % n) + n) % n;
  }

  /**
   * Force a fresh round right now (lobby START / restart button). Mid-match it
   * only works when you're the only human, so nobody can wipe a shared round.
   */
  restart(): void {
    const humans = this.humanCount();
    if (humans === 0) return;
    if (this.w.phase === 'playing' && humans > 1) return;
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

  /** lobby → starting: build the course and line everyone up on the start pad. */
  private beginCountdown(): void {
    const w = this.w;
    this.levelIndex = this.nextLevelIndex;
    this.round++;
    w.level = levelAt(this.levelIndex, this.levels);
    w.plats = buildPlats(w.level, w.t);
    w.solids = solidIndices(w.plats);
    w.spots = safeSpots(w.level);
    w.scrollX = 0;
    w.gateIdx = 0;
    w.firstFinishAt = -1;
    w.finishCount = 0;
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
      // bots have human-ish reaction times off the line
      if (p.brain) p.brain.calmUntil = w.t + MATCH.countdownMs + 80 + w.rng() * 420 * (1.5 - p.brain.skill);
    }
    armGate(w);
  }

  private startPlaying(): void {
    const w = this.w;
    w.phase = 'playing';
    this.countdownMs = null;
    this.timeLeftMs = MATCH.durationMs;
    this.startCount = [...w.players.values()].filter((p) => p.life === 'alive').length;
    w.roundStartT = w.t;
    armGate(w); // sized for everyone who made the start
    // a jump tapped during the countdown must not fire as an air jump at GO
    for (const p of w.players.values()) p.jumpBufferMs = 0;
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
    w.scrollX = 0;
    for (const p of w.players.values()) resetForRound(p);
    // re-arm the auto-start grace period so rounds keep flowing
    this.fallbackSince = w.players.size >= MATCH.fallbackStartPlayers ? w.t : null;
  }

  // ------------------------------------------------------------ simulation

  private simulate(combat: boolean): void {
    const w = this.w;
    if (combat) {
      const actions = {
        fire: (p: Player) => fire(w, p),
        drop: (p: Player) => tryDrop(w, p),
        input: (p: Player, i: Input) => applyInput(p, i),
      };
      for (const p of w.players.values()) if (p.bot) thinkBot(w, p, actions);
    }

    updatePlats(w, TICK_MS);
    if (combat) this.respawnDue();

    const alive = [...w.players.values()].filter((p) => p.life === 'alive');
    updatePace(alive);
    for (const p of alive) stepPlayer(w, p, TICK_MS);

    if (combat) {
      updateStomps(w, alive);
    }
    separateBodies(alive);
    resolveSolids(w, alive);
    if (combat) {
      updateCharges(w);
      updateProjectiles(w, TICK_MS);
      updateCrates(w, TICK_MS);
      updateScroll(w, TICK_MS);
    }

    for (const p of alive) {
      if (p.finishMs < 0) p.bestX = Math.max(p.bestX, centerX(p));
      if (combat && p.finishMs < 0 && centerX(p) >= w.level.finishX) this.finish(p);
      const lost = lostHow(w, p);
      if (!lost) continue;
      if (p.finishMs >= 0) this.parkAtFinish(p); // done racing: just put them back on the pad
      else if (combat) this.knockOut(p, lost);
      else {
        // victory lap: just park anyone who wanders off; standings are final
        p.life = 'respawning';
        p.respawnAt = Infinity;
      }
    }
  }

  private respawnDue(): void {
    for (const p of this.w.players.values()) {
      if (p.life !== 'respawning' || this.w.t < p.respawnAt) continue;
      resetBody(p);
      p.life = 'alive';
      p.face = 1;
      const s = this.pickRespawn();
      p.x = s.x - PHYS.playerW / 2;
      p.y = s.y - PHYS.playerH;
      p.invulnUntil = this.w.t + MATCH.invulnMs;
      this.w.fx.push({ k: 'spawn', x: s.x, y: s.y, id: p.id });
    }
  }

  /**
   * Where a runner drops back in: the first safe spot a little in from the
   * left screen edge, never past the standing gate or the finish line.
   */
  private pickRespawn(): { x: number; y: number } {
    const w = this.w;
    const gate = activeGate(w);
    const maxX = Math.min(gate ? gate.x - 70 : Infinity, w.level.finishX - 120, w.scrollX + ARENA.width - 60);
    const wantX = w.scrollX + RUN.respawnAheadFrac * ARENA.width;
    const ok = w.spots.filter((s) => s.x >= w.scrollX + 50 && s.x <= maxX);
    const ahead = ok.find((s) => s.x >= wantX);
    return ahead ?? ok[ok.length - 1] ?? w.spots.find((s) => s.x >= w.scrollX + 50) ?? w.level.spawns[0];
  }

  /** A runner crossed the line. */
  private finish(p: Player): void {
    const w = this.w;
    p.finishMs = w.t - w.roundStartT + p.deaths * RUN.deathPenaltyMs;
    w.finishCount++;
    // lost lives cost time, so a cleaner run can place ahead of an earlier finisher
    [...w.players.values()]
      .filter((q) => q.finishMs >= 0)
      .sort((a, b) => a.finishMs - b.finishMs || (a.place || Infinity) - (b.place || Infinity))
      .forEach((q, i) => (q.place = i + 1));
    p.chargeUntil = 0;
    p.invulnUntil = 0;
    if (w.firstFinishAt < 0) w.firstFinishAt = w.t;
    w.fx.push({ k: 'finish', x: centerX(p), y: p.y + PHYS.playerH / 2, id: p.id, place: p.place });
    this.pushFeed(p, null, 'finish');
  }

  /** Finished runners can't be lost: drop them back on the finish pad. */
  private parkAtFinish(p: Player): void {
    const w = this.w;
    const x = w.level.finishX + 140 + (p.place % 6) * 40;
    const pad = w.level.platforms.find((pl) => !pl.move && x >= pl.x && x <= pl.x + pl.w);
    resetBody(p);
    p.x = x - PHYS.playerW / 2;
    p.y = (pad ? pad.y : ARENA.height * 0.75) - PHYS.playerH;
  }

  /** Lost a life: fell into a pit or got caught by the left edge of the screen. */
  private knockOut(p: Player, how: 'fall' | 'scroll'): void {
    const w = this.w;
    const cx = Math.min(Math.max(centerX(p), w.scrollX + 24), w.scrollX + ARENA.width - 24);
    const cy = Math.min(Math.max(p.y + PHYS.playerH / 2, 24), ARENA.height - 24);
    w.fx.push({ k: 'ko', x: cx, y: cy, id: p.id, color: p.color, dirX: how === 'scroll' ? 1 : 0, dirY: how === 'fall' ? -1 : 0 });

    const hit = p.lastHit;
    const killer = hit && w.t - hit.at <= COMBAT.koCreditMs ? w.players.get(hit.by) ?? null : null;
    if (killer && killer !== p) {
      killer.kos++;
      killer.totalKos++;
      this.pushFeed(p, killer, hit!.how);
    } else {
      this.pushFeed(p, null, how);
    }

    p.lives--;
    p.deaths++;
    resetBody(p);
    p.x = -9999;
    p.y = -9999;
    if (p.lives > 0) {
      p.life = 'respawning';
      p.respawnAt = w.t + MATCH.respawnDelayMs;
    } else {
      p.life = 'out';
      p.outAt = w.t;
    }
  }

  private pushFeed(victim: Player, killer: Player | null, how: FeedEntry['how']): void {
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

  /** The round ends when nobody is still racing, the finish grace runs out, or the clock does. */
  private checkMatchEnd(): void {
    const w = this.w;
    if (w.phase !== 'playing') return;
    const racing = [...w.players.values()].some(isRacing);
    const graceOver = w.firstFinishAt >= 0 && w.t - w.firstFinishAt >= RUN.finishGraceMs;
    if (!racing || graceOver) this.endMatch(false);
    else if ((this.timeLeftMs ?? 1) <= 0) this.endMatch(true);
  }

  /** ms the stragglers have left once someone has finished, else null. */
  graceMs(): number | null {
    const w = this.w;
    if (w.phase !== 'playing' || w.firstFinishAt < 0) return null;
    return Math.max(0, Math.round(RUN.finishGraceMs - (w.t - w.firstFinishAt)));
  }

  private endMatch(timeout: boolean): void {
    const w = this.w;
    // finishers keep their order; then runners still going by distance, then the eliminated by distance
    const ran = [...w.players.values()].filter((p) => p.life !== 'waiting');
    const rest = ran
      .filter((p) => p.finishMs < 0)
      .sort((a, b) => Number(a.life === 'out') - Number(b.life === 'out') || b.bestX - a.bestX);
    rest.forEach((p, i) => (p.place = w.finishCount + i + 1));
    const winner = ran.find((p) => p.finishMs >= 0 && p.place === 1) ?? null;
    if (winner) winner.wins++;
    for (const p of w.players.values()) if (p.bot) applyInput(p, { left: false, right: false, jump: false });
    this.winnerId = winner ? winner.id : null;

    const finishX = w.level.finishX;
    this.results = ran
      .sort((a, b) => a.place - b.place)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot,
        place: p.place,
        timeMs: p.finishMs >= 0 ? Math.round(p.finishMs) : null,
        progress: p.finishMs >= 0 ? 100 : Math.max(0, Math.min(99, Math.round((p.bestX / finishX) * 100))),
        deaths: p.deaths,
        smash: Math.round(p.smash),
      }));

    w.phase = 'ended';
    w.projectiles = [];
    this.endHoldMs = MATCH.endHoldMs;
    this.timeLeftMs = timeout ? 0 : this.timeLeftMs;
    this.nextLevelIndex = (this.levelIndex + 1) % this.levels.length;
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
    const idx = this.w.plats.findIndex((pl) => pl.y === s.y && x >= pl.x && x <= pl.x + pl.w);
    p.grounded = idx >= 0;
    p.platIdx = idx;
    p.face = 1;
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
    const onCourse = w.phase !== 'lobby';
    const gate = onCourse ? activeGate(w) : null;
    const viewL = w.scrollX - 200;
    const viewR = w.scrollX + ARENA.width + 200;
    return {
      tick: this.tick,
      simTimeMs: Math.round(t),
      phase: w.phase,
      countdownMs: this.w.phase === 'ended' ? Math.round(this.endHoldMs ?? 0) : this.countdownMs,
      autoStartMs: this.autoStartMs(),
      timeLeftMs: this.timeLeftMs === null ? null : Math.round(this.timeLeftMs),
      graceMs: this.graceMs(),
      winnerId: this.winnerId,
      level: this.levelIndex,
      nextLevel: this.nextLevelIndex,
      round: this.round,
      scrollX: onCourse ? r1(w.scrollX) : 0,
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
        lives: p.lives,
        place: p.finishMs >= 0 ? p.place : 0,
        finishMs: p.finishMs >= 0 ? Math.round(p.finishMs) : -1,
        weapon: p.weapon,
        ammo: p.ammo,
        invuln: t < p.invulnUntil,
        shield: t < p.shieldUntil,
        launched: t < p.launchUntil,
        dmg: Math.round(p.dmg),
        charging: p.chargeUntil > 0,
        shotAt: p.shotAt < 0 ? -1 : Math.round(p.shotAt),
        airJumps: p.airJumpsLeft,
        wins: p.wins,
        kos: p.totalKos,
      })),
      crumble: onCourse ? crumbleStates(w) : [],
      boxes: onCourse ? boxStates(w, viewL, viewR) : [],
      gate: gate ? { i: w.gateIdx, hp: r1(w.gateHp), max: w.gateMax } : null,
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

/** How (if at all) a runner was lost this tick: into a pit, or off the left edge of the screen. */
function lostHow(w: World, p: Player): 'fall' | 'scroll' | null {
  if (p.y > ARENA.height + RUN.fallBelow) return 'fall';
  if (p.x + PHYS.playerW < w.scrollX - RUN.killMargin) return 'scroll';
  return null;
}

function crumbleStates(w: World): [number, 'shaking' | 'gone'][] {
  const out: [number, 'shaking' | 'gone'][] = [];
  for (let i = 0; i < w.plats.length; i++) {
    const pl = w.plats[i];
    if (!pl.box && pl.state !== 'solid') out.push([i, pl.state]);
  }
  return out;
}

/** Damaged or broken boxes near the screen. */
function boxStates(w: World, viewL: number, viewR: number): [number, number][] {
  const out: [number, number][] = [];
  for (const i of w.solids) {
    const pl = w.plats[i];
    const box = pl.box!;
    if (box.hp >= box.max || pl.x + pl.w < viewL || pl.x > viewR) continue;
    out.push([box.idx, r1(Math.max(0, box.hp))]);
  }
  return out;
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
