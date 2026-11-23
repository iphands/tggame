/** Server-side simulation state. Everything here is internal to the server. */
import { MATCH, PHYS } from '../../../shared/src/constants.js';
import type { LevelDef, PlatformDef, PlatformKind } from '../../../shared/src/levels.js';
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
  /** 0..1 — scales aggression and aim. */
  skill: number;
  targetId: string | null;
  retargetAt: number;
  /** Ticks left to keep holding jump. */
  jumpHold: number;
  /** A jump press is queued (needs a released→pressed edge). */
  pressQueued: boolean;
  pressHold: number;
  /** Ticks before another jump decision. */
  jumpCd: number;
  dropCd: number;
  /** Sim ms until the bot may punch again (pacing). */
  calmUntil: number;
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
  /** In hitstun until this sim ms (reduced control, no speed clamp). */
  launchUntil: number;
  /** Speed clamp skipped until this sim ms (lunges, recoil, launches). */
  boostUntil: number;

  dmg: number;
  stocks: number;
  weapon: WeaponKind;
  ammo: number;
  punchAt: number;
  punchHits: Set<string>;
  shotAt: number;
  /** Railgun: sim ms the charged shot fires (0 = not charging). */
  chargeUntil: number;
  lastHit: { by: string; at: number; how: HitHow } | null;

  // per-match stats
  kos: number;
  falls: number;
  dmgDealt: number;
  place: number;
  /** Sim ms the player lost their last stock (-1 if not out). */
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
  plats: Plat[];
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
    launchUntil: 0,
    boostUntil: 0,
    dmg: 0,
    stocks: MATCH.stocks,
    weapon: 'pistol',
    ammo: -1,
    punchAt: -1e9,
    punchHits: new Set(),
    shotAt: -1e9,
    chargeUntil: 0,
    lastHit: null,
    kos: 0,
    falls: 0,
    dmgDealt: 0,
    place: 0,
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
  p.launchUntil = 0;
  p.boostUntil = 0;
  p.weapon = 'pistol';
  p.ammo = -1;
  p.punchAt = -1e9;
  p.punchHits.clear();
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
  p.dmg = 0;
  p.stocks = MATCH.stocks;
  p.kos = 0;
  p.falls = 0;
  p.dmgDealt = 0;
  p.place = 0;
  p.outAt = -1;
  p.input = { ...NO_INPUT };
  p.prevJump = false;
}

export function isActive(p: Player): boolean {
  return p.life === 'alive';
}

export function centerX(p: Player): number {
  return p.x + PHYS.playerW / 2;
}

export function centerY(p: Player): number {
  return p.y + PHYS.playerH / 2;
}
