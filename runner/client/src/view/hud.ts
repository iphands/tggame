/** In-run HUD: race clock, course progress bar, feed, player cards, banners, results, off-screen markers. */
import Phaser from 'phaser';
import { ARENA, MATCH, PHYS, RUN } from '../../../shared/src/constants';
import { levelAt } from '../../../shared/src/levels';
import type { SnapshotMessage } from '../../../shared/src/protocol';
import type { FeedEntry, PlayerState } from '../../../shared/src/types';
import { store } from '../store';
import { fighterTexture } from '../art/sprites';
import { hexNum } from '@tggame/base/platformer/art/color';
import { dmgColor, ordinal, placeColor, setTextIf, TEXT_RES } from './fighters';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const HOW_LABEL: Record<FeedEntry['how'], string> = {
  stomp: 'stomped',
  pistol: 'blasted',
  boomstick: 'boomsticked',
  bomb: 'bombed',
  smg: 'riddled',
  rocket: 'rocketed',
  railgun: 'RAILED',
  fall: 'fell',
  scroll: 'got left behind',
  left: 'left',
  finish: 'crossed the line!',
};

/** m:ss.cc */
export function raceTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor(cs / 100) % 60;
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** Width of the course progress track (HUD units, before the UI scale). */
const TRACK_W = 520;

type Card = {
  id: string;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Image;
  /** The big readout: course progress, finishing place, or OUT. */
  big: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Image[];
  /** Last applied pip state (lives), to avoid redundant updates. */
  pipLives: number;
  icon: Phaser.GameObjects.Image;
  ammo: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.Sprite;
  bump: number;
  lastDmg: number;
};

function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = '#ffffff', stroke = 5) {
  return scene.add
    .text(x, y, s, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#120a20',
      strokeThickness: stroke,
    })
    .setResolution(TEXT_RES);
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
  /** Course progress bar: track + one marker per runner. */
  private track: Phaser.GameObjects.Container;
  private trackLevel = -1;
  private trackDots = new Map<string, Phaser.GameObjects.Image>();
  private trackWall!: Phaser.GameObjects.Rectangle;
  private results: Phaser.GameObjects.Container | null = null;
  private lastCount = -1;
  private centerPunch = 0;
  private readonly cardsTop: boolean;
  /** Top edge of the free area below the cards (touch layout) for timer + feed. */
  private topY = 14;

  /**
   * @param k UI scale: >1 on small screens so text and cards stay readable.
   */
  constructor(private scene: Phaser.Scene, touchMode: boolean, private readonly k = 1) {
    this.cardsTop = touchMode;
    this.timer = text(scene, 640, 12, '', 30 * k, '#ffe9b0', 6).setOrigin(0.5, 0).setDepth(100);
    this.center = text(scene, 640, 290, '', 84 * k, '#ffd166', 10).setOrigin(0.5).setDepth(110);
    this.sub = text(scene, 640, 290 + 70 * k, '', 26 * k, '#ffffff', 6).setOrigin(0.5).setDepth(110);
    this.status = text(scene, 640, 56, '', 18 * k, '#cfe9ff', 5).setOrigin(0.5, 0).setDepth(100);
    this.track = scene.add.container(640 - (TRACK_W * k) / 2, 60).setDepth(100).setScale(k).setVisible(false);
    this.placeTop(14);
  }

  /** Lay out timer / status / feed from a top y (below the cards in touch mode). */
  private placeTop(y: number): void {
    this.topY = y;
    this.timer.setY(y - 2);
    this.track.setY(y + 46 * this.k);
    this.status.setY(y + 62 * this.k);
    this.feedKey = ''; // re-layout the feed
  }

  /** Big transient center text ("GO!"). */
  flash(msg: string, color = '#ffd166', sub = ''): void {
    this.center.setText(msg).setColor(color).setVisible(true).setScale(1.6).setAlpha(1);
    this.sub.setText(sub).setVisible(!!sub);
    this.centerPunch = 900;
  }

  /** `view` is the visible world rectangle (the arena camera may be zoomed in). */
  update(
    snap: SnapshotMessage,
    players: PlayerState[],
    selfId: string | null,
    dtMs: number,
    view: { x: number; y: number; w: number; h: number }
  ): number | null {
    let tick: number | null = null;
    // ---- timer
    if (snap.phase === 'playing' && snap.timeLeftMs !== null) {
      // the race clock counts up; once someone has finished (or time is nearly up) it's a red countdown
      const left = snap.graceMs !== null ? Math.min(snap.graceMs, snap.timeLeftMs) : snap.timeLeftMs;
      const hurry = snap.graceMs !== null || left <= 15_000;
      if (hurry) {
        setTextIf(this.timer, `⏱ ${Math.ceil(left / 1000)}`, '#ff7b7b');
      } else {
        const total = Math.floor((MATCH.durationMs - snap.timeLeftMs) / 1000);
        setTextIf(this.timer, `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, '#ffe9b0');
      }
      this.timer.setScale(hurry ? 1 + 0.08 * Math.abs(Math.sin(snap.simTimeMs / 160)) : 1);
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
      setTextIf(this.center, String(Math.max(1, n)), '#ffd166');
      this.center.setVisible(true);
      this.center.setScale(Math.max(1, this.center.scale - dtMs / 300));
      setTextIf(this.sub, levelAt(snap.level).name.toUpperCase());
      this.sub.setVisible(true);
    } else if (this.lastCount > 0 && snap.phase === 'playing') {
      this.lastCount = -1;
      tick = 0;
      this.flash('GO!', '#7dffb0');
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
      if (me.place > 0) status = `🏁 You finished ${ordinal(me.place)}!`;
      else if (me.life === 'respawning') status = 'Respawning…';
      else if (me.life === 'out') status = 'Out of lives: spectating';
      else if (me.life === 'waiting') status = 'You joined mid-round: you play next round';
    }
    if (!me && store.watching && snap.phase === 'playing') status = 'Watching';
    setTextIf(this.status, status);
    this.status.setVisible(!!status);

    this.updateFeed(snap.feed);
    this.updateCards(players, selfId, snap);
    this.updateTrack(snap, players, selfId);
    this.updateArrows(players, snap.phase, view);
    this.updateResults(snap, selfId);
    return tick;
  }

  // ------------------------------------------------------------ feed

  private updateFeed(feed: FeedEntry[]): void {
    const key = feed.map((f) => f.n).join(',');
    if (key === this.feedKey) return;
    this.feedKey = key;
    for (const r of this.feedRows) r.destroy();
    this.feedRows = [];
    const y0 = this.cardsTop ? this.topY : 14;
    feed.slice(0, 5).forEach((f, i) => {
      const row = this.scene.add.container(14, y0 + i * 24 * this.k).setDepth(100).setScale(this.k);
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

  /** Build the cards afresh on the next update: a name on them changed. */
  redrawCards(): void {
    this.cardsKey = '';
  }

  private updateCards(players: PlayerState[], selfId: string | null, snap: SnapshotMessage): void {
    const simNow = snap.simTimeMs;
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
      c.bump *= 0.88;
      if (p.place > 0) setTextIf(c.big, ordinal(p.place), placeColor(p.place));
      else if (out) setTextIf(c.big, 'OUT', '#8a7fa0');
      else {
        // damage taken this life (it slows you down); progress is on the track
        const dmg = p.life === 'alive' ? p.dmg : 0;
        if (dmg > c.lastDmg) c.bump = 1; // took a hit: shake the card
        c.lastDmg = dmg;
        setTextIf(c.big, `${dmg}%`, dmgColor(dmg));
      }
      c.big.setScale(1 + c.bump * 0.35).setX(c.big.getData('x') + (c.bump > 0.2 ? (Math.random() - 0.5) * 4 * c.bump : 0));
      if (c.pipLives !== p.lives) {
        if (p.lives < c.pipLives) c.bump = 1; // lost a life: shake the card
        c.pipLives = p.lives;
        c.pips.forEach((pip, i) => pip.setTint(i < p.lives ? hexNum(p.color) : 0x2a2140));
      }
      c.root.setAlpha(out ? 0.5 : p.life === 'respawning' ? 0.75 : 1);
      const iconKey = `icon-${p.weapon}`;
      if (c.icon.texture.key !== iconKey) c.icon.setTexture(iconKey);
      setTextIf(c.ammo, p.ammo > 0 ? `×${p.ammo}` : '');
      c.portrait.setFrame(p.life === 'alive' && p.launched ? 8 : Math.floor(simNow / 450) % 2);
    }
  }

  // ------------------------------------------------------------ course progress bar

  /** A strip under the clock: where everyone is on the course, the gates, and the creeping left edge. */
  private updateTrack(snap: SnapshotMessage, players: PlayerState[], selfId: string | null): void {
    const show = snap.phase === 'playing' || snap.phase === 'starting';
    this.track.setVisible(show);
    if (!show) return;
    const s = this.scene;
    const level = levelAt(snap.level);
    const at = (x: number) => Phaser.Math.Clamp(x / level.finishX, 0, 1) * TRACK_W;
    if (this.trackLevel !== snap.level) {
      this.trackLevel = snap.level;
      this.track.removeAll(true);
      this.trackDots.clear();
      const g = s.add.graphics();
      g.fillStyle(0x0d0820, 0.8).fillRoundedRect(-8, -7, TRACK_W + 30, 14, 7);
      g.fillStyle(0x3a2c58, 1).fillRect(0, -2, TRACK_W, 4);
      // gates: little yellow posts
      g.fillStyle(0xffc23d, 1);
      for (const gate of level.gates) g.fillRect(at(gate.x) - 2, -6, 4, 12);
      // finish flag: a checkered square at the end
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) g.fillStyle((i + j) % 2 ? 0x14111c : 0xf5f6fa, 1).fillRect(TRACK_W + 4 + i * 6, -6 + j * 6, 6, 6);
      }
      this.trackWall = s.add.rectangle(0, 0, 0, 4, 0xff5d5d, 0.9).setOrigin(0, 0.5);
      this.track.add([g, this.trackWall]);
    }
    // the part of the course the screen has already swallowed
    this.trackWall.setDisplaySize(Math.max(0.001, at(snap.scrollX)), 4);
    const seen = new Set<string>();
    for (const p of players) {
      if (p.life !== 'alive') continue;
      seen.add(p.id);
      let dot = this.trackDots.get(p.id);
      if (!dot) {
        dot = s.add.image(0, 0, 'pip').setTint(hexNum(p.color));
        this.trackDots.set(p.id, dot);
        this.track.add(dot);
      }
      const self = p.id === selfId;
      dot.setPosition(p.place > 0 ? TRACK_W : at(p.x + PHYS.playerW / 2), self ? 0 : (hash(p.id) % 5) - 2).setScale(self ? 2 : 1.3);
      if (self) this.track.bringToTop(dot);
    }
    for (const [id, dot] of this.trackDots) {
      if (!seen.has(id)) {
        dot.destroy();
        this.trackDots.delete(id);
      }
    }
  }

  private layoutCards(active: PlayerState[], selfId: string | null): void {
    const n = active.length;
    if (n === 0) return;
    const perRow = n > 8 ? Math.ceil(n / 2) : n;
    const rows = Math.ceil(n / perRow);
    const compact = rows > 1 || this.cardsTop;
    const k = this.k;
    const ch = compact ? 44 : 58; // card-local units (the card is scaled by k)
    const gap = 8;
    const cw = Math.min((compact ? 138 : 168) * k, (ARENA.width - 24 - gap * (perRow - 1)) / perRow); // screen px
    const chS = ch * k;
    active.forEach((p, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, n - row * perRow);
      const total = inRow * cw + (inRow - 1) * gap;
      const x = (ARENA.width - total) / 2 + col * (cw + gap);
      const y = this.cardsTop ? 6 + row * (chS + 4) : ARENA.height - (rows - row) * (chS + 6) - 2;
      const card = this.makeCard(p, x, y, cw / k, ch, p.id === selfId, compact);
      card.root.setScale(k);
      this.cards.set(p.id, card);
    });
    if (this.cardsTop) this.placeTop(6 + rows * (chS + 4) + 6);
  }

  private makeCard(p: PlayerState, x: number, y: number, w: number, h: number, self: boolean, compact: boolean): Card {
    const s = this.scene;
    const root = s.add.container(x, y).setDepth(100);
    // bake the card frame once: Graphics would be re-tessellated every frame
    const bgKey = `card-${p.color}-${self ? 1 : 0}-${Math.round(w)}x${h}`;
    if (!s.textures.exists(bgKey)) {
      const g = s.make.graphics({}, false);
      g.fillStyle(0x0d0820, 0.78).fillRoundedRect(1, 1, w - 2, h - 2, 8);
      g.fillStyle(hexNum(p.color), 1).fillRoundedRect(1, 1, 6, h - 2, { tl: 8, bl: 8, tr: 0, br: 0 });
      g.lineStyle(2, self ? 0xffe066 : 0x3a2c58, 1).strokeRoundedRect(1, 1, w - 2, h - 2, 8);
      g.generateTexture(bgKey, Math.ceil(w), h);
      g.destroy();
    }
    const bg = s.add.image(-1, -1, bgKey).setOrigin(0);
    root.add(bg);
    const portrait = s.add.sprite(compact ? 22 : 26, h / 2 + 2, fighterTexture(s, p.color), 0).setScale(compact ? 0.75 : 0.95);
    root.add(portrait);
    const nameSize = compact ? 11 : 13;
    const name = text(s, compact ? 40 : 48, compact ? 3 : 5, p.name + (p.bot ? ' 🤖' : ''), nameSize, self ? '#ffe680' : '#e9e2ff', 3);
    if (name.width > w - (compact ? 44 : 52)) name.setScale((w - (compact ? 44 : 52)) / name.width);
    root.add(name);
    const bigX = compact ? 40 : 48;
    const big = text(s, bigX, compact ? 17 : 22, '0%', compact ? 20 : 26, '#ffffff', 5).setData('x', bigX);
    root.add(big);
    const pips: Phaser.GameObjects.Image[] = [];
    // two rows once there are too many to sit beside the big number; the bottom row empties last
    const pipCols = RUN.lives > 4 ? Math.ceil(RUN.lives / 2) : RUN.lives;
    for (let i = 0; i < RUN.lives; i++) {
      // lives: tinted images, not shapes (cheap to draw)
      const pip = s.add.image(w - 10 - (i % pipCols) * 9.5, h - 8 - Math.floor(i / pipCols) * 9, 'pip').setTint(hexNum(p.color));
      pips.push(pip);
      root.add(pip);
    }
    const icon = s.add.image(w - 18, compact ? 16 : 20, 'icon-pistol').setScale(compact ? 0.55 : 0.7);
    const ammo = text(s, w - 34, compact ? 9 : 12, '', 11, '#ffe9b0', 3).setOrigin(1, 0);
    root.add([icon, ammo]);
    return { id: p.id, root, bg, big, name, pips, pipLives: RUN.lives, icon, ammo, portrait, bump: 0, lastDmg: 0 };
  }

  // ------------------------------------------------------------ off-screen markers

  private updateArrows(
    players: PlayerState[],
    phase: SnapshotMessage['phase'],
    view: { x: number; y: number; w: number; h: number }
  ): void {
    const seen = new Set<string>();
    if (phase === 'playing' || phase === 'ended') {
      for (const p of players) {
        if (p.life !== 'alive') continue;
        // world → screen through the (possibly zoomed) arena camera
        const cx = ((p.x + PHYS.playerW / 2 - view.x) / view.w) * ARENA.width;
        const cy = ((p.y + PHYS.playerH / 2 - view.y) / view.h) * ARENA.height;
        const off = cx < -4 || cx > ARENA.width + 4 || cy < -4 || cy > ARENA.height + 4;
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
        const minY = (this.cardsTop ? this.topY : 0) + 26 * this.k;
        const y = Phaser.Math.Clamp(cy, minY, ARENA.height - 22);
        a.setPosition(x, y);
        const tri = a.list[2] as Phaser.GameObjects.Triangle;
        tri.setRotation(Math.atan2(cy - y, cx - x) + Math.PI / 2);
        tri.setPosition(Math.cos(Math.atan2(cy - y, cx - x)) * 22, Math.sin(Math.atan2(cy - y, cx - x)) * 22);
        const dist = Math.hypot(cx - x, cy - y);
        a.setScale(Phaser.Math.Clamp(1.1 - dist / 900, 0.6, 1.1) * this.k);
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
    // scaled around the screen center on small screens
    const root = s.add
      .container(640 * (1 - this.k), 360 * (1 - this.k))
      .setDepth(120)
      .setScale(this.k);
    this.results = root;
    const rows = snap.results.slice(0, 8);
    const ph = 150 + rows.length * 34;
    const py = Math.max(70, (ARENA.height - ph) / 2 - 20);
    const panel = s.add.graphics();
    panel.fillStyle(0x07041a, 0.55).fillRect(0, 0, ARENA.width, ARENA.height);
    panel.fillStyle(0x120a2a, 0.94).fillRoundedRect(260, py, 760, ph, 16);
    panel.lineStyle(3, 0xffd166, 1).strokeRoundedRect(260, py, 760, ph, 16);
    root.add(panel);
    root.setAlpha(0);
    s.tweens.add({ targets: root, alpha: 1, duration: 350, delay: 900 });

    const winner = snap.players.find((p) => p.id === snap.winnerId);
    const title = winner ? `${winner.name} WINS!` : snap.timeLeftMs === 0 ? "TIME'S UP!" : 'NOBODY MADE IT!';
    const t = text(s, 640, py + 18, title, 38, winner ? winner.color : '#ffd166', 7).setOrigin(0.5, 0);
    if (t.width > 560) t.setScale(560 / t.width);
    root.add(t);
    if (winner) root.add(s.add.sprite(640 - t.displayWidth / 2 - 30, py + 40, fighterTexture(s, winner.color), 0).setScale(1.2));
    const hdrY = py + 74;
    root.add(text(s, 320, hdrY, 'PLAYER', 13, '#9d8cc4', 3));
    root.add(text(s, 590, hdrY, 'RUN', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    root.add(text(s, 680, hdrY, 'PENALTY', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    root.add(text(s, 770, hdrY, 'TOTAL', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    root.add(text(s, 870, hdrY, 'LIVES LOST', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    root.add(text(s, 965, hdrY, 'SMASHED', 13, '#9d8cc4', 3).setOrigin(0.5, 0));
    // the quickest run on the clock, whatever the penalties did to the places
    const fastest = Math.min(...snap.results.map((r) => r.rawMs ?? Infinity));
    const courseBest = store.records[levelAt(snap.level).id];
    rows.forEach((r, i) => {
      const y = hdrY + 24 + i * 34;
      if (r.id === selfId) {
        const hl = s.add.graphics();
        hl.fillStyle(0xffe066, 0.12).fillRoundedRect(276, y - 4, 728, 30, 6);
        root.add(hl);
      }
      root.add(text(s, 292, y, `${r.place}`, 18, r.timeMs !== null ? placeColor(r.place) : '#8a7fa0', 4).setOrigin(0.5, 0));
      root.add(s.add.circle(320, y + 11, 7, hexNum(r.color)).setStrokeStyle(2, 0x120a20));
      const nm = text(s, 334, y, r.name + (r.bot ? ' 🤖' : ''), 18, '#ffffff', 4);
      if (nm.width > 200) nm.setScale(200 / nm.width);
      root.add(nm);
      if (r.timeMs !== null && r.rawMs !== null) {
        // finishers: time on the clock, the penalty for lives lost, and the total they are ranked by
        const quickest = r.rawMs === fastest;
        root.add(text(s, 590, y, (quickest ? '⚡' : '') + raceTime(r.rawMs), 18, quickest ? '#ffe066' : '#e9e2ff', 4).setOrigin(0.5, 0));
        const pen = r.timeMs - r.rawMs;
        root.add(text(s, 680, y, pen > 0 ? `+${Math.round(pen / 1000)}s` : '—', 18, pen > 0 ? '#ff9d99' : '#8a7fa0', 4).setOrigin(0.5, 0));
        // a trophy on the time that is now the best this course has seen
        const record = courseBest !== undefined && r.timeMs === courseBest.timeMs && r.name === courseBest.name;
        root.add(text(s, 770, y, (record ? '🏆' : '') + raceTime(r.timeMs), 18, record ? '#ffe066' : '#7dffb0', 4).setOrigin(0.5, 0));
      } else {
        // everyone else: how far they got
        root.add(text(s, 590, y, '—', 18, '#8a7fa0', 4).setOrigin(0.5, 0));
        root.add(text(s, 680, y, '—', 18, '#8a7fa0', 4).setOrigin(0.5, 0));
        root.add(text(s, 770, y, `${r.progress}%`, 18, '#8a7fa0', 4).setOrigin(0.5, 0));
      }
      root.add(text(s, 870, y, String(r.deaths), 18, '#ff9d99', 4).setOrigin(0.5, 0));
      root.add(text(s, 965, y, String(r.smash), 18, '#ffe9b0', 4).setOrigin(0.5, 0));
    });
    root.add(text(s, 640, py + ph - 30, '', 15, '#c9b8e6', 3).setOrigin(0.5, 0).setName('foot'));
  }

  destroy(): void {
    for (const o of [this.timer, this.center, this.sub, this.status, this.track]) o.destroy();
    for (const r of this.feedRows) r.destroy();
    for (const c of this.cards.values()) c.root.destroy();
    for (const a of this.arrows.values()) a.destroy();
    this.results?.destroy();
  }
}

/** Small stable hash (spreads markers so they don't sit exactly on top of each other). */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
