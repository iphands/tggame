import Phaser from 'phaser';
import { makeBackground, makePlatformTexture, makeCharacterTexture, makeBulletTexture } from '../art';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const W = 1280;
    const H = 720;
    if (!this.textures.exists('bg')) this.textures.addCanvas('bg', makeBackground(W, H));
    if (!this.textures.exists('platform')) this.textures.addCanvas('platform', makePlatformTexture());
    if (!this.textures.exists('character')) this.textures.addCanvas('character', makeCharacterTexture());
    if (!this.textures.exists('bullet')) this.textures.addCanvas('bullet', makeBulletTexture());
    this.scene.start('Lobby');
  }
}
