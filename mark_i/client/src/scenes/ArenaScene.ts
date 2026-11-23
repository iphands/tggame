import Phaser from 'phaser';
import { store } from '../store';
import { hideChrome, syncRestartButton, syncGoButton } from '../ui';
import { touchInput, mergeInput, setTouchControlsVisible } from '../controls';
import type { Snapshot } from '../net';
import { WORLD } from '../../../shared/src/constants';

type Views = Map<string, PlayerView>;

type PlayerView = {
  image: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  lastX: number;
  lastY: number;
  fading: boolean;
};

const INTERPOLATION_MS = 110;

export class ArenaScene extends Phaser.Scene {
  private buffer: { time: number; snap: Snapshot }[] = [];
  private views: Views = new Map();
  private platformImages: Phaser.GameObjects.Image[] = [];
  private selfMarker: Phaser.GameObjects.Rectangle | null = null;
  private timerText!: Phaser.GameObjects.Text;
  private aliveText!: Phaser.GameObjects.Text;
  private feedTexts: Phaser.GameObjects.Text[] = [];
  private centerText!: Phaser.GameObjects.Text;
  private eventsKey = '';
  private lastInputSent = { left: false, right: false, jump: false };
  private keys: Record<string, Phaser.Input.Keyboard.Key[]> = { left: [], right: [], jump: [] };
  private frame = 0;

  constructor() {
    super('Arena');
  }

  create(): void {
    hideChrome();
    syncGoButton(false);
    setTouchControlsVisible(store.touchMode);
    this.buffer = [];
    this.views.clear();
    this.platformImages = [];
    this.feedTexts = [];
    this.eventsKey = '';
    this.selfMarker = null;
    this.frame = 0;
    this.lastInputSent = { left: false, right: false, jump: false };

    this.add.image(0, 0, 'bg').setOrigin(0, 0).setDisplaySize(1280, 720);

    this.timerText = this.add
      .text(640, 18, '', { fontFamily: 'Courier New, monospace', fontSize: '30px', fontStyle: 'bold', color: '#ffe9b0', stroke: '#1a0e2b', strokeThickness: 4 })
      .setOrigin(0.5, 0);
    this.aliveText = this.add
      .text(1250, 20, '', { fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#cfe9ff', stroke: '#101024', strokeThickness: 4 })
      .setOrigin(1, 0);
    this.centerText = this.add
      .text(640, 300, '', { fontFamily: 'Courier New, monospace', fontSize: '60px', fontStyle: 'bold', color: '#ffd166', stroke: '#1d0f0b', strokeThickness: 8 })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = {
        left: [Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.A].map((code) => kb.addKey(code)),
        right: [Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.D].map((code) => kb.addKey(code)),
        jump: [Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.W].map((code) => kb.addKey(code)),
      };
      kb.on('keydown', (e: KeyboardEvent) => {
        if (e.code === 'KeyR' && !e.repeat) store.client?.sendRestart();
      });
    }
  }

  private anyKeyDown(name: 'left' | 'right' | 'jump'): boolean {
    return this.keys[name]?.some((k) => k.isDown) ?? false;
  }

  update(_time: number, delta: number): void {
    const snap = store.snapshot;
    if (!snap || snap.phase === 'lobby') {
      this.scene.start('Lobby');
      return;
    }

    syncRestartButton(true, snap.phase === 'ended');

    // ---- input (keyboard OR touch)
    const input = mergeInput(
      {
        left: this.anyKeyDown('left'),
        right: this.anyKeyDown('right'),
        jump: this.anyKeyDown('jump'),
      },
      touchInput
    );
    const changed =
      input.left !== this.lastInputSent.left ||
      input.right !== this.lastInputSent.right ||
      input.jump !== this.lastInputSent.jump;
    this.frame++;
    if (changed || this.frame % 20 === 0) {
      this.lastInputSent = { ...input };
      store.client?.sendInput(input);
    }

    // ---- interpolation buffer
    const now = performance.now();
    if (this.buffer.length === 0 || this.buffer[this.buffer.length - 1].snap.tick !== snap.tick) {
      this.buffer.push({ time: now, snap });
      if (this.buffer.length > 4) this.buffer.shift();
    }

    this.render(snap, now - INTERPOLATION_MS, delta);
  }

  private bracket(renderTime: number): { prev: Snapshot; curr: Snapshot; alpha: number } | null {
    if (this.buffer.length < 2) {
      return this.buffer.length ? { prev: this.buffer[0].snap, curr: this.buffer[0].snap, alpha: 1 } : null;
    }
    let prev = this.buffer[0];
    let curr = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (renderTime >= this.buffer[i].time && renderTime <= this.buffer[i + 1].time) {
        prev = this.buffer[i];
        curr = this.buffer[i + 1];
        break;
      }
    }
    const span = Math.max(1, curr.time - prev.time);
    const alpha = Math.min(1, Math.max(0, (renderTime - prev.time) / span));
    return { prev: prev.snap, curr: curr.snap, alpha };
  }

  private render(snap: Snapshot, renderTime: number, delta: number): void {
    const pair = this.bracket(renderTime);
    const plats = snap.platforms;
    const players = pair ? pair.curr.players : snap.players;
    const prevPlayers = pair ? pair.prev.players : players;
    const prevById = new Map(prevPlayers.map((p) => [p.id, p]));
    const alpha = pair ? pair.alpha : 1;

    // ---- platforms
    if (this.platformImages.length !== plats.length) {
      for (const img of this.platformImages) img.destroy();
      this.platformImages = [];
      for (let i = 0; i < plats.length; i++) {
        const img = this.add.image(0, 0, 'platform').setOrigin(0, 0).setDisplaySize(100, 22);
        this.platformImages.push(img);
      }
    }
    for (let i = 0; i < this.platformImages.length; i++) {
      const plat = plats[i];
      if (!plat) continue;
      this.platformImages[i].setPosition(plat.x, plat.y).setDisplaySize(plat.w, Math.max(plat.h, 18));
    }

    // ---- players
    const renderedIds = new Set<string>();
    for (const p of players) {
      if (p.waiting) continue;
      renderedIds.add(p.id);
      const prev = prevById.get(p.id) ?? p;
      const x = prev.x + (p.x - prev.x) * alpha;
      const y = prev.y + (p.y - prev.y) * alpha;

      let view = this.views.get(p.id);
      if (!view) {
        view = this.createView(p);
        this.views.set(p.id, view);
      }
      view.image.setPosition(x, y);
      view.image.setDisplaySize(WORLD.playerW, WORLD.playerH);
      view.image.setTint(parseInt(p.color.slice(1), 16));
      view.nameText.setPosition(x + WORLD.playerW / 2, y - 26).setText(p.name);

      // hp bar (above the sprite, under the name)
      const hpFrac = Math.max(0, Math.min(1, p.hp / p.maxHp));
      view.hpBg.setPosition(x + 1, y - 24);
      view.hpBar
        .setPosition(x + 2, y - 23)
        .setSize(Math.max(2, 30 * hpFrac), 4)
        .setFillStyle(hpColor(hpFrac));

      if (p.id === store.selfId) {
        if (!this.selfMarker) {
          this.selfMarker = this.add.rectangle(0, 0, WORLD.playerW + 8, 4, 0xffd166).setOrigin(0.5, 0);
        }
        this.selfMarker.setPosition(x + WORLD.playerW / 2, y + WORLD.playerH + 8).setVisible(true);
      }

      // death fade-out
      if (!p.alive) {
        view.fading = true;
      }
      if (view.fading) {
        const a = Math.max(0, view.image.alpha - delta / 200);
        view.image.setAlpha(a);
        view.nameText.setAlpha(a);
        view.hpBg.setAlpha(a);
        view.hpBar.setAlpha(a);
        if (a <= 0.01) {
          view.image.destroy();
          view.nameText.destroy();
          view.hpBg.destroy();
          view.hpBar.destroy();
          this.views.delete(p.id);
        }
      }
    }

    // self marker visibility
    const selfAlive = players.some((p) => p.id === store.selfId && p.alive && !p.waiting);
    if (this.selfMarker) this.selfMarker.setVisible(selfAlive && !!store.selfId);

    // remove orphan views (player disconnected)
    for (const [id, view] of [...this.views]) {
      if (!renderedIds.has(id)) {
        view.image.destroy();
        view.nameText.destroy();
        view.hpBg.destroy();
        view.hpBar.destroy();
        this.views.delete(id);
      }
    }

    this.renderHUD(snap, players);
  }

  private createView(p: { id: string; name: string; color: string }): PlayerView {
    const image = this.add.image(0, 0, 'character').setOrigin(0, 0).setDisplaySize(WORLD.playerW, WORLD.playerH);
    const nameText = this.add
      .text(0, 0, p.name, {
        fontFamily: 'Courier New, monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f4f1ff',
        stroke: '#140d22',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    const hpBg = this.add.rectangle(0, 0, 32, 6, 0x101024, 0.9).setOrigin(0, 0);
    const hpBar = this.add.rectangle(0, 0, 30, 4, 0x6ef58a).setOrigin(0, 0);
    return { image, nameText, hpBg, hpBar, lastX: 0, lastY: 0, fading: false };
  }

  private renderHUD(snap: Snapshot, players: Snapshot['players']): void {
    if (snap.phase === 'playing' && snap.timeLeftMs !== null) {
      const total = Math.ceil(snap.timeLeftMs / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      this.timerText.setText(`${m}:${String(s).padStart(2, '0')}`);
      this.timerText.setColor(total <= 15 ? '#ff7b7b' : '#ffe9b0').setVisible(true);
    } else {
      this.timerText.setVisible(false);
    }

    const alive = players.filter((p) => p.alive && !p.waiting);
    const active = players.filter((p) => !p.waiting);
    this.aliveText.setText(`Alive  ${alive.length} / ${active.length}`);

    if (snap.phase === 'starting' && snap.countdownMs !== null) {
      const s = Math.ceil(snap.countdownMs / 1000);
      this.centerText.setText(`${s}`).setVisible(true);
    } else if (snap.phase === 'ended') {
      const winner = players.find((p) => p.id === snap.winnerId);
      this.centerText.setText(winner ? `🏆 ${winner.name} wins!` : "TIME'S UP").setVisible(true);
    } else {
      this.centerText.setVisible(false);
    }

    const key = snap.events.map((e) => `${e.id}:${e.cause}:${Math.round(e.atMs)}`).join('|');
    if (key !== this.eventsKey) {
      this.eventsKey = key;
      for (const t of this.feedTexts) t.destroy();
      this.feedTexts = [];
      snap.events.slice(0, 5).forEach((e, i) => {
        const t = this.add
          .text(16, 700 - i * 22, `✗ ${e.name}  ${causeLabel(e.cause)}`, {
            fontFamily: 'Courier New, monospace',
            fontSize: '14px',
            color: '#ffb0a0',
            stroke: '#180d18',
            strokeThickness: 3,
          })
          .setOrigin(0, 1);
        this.feedTexts.push(t);
      });
    }
  }
}

function hpColor(frac: number): number {
  if (frac > 0.6) return 0x6ef58a; // green
  if (frac > 0.3) return 0xffd166; // amber
  return 0xff6b6b; // red
}

function causeLabel(c: string): string {
  switch (c) {
    case 'pit': return 'fell off';
    case 'left': return 'left the arena';
    case 'timeout': return 'time expired';
    case 'knockdown': return 'knocked out';
    case 'stomp': return 'was stomped';
    default: return c;
  }
}
