import Phaser from 'phaser';
import { LEVELS } from '../../../shared/src/levels';
import { COLORS } from '../../../shared/src/constants';
import { store } from '../store';
import { setTouchControlsVisible } from '@tggame/base/platformer/controls';
import { LevelView } from '../view/levelView';
import { fighterTexture, FRAMES } from '../art/sprites';
import { renderLobby, showScreen } from '../lobby';
import { setPerfExtra } from '@tggame/base/platformer/perfMeter';

/**
 * Title / lobby: the start of the next course sits live behind the DOM lobby
 * panels, with a few idle runners bouncing on the start pad. Before joining,
 * it cycles through every course as an attract loop.
 */
export class LobbyScene extends Phaser.Scene {
  private view: LevelView | null = null;
  private shownIndex = -1;
  private attractAt = 0;
  private domAccum = 0;
  private dancers: { s: Phaser.GameObjects.Sprite; vx: number; vy: number; ground: number }[] = [];

  constructor() {
    super('Lobby');
  }

  create(): void {
    setTouchControlsVisible(false);
    this.view = null;
    this.shownIndex = -1;
    this.dancers = [];
    this.add.rectangle(0, 0, 1280, 720, 0x07041a, 0.18).setOrigin(0).setDepth(90);
    this.showLevel(store.snapshot?.nextLevel ?? 0);
    showScreen(store.joined ? 'lobby' : 'join');
    renderLobby();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.view?.destroy();
      for (const d of this.dancers) d.s.destroy();
    });
  }

  private showLevel(index: number): void {
    if (index === this.shownIndex) return;
    this.shownIndex = index;
    this.view?.destroy();
    this.view = new LevelView(this, index);
    for (const d of this.dancers) d.s.destroy();
    this.dancers = [];
    // a few runners hopping on the start pad for flavor
    const level = LEVELS[index];
    const main = level.platforms[0];
    for (let i = 0; i < 4; i++) {
      const color = COLORS[(i * 3 + index) % COLORS.length];
      const s = this.add.sprite(main.x + 40 + (i * (main.w - 80)) / 3, main.y, fighterTexture(this, color), 0).setOrigin(0.5, 1).setDepth(10);
      s.setFlipX(i % 2 === 1);
      this.dancers.push({ s, vx: 0, vy: 0, ground: main.y });
    }
    this.cameras.main.flash(250, 7, 4, 26);
  }

  update(time: number, delta: number): void {
    const snap = store.snapshot;
    if (store.joined && snap && snap.phase !== 'lobby') {
      this.scene.start('Arena');
      return;
    }
    if (store.joined && snap) {
      this.showLevel(snap.nextLevel);
    } else if (time > this.attractAt) {
      this.attractAt = time + 6000;
      this.showLevel((this.shownIndex + 1) % LEVELS.length);
    }
    this.view?.update(time, delta, 0);
    setPerfExtra(`${store.quality.tier} · lobby`);

    const s = delta / 1000;
    for (const d of this.dancers) {
      if (d.s.y >= d.ground && Math.random() < 0.012) d.vy = -420 - Math.random() * 250;
      d.vy += 1800 * s;
      d.s.y = Math.min(d.ground, d.s.y + d.vy * s);
      if (d.s.y >= d.ground) d.vy = 0;
      d.s.setFrame(d.s.y < d.ground - 1 ? (d.vy < 0 ? FRAMES.jump : FRAMES.fall) : FRAMES.idle[Math.floor(time / 450) % 2]);
    }

    this.domAccum += delta;
    if (this.domAccum > 120) {
      this.domAccum = 0;
      renderLobby();
    }
  }
}
