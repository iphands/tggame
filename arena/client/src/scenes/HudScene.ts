import Phaser from 'phaser';
import { store } from '../store';
import { play } from '@tggame/base/platformer/audio';
import { Hud } from '../view/hud';

/** Shared between the arena camera and the HUD overlay. */
export const view = { x: 0, y: 0, w: 1280, h: 720, small: false };

/**
 * The HUD lives in its own scene layered over the arena so the arena camera
 * can zoom and follow on small screens while the HUD stays put.
 */
export class HudScene extends Phaser.Scene {
  private hud!: Hud;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.hud = new Hud(this, store.touchMode, view.small ? 1.3 : 1);
    const onRenamed = () => this.hud.redrawCards();
    window.addEventListener('lsa-renamed', onRenamed);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('lsa-renamed', onRenamed);
      this.hud.destroy();
    });
  }

  update(_time: number, delta: number): void {
    const snap = store.snapshot;
    if (!snap) return;
    const tick = this.hud.update(snap, snap.players, store.selfId, delta, view);
    if (tick !== null) play(tick > 0 ? 'tick' : 'go');
  }
}
