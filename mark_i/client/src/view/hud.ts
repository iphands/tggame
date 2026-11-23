/** In-arena HUD: timer, KO feed, player cards, banners, results, off-screen markers. */
import Phaser from 'phaser';
import { ARENA, MATCH, PHYS } from '../../../shared/src/constants';
import { levelAt } from '../../../shared/src/levels';
import type { SnapshotMessage } from '../../../shared/src/protocol';
import type { FeedEntry, PlayerState } from '../../../shared/src/types';
import { fighterTexture } from '../art/sprites';
import { hexNum } from '../art/color';
import { dmgColor } from './fighters';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const HOW_LABEL: Record<FeedEntry['how'], string> = {
  punch: 'punched out',
  stomp: 'stomped',
  pistol: 'blasted',
  boomstick: 'boomsticked',
  bomb: 'bombed',
  fall: 'fell',
  left: 'left',
};

type Card = {
  id: string;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  dmg: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Arc[];
  icon: Phaser.GameObjects.Image;
  ammo: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.Sprite;
  lastDmg: number;
  bump: number;
};

function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 5) {
  return scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: '#120a20',
    strokeThickness: stroke,
  });
}

export class Hud {
  private timer: Phaser.GameObjects.Text;
  private center: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private status: Phaser.GameObjects.Text;
  private feedRows: Phaser.GameObjects.Container[] = [];
  private feedKey = '';
  private cards = new Map<string, Card>();
  private cardsKey = '';
  private arrows = new Map<string, Phaser.GameObjects.Container>();
  private results: Phaser.GameObjects.Container | null = null;
  private lastCount = -1;
  private centerPunch = 0;
  private readonly cardsTop: boolean;

  constructor(private scene: Phaser.Scene, touchMode: boolean) {
    this.cardsTop = touchMode;
    const timerY = touchMode ? 64 : 12;
    this.timer = text(scene, 640, timerY, '', 30, '#ffe9b0', 6).setOrigin(0.5, 0).setDepth(100);
    this.center = text(scene, 640, 290, '', 84, '#ffd166', 10).setOrigin(0.5).setDepth(110);
    this.sub = text(scene, 640, 360, '', 26, '#ffffff', 6).setOrigin(0.5).setDepth(110);
    this.status = text(scene, 640, touchMode ? 108 : 56, '', 18, '#cfe9ff', 5).setOrigin(0.5, 0).setDepth(100);
  }

  /** Big transient center text ("KO!", "FIGHT!"). */
  flash(msg: string, color = '#ffd166', sub = ''): void {
    this.center.setText(msg).setColor(color).setVisible(true).setScale(1.6).setAlpha(1);
    this.sub.setText(sub).setVisible(!!sub);
    this.centerPunch = 900;
  }

  update(snap: SnapshotMessage, players: PlayerState[], selfId: string | null, dtMs: number): number | null {
    let tick: number | null = null;
    // ---- timer
    if (snap.phase === 'playing' && snap.timeLeftMs !== null) {
      const total = Math.ceil(snap.timeLeftMs / 1000);
      this.timer.setText(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
      const hurry = total <= 15;
      this.timer.setColor(hurry ? '#ff7b7b' : '#ffe9b0').setScale(hurry ? 1 + 0.08 * Math.abs(Math.sin(snap.simTimeMs / 160)) : 1);
      this.timer.setVisible(true);
    } else this.timer.setVisible(false);

    // ---- countdown / banners
    if (snap.phase === 'starting' && snap.countdownMs !== null) {
      const n = Math.ceil(snap.countdownMs / 1000);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        tick = n;
        this.center.setScale(1.8);
      }
      this.center.setText(String(Math.max(1, n))).setColor('#ffd166').setVisible(true);
      this.center.setScale(Math.max(1, this.center.scale - dtMs / 300));
      this.sub.setText(levelAt(snap.level).name.toUpperCase()).setVisible(true);
    } else if (this.lastCount > 0 && snap.phase === 'playing') {
      this.lastCount = -1;
      tick = 0;
      this.flash('FIGHT!', '#7dffb0');
    } else if (this.centerPunch > 0) {
      this.centerPunch -= dtMs;
      this.center.setScale(Math.max(1, this.center.scale - dtMs / 160));
      if (this.centerPunch < 250) this.center.setAlpha(this.centerPunch / 250);
      if (this.centerPunch <= 0) {
        this.center.setVisible(false);
        this.sub.setVisible(false);
      }
    } else if (snap.phase !== 'starting') {
      this.center.setVisible(false);
      this.sub.setVisible(false);
    }

    // ---- personal status line
    const me = players.find((p) => p.id === selfId);
    let status = '';
    if (me && snap.phase === 'playing') {
      if (me.life === 'respawning') status = 'Respawning…';
      else if (me.life === 'out') status = 'Out of lives: spectating';
      else if (me.life === 'waiting') status = 'You joined mid-round: you play next round';
    }
    this.status.setText(status).setVisible(!!status);

    this.updateFeed(snap.feed);
    this.updateCards(players, selfId, snap.simTimeMs);
    this.updateArrows(players, snap.phase);
    this.updateResults(snap, selfId);
    return tick;
  }

  // ------------------------------------------------------------ KO feed

  private updateFeed(feed: FeedEntry[]): void {
    const key = feed.map((f) => f.n).join(',');
    if (key === this.feedKey) return;
    this.feedKey = key;
    for (const r of this.feedRows) r.destroy();
    this.feedRows = [];
    const y0 = this.cardsTop ? 96 : 14;
    feed.slice(0, 5).forEach((f, i) => {
      const row = this.scene.add.container(14, y0 + i * 24).setDepth(100);
      const parts: [string, string][] = [];
      if (f.killer) parts.push([f.killer, f.killerColor ?? '#fff'], [` ${HOW_LABEL[f.how]} `, '#c9b8e6'], [f.victim, f.victimColor]);
      else parts.push([f.victim, f.victimColor], [` ${HOW_LABEL[f.how]}`, '#c9b8e6']);
      let x = 0;
      for (const [s, c] of parts) {
        const t = text(this.scene, x, 0, s, 15, c, 4);
        row.add(t);
        x += t.width - 4;
      }
      row.setAlpha(i === 0 ? 1 : 0.85 - i * 0.12);
      this.feedRows.push(row);
    });
  }

  // ------------------------------------------------------------ player cards

  private updateCards(players: PlayerState[], selfId: string | null, simNow: number): void {
    const active = players.filter((p) => p.life !== 'waiting');
    const key = active.map((p) => p.id).join(',');
    if (key !== this.cardsKey) {
      this.cardsKey = key;
      for (const c of this.cards.values()) c.root.destroy();
      this.cards.clear();
      this.layoutCards(active, selfId);
    }
    for (const p of active) {
      const c = this.cards.get(p.id);
      if (!c) continue;
      const out = p.life === 'out';
      if (Math.floor(p.dmg) !== c.lastDmg) {
        if (p.dmg > c.lastDmg) c.bump = 1;
        c.lastDmg = Math.floor(p.dmg);
      }
      c.bump *= 0.88;
      c.dmg
        .setText(out ? 'OUT' : `${Math.floor(p.dmg)}%`)
        .setColor(out ? '#8a7fa0' : dmgColor(p.dmg))
        .setScale(1 + c.bump * 0.35)
        .setX(c.dmg.getData('x') + (c.bump > 0.2 ? (Math.random() - 0.5) * 4 * c.bump : 0));
      c.pips.forEach((pip, i) => pip.setFillStyle(i < p.stocks ? hexNum(p.color) : 0x2a2140, 1));
      c.root.setAlpha(out ? 0.5 : p.life === 'respawning' ? 0.75 : 1);
      const iconKey = `icon-${p.weapon}`;
      if (c.icon.texture.key !== iconKey) c.icon.setTexture(iconKey);
      c.ammo.setText(p.ammo > 0 ? `×${p.ammo}` : '');
      c.portrait.setFrame(p.life === 'alive' && p.launched ? 8 : Math.floor(simNow / 450) % 2);
    }
  }

  private layoutCards(active: PlayerState[], selfId: string | null): void {
    const n = active.length;
    if (n === 0) return;
    const perRow = n > 8 ? Math.ceil(n / 2) : n;
    const rows = Math.ceil(n / perRow);
    const compact = rows > 1 || this.cardsTop;
    const ch = compact ? 44 : 58;
    const gap = 8;
    const cw = Math.min(compact ? 138 : 168, (ARENA.width - 40 - gap * (perRow - 1)) / perRow);
    active.forEach((p, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, n - row * perRow);
      const total = inRow * cw + (inRow - 1) * gap;
      const x = (ARENA.width - total) / 2 + col * (cw + gap);
      const y = this.cardsTop ? 6 + row * (ch + 4) : ARENA.height - (rows - row) * (ch + 6) - 2;
      this.cards.set(p.id, this.makeCard(p, x, y, cw, ch, p.id === selfId, compact));
    });
  }

  private makeCard(p: PlayerState, x: number, y: number, w: number, h: number, self: boolean, compact: boolean): Card {
    const s = this.scene;
    const root = s.add.container(x, y).setDepth(100);
    const bg = s.add.graphics();
    bg.fillStyle(0x0d0820, 0.78).fillRoundedRect(0, 0, w, h, 8);
    bg.fillStyle(hexNum(p.color), 1).fillRoundedRect(0, 0, 6, h, { tl: 8, bl: 8, tr: 0, br: 0 });
    bg.lineStyle(2, self ? 0xffe066 : 0x3a2c58, 1).strokeRoundedRect(0, 0, w, h, 8);
    root.add(bg);
    const portrait = s.add.sprite(compact ? 22 : 26, h / 2 + 2, fighterTexture(s, p.color), 0).setScale(compact ? 0.75 : 0.95);
    root.add(portrait);
    const nameSize = compact ? 11 : 13;
    const name = text(s, compact ? 40 : 48, compact ? 3 : 5, p.name + (p.bot ? ' 🤖' : ''), nameSize, self ? '#ffe680' : '#e9e2ff', 3);
    if (name.width > w - (compact ? 44 : 52)) name.setScale((w - (compact ? 44 : 52)) / name.width);
    root.add(name);
    const dmgX = compact ? 40 : 48;
    const dmg = text(s, dmgX, compact ? 17 : 22, '0%', compact ? 20 : 26, '#ffffff', 5).setData('x', dmgX);
    root.add(dmg);
    const pips: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < MATCH.stocks; i++) {
      const pip = s.add.circle(w - 12 - i * 11, h - 9, 4, hexNum(p.color)).setStrokeStyle(1.5, 0x120a20);
      pips.push(pip);
      root.add(pip);
    }
    const icon = s.add.image(w - 18, compact ? 16 : 20, 'icon-pistol').setScale(compact ? 0.55 : 0.7);
    const ammo = text(s, w - 34, compact ? 9 : 12, '', 11, '#ffe9b0', 3).setOrigin(1, 0);
    root.add([icon, ammo]);
    return { id: p.id, root, bg, dmg, name, pips, icon, ammo, portrait, lastDmg: 0, bump: 0 };
  }

  // ------------------------------------------------------------ off-screen markers

  private updateArrows(players: PlayerState[], phase: SnapshotMessage['phase']): void {
    const seen = new Set<string>();
    if (phase === 'playing' || phase === 'ended') {
      for (const p of players) {
        if (p.life !== 'alive') continue;
        const cx = p.x + PHYS.playerW / 2;
        const cy = p.y + PHYS.playerH / 2;
        const off = cx < -4 || cx > ARENA.width + 4 || cy < -4;
        if (!off) continue;
        seen.add(p.id);
        let a = this.arrows.get(p.id);
        if (!a) {
          a = this.scene.add.container(0, 0).setDepth(105);
          const bubble = this.scene.add.circle(0, 0, 15, 0x0d0820, 0.85).setStrokeStyle(3, hexNum(p.color));
          const face = this.scene.add.sprite(0, 4, fighterTexture(this.scene, p.color), 0).setScale(0.55);
          const tri = this.scene.add.triangle(0, -22, -7, 0, 7, 0, 0, -9, hexNum(p.color));
          a.add([bubble, face, tri]);
          this.arrows.set(p.id, a);
        }
        const x = Phaser.Math.Clamp(cx, 22, ARENA.width - 22);
        const y = Phaser.Math.Clamp(cy, 26, ARENA.height - 22);
        a.setPosition(x, y);
        const tri = a.list[2] as Phaser.GameObjects.Triangle;
        tri.setRotation(Math.atan2(cy - y, cx - x) + Math.PI / 2);
        tri.setPosition(Math.cos(Math.atan2(cy - y, cx - x)) * 22, Math.sin(Math.atan2(cy - y, cx - x)) * 22);
        const dist = Math.hypot(cx - x, cy - y);
        a.setScale(Phaser.Math.Clamp(1.1 - dist / 900, 0.6, 1.1));
      }
    }
    for (const [id, a] of this.arrows) {
      if (!seen.has(id)) {
        a.destroy();
        this.arrows.delete(id);
      }
    }
  }

  // ------------------------------------------------------------ results

  private updateResults(snap: SnapshotMessage, selfId: string | null): void {
    if (snap.phase !== 'ended' || !snap.results) {
      if (this.results) {
        this.results.destroy();
        this.results = null;
      }
      return;
    }
    if (this.results) {
      const foot = this.results.getByName('foot') as Phaser.GameObjects.Text | null;
      const secs = Math.ceil((snap.countdownMs ?? 0) / 1000);
      foot?.setText(`Next up: ${levelAt(snap.nextLevel).name}  ·  ${secs}s   (↻ to skip)`);
      return;
    }
    const s = this.scene;
    const root = s.add.container(0, 0).setDepth(120);
    this.results = root;
    const rows = snap.results.slice(0, 8);
    const ph = 150 + rows.length * 34;
    const py = Math.max(70, (ARENA.height - ph) / 2 - 20);
    const panel = s.add.graphics();
    panel.fillStyle(0x07041a, 0.55).fillRect(0, 0, ARENA.width, ARENA.height);
    panel.fillStyle(0x120a2a, 0.94).fillRoundedRect(340, py, 600, ph, 16);
    panel.lineStyle(3, 0xffd166, 1).strokeRoundedRect(340, py, 600, ph, 16);
    root.add(panel);
    root.setAlpha(0);
    s.tweens.add({ targets: root, alpha: 1, duration: 350, delay: 900 });

    const winner = snap.players.find((p) => p.id === snap.winnerId);
    const title = winner ? `${winner.name} WINS!` : snap.timeLeftMs === 0 ? "TIME'S UP: DRAW!" : 'DRAW!';
    const t = text(s, 640, py + 18, title, 38, winner ? winner.color : '#ffd166', 7).setOrigin(0.5, 0);
    if (t.width > 560) t.setScale(560 / t.width);
    root.add(t);
    if (winner) root.add(s.add.sprite(640 - t.displayWidth / 2 - 30, py + 40, fighterTexture(s, winner.color), 0).setScale(1.2));
    const hdrY = py + 74;
    root.add(text(s, 400, hdrY, 'PLAYER', 13, '#9d8cc4', 3));
    root.add(text(s, 700, hdrY, 'KOs', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    root.add(text(s, 780, hdrY, 'FALLS', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    root.add(text(s, 870, hdrY, 'DAMAGE', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    const medals = ['#ffd166', '#d7e1f0', '#e0a96d'];
    rows.forEach((r, i) => {
      const y = hdrY + 24 + i * 34;
      if (r.id === selfId) {
        const hl = s.add.graphics();
        hl.fillStyle(0xffe066, 0.12).fillRoundedRect(356, y - 4, 568, 30, 6);
        root.add(hl);
      }
      root.add(text(s, 372, y, `${r.place}`, 18, medals[r.place - 1] ?? '#c9b8e6', 4).setOrigin(0.5, 0));
      root.add(s.add.circle(400, y + 11, 7, hexNum(r.color)).setStrokeStyle(2, 0x120a20));
      const nm = text(s, 414, y, r.name + (r.bot ? ' 🤖' : ''), 18, '#ffffff', 4);
      if (nm.width > 250) nm.setScale(250 / nm.width);
      root.add(nm);
      root.add(text(s, 700, y, String(r.kos), 18, '#7dffb0', 4).setOrigin(0.5, 0));
      root.add(text(s, 780, y, String(r.falls), 18, '#ff9d99', 4).setOrigin(0.5, 0));
      root.add(text(s, 870, y, `${r.dmgDealt}%`, 18, '#ffe9b0', 4).setOrigin(0.5, 0));
    });
    root.add(text(s, 640, py + ph - 30, '', 15, '#c9b8e6', 3).setOrigin(0.5, 0).setName('foot'));
  }

  destroy(): void {
    for (const o of [this.timer, this.center, this.sub, this.status]) o.destroy();
    for (const r of this.feedRows) r.destroy();
    for (const c of this.cards.values()) c.root.destroy();
    for (const a of this.arrows.values()) a.destroy();
    this.results?.destroy();
  }
}
