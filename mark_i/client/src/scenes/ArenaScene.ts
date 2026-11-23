import Phaser from 'phaser';
import { PHYS } from '../../../shared/src/constants';
import type { Fx, PlatformState, PlayerState } from '../../../shared/src/types';
import { store } from '../store';
import { lerp, lerpPlayer } from '../interp';
import { fireHeld, mergeInput, requests, setTouchControlsVisible, touchInput } from '../controls';
import { play, setMuted, isMuted } from '../audio';
import { hexNum } from '../art/color';
import { LevelView } from '../view/levelView';
import { FighterView, TEXT_RES } from '../view/fighters';
import { Particles } from '../view/particles';
import { view as camView } from './HudScene';
import { setPerfExtra } from '../perfMeter';
import { showScreen, syncGfxButton, syncMuteButton, syncRestartButton } from '../lobby';

/** Camera zoom on phone-sized screens (the HUD is unaffected). */
const SMALL_SCREEN_ZOOM = 1.45;

type KeyName = 'left' | 'right' | 'jump' | 'down' | 'punch' | 'fire';

const KEYMAP: Record<KeyName, number[]> = {
  left: [Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.A],
  right: [Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.D],
  jump: [Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.W],
  down: [Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.S],
  punch: [Phaser.Input.Keyboard.KeyCodes.J, Phaser.Input.Keyboard.KeyCodes.X, Phaser.Input.Keyboard.KeyCodes.Z],
  fire: [Phaser.Input.Keyboard.KeyCodes.K, Phaser.Input.Keyboard.KeyCodes.C, Phaser.Input.Keyboard.KeyCodes.F],
};

const ITEM_LABEL: Record<string, [string, string]> = {
  boomstick: ['BOOMSTICK!', '#ffb02e'],
  bombs: ['BOMBS!', '#ff7a5c'],
  shield: ['SHIELD!', '#7fd3ff'],
  heal: ['-40%', '#7dffb0'],
  smg: ['SMG!', '#3df2ff'],
  rockets: ['ROCKETS!', '#ff6b4f'],
  railgun: ['☢ RAILGUN ☢', '#ff4fd8'],
};

export class ArenaScene extends Phaser.Scene {
  private level: LevelView | null = null;
  private levelIndex = -1;
  private fighters = new Map<string, FighterView>();
  private shots = new Map<number, Phaser.GameObjects.Image>();
  private crates = new Map<number, Phaser.GameObjects.Image>();
  private particles!: Particles;
  private camX = 640;
  private camY = 360;
  private zoom = 1;
  private createdAt = 0;
  private bloom: Phaser.FX.Bloom | null = null;
  private vignette: Phaser.GameObjects.Image | null = null;
  private zoomKick = 0;
  private keys = {} as Record<KeyName, Phaser.Input.Keyboard.Key[]>;
  private prevDown = false;
  private prevPunch = false;
  private lastFireSent = 0;

  constructor() {
    super('Arena');
  }

  create(): void {
    showScreen('game');
    setTouchControlsVisible(store.touchMode);
    store.fxQueue.length = 0;
    this.fighters = new Map();
    this.shots = new Map();
    this.crates = new Map();
    this.level = null;
    this.levelIndex = -1;
    this.particles = new Particles(this);
    // small screens: the arena camera zooms in and follows you; the HUD is its own overlay scene
    camView.small = this.scale.displaySize.height < 560;
    this.zoom = 1;
    this.camX = 640;
    this.camY = 360;
    this.cameras.main.setBounds(0, 0, 1280, 720).setZoom(1).centerOn(640, 360);
    this.scene.launch('Hud');

    const kb = this.input.keyboard;
    const onRestart = () => {
      if (store.snapshot?.phase === 'ended') store.client?.send({ type: 'restart' });
    };
    const onMute = () => {
      setMuted(!isMuted());
      syncMuteButton();
    };
    if (kb) {
      for (const name of Object.keys(KEYMAP) as KeyName[]) this.keys[name] = KEYMAP[name].map((c) => kb.addKey(c, true));
      kb.on('keydown-R', onRestart);
      kb.on('keydown-M', onMute);
    }
    this.input.mouse?.disableContextMenu();
    const onDown = (p: Phaser.Input.Pointer) => {
      if (store.touchMode) return; // touch uses the on-screen buttons
      if (p.rightButtonDown()) requests.punch = true;
      else fireHeld.mouse = true;
    };
    const release = () => (fireHeld.mouse = false);
    this.input.on('pointerdown', onDown);
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    // vignette: one screen-fixed sprite (cheap) instead of a shader pass
    this.vignette = this.add.image(640, 360, 'vignette').setScrollFactor(0).setDepth(95);
    this.createdAt = performance.now();
    const onQuality = () => this.applyQuality();
    window.addEventListener('lsa-quality', onQuality);
    this.applyQuality();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('lsa-quality', onQuality);
      kb?.off('keydown-R', onRestart);
      kb?.off('keydown-M', onMute);
      this.input.off('pointerdown', onDown);
      this.input.off('pointerup', release);
      this.input.off('pointerupoutside', release);
      this.teardown();
    });
  }

  private teardown(): void {
    this.input.keyboard?.removeAllKeys(true);
    this.input.keyboard?.clearCaptures();
    for (const f of this.fighters.values()) f.destroy();
    this.fighters.clear();
    this.level?.destroy();
    this.scene.stop('Hud');
    Object.assign(camView, { x: 0, y: 0, w: 1280, h: 720 });
    fireHeld.mouse = false;
  }

  private down(name: KeyName): boolean {
    return this.keys[name]?.some((k) => k.isDown) ?? false;
  }

  update(_time: number, delta: number): void {
    const snap = store.snapshot;
    if (!snap || snap.phase === 'lobby' || !store.joined) {
      this.scene.start('Lobby');
      return;
    }
    if (snap.level !== this.levelIndex) {
      // new arena: rebuild everything world-side
      for (const f of this.fighters.values()) f.destroy();
      this.fighters.clear();
      for (const s of this.shots.values()) s.destroy();
      this.shots.clear();
      for (const c of this.crates.values()) c.destroy();
      this.crates.clear();
      this.particles.clear();
      this.level?.destroy();
      this.level = new LevelView(this, snap.level);
      this.applyQuality();
      this.levelIndex = snap.level;
    }

    this.handleInput();
    syncRestartButton(true);

    // ---- interpolated world state
    const now = performance.now();
    const br = store.buffer.bracket(now);
    const renderT = store.buffer.renderTime(now);
    if (!br) return;
    const { a, b, alpha } = br;
    const prev = new Map(a.players.map((p) => [p.id, p]));
    const players: PlayerState[] = b.players.map((p) => lerpPlayer(prev.get(p.id), p, alpha));
    const plats: PlatformState[] =
      a.platforms.length === b.platforms.length
        ? b.platforms.map((p, i) => ({ ...p, x: lerp(a.platforms[i].x, p.x, alpha), y: lerp(a.platforms[i].y, p.y, alpha) }))
        : b.platforms;
    const simNow = lerp(a.simTimeMs, b.simTimeMs, alpha);

    this.level!.update(simNow, delta, plats.length ? plats : undefined);
    this.renderFighters(players, simNow, delta, plats);
    this.renderProjectiles(a, b, alpha, delta);
    this.renderCrates(b, simNow);

    while (store.fxQueue.length && store.fxQueue[0].t <= renderT + 20) {
      this.handleFx(store.fxQueue.shift()!.fx);
    }
    this.particles.update(delta);

    // adaptive quality (skip the first seconds: texture baking hitches)
    const nowMs = performance.now();
    if (nowMs - this.createdAt > 2500 && store.quality.sample(this.game.loop.actualFps, nowMs)) {
      this.applyQuality();
      syncGfxButton();
    }
    setPerfExtra(`${store.quality.tier} · ${this.particles.active} fx · ${camView.small ? 'zoom' : 'full'}`);
    this.updateCamera(players, snap.phase, delta);
  }

  /** Zoom in and follow yourself on small screens; full view otherwise. */
  /** Apply the current quality tier: bloom (shader, high only) + vignette overlay. */
  private applyQuality(): void {
    const f = store.quality.flags;
    this.particles.mul = f.particleMul;
    this.vignette?.setVisible(f.vignette);
    const cam = this.cameras.main;
    this.bloom = null;
    if (this.game.renderer.type !== Phaser.WEBGL || !cam.postFX) return;
    cam.postFX.clear();
    if (f.bloom) this.bloom = cam.postFX.addBloom(0xffffff, 1, 1, 1, 0.55, 3);
  }

  private updateCamera(players: PlayerState[], phase: string, delta: number): void {
    camView.small = this.scale.displaySize.height < 560;
    const me = players.find((p) => p.id === store.selfId);
    const follow = camView.small && !!me && me.life === 'alive' && (phase === 'playing' || phase === 'starting');
    const targetZoom = follow ? SMALL_SCREEN_ZOOM : 1;
    const s = Math.min(delta, 50) / 1000;
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-3.5 * s));
    let tx = 640;
    let ty = 360;
    if (follow && me) {
      // look a little ahead of where you're moving
      tx = me.x + PHYS.playerW / 2 + Phaser.Math.Clamp(me.vx * 0.18, -90, 90);
      ty = me.y + PHYS.playerH / 2 - 30;
    }
    const f = 1 - Math.exp(-6 * s);
    this.camX += (tx - this.camX) * f;
    this.camY += (ty - this.camY) * f;
    const cam = this.cameras.main;
    this.zoomKick *= Math.exp(-9 * s);
    const z = this.zoom * (1 + this.zoomKick);
    cam.setZoom(z);
    this.vignette?.setScale(1 / z);
    cam.centerOn(this.camX, this.camY);
    // what the HUD needs to place off-screen markers (bounds-clamped like the camera)
    const w = 1280 / this.zoom;
    const h = 720 / this.zoom;
    camView.w = w;
    camView.h = h;
    camView.x = Phaser.Math.Clamp(this.camX - w / 2, 0, 1280 - w);
    camView.y = Phaser.Math.Clamp(this.camY - h / 2, 0, 720 - h);
  }

  // ------------------------------------------------------------ input

  private handleInput(): void {
    const client = store.client;
    if (!client) return;
    const input = mergeInput({ left: this.down('left'), right: this.down('right'), jump: this.down('jump') }, touchInput);
    client.sendInput(input);

    const downNow = this.down('down');
    if ((downNow && !this.prevDown) || requests.drop) client.send({ type: 'drop' });
    this.prevDown = downNow;
    requests.drop = false;

    const punchNow = this.down('punch');
    if ((punchNow && !this.prevPunch) || requests.punch) client.send({ type: 'punch' });
    this.prevPunch = punchNow;
    requests.punch = false;

    const firing = this.down('fire') || fireHeld.touch || fireHeld.mouse;
    const t = performance.now();
    if (firing && t - this.lastFireSent >= 70) {
      this.lastFireSent = t;
      client.send({ type: 'shoot' });
    }
  }

  // ------------------------------------------------------------ world

  private renderFighters(players: PlayerState[], simNow: number, delta: number, plats: PlatformState[]): void {
    const seen = new Set<string>();
    const topWins = Math.max(0, ...players.map((p) => p.wins));
    for (const p of players) {
      if (p.life === 'waiting') continue;
      seen.add(p.id);
      let v = this.fighters.get(p.id);
      if (!v) {
        v = new FighterView(this, p, p.id === store.selfId);
        this.fighters.set(p.id, v);
      }
      v.leader = topWins > 0 && p.wins === topWins;
      v.update(p, simNow, delta, plats);
      if (p.life === 'alive' && p.launched && Math.hypot(p.vx, p.vy) > 850 && Math.random() < 0.7) {
        this.particles.burst(p.x + PHYS.playerW / 2, p.y + PHYS.playerH / 2, {
          count: 1,
          colors: [0xffffff, hexNum(p.color)],
          speed: [0, 20],
          life: [250, 450],
          size: [3, 5],
          texture: 'puff',
          alpha: 0.6,
          depth: 8,
        });
      }
    }
    for (const [id, v] of this.fighters) {
      if (!seen.has(id)) {
        v.destroy();
        this.fighters.delete(id);
      }
    }
  }

  private renderProjectiles(
    a: { projectiles: { id: number; x: number; y: number }[] },
    b: { projectiles: { id: number; kind: string; x: number; y: number; vx: number; vy: number }[] },
    alpha: number,
    delta: number
  ): void {
    const prev = new Map(a.projectiles.map((p) => [p.id, p]));
    const seen = new Set<number>();
    for (const pr of b.projectiles) {
      seen.add(pr.id);
      const pa = prev.get(pr.id);
      const x = pa ? lerp(pa.x, pr.x, alpha) : pr.x;
      const y = pa ? lerp(pa.y, pr.y, alpha) : pr.y;
      let img = this.shots.get(pr.id);
      if (!img) {
        img = this.add.image(x, y, pr.kind).setDepth(16);
        if (pr.kind !== 'bomb' && pr.kind !== 'rocket') img.setBlendMode(Phaser.BlendModes.ADD);
        this.shots.set(pr.id, img);
      }
      img.setPosition(x, y);
      if (pr.kind === 'bomb') {
        img.rotation += (pr.vx / 160) * (delta / 1000) * 6;
        if (Math.random() < 0.5) {
          this.particles.burst(x + 4, y - 10, { count: 1, colors: [0xffd34d, 0xff7a1a], speed: [10, 60], angle: [-120, -60], life: [150, 300], size: [1, 2], add: true });
        }
      } else {
        img.setRotation(Math.atan2(pr.vy, pr.vx));
        if (pr.kind === 'rocket') {
          const back = Math.atan2(pr.vy, pr.vx) + Math.PI;
          const deg = Phaser.Math.RadToDeg(back);
          this.particles.burst(x + Math.cos(back) * 12, y + Math.sin(back) * 12, { count: 2, colors: [0xffd34d, 0xff7a1a, 0xffffff], speed: [40, 140], angle: [deg - 20, deg + 20], life: [120, 260], size: [2, 3], add: true });
          this.particles.burst(x + Math.cos(back) * 14, y + Math.sin(back) * 14, { count: 1, colors: [0x6b6680, 0x8d88a0], speed: [10, 40], life: [400, 700], size: [5, 8], texture: 'puff', alpha: 0.5, endScale: 1.5, gravity: -40 });
        }
      }
    }
    for (const [id, img] of this.shots) {
      if (!seen.has(id)) {
        img.destroy();
        this.shots.delete(id);
      }
    }
  }

  private renderCrates(b: { crates: { id: number; x: number; y: number; blink: boolean }[] }, simNow: number): void {
    const seen = new Set<number>();
    for (const c of b.crates) {
      seen.add(c.id);
      let img = this.crates.get(c.id);
      if (!img) {
        img = this.add.image(c.x, c.y, 'crate').setOrigin(0).setDepth(6);
        this.crates.set(c.id, img);
      }
      img.setPosition(c.x, c.y - Math.abs(Math.sin(simNow / 300 + c.id)) * 2);
      img.setAlpha(c.blink ? (Math.floor(simNow / 120) % 2 ? 0.3 : 1) : 1);
    }
    for (const [id, img] of this.crates) {
      if (!seen.has(id)) {
        img.destroy();
        this.crates.delete(id);
      }
    }
  }

  // ------------------------------------------------------------ effects

  private ring(x: number, y: number, color: number, size: number, dur: number): void {
    const r = this.add.image(x, y, 'ring').setTint(color).setDepth(25).setScale(0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: r, scale: size / 64, alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  private glow(x: number, y: number, color: number, size: number, dur: number): void {
    const g = this.add.image(x, y, 'soft').setTint(color).setDepth(24).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(size, size);
    this.tweens.add({ targets: g, alpha: 0, scale: g.scale * 1.4, duration: dur, onComplete: () => g.destroy() });
  }

  private popup(x: number, y: number, msg: string, color: string, size = 22): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        stroke: '#120a20',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setResolution(TEXT_RES)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 46, alpha: 0, delay: 500, duration: 600, onComplete: () => t.destroy() });
  }

  private handleFx(f: Fx): void {
    const self = 'id' in f && f.id === store.selfId;
    const vol = self ? 1 : 0.55;
    const view = 'id' in f ? this.fighters.get(f.id) : undefined;
    const dust = [0xffffff, 0xe6e0f0, 0xcfc6dc];
    switch (f.k) {
      case 'jump':
        view?.onJump();
        this.particles.burst(f.x, f.y, { count: 5, colors: dust, speed: [30, 90], angle: [-170, -10], life: [200, 380], size: [3, 5], texture: 'puff', alpha: 0.7, gravity: -40 });
        play('jump', vol);
        break;
      case 'airjump':
        view?.onJump();
        this.ring(f.x, f.y, 0xbff4ff, 34, 300);
        this.particles.burst(f.x, f.y, { count: 8, colors: [0xbff4ff, 0xffffff], speed: [60, 160], angle: [20, 160], life: [200, 360], size: [2, 3], add: true });
        play('airjump', vol);
        break;
      case 'land':
        view?.onLand();
        this.particles.burst(f.x, f.y, { count: 8, colors: dust, speed: [40, 140], angle: [-180, 0], life: [220, 420], size: [3, 6], texture: 'puff', alpha: 0.65, drag: 3 });
        play('land', vol * 0.7);
        break;
      case 'bounce':
        view?.onJump();
        this.ring(f.x, f.y, 0xffe066, 60, 350);
        this.particles.burst(f.x, f.y, { count: 14, colors: [0xffe066, 0xffffff, 0xff9f43], speed: [120, 320], angle: [-160, -20], life: [250, 500], size: [2, 4], gravity: 600 });
        play('bounce', vol);
        break;
      case 'punch':
        play('punch', vol);
        break;
      case 'hit': {
        view?.onHit(f.power);
        const big = f.power > 900;
        const n = Math.min(30, 6 + Math.floor(f.power / 60));
        this.particles.burst(f.x, f.y, { count: n, colors: [0xffffff, 0xffe066, 0xff9f43], speed: [120, 260 + f.power * 0.3], life: [180, 420], size: [2, 4], add: true, drag: 4 });
        this.glow(f.x, f.y, 0xfff2c0, big ? 110 : 60, 200);
        if (big) this.ring(f.x, f.y, 0xffffff, 70, 260);
        if (f.power > 700) this.cameras.main.shake(big ? 180 : 100, Math.min(0.014, f.power / 120000));
        if (big) this.zoomKick = Math.max(this.zoomKick, 0.025);
        play(big ? 'hitBig' : 'hit', self || f.by === store.selfId ? 1 : 0.6);
        break;
      }
      case 'block':
        this.ring(f.x, f.y, 0x7fd3ff, 50, 260);
        this.particles.burst(f.x, f.y, { count: 10, colors: [0x7fd3ff, 0xffffff], speed: [80, 200], life: [200, 350], size: [2, 3], add: true });
        play('block', vol);
        break;
      case 'shot':
        if (f.weapon === 'bombs') {
          play('throw', vol);
        } else if (f.weapon === 'smg') {
          this.glow(f.x, f.y, 0x3df2ff, 28, 70);
          play('smg', vol * 0.8);
        } else if (f.weapon === 'rockets') {
          this.glow(f.x, f.y, 0xff9a3d, 60, 160);
          this.particles.burst(f.x - f.face * 20, f.y, { count: 8, colors: [0xcfc6dc, 0x8d88a0], speed: [40, 160], angle: f.face > 0 ? [150, 210] : [-30, 30], life: [250, 500], size: [5, 9], texture: 'puff', alpha: 0.6, drag: 3 });
          play('rocket', vol);
        } else {
          this.glow(f.x, f.y, f.weapon === 'boomstick' ? 0xff9a3d : 0xffe066, f.weapon === 'boomstick' ? 70 : 40, 110);
          this.particles.burst(f.x, f.y, { count: f.weapon === 'boomstick' ? 10 : 4, colors: [0xffe066, 0xffffff], speed: [80, 240], angle: f.face > 0 ? [-30, 30] : [150, 210], life: [80, 200], size: [1, 3], add: true });
          if (f.weapon === 'boomstick') this.cameras.main.shake(80, self ? 0.006 : 0.003);
          play(f.weapon === 'boomstick' ? 'boomstick' : 'pistol', vol);
        }
        break;
      case 'charge':
        this.glow(f.x, f.y, 0xff4fd8, 70, 330);
        this.particles.burst(f.x, f.y, { count: 14, colors: [0xff4fd8, 0xffffff, 0x3df2ff], speed: [60, 140], life: [250, 330], size: [1, 2], add: true, drag: 1, gravity: 0 });
        play('charge', self ? 1 : 0.7);
        break;
      case 'beam': {
        const c = hexNum(f.color);
        const g = this.add.graphics().setDepth(26).setBlendMode(Phaser.BlendModes.ADD);
        g.lineStyle(26, c, 0.35).lineBetween(f.x, f.y, f.x2, f.y2);
        g.lineStyle(12, 0xff4fd8, 0.8).lineBetween(f.x, f.y, f.x2, f.y2);
        g.lineStyle(4, 0xffffff, 1).lineBetween(f.x, f.y, f.x2, f.y2);
        this.tweens.add({ targets: g, alpha: 0, duration: 420, ease: 'Cubic.easeIn', onComplete: () => g.destroy() });
        // sparks streaming along the beam
        const n = 24;
        for (let i = 0; i < n; i++) {
          const k = i / n;
          this.particles.burst(f.x + (f.x2 - f.x) * k, f.y + (f.y2 - f.y) * k, { count: 1, colors: [0xffffff, 0xff4fd8, c], speed: [20, 120], life: [200, 500], size: [2, 3], add: true });
        }
        this.glow(f.x, f.y, 0xffffff, 120, 220);
        this.cameras.main.shake(260, 0.02);
        this.cameras.main.flash(90, 255, 120, 230);
        this.zoomKick = Math.max(this.zoomKick, 0.045);
        if (this.bloom) {
          const b = this.bloom;
          b.strength = 2.2;
          this.tweens.add({ targets: b, strength: 0.55, duration: 500, ease: 'Cubic.easeOut' });
        }
        play('railgun');
        break;
      }
      case 'boom':
        this.glow(f.x, f.y, 0xffb347, f.r * 2.6, 380);
        this.glow(f.x, f.y, 0xffffff, f.r * 1.2, 160);
        this.ring(f.x, f.y, 0xffd166, f.r * 1.1, 420);
        this.particles.burst(f.x, f.y, { count: 30, colors: [0xffd166, 0xff7a1a, 0xff4f2e, 0xffffff], speed: [150, 520], life: [300, 700], size: [2, 5], add: true, drag: 3, gravity: 300 });
        this.particles.burst(f.x, f.y, { count: 14, colors: [0x4b4560, 0x2a2438, 0x6b6680], speed: [40, 140], life: [600, 1100], size: [8, 14], texture: 'puff', alpha: 0.75, gravity: -60, drag: 1.5, endScale: 1.4 });
        this.cameras.main.shake(260, 0.016);
        play('boom');
        break;
      case 'ko': {
        const c = hexNum(f.color);
        const ang = Phaser.Math.RadToDeg(Math.atan2(f.dirY, f.dirX || 0.0001));
        const spread = f.dirX === 0 && f.dirY === 0 ? 180 : 35;
        this.glow(f.x, f.y, c, 260, 500);
        this.glow(f.x, f.y, 0xffffff, 120, 200);
        this.ring(f.x, f.y, c, 150, 600);
        this.particles.burst(f.x, f.y, { count: 46, colors: [c, 0xffffff, 0xffe066], speed: [300, 900], angle: [ang - spread, ang + spread], life: [400, 900], size: [3, 6], add: true, drag: 2.5 });
        this.cameras.main.shake(380, 0.02);
        this.zoomKick = Math.max(this.zoomKick, 0.05);
        this.popup(
          Phaser.Math.Clamp(f.x + f.dirX * 60, camView.x + 80, camView.x + camView.w - 80),
          Phaser.Math.Clamp(f.y + f.dirY * 60, camView.y + 80, camView.y + camView.h - 80),
          'KO!',
          '#ffd166',
          46
        );
        play('ko', self ? 1.2 : 0.9);
        break;
      }
      case 'spawn':
        this.ring(f.x, f.y - PHYS.playerH / 2, 0xffffff, 60, 500);
        this.particles.burst(f.x, f.y - 20, { count: 16, colors: [0xffffff, 0xbff4ff, 0xffe066], speed: [30, 120], angle: [-120, -60], life: [400, 800], size: [2, 3], add: true, gravity: -80 });
        play('spawn', vol);
        break;
      case 'pickup': {
        const [label, color] = ITEM_LABEL[f.item] ?? [f.item, '#ffffff'];
        this.popup(f.x, f.y - 30, label, color);
        this.ring(f.x, f.y, hexNum(color), 50, 350);
        this.particles.burst(f.x, f.y, { count: 14, colors: [hexNum(color), 0xffffff], speed: [80, 220], life: [250, 500], size: [2, 3], add: true });
        play('pickup', vol);
        break;
      }
      case 'crate':
        play('crate', 0.5);
        break;
      case 'crumble':
        for (let i = 0; i < 4; i++) {
          this.particles.burst(f.x + (f.w * (i + 0.5)) / 4, f.y + 8, { count: 6, colors: [0xb98a52, 0x8a6440, 0xd9a55b], speed: [20, 120], angle: [40, 140], life: [600, 1100], size: [3, 6], gravity: 900 });
        }
        play('crumble', 0.8);
        break;
    }
  }
}
