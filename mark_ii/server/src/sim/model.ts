/** Server-side simulation state. Everything here is internal to the server. */
import { PHYS, RUN } from '../../../shared/src/constants.js';
import type { GateDef, LevelDef, PlatformDef, PlatformKind } from '../../../shared/src/levels.js';
import type {
  FeedEntry,
  Fx,
  HitHow,
  ItemKind,
  LifeState,
  Phase,
  ProjectileState,
  WeaponKind,
} from '../../../shared/src/types.js';

export type Input = { left: boolean; right: boolean; jump: boolean };

export const NO_INPUT: Input = { left: false, right: false, jump: false };

export type BotBrain = {
  /** 0..1 — scales reaction time, steadiness and trigger speed. */
  skill: number;
  /** Ticks left to keep holding jump. */
  jumpHold: number;
  /** A jump press is queued (needs a released→pressed edge). */
  pressQueued: boolean;
  pressHold: number;
  /** Ticks before another jump decision. */
  jumpCd: number;
  /** Sim ms until the bot gets going again (reaction time, hesitation). */
  calmUntil: number;
  /** Stuck detector: where it stood at `stuckAt`. */
  stuckX: number;
  stuckAt: number;
};

export type Player = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  brain: BotBrain | null;

  x: number; // top-left of the body box
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  grounded: boolean;
  platIdx: number;
  coyoteMs: number;
  jumpBufferMs: number;
  prevJump: boolean;
  /** Rising from a jump (releasing jump cuts it short). Pads and hits are not cuttable. */
  cuttable: boolean;
  airJumpsLeft: number;
  dropFrom: number;
  dropUntil: number;
  prevBottom: number;
  input: Input;

  life: LifeState;
  respawnAt: number;
  invulnUntil: number;
  shieldUntil: number;
  /** Speed shoes last until this sim ms. */
  shoesUntil: number;
  /** In hitstun until this sim ms (reduced control, no speed clamp). */
  launchUntil: number;
  /** Speed clamp skipped until this sim ms (lunges, recoil, launches). */
  boostUntil: number;
  /** Damage percent taken this life: slows the runner (see RUN.dmgSlow). */
  dmg: number;
  /** Max-speed multiplier this tick (damage + lead over the pack): set by updatePace(). */
  speedMul: number;

  lives: number;
  weapon: WeaponKind;
  ammo: number;
  shotAt: number;
  /** Railgun: sim ms the charged shot fires (0 = not charging). */
  chargeUntil: number;
  lastHit: { by: string; at: number; how: HitHow } | null;

  // per-round stats
  kos: number;
  deaths: number;
  /** Damage dealt to boxes and gates. */
  smash: number;
  /** Finishing position (0 = hasn't finished). */
  place: number;
  /** Run time when they crossed the line, plus RUN.deathPenaltyMs per life lost (-1 = hasn't finished). */
  finishMs: number;
  /** Farthest x reached this round. */
  bestX: number;
  /** Sim ms the player lost their last life (-1 if not out). */
  outAt: number;

  // session stats
  wins: number;
  totalKos: number;
};

export type Plat = {
  def: PlatformDef;
  kind: PlatformKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  w: number;
  h: number;
  state: 'solid' | 'shaking' | 'gone';
  /** ms spent in the current crumble state. */
  timer: number;
  /** Set for boxes: solid on every side. `idx` is the index into level.boxes; hp Infinity = unbreakable; `arms` = blue weapon box. */
  box?: { idx: number; hp: number; max: number; arms: boolean };
};

export type Projectile = {
  id: number;
  kind: ProjectileState['kind'];
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
  bornAt: number;
  /** Knockback angle for bullets/pellets (degrees above horizontal). */
  angleDeg: number;
  /** Players this shot has already shoved (it flies on through them). */
  hit: string[];
};

export type Crate = {
  id: number;
  item: ItemKind;
  x: number;
  y: number;
  vy: number;
  platIdx: number;
  bornAt: number;
};

/** Mutable world shared by all sim modules. */
export type World = {
  /** Sim clock in ms (advances in fixed ticks). */
  t: number;
  phase: Phase;
  level: LevelDef;
  /** Level platforms first (same order as level.platforms), then one per level box. */
  plats: Plat[];
  /** Indices into `plats` of the boxes. */
  solids: number[];
  /** Respawn spots (see safeSpots), sorted by x. */
  spots: { x: number; y: number }[];
  /** Left edge of the screen in course px. Only ever moves right during a round. */
  scrollX: number;
  /** Index of the next standing gate (level.gates.length = all down). */
  gateIdx: number;
  gateHp: number;
  gateMax: number;
  /** Sim ms the current round went live. */
  roundStartT: number;
  /** Sim ms the first runner crossed the line (-1 = nobody yet). */
  firstFinishAt: number;
  finishCount: number;
  players: Map<string, Player>;
  projectiles: Projectile[];
  crates: Crate[];
  nextCrateAt: number;
  fx: Fx[];
  feed: FeedEntry[];
  rng: () => number;
  seq: { projectile: number; crate: number; feed: number };
};

export function createPlayer(id: string, name: string, color: string, bot: boolean): Player {
  return {
    id,
    name,
    color,
    bot,
    brain: null,
    x: -9999,
    y: -9999,
    vx: 0,
    vy: 0,
    face: 1,
    grounded: false,
    platIdx: -1,
    coyoteMs: 0,
    jumpBufferMs: 0,
    prevJump: false,
    cuttable: false,
    airJumpsLeft: PHYS.airJumps,
    dropFrom: -1,
    dropUntil: 0,
    prevBottom: -1e9,
    input: { ...NO_INPUT },
    life: 'alive',
    respawnAt: 0,
    invulnUntil: 0,
    shieldUntil: 0,
    shoesUntil: 0,
    launchUntil: 0,
    boostUntil: 0,
    dmg: 0,
    speedMul: 1,
    lives: RUN.lives,
    weapon: 'pistol',
    ammo: -1,
    shotAt: -1e9,
    chargeUntil: 0,
    lastHit: null,
    kos: 0,
    deaths: 0,
    smash: 0,
    place: 0,
    finishMs: -1,
    bestX: 0,
    outAt: -1,
    wins: 0,
    totalKos: 0,
  };
}

/** Clear everything about a player's body (position, motion, timers, weapon). */
export function resetBody(p: Player): void {
  p.vx = 0;
  p.vy = 0;
  p.grounded = false;
  p.platIdx = -1;
  p.coyoteMs = 0;
  p.jumpBufferMs = 0;
  p.cuttable = false;
  p.airJumpsLeft = PHYS.airJumps;
  p.dropFrom = -1;
  p.dropUntil = 0;
  p.prevBottom = -1e9;
  p.invulnUntil = 0;
  p.shieldUntil = 0;
  p.shoesUntil = 0;
  p.launchUntil = 0;
  p.boostUntil = 0;
  p.dmg = 0;
  p.speedMul = 1;
  p.weapon = 'pistol';
  p.ammo = -1;
  p.shotAt = -1e9;
  p.chargeUntil = 0;
  p.lastHit = null;
}

/** Full reset for a fresh round. Session stats (wins, totalKos) survive. */
export function resetForRound(p: Player): void {
  resetBody(p);
  p.x = -9999;
  p.y = -9999;
  p.face = 1;
  p.life = 'alive';
  p.respawnAt = 0;
  p.lives = RUN.lives;
  p.kos = 0;
  p.deaths = 0;
  p.smash = 0;
  p.place = 0;
  p.finishMs = -1;
  p.bestX = 0;
  p.outAt = -1;
  p.input = { ...NO_INPUT };
  p.prevJump = false;
}

export function isActive(p: Player): boolean {
  return p.life === 'alive';
}

/** Still racing: on the course or about to drop back in, and not across the line yet. */
export function isRacing(p: Player): boolean {
  return (p.life === 'alive' || p.life === 'respawning') && p.finishMs < 0;
}

/** The gate currently standing in the way, if any. */
export function activeGate(w: World): GateDef | null {
  return w.level.gates[w.gateIdx] ?? null;
}

export function centerX(p: Player): number {
  return p.x + PHYS.playerW / 2;
}

export function centerY(p: Player): number {
  return p.y + PHYS.playerH / 2;
}
