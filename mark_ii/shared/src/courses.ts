/**
 * The five hand-built courses, written segment by segment with a small cursor
 * builder: lay ground, leave gaps, drop boxes and gates on the last stretch.
 *
 * Reach budget at normal gravity (see PHYS): a held jump clears ~190 px flat,
 * a double jump ~280 px, and climbs ~150 px (double ~280 px).
 */
import { BOX } from './constants.js';
import type { BoxDef, GateDef, LevelDef, PlatformDef, PlatformKind, PlatformMove, ThemeId } from './levels.js';

const GROUND_Y = 540;
const GROUND_H = 40;
/** Floor is laid in tiles this wide at most (keeps platform textures small). */
const TILE = 640;
const B = BOX.size;

type PlatOpts = { kind?: PlatformKind; move?: PlatformMove; h?: number };

class Course {
  /** Cursor: where the next piece of floor starts, and the floor height. */
  x = 0;
  y = GROUND_Y;
  /** Start of the most recent floor: features are placed relative to it. */
  private g0 = 0;
  private gy = GROUND_Y;
  private finishX = 0;
  readonly platforms: PlatformDef[] = [];
  readonly boxes: BoxDef[] = [];
  readonly gates: GateDef[] = [];

  /** Solid floor from the cursor, `w` wide. */
  ground(w: number, kind?: PlatformKind): this {
    this.g0 = this.x;
    this.gy = this.y;
    const n = Math.ceil(w / TILE);
    for (let i = 0; i < n; i++) {
      const tw = Math.round(w / n);
      const def: PlatformDef = { x: this.x + i * tw, y: this.y, w: i === n - 1 ? w - tw * (n - 1) : tw, h: GROUND_H };
      if (kind) def.kind = kind;
      this.platforms.push(def);
    }
    this.x += w;
    return this;
  }

  /** A pit: nothing to stand on for `w` px. */
  gap(w: number): this {
    this.x += w;
    return this;
  }

  /** The next floor sits `dy` px higher (negative = lower). */
  rise(dy: number): this {
    this.y -= dy;
    return this;
  }

  /** A stack of `n` breakable boxes on the last floor, `at` px from its start. Shoot the bottom one and the stack falls. */
  crates(at: number, n = 1, hp: number = BOX.hp): this {
    for (let i = 0; i < n; i++) this.boxes.push({ x: this.g0 + at, y: this.gy - B * (i + 1), w: B, h: B, hp });
    return this;
  }

  /** A permanent block on the last floor, `wTiles` x `hTiles` boxes big. Jump it. */
  block(at: number, wTiles = 1, hTiles = 1): this {
    this.boxes.push({ x: this.g0 + at, y: this.gy - B * hTiles, w: B * wTiles, h: B * hTiles });
    return this;
  }

  /** A one-way ledge above the last floor: `at` px from its start, `up` px above it. */
  ledge(at: number, up: number, w: number, opts: PlatOpts = {}): this {
    return this.put(this.g0 + at, this.gy - up, w, opts);
  }

  /** A one-way platform out past the cursor (over the gap you're about to leave): `dx` px ahead, `up` px above the floor line. */
  air(dx: number, up: number, w: number, opts: PlatOpts = {}): this {
    return this.put(this.x + dx, this.y - up, w, opts);
  }

  /** A co-op gate across the last floor, `at` px from its start. */
  gate(at: number): this {
    this.gates.push({ x: this.g0 + at, w: BOX.gateW });
    return this;
  }

  /** The finish line and the pad behind it. */
  finish(): this {
    this.finishX = this.x + 220;
    this.ground(920);
    return this;
  }

  build(meta: { id: string; name: string; tagline: string; theme: ThemeId; gravityScale?: number }): LevelDef {
    const pad = this.platforms[0];
    const spawns = [];
    for (let i = 0; i < 8; i++) spawns.push({ x: pad.x + 110 + i * 52, y: pad.y });
    return {
      ...meta,
      gravityScale: meta.gravityScale ?? 1,
      length: this.x,
      finishX: this.finishX,
      platforms: this.platforms,
      boxes: this.boxes,
      gates: [...this.gates].sort((a, b) => a.x - b.x),
      spawns,
    };
  }

  private put(x: number, y: number, w: number, opts: PlatOpts): this {
    const def: PlatformDef = { x, y, w, h: opts.h ?? 22 };
    if (opts.kind) def.kind = opts.kind;
    if (opts.move) def.move = opts.move;
    this.platforms.push(def);
    return this;
  }
}

// ------------------------------------------------------------------ Sky Sprint

function skySprint(): LevelDef {
  const c = new Course();
  // warm-up: one box to shoot or hop, one block to jump
  c.ground(1240).crates(940, 1);
  c.gap(130);
  c.ground(760).block(380, 1, 1);
  c.gap(170);
  c.ground(620).ledge(210, 120, 180);
  c.gap(190);
  // crate field
  c.ground(1000).crates(330, 2).crates(620, 1).crates(668, 2);
  // stairs up
  c.gap(140).rise(70);
  c.ground(480);
  c.gap(140).rise(70);
  // gate 1
  c.ground(1150).crates(300, 1).gate(820);
  // a lazy lift carries you over the wide pit
  c.air(95, 0, 120, { move: { ay: 46, periodMs: 2600 } });
  c.gap(310).rise(-70);
  c.ground(820).block(330, 2, 1).crates(600, 3, 4);
  c.gap(180).rise(-70);
  // island hops
  c.ground(300);
  c.gap(160);
  c.ground(260);
  c.gap(180);
  c.ground(300).block(130, 1, 1);
  c.gap(200);
  // gate 2
  c.ground(1250).crates(280, 2).crates(328, 2).ledge(430, 130, 200).gate(900);
  c.gap(170).rise(60);
  c.ground(520).block(260, 1, 2);
  c.air(100, 20, 130, { move: { ax: 60, periodMs: 3000 } });
  c.gap(330).rise(-60);
  // last dash: a crate wall
  c.ground(900).crates(380, 4, 6).crates(428, 4, 6).block(700, 1, 1);
  c.gap(190);
  c.finish();
  return c.build({ id: 'sky', name: 'Sky Sprint', tagline: 'Floating meadows and lazy lifts. A gentle first dash.', theme: 'sky' });
}

// ------------------------------------------------------------------ Frost Dash

function frostDash(): LevelDef {
  const c = new Course();
  c.ground(1100);
  c.gap(140);
  // first slide
  c.ground(900, 'ice').block(520, 1, 1);
  c.gap(180);
  c.ground(420);
  c.gap(170);
  c.ground(800, 'ice').crates(360, 2).crates(620, 1);
  c.gap(150).rise(60);
  c.ground(360);
  c.gap(150).rise(60);
  // gate 1 on firm ground
  c.ground(1200).block(260, 1, 1).gate(860);
  // a glider crosses the crevasse
  c.air(170, 10, 150, { move: { ax: 90, periodMs: 3600 } });
  c.gap(480).rise(-60);
  c.ground(700, 'ice').block(300, 2, 1);
  c.gap(190).rise(-60);
  // floes
  c.ground(280, 'ice');
  c.gap(170);
  c.ground(280, 'ice');
  c.gap(170);
  c.ground(520).crates(240, 3, 4);
  c.gap(200);
  // slide into a crate wall: shoot early
  c.ground(1000, 'ice').crates(560, 4, 6).crates(608, 4, 6).ledge(120, 120, 170, { kind: 'ice' });
  c.gap(180);
  // gate 2
  c.ground(1200).crates(240, 1).crates(500, 2).gate(880);
  c.gap(190).rise(70);
  c.ground(420, 'ice').block(210, 1, 1);
  c.gap(200).rise(-70);
  c.ground(820, 'ice').block(300, 1, 2).crates(620, 2);
  c.gap(200);
  c.finish();
  return c.build({ id: 'frost', name: 'Frost Dash', tagline: 'Slick ice under the aurora. Brake early, shoot earlier.', theme: 'frost' });
}

// ------------------------------------------------------------------ Temple Tumble

function templeTumble(): LevelDef {
  const c = new Course();
  c.ground(1100).block(820, 1, 1);
  c.gap(150);
  c.ground(520).crates(260, 2);
  // first crumbling bridge
  c.air(60, 0, 120, { kind: 'crumble' }).air(240, 0, 120, { kind: 'crumble' }).air(420, 0, 120, { kind: 'crumble' });
  c.gap(600);
  c.ground(700).block(300, 1, 2);
  c.gap(170).rise(70);
  c.ground(420).crates(200, 1);
  c.gap(160).rise(70);
  // gate 1
  c.ground(1200).crates(300, 3, 4).gate(860);
  c.gap(180).rise(-70);
  c.ground(360);
  // crumbling stairs down, then up
  c.air(70, -30, 110, { kind: 'crumble' }).air(250, 20, 110, { kind: 'crumble' }).air(430, 70, 110, { kind: 'crumble' });
  c.gap(600).rise(70);
  c.ground(760).block(260, 2, 1).crates(520, 2).crates(568, 3, 4);
  c.gap(190);
  c.ground(300);
  c.gap(180);
  // pillar tops
  c.ground(200);
  c.gap(170);
  c.ground(200);
  c.gap(170);
  // gate 2
  c.ground(1250).crates(260, 1).crates(308, 2).crates(356, 1).gate(900);
  c.gap(160).rise(-70);
  // long crumbling causeway
  c.ground(300);
  c.air(60, 0, 130, { kind: 'crumble' })
    .air(250, 0, 130, { kind: 'crumble' })
    .air(440, 0, 130, { kind: 'crumble' })
    .air(630, 0, 130, { kind: 'crumble' });
  c.gap(820);
  c.ground(900).crates(330, 4, 6).crates(378, 4, 6).block(660, 1, 2);
  c.gap(190);
  c.finish();
  return c.build({ id: 'temple', name: 'Temple Tumble', tagline: 'Ancient stones give way underfoot. Keep moving!', theme: 'temple' });
}

// ------------------------------------------------------------------ Forge Run

function forgeRun(): LevelDef {
  const c = new Course();
  c.ground(1100).crates(840, 2);
  c.gap(160);
  c.ground(600).block(300, 1, 2);
  // spring across the lava
  c.air(190, -60, 100, { kind: 'bounce', h: 18 });
  c.gap(480);
  c.ground(760).crates(300, 1).crates(348, 2).crates(396, 1);
  c.gap(180).rise(80);
  c.ground(420).block(200, 1, 1);
  c.gap(170).rise(-80);
  // gate 1
  c.ground(1200).crates(260, 2).gate(860);
  // shuttle ride
  c.air(120, 0, 140, { move: { ax: 80, periodMs: 3200 } });
  c.gap(440);
  c.ground(520).block(240, 2, 1);
  c.gap(190);
  c.ground(300);
  // double spring
  c.air(170, -70, 90, { kind: 'bounce', h: 18 });
  c.gap(430).rise(90);
  c.ground(700).crates(300, 3, 4).crates(560, 2);
  c.gap(200).rise(-90);
  c.ground(360);
  c.gap(190);
  // gate 2
  c.ground(1250).block(250, 1, 1).crates(480, 2).crates(528, 2).gate(900);
  c.gap(180);
  c.ground(420).block(210, 1, 2);
  c.air(110, 10, 130, { move: { ax: 70, periodMs: 2800, phase: 0.5 } });
  c.gap(360);
  c.ground(950).crates(330, 4, 6).crates(378, 4, 6).crates(426, 4, 6).block(720, 1, 1);
  c.gap(200);
  c.finish();
  return c.build({ id: 'forge', name: 'Forge Run', tagline: 'Springs, shuttles and a lake of fire below.', theme: 'forge' });
}

// ------------------------------------------------------------------ Neon Rush

function neonRush(): LevelDef {
  const c = new Course();
  // low gravity: every jump is big air, so the pits are wide and the blocks tall
  c.ground(1100).block(840, 1, 2);
  c.gap(240);
  c.ground(560).crates(260, 3, 4);
  c.gap(260);
  c.ground(420);
  c.air(150, 40, 130, { move: { ax: 60, ay: 60, periodMs: 4200, circle: true } });
  c.gap(430);
  c.ground(760).block(280, 1, 3).crates(540, 2);
  c.gap(250).rise(110);
  c.ground(420);
  c.gap(250).rise(110);
  // gate 1 up high
  c.ground(1200).crates(280, 2).crates(328, 3, 4).gate(860);
  c.gap(280).rise(-110);
  c.ground(300);
  c.gap(260).rise(-110);
  c.ground(300).block(130, 1, 2);
  c.air(120, -50, 90, { kind: 'bounce', h: 18 });
  c.gap(520);
  c.ground(700).crates(300, 4, 6).crates(348, 4, 6);
  c.gap(280);
  // stepping stones
  c.ground(220);
  c.gap(250);
  c.ground(220);
  c.gap(250);
  // gate 2
  c.ground(1250).block(250, 2, 2).crates(520, 2).gate(900);
  c.air(160, 30, 130, { move: { ax: 60, ay: 60, periodMs: 4200, phase: 0.5, circle: true } });
  c.gap(460);
  c.ground(520).block(240, 1, 3);
  c.gap(280);
  c.ground(950).crates(330, 5, 8).crates(378, 5, 8).block(700, 1, 2);
  c.gap(260);
  c.finish();
  return c.build({ id: 'neon', name: 'Neon Rush', tagline: 'Low gravity, orbiting platforms, big air.', theme: 'neon', gravityScale: 0.72 });
}

export const COURSES: LevelDef[] = [skySprint(), frostDash(), templeTumble(), forgeRun(), neonRush()];
