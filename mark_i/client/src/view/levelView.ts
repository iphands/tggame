/** Draws an arena: backdrop, parallax layers, ambient weather and platforms. */
import Phaser from 'phaser';
import { levelAt, platformPos, type LevelDef } from '../../../shared/src/levels';
import type { PlatformState } from '../../../shared/src/types';
import { THEMES, backdropCanvas, layerCanvas, platformCanvas, W, H } from '../art/themes';
import { store } from '../store';

type Flake = { img: Phaser.GameObjects.Image; vx: number; vy: number; phase: number };

export class LevelView {
  readonly level: LevelDef;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = [];
  private plats: Phaser.GameObjects.Image[] = [];
  private flakes: Flake[] = [];
  private grid: Phaser.GameObjects.Graphics | null = null;
  private aurora: Phaser.GameObjects.TileSprite | null = null;
  private lavaGlow: Phaser.GameObjects.Image | null = null;
  private shake: number[] = [];
  private rays: { img: Phaser.GameObjects.Image; base: number; rot: number; phase: number; period: number }[] = [];

  constructor(scene: Phaser.Scene, levelIndex: number) {
    this.level = levelAt(levelIndex);
    const id = this.level.id;
    const theme = THEMES[this.level.theme];

    const bgKey = `bg-${id}`;
    if (!scene.textures.exists(bgKey)) scene.textures.addCanvas(bgKey, backdropCanvas(this.level.theme));
    // parallax: far things move less when the (phone) camera follows you
    this.track(scene.add.image(0, 0, bgKey).setOrigin(0).setDepth(-100).setScrollFactor(0.35));

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
          .setScrollFactor(0.4)
          .setScale(0.8 + Math.random() * 1.6, R.length / 512);
        const rot = Phaser.Math.DegToRad(deg - 90);
        img.setRotation(rot);
        const base = R.alpha * (0.6 + Math.random() * 0.8);
        this.rays.push({ img, base, rot, phase: Math.random() * 10, period: 2500 + Math.random() * 3000 });
        this.track(img);
      }
    }

    for (const layer of theme.layers) {
      if (!scene.textures.exists(layer.key)) scene.textures.addCanvas(layer.key, layerCanvas(layer, this.level.theme));
      const ts = scene.add
        .tileSprite(0, 0, W, H, layer.key)
        .setOrigin(0)
        .setDepth(layer.depth)
        .setAlpha(layer.alpha)
        .setScrollFactor(layer.depth < 0 ? 0.6 : 1);
      this.track(ts);
      this.layers.push({ sprite: ts, speed: layer.speed });
      if (layer.key === 'frost-aurora') this.aurora = ts;
    }

    if (this.level.theme === 'neon') {
      this.grid = scene.add.graphics().setDepth(-70).setScrollFactor(0.35);
      this.track(this.grid);
    }
    if (this.level.theme === 'forge') {
      this.lavaGlow = scene.add
        .image(W / 2, H + 10, 'soft')
        .setDisplaySize(W * 1.6, 260)
        .setTint(0xff6a1a)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-60);
      this.track(this.lavaGlow);
    }

    // platforms
    this.level.platforms.forEach((def, i) => {
      const key = `plat-${id}-${i}`;
      if (!scene.textures.exists(key)) {
        scene.textures.addCanvas(key, platformCanvas(this.level.theme, def.w, def.h, def.kind ?? 'normal', 101 + i * 17));
      }
      const img = scene.add.image(def.x, def.y, key).setOrigin(0).setDepth(0);
      this.track(img);
      this.plats.push(img);
      this.shake.push(0);
    });

    // ambient weather
    if (theme.ambient !== 'none') {
      const n = Math.round((theme.ambient === 'stars' ? 40 : 70) * store.quality.flags.ambientMul);
      for (let i = 0; i < n; i++) {
        const img = scene.add
          .image(Math.random() * W, Math.random() * H, theme.ambient === 'snow' ? 'puff' : 'px')
          .setTint(theme.ambientColor)
          .setDepth(theme.ambient === 'snow' ? 45 : -50)
          .setScrollFactor(theme.ambient === 'snow' ? 1 : theme.ambient === 'stars' ? 0.35 : 0.7);
        const f: Flake = { img, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2 };
        this.resetFlake(f, true);
        this.flakes.push(f);
        this.track(img);
      }
    }
  }

  private track(o: Phaser.GameObjects.GameObject): void {
    this.objs.push(o);
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
   * Animate. `platforms` comes from the (interpolated) snapshot; without it
   * (lobby preview) platform motion is computed locally from the level def.
   */
  update(timeMs: number, dtMs: number, platforms?: PlatformState[]): void {
    const s = Math.min(dtMs, 50) / 1000;
    for (const l of this.layers) l.sprite.tilePositionX -= l.speed * s;
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
    if (this.grid) this.drawGrid(timeMs);

    const kind = THEMES[this.level.theme].ambient;
    for (const f of this.flakes) {
      const img = f.img;
      if (kind === 'stars') {
        img.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(timeMs / 900 + f.phase)));
        continue;
      }
      f.phase += s * 2;
      img.x += (f.vx + Math.sin(f.phase) * 12) * s;
      img.y += f.vy * s;
      if (img.y > H + 20 || img.y < -20 || img.x < -20) this.resetFlake(f, false);
    }

    this.level.platforms.forEach((def, i) => {
      const img = this.plats[i];
      const st = platforms?.[i];
      let x: number;
      let y: number;
      let state: PlatformState['state'] = 'solid';
      if (st) {
        x = st.x;
        y = st.y;
        state = st.state;
      } else {
        const pos = platformPos(def, timeMs);
        x = pos.x;
        y = pos.y;
      }
      if (state === 'shaking') {
        this.shake[i] += dtMs;
        x += Math.sin(this.shake[i] / 22) * 2.2;
        y += Math.cos(this.shake[i] / 31) * 1.2;
        img.setTint(0xffd0b0);
      } else {
        this.shake[i] = 0;
        img.clearTint();
      }
      img.setPosition(Math.round(x), Math.round(y));
      const targetAlpha = state === 'gone' ? 0 : 1;
      img.setAlpha(img.alpha + (targetAlpha - img.alpha) * Math.min(1, s * (state === 'gone' ? 30 : 6)));
    });
  }

  private drawGrid(timeMs: number): void {
    const g = this.grid!;
    g.clear();
    const horizon = 520;
    g.lineStyle(2, 0x3df2ff, 0.5);
    for (let i = -14; i <= 14; i++) {
      g.lineBetween(640 + i * 30, horizon, 640 + i * 190, H);
    }
    const t = (timeMs / 1400) % 1;
    for (let i = 0; i < 9; i++) {
      const k = (i + t) / 9;
      const y = horizon + (H - horizon) * k * k;
      g.lineStyle(2, 0xff4fd8, 0.25 + 0.6 * k);
      g.lineBetween(0, y, W, y);
    }
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.layers = [];
    this.plats = [];
    this.flakes = [];
    this.rays = [];
  }
}
