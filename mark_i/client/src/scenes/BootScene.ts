import Phaser from 'phaser';
import { makeCommonTextures } from '../art/sprites';

/** Bakes all procedural textures once, then hands off to the lobby. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    makeCommonTextures(this);
    this.scene.start('Lobby');
  }
}
