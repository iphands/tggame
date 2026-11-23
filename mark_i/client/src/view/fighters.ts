/** On-screen fighters: animated sprite, name/damage tag, weapon, shield, punch swoosh. */
import Phaser from 'phaser';
import { PHYS } from '../../../shared/src/constants';
import type { PlatformState, PlayerState } from '../../../shared/src/types';
import { store } from '../store';
import { FRAMES, fighterTexture } from '../art/sprites';
import { hexNum } from '../art/color';

const W = PHYS.playerW;
const H = PHYS.playerH;

export function dmgColor(dmg: number): string {
  if (dmg < 35) return '#ffffff';
  if (dmg < 70) return '#ffe066';
  if (dmg < 110) return '#ff9f43';
  if (dmg < 150) return '#ff5d5d';
  return '#d63c8a';
}

/** Render text at device resolution (capped) so it stays crisp on high-DPI phones. */
export const TEXT_RES = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

const TEXT_FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export class FighterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly name: Phaser.GameObjects.Text;
  private readonly dmg: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Triangle | null;
  private readonly gun: Phaser.GameObjects.Image;
  private readonly fist: Phaser.GameObjects.Image;
  private readonly shield: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly crown: Phaser.GameObjects.Image;
  /** Soft contact shadow on the platform below. */
  private readonly shadow: Phaser.GameObjects.Image;
  /** Railgun sight line while charging. */
  private readonly sight: Phaser.GameObjects.Graphics;
  /** Set by the scene: this player leads the session in wins. */
  leader = false;
  private runDist = 0;
  private squash = 0; // >0 squash (landing), <0 stretch (jumping)
  private flashUntil = 0;
  private spin = 0;
  private lastShown = false;

  constructor(private scene: Phaser.Scene, p: PlayerState, readonly isSelf: boolean) {
    const key = fighterTexture(scene, p.color);
    this.shadow = scene.add.image(0, 0, 'soft').setTint(0x07021a).setDepth(5).setVisible(false);
    this.glow = scene.add.image(0, 0, 'soft').setTint(hexNum(p.color)).setAlpha(isSelf ? 0.35 : 0.18).setDisplaySize(70, 30).setDepth(9);
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setDepth(isSelf ? 12 : 11);
    this.gun = scene.add.image(0, 0, 'gun-pistol').setDepth(13).setOrigin(0.2, 0.5);
    this.fist = scene.add.image(0, 0, 'fist').setDepth(14).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.shield = scene.add.image(0, 0, 'shield').setDepth(15).setVisible(false);
    this.crown = scene.add.image(0, 0, 'crown').setDepth(13).setOrigin(0.5, 1).setVisible(false);
    this.sight = scene.add.graphics().setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
    this.name = scene.add
      .text(0, 0, p.name, {
        fontFamily: TEXT_FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: isSelf ? '#ffe680' : '#f4f1ff',
        stroke: '#120a20',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setResolution(TEXT_RES);
    this.dmg = scene.add
      .text(0, 0, '0%', { fontFamily: TEXT_FONT, fontSize: '12px', fontStyle: 'bold', color: '#fff', stroke: '#120a20', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setResolution(TEXT_RES);
    this.marker = isSelf ? scene.add.triangle(0, 0, 0, 0, 12, 0, 6, 8, 0xffe066).setDepth(20).setOrigin(0.5, 0) : null;
  }

  /** Visual reactions to sim events. */
  onLand(): void {
    this.squash = 0.35;
  }
  onJump(): void {
    this.squash = -0.3;
  }
  onHit(power: number): void {
    this.flashUntil = this.scene.time.now + 90;
    if (power > 900) this.spin = (Math.random() < 0.5 ? -1 : 1) * Math.min(22, power / 70);
  }

  update(p: PlayerState, simNow: number, dtMs: number, plats: PlatformState[] = []): void {
    const shown = p.life === 'alive';
    if (!shown) {
      if (this.lastShown) this.setVisible(false);
      this.lastShown = false;
      return;
    }
    if (!this.lastShown) this.setVisible(true);
    this.lastShown = true;

    const s = Math.min(dtMs, 50) / 1000;
    const cx = p.x + W / 2;
    const feet = p.y + H;

    // ---- animation frame
    let frame: number;
    const punching = p.punchAt >= 0 && simNow - p.punchAt < 140;
    if (p.launched) frame = FRAMES.hurt;
    else if (punching) frame = FRAMES.punch;
    else if (!p.grounded) frame = p.vy < 0 ? FRAMES.jump : FRAMES.fall;
    else if (Math.abs(p.vx) > 40) {
      this.runDist += Math.abs(p.vx) * s;
      frame = FRAMES.run[Math.floor(this.runDist / 16) % 4];
    } else frame = FRAMES.idle[Math.floor(simNow / 450) % 2];
    this.sprite.setFrame(frame);
    this.sprite.setFlipX(p.face < 0);

    // ---- squash & stretch + spin while launched
    this.squash *= Math.exp(-14 * s);
    const sx = 1 + this.squash * 0.6;
    const sy = 1 - this.squash;
    this.sprite.setScale(sx, sy);
    if (p.launched && this.spin !== 0) this.sprite.rotation += this.spin * s;
    else {
      this.spin = 0;
      this.sprite.rotation *= Math.exp(-20 * s);
    }
    this.sprite.setPosition(cx, feet);

    // ---- hit flash / invulnerability blink
    if (this.scene.time.now < this.flashUntil) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
    this.sprite.setAlpha(p.invuln ? (Math.floor(simNow / 90) % 2 ? 0.35 : 0.9) : 1);

    this.glow.setPosition(cx, feet - 2).setVisible(p.grounded);

    // ---- contact shadow: shrinks and fades with height above the platform below
    let ground = Infinity;
    if (store.quality.flags.shadows) {
      for (const pl of plats) {
        if (pl.state === 'gone' || cx < pl.x || cx > pl.x + pl.w || pl.y < feet - 4) continue;
        if (pl.y < ground) ground = pl.y;
      }
    }
    const h = ground - feet;
    if (h < 340) {
      const k = 1 - Math.max(0, h) / 340;
      this.shadow.setVisible(true).setPosition(cx, ground + 1).setDisplaySize(16 + 30 * k, 5 + 5 * k).setAlpha(0.65 * k);
    } else this.shadow.setVisible(false);
    this.crown
      .setVisible(this.leader)
      .setPosition(cx + p.face * -2, p.y + H * (1 - this.sprite.scaleY) + 4 + Math.sin(simNow / 200) * 1)
      .setRotation(this.sprite.rotation - p.face * 0.15);

    // ---- weapon in hand
    const gunKey = `gun-${p.weapon}`;
    if (this.gun.texture.key !== gunKey) this.gun.setTexture(gunKey);
    const recoil = p.shotAt >= 0 && simNow - p.shotAt < 90 ? -4 : 0;
    this.gun
      .setPosition(cx + p.face * (W / 2 - 2 + recoil), p.y + H * 0.55)
      .setFlipX(p.face < 0)
      .setOrigin(p.face < 0 ? 0.8 : 0.2, 0.5)
      .setVisible(!punching && !p.launched);

    // ---- punch swoosh
    if (punching) {
      const k = (simNow - p.punchAt) / 140;
      this.fist
        .setVisible(true)
        .setPosition(cx + p.face * (W / 2 + 10 + k * 8), p.y + H * 0.45)
        .setFlipX(p.face < 0)
        .setAlpha(1 - k)
        .setScale(0.8 + k * 0.4);
    } else this.fist.setVisible(false);

    // ---- shield bubble
    this.shield.setVisible(p.shield).setPosition(cx, p.y + H / 2);

    // ---- railgun charge: a flickering sight line warns everyone in its path
    this.sight.clear();
    if (p.charging) {
      const mx = cx + p.face * (W / 2 + 6);
      const my = p.y + H * 0.45;
      const flicker = 0.35 + 0.4 * Math.abs(Math.sin(simNow / 25));
      this.sight.lineStyle(2, 0xff4fd8, flicker).lineBetween(mx, my, mx + p.face * 1500, my);
      this.sight.fillStyle(0xffffff, 0.9).fillCircle(mx, my, 3 + Math.sin(simNow / 40) * 1.5);
    }
    if (p.shield) this.shield.setScale(1 + Math.sin(simNow / 120) * 0.04).setAlpha(0.8 + Math.sin(simNow / 70) * 0.15);

    // ---- name + damage tag
    const top = p.y - 6;
    this.dmg.setPosition(cx, top).setText(`${Math.floor(p.dmg)}%`).setColor(dmgColor(p.dmg));
    this.name.setPosition(cx, top - 13);
    if (this.marker) this.marker.setPosition(cx, top - 38 + Math.sin(simNow / 160) * 2);
  }

  setVisible(v: boolean): void {
    for (const o of [this.sprite, this.name, this.dmg, this.gun, this.glow]) o.setVisible(v);
    if (!v) this.shadow.setVisible(false);
    this.crown.setVisible(v && this.leader);
    this.marker?.setVisible(v);
    if (!v) {
      this.sight.clear();
      this.fist.setVisible(false);
      this.shield.setVisible(false);
    }
  }

  destroy(): void {
    for (const o of [this.sprite, this.name, this.dmg, this.gun, this.fist, this.shield, this.glow, this.crown, this.sight, this.shadow]) o.destroy();
    this.marker?.destroy();
  }
}
