import Phaser from 'phaser';
import { MATCH } from '../../../shared/src/constants';
import type { SnapshotMessage } from '../../../shared/src/protocol';
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

  /**
   * The snapshot's clocks as of the moment our own fighter is drawn at. It runs ahead of the
   * snapshots (`predict.ts`) and may move the instant the countdown ends there, so the count and
   * the word that ends it have to be shown on that same timeline, not a trip late.
   */
  private onOurTimeline(snap: SnapshotMessage): SnapshotMessage {
    const edge = store.buffer.simTime(performance.now());
    if (edge === null || !store.predictor.active) return snap;
    const ahead = Math.min(750, Math.max(0, edge + store.predictor.leadMs - snap.simTimeMs));
    if (snap.phase === 'starting' && snap.countdownMs !== null) {
      const left = snap.countdownMs - ahead;
      if (left > 0) return { ...snap, countdownMs: left };
      return { ...snap, phase: 'playing', countdownMs: null, timeLeftMs: MATCH.durationMs };
    }
    if (snap.phase === 'playing' && snap.timeLeftMs !== null) return { ...snap, timeLeftMs: Math.max(0, snap.timeLeftMs - ahead) };
    return snap;
  }

  update(_time: number, delta: number): void {
    const snap = store.snapshot;
    if (!snap) return;
    const tick = this.hud.update(this.onOurTimeline(snap), snap.players, store.selfId, delta, view);
    if (tick !== null) play(tick > 0 ? 'tick' : 'go');
  }
}
