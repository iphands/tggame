/**
 * Draws a course: backdrop, parallax layers, ambient weather, and (only near
 * the screen) platforms, boxes, gates and the finish line.
 */
import Phaser from 'phaser';
import { BOX } from '../../../shared/src/constants';
import { levelAt, platformPos, type LevelDef, type PlatformDef } from '../../../shared/src/levels';
import type { SnapshotBody } from '../../../shared/src/protocol';
import { THEMES, backdropCanvas, layerCanvas, platformCanvas, W, H } from '../art/themes';
import { blockTexture } from '../art/sprites';
import { TEXT_RES } from './fighters';
import { store } from '../store';

type Flake = { img: Phaser.GameObjects.Image; vx: number; vy: number; phase: number; drift: number };
type PlatSprite = { img: Phaser.GameObjects.Image; shake: number };
type BoxSprite = { img: Phaser.GameObjects.Image; hp: number; flash: number };
type GateSprite = {
  body: Phaser.GameObjects.TileSprite;
  barBg: Phaser.GameObjects.Rectangle;
  bar: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  hp: number;
  flash: number;
};

/** The live course state a snapshot carries. */
export type CourseState = Pick<SnapshotBody, 'scrollX' | 'crumble' | 'boxes' | 'gate'>;

/** How far past the screen edges course pieces are kept alive. */
const MARGIN = 260;
/** Parallax: how much of the camera's travel each kind of scenery follows. */
const FAR = 0.18;
const NEAR = 1.15;
const GATE_TOP = -400;

export class LevelView {
  readonly level: LevelDef;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number; auto: number; factor: number }[] = [];
  private plats = new Map<number, PlatSprite>();
  private boxes = new Map<number, BoxSprite>();
  private gates = new Map<number, GateSprite>();
  /** Boxes known to be broken: they never come back within a round. */
  private broken = new Set<number>();
  /** Box hit points as last reported (unreported boxes are at full health). */
  private boxHp = new Map<number, number>();
  private crumble = new Map<number, 'shaking' | 'gone'>();
  private gateIdx = 0;
  private flakes: Flake[] = [];
  private grid: Phaser.GameObjects.Graphics | null = null;
  private aurora: Phaser.GameObjects.TileSprite | null = null;
  private lavaGlow: Phaser.GameObjects.Image | null = null;
  private killWall: Phaser.GameObjects.Image;
  private rays: { img: Phaser.GameObjects.Image; base: number; rot: number; phase: number; period: number }[] = [];
  private lastCamX = 0;
  private timeMs = 0;

  constructor(private scene: Phaser.Scene, levelIndex: number) {
    this.level = levelAt(levelIndex);
    const id = this.level.id;
    const theme = THEMES[this.level.theme];

    const bgKey = `bg-${id}`;
    if (!scene.textures.exists(bgKey)) scene.textures.addCanvas(bgKey, backdropCanvas(this.level.theme));
    // the backdrop is one screen-sized painting: it stays put while the course scrolls past
    this.track(scene.add.image(0, 0, bgKey).setOrigin(0).setDepth(-100).setScrollFactor(0, 0.35));

    // light shafts from the theme's light source
    const R = theme.rays;
    if (R) {
      const n = Math.max(2, Math.round(R.count * Math.max(0.5, store.quality.flags.ambientMul)));
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        const deg = R.angle - R.spread / 2 + R.spread * k + (Math.random() - 0.5) * 6;
        const img = scene.add
          .image(R.x, R.y, 'ray')
          .setOrigin(0.5, 0)
          .setTint(R.color)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(-90)
          .setScrollFactor(0, 0.4)
          .setScale(0.8 + Math.random() * 1.6, R.length / 512);
        const rot = Phaser.Math.DegToRad(deg - 90);
        img.setRotation(rot);
        const base = R.alpha * (0.6 + Math.random() * 0.8);
        this.rays.push({ img, base, rot, phase: Math.random() * 10, period: 2500 + Math.random() * 3000 });
        this.track(img);
      }
    }

    // parallax layers: screen-fixed tile sprites whose texture slides with the camera
    for (const layer of theme.layers) {
      if (!scene.textures.exists(layer.key)) scene.textures.addCanvas(layer.key, layerCanvas(layer, this.level.theme));
      const far = layer.depth < 0;
      const ts = scene.add
        .tileSprite(0, 0, W, H, layer.key)
        .setOrigin(0)
        .setDepth(layer.depth)
        .setAlpha(layer.alpha)
        .setScrollFactor(0, far ? 0.6 : 1);
      this.track(ts);
      this.layers.push({ sprite: ts, speed: layer.speed, auto: 0, factor: far ? FAR : NEAR });
      if (layer.key === 'frost-aurora') this.aurora = ts;
    }

    if (this.level.theme === 'neon') {
      this.grid = scene.add.graphics().setDepth(-70).setScrollFactor(0, 0.35);
      this.track(this.grid);
    }
    if (this.level.theme === 'forge') {
      this.lavaGlow = scene.add
        .image(W / 2, H + 10, 'soft')
        .setDisplaySize(W * 1.6, 260)
        .setTint(0xff6a1a)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-60)
        .setScrollFactor(0, 1);
      this.track(this.lavaGlow);
    }

    // bake every platform texture up front (during the countdown), so nothing hitches mid-run
    this.level.platforms.forEach((def, i) => this.platKey(def, i));
    for (const b of this.level.boxes) if (b.hp === undefined) blockTexture(scene, b.w, b.h);

    // finish line: a checkered post with a banner
    const fx = this.level.finishX;
    const floor = this.floorAt(fx);
    this.track(scene.add.tileSprite(fx - 12, floor - 264, 24, 264, 'checker').setOrigin(0).setDepth(2).setAlpha(0.95));
    this.track(
      scene.add
        .text(fx, floor - 300, 'FINISH', {
          fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#ffe680',
          stroke: '#120a20',
          strokeThickness: 7,
        })
        .setOrigin(0.5)
        .setDepth(3)
        .setResolution(TEXT_RES)
    );

    // the left edge of the screen: fall behind it and you're caught
    this.killWall = scene.add
      .image(0, -200, 'killwall')
      .setOrigin(0)
      .setDisplaySize(96, H + 400)
      .setDepth(50)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.track(this.killWall);

    // ambient weather (lives in screen space; drifts against the camera's motion)
    if (theme.ambient !== 'none') {
      const n = Math.round((theme.ambient === 'stars' ? 40 : 70) * store.quality.flags.ambientMul);
      const drift = theme.ambient === 'snow' ? 1 : theme.ambient === 'stars' ? 0.05 : 0.7;
      for (let i = 0; i < n; i++) {
        const img = scene.add
          .image(Math.random() * W, Math.random() * H, theme.ambient === 'snow' ? 'puff' : 'px')
          .setTint(theme.ambientColor)
          .setDepth(theme.ambient === 'snow' ? 45 : -50)
          .setScrollFactor(0, theme.ambient === 'snow' ? 1 : theme.ambient === 'stars' ? 0.35 : 0.7);
        const f: Flake = { img, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, drift };
        this.resetFlake(f, true);
        this.flakes.push(f);
        this.track(img);
      }
    }
  }

  private track(o: Phaser.GameObjects.GameObject): void {
    this.objs.push(o);
  }

  /** Top of the static floor under x (for placing the finish post). */
  private floorAt(x: number): number {
    let y = H * 0.75;
    for (const p of this.level.platforms) if (!p.move && x >= p.x && x <= p.x + p.w) y = p.y;
    return y;
  }

  /** Platform textures are shared by size and kind (a few variants each), not baked per platform. */
  private platKey(def: PlatformDef, i: number): string {
    const kind = def.kind ?? 'normal';
    const variant = i % 3;
    const key = `plat-${this.level.theme}-${def.w}x${def.h}-${kind}-${variant}`;
    if (!this.scene.textures.exists(key)) {
      this.scene.textures.addCanvas(key, platformCanvas(this.level.theme, def.w, def.h, kind, 101 + variant * 17));
    }
    return key;
  }

  private resetFlake(f: Flake, anywhere: boolean): void {
    const kind = THEMES[this.level.theme].ambient;
    const img = f.img;
    if (kind === 'snow') {
      img.setPosition(Math.random() * W, anywhere ? Math.random() * H : -10);
      const s = 0.12 + Math.random() * 0.22;
      img.setScale(s).setAlpha(0.5 + Math.random() * 0.5);
      f.vx = -10 - Math.random() * 25;
      f.vy = 30 + s * 160;
    } else if (kind === 'embers') {
      img.setPosition(Math.random() * W, anywhere ? Math.random() * H : H + 10);
      img.setScale(0.4 + Math.random() * 0.6).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD);
      f.vx = (Math.random() - 0.5) * 30;
      f.vy = -40 - Math.random() * 90;
    } else if (kind === 'dust') {
      img.setPosition(anywhere ? Math.random() * W : W + 10, Math.random() * H);
      img.setScale(0.3 + Math.random() * 0.5).setAlpha(0.35 + Math.random() * 0.4);
      f.vx = -20 - Math.random() * 40;
      f.vy = (Math.random() - 0.5) * 10;
    } else {
      img.setPosition(Math.random() * W, Math.random() * 520);
      img.setScale(0.3 + Math.random() * 0.4);
      f.vx = 0;
      f.vy = 0;
    }
  }

  /**
   * Highest surface at or below `feet` under x among what's on screen
   * (platforms and boxes), or Infinity. Used for contact shadows.
   */
  groundBelow(cx: number, feet: number): number {
    let best = Infinity;
    for (const [i, sp] of this.plats) {
      if (this.crumble.get(i) === 'gone') continue;
      const def = this.level.platforms[i];
      const x = sp.img.x;
      const y = sp.img.y;
      if (cx < x || cx > x + def.w || y < feet - 4) continue;
      if (y < best) best = y;
    }
    for (const [i] of this.boxes) {
      const b = this.level.boxes[i];
      if (cx < b.x || cx > b.x + b.w || b.y < feet - 4) continue;
      if (b.y < best) best = b.y;
    }
    return best;
  }

  /**
   * Animate and sync with the course state.
   * @param camX   world x of the left edge of what the camera shows
   * @param state  live state from the snapshot; omit for the lobby preview
   */
  update(timeMs: number, dtMs: number, camX: number, state?: CourseState): void {
    const s = Math.min(dtMs, 50) / 1000;
    this.timeMs = timeMs;
    const camDx = Phaser.Math.Clamp(camX - this.lastCamX, -400, 400);
    this.lastCamX = camX;

    for (const l of this.layers) {
      l.auto -= l.speed * s;
      l.sprite.tilePositionX = l.auto + camX * l.factor;
    }
    if (this.aurora) this.aurora.setAlpha(0.4 + Math.sin(timeMs / 1700) * 0.18);
    const shafts = store.quality.flags.lightShafts;
    for (const r of this.rays) {
      r.img.setVisible(shafts);
      if (!shafts) continue;
      const w = Math.sin(timeMs / r.period + r.phase);
      r.img.setAlpha(r.base * (0.55 + 0.45 * w));
      r.img.setRotation(r.rot + w * 0.025);
    }
    if (this.lavaGlow) this.lavaGlow.setAlpha(0.4 + Math.sin(timeMs / 380) * 0.08);
    if (this.grid) this.drawGrid(timeMs, camX);

    const kind = THEMES[this.level.theme].ambient;
    for (const f of this.flakes) {
      const img = f.img;
      img.x -= camDx * f.drift;
      if (kind === 'stars') {
        img.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(timeMs / 900 + f.phase)));
        if (img.x < -10) img.x += W + 20;
        continue;
      }
      f.phase += s * 2;
      img.x += (f.vx + Math.sin(f.phase) * 12) * s;
      img.y += f.vy * s;
      if (img.x < -20) img.x += W + 40; // blown off the left by the scroll: wrap around
      if (img.y > H + 20 || img.y < -20) this.resetFlake(f, false);
    }

    if (state) {
      this.crumble = new Map(state.crumble);
      for (const [i, hp] of state.boxes) {
        this.boxHp.set(i, hp);
        if (hp <= 0) this.broken.add(i);
      }
      this.gateIdx = state.gate ? state.gate.i : this.level.gates.length;
    }
    const lo = camX - MARGIN;
    const hi = camX + W + MARGIN;
    this.syncPlatforms(lo, hi, timeMs, dtMs, s);
    this.syncBoxes(lo, hi, dtMs);
    this.syncGates(lo, hi, dtMs, state);

    // danger glow on the left edge once the screen is on the move
    const moving = !!state && state.scrollX > 1;
    this.killWall.setVisible(moving);
    if (moving) this.killWall.setPosition(Math.round(state!.scrollX), -200).setAlpha(0.55 + 0.25 * Math.sin(timeMs / 180));
  }

  private syncPlatforms(lo: number, hi: number, timeMs: number, dtMs: number, s: number): void {
    this.level.platforms.forEach((def, i) => {
      const reach = def.move?.ax ?? 0;
      const near = def.x + def.w + reach >= lo && def.x - reach <= hi;
      let sp = this.plats.get(i);
      if (!near) {
        if (sp) {
          sp.img.destroy();
          this.plats.delete(i);
        }
        return;
      }
      if (!sp) {
        sp = { img: this.scene.add.image(def.x, def.y, this.platKey(def, i)).setOrigin(0).setDepth(0), shake: 0 };
        this.plats.set(i, sp);
      }
      const pos = platformPos(def, timeMs);
      let x = pos.x;
      let y = pos.y;
      const state = this.crumble.get(i) ?? 'solid';
      if (state === 'shaking') {
        sp.shake += dtMs;
        x += Math.sin(sp.shake / 22) * 2.2;
        y += Math.cos(sp.shake / 31) * 1.2;
        sp.img.setTint(0xffd0b0);
      } else {
        sp.shake = 0;
        sp.img.clearTint();
      }
      sp.img.setPosition(Math.round(x), Math.round(y));
      const targetAlpha = state === 'gone' ? 0 : 1;
      sp.img.setAlpha(sp.img.alpha + (targetAlpha - sp.img.alpha) * Math.min(1, s * (state === 'gone' ? 30 : 6)));
    });
  }

  private syncBoxes(lo: number, hi: number, dtMs: number): void {
    this.level.boxes.forEach((def, i) => {
      const near = def.x + def.w >= lo && def.x <= hi && !this.broken.has(i);
      let sp = this.boxes.get(i);
      if (!near) {
        if (sp) {
          sp.img.destroy();
          this.boxes.delete(i);
        }
        return;
      }
      const breakable = def.hp !== undefined;
      const hp = breakable ? this.boxHp.get(i) ?? def.hp! : Infinity;
      if (!sp) {
        const key = breakable ? (def.arms ? 'box-arms' : 'box') : blockTexture(this.scene, def.w, def.h);
        const img = this.scene.add.image(def.x, def.y, key).setOrigin(0).setDepth(4);
        if (breakable) img.setDisplaySize(def.w, def.h);
        sp = { img, hp, flash: 0 };
        this.boxes.set(i, sp);
      }
      if (!breakable) return;
      if (hp < sp.hp) {
        sp.flash = 90;
        sp.img.setTexture(def.arms ? 'box-arms-cracked' : 'box-cracked');
      }
      sp.hp = hp;
      if (sp.flash > 0) {
        sp.flash -= dtMs;
        if (sp.flash > 0) sp.img.setTintFill(0xffffff);
        else sp.img.clearTint();
      }
    });
  }

  private syncGates(lo: number, hi: number, dtMs: number, state?: CourseState): void {
    this.level.gates.forEach((def, i) => {
      const near = def.x + def.w >= lo && def.x <= hi && i >= this.gateIdx;
      let sp = this.gates.get(i);
      if (!near) {
        if (sp) {
          for (const o of [sp.body, sp.barBg, sp.bar, sp.label]) o.destroy();
          this.gates.delete(i);
        }
        return;
      }
      if (!sp) {
        const floor = this.floorAt(def.x + def.w / 2);
        const body = this.scene.add.tileSprite(def.x, GATE_TOP, def.w, floor - GATE_TOP, 'gate').setOrigin(0).setDepth(4);
        body.tilePositionY = -(floor - GATE_TOP); // tiles line up with the floor
        const barY = floor - 330;
        const barBg = this.scene.add.rectangle(def.x + def.w / 2, barY, def.w + 64, 16, 0x120a20, 0.9).setStrokeStyle(2, 0xffe680).setDepth(30);
        const bar = this.scene.add.rectangle(def.x - 30, barY, def.w + 60, 10, 0x7dffb0).setOrigin(0, 0.5).setDepth(31);
        const label = this.scene.add
          .text(def.x + def.w / 2, barY - 22, 'SHOOT THE GATE!', {
            fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#ffe680',
            stroke: '#120a20',
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(31)
          .setResolution(TEXT_RES);
        sp = { body, barBg, bar, label, hp: Infinity, flash: 0 };
        this.gates.set(i, sp);
      }
      // only the next standing gate has a live health bar
      const live = state?.gate && state.gate.i === i ? state.gate : null;
      const frac = live ? Phaser.Math.Clamp(live.hp / Math.max(1, live.max), 0, 1) : 1;
      sp.bar.setDisplaySize((def.w + 60) * frac, 10).setFillStyle(frac > 0.5 ? 0x7dffb0 : frac > 0.25 ? 0xffc23d : 0xff5d5d);
      for (const o of [sp.barBg, sp.bar, sp.label]) o.setVisible(!!live);
      sp.label.setScale(1 + 0.05 * Math.sin(this.timeMs / 160));
      const hp = live ? live.hp : sp.hp;
      // only a real hit flashes (the slow idle decay doesn't)
      if (hp < sp.hp - BOX.dmg.dart * 0.9) sp.flash = 70;
      sp.hp = hp;
      if (sp.flash > 0) {
        sp.flash -= dtMs;
        if (sp.flash > 0) sp.body.setTintFill(0xffffff);
        else sp.body.clearTint();
      } else {
        // darkens as it weakens
        const v = Math.round(150 + 105 * frac);
        sp.body.setTint(Phaser.Display.Color.GetColor(255, v, v));
      }
    });
  }

  private drawGrid(timeMs: number, camX: number): void {
    const g = this.grid!;
    g.clear();
    const horizon = 520;
    g.lineStyle(2, 0x3df2ff, 0.5);
    // the floor grid slides sideways as the course scrolls
    const k = ((camX * 0.004) % 1 + 1) % 1;
    for (let i = -14; i <= 15; i++) {
      g.lineBetween(640 + (i - k) * 30, horizon, 640 + (i - k) * 190, H);
    }
    const t = (timeMs / 1400) % 1;
    for (let i = 0; i < 9; i++) {
      const f = (i + t) / 9;
      const y = horizon + (H - horizon) * f * f;
      g.lineStyle(2, 0xff4fd8, 0.25 + 0.6 * f);
      g.lineBetween(0, y, W, y);
    }
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    for (const sp of this.plats.values()) sp.img.destroy();
    for (const sp of this.boxes.values()) sp.img.destroy();
    for (const sp of this.gates.values()) for (const o of [sp.body, sp.barBg, sp.bar, sp.label]) o.destroy();
    this.objs = [];
    this.layers = [];
    this.plats.clear();
    this.boxes.clear();
    this.gates.clear();
    this.flakes = [];
    this.rays = [];
  }
}
