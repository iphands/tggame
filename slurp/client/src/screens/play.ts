/** A course being played: one canvas for the table, a few floating labels over it, one frame loop. */
import { h } from '@tggame/base/client/dom';
import { lerp } from '@tggame/base/platformer/interp';
import {
  EXTRAS,
  FLAG_GRAVITY,
  FLAG_SLOW,
  FLAG_TURBO,
  GRAVITY_REACH,
  PRIZE,
  PULL_REACH,
  SPILL_PENALTY_MS,
  SWALLOW_MS,
  TIERS,
  speedFactor,
} from '../../../shared/src/constants';
import { canEat, massForRadius, massForTier, moveHole, tiersEdible } from '../../../shared/src/sim';
import { GRASS, POWER_NAMES, TIER_NAMES, drawBlanket, drawFood, drawHole, foodSprites } from '../art';
import { buzz, sfx } from '../audio';
import { createInput, type View } from '../input';
import { clockLeft, live, type FoodView, type LiveEvent } from '../live';
import { isSeated, player, send, store } from '../store';
import type { Screen } from './index';

type HoleView = { id: string; x: number; y: number; r: number; flags: number };
type Spark = { x: number; y: number; vx: number; vy: number; at: number; color: string };
type Float = { x: number; y: number; at: number; text: string };

const INK = '#1f2440';
/** Aim is sent at most this often. */
const AIM_EVERY_MS = 33;
/** How much grass the camera shows beyond the table's edge, in world units. */
const EDGE_VIEW = 70;
/** Minimap dot colours, by tier. */
const DOT = ['#ff5d73', '#c98b4a', '#e9c46a', '#c0304a', '#2f9e44', '#c97a2b', '#ffd23f', '#8e44d9'];

export function playScreen(): Screen {
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  const clock = h('div', { class: 'clock' }, '');
  const left = h('div', { class: 'left' });
  const team = h('div', { class: 'team' });
  const nextIcon = h('canvas', { width: 60, height: 60 });
  const bar = h('i');
  const growText = h('span');
  const grow = h('div', { class: 'grow' }, growText, nextIcon, h('span', { class: 'bar' }, bar));
  const count = h('div', { class: 'count' });
  const watching = h('div', { class: 'watching' }, 'Watching. You get a hole on the next course.');
  // the power this hole is carrying, and the button that sets it off
  const use = h('button', { class: 'btn use', type: 'button', hidden: true });
  const effects = h('div', { class: 'effects' });
  const fire = (): void => {
    if (!use.hidden) send({ type: 'use' });
  };
  // pressed, not clicked: it must answer at once, and the press must not start steering the hole
  use.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    fire();
  });
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'Space' || ev.code === 'Enter') {
      ev.preventDefault();
      fire();
    }
  };
  window.addEventListener('keydown', onKey);
  const hud = h('div', { class: 'hud' }, team, clock, left, count, effects, grow, use, watching);
  const el = h('section', { class: 'screen play' }, canvas, hud);

  const input = createInput(el);
  const view: View = { x: 0, y: 0, scale: 1, cw: 1, ch: 1 };
  /** Our own hole, moved here ahead of the server so it answers the finger at once. */
  const self = { x: 0, y: 0, ax: 0, ay: 0, r: 0, ready: false };
  const pulses = new Map<string, number>();
  const sparks: Spark[] = [];
  const floats: Float[] = [];
  const byTier: FoodView[][] = [...TIERS, ...EXTRAS].map(() => []);
  let holes: HoleView[] = [];
  let raf = 0;
  let last = performance.now();
  let lastAimAt = 0;
  let sentX = Infinity;
  let sentY = Infinity;
  let edible = 0;
  let shownCount = -1;
  let shownSecond = -1;
  let shownIcon = -1;
  /** Until when the grow badge announces the food just unlocked, instead of the next one. */
  let unlockedUntil = 0;
  let unlockedName = '';
  let shownHeld = -1;
  let shownFlags = -1;
  let goTimer = 0;
  let camReady = false;
  let teamAt = 0;

  // ---- things that happen on the table

  const selfId = (): string => store.state?.selfId ?? '';
  const colorOf = (id: string): string => player(id)?.color ?? '#fff';

  /** Text is only touched when it changes: this runs every frame. */
  function setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  function onEvent(e: LiveEvent): void {
    if (e.kind === 'power') {
      const mine = e.hole === selfId();
      pulses.set(e.hole, 1);
      sfx.power(mine);
      if (mine) buzz(50);
      const at = holes.find((o) => o.id === e.hole);
      if (at) floats.push({ x: at.x, y: at.y - at.r, at: performance.now(), text: POWER_NAMES[e.power] ?? '' });
    } else if (e.kind === 'eat' && e.food.tier >= TIERS.length) {
      // a prize box or a rotten fish
      pulses.set(e.hole, 1);
      if (e.hole !== selfId()) return;
      if (e.food.tier === PRIZE) {
        sfx.prize();
        buzz(30);
        floats.push({ x: e.food.x, y: e.food.y, at: performance.now(), text: 'Prize!' });
      } else {
        sfx.yuck();
        buzz(120);
        floats.push({ x: e.food.x, y: e.food.y, at: performance.now(), text: 'Yuck! Slowed…' });
      }
    } else if (e.kind === 'eat') {
      const mine = e.hole === selfId();
      pulses.set(e.hole, 1);
      sfx.gulp(e.food.tier, mine);
      if (mine) buzz(e.food.tier >= 3 ? 25 : 8);
      const n = 2 + e.food.tier;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 110;
        sparks.push({ x: e.food.x, y: e.food.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, at: performance.now(), color: colorOf(e.hole) });
      }
    } else if (e.kind === 'spill') {
      sfx.spill();
      floats.push({ x: e.food.x, y: e.food.y, at: performance.now(), text: `−${SPILL_PENALTY_MS / 1000}s` });
      clock.classList.remove('hit');
      void clock.offsetWidth;
      clock.classList.add('hit');
      if (e.by === selfId()) buzz(60);
    } else sfx.plop();
  }
  live.onEvent = onEvent;

  // ---- one frame

  function holesNow(now: number): HoleView[] {
    const br = live.buffer.bracket(now);
    if (!br) return [];
    return br.b.holes.map(([id, x, y, r, flags]) => {
      const a = br.a.holes.find((o) => o[0] === id);
      return a ? { id, x: lerp(a[1], x, br.alpha), y: lerp(a[2], y, br.alpha), r: lerp(a[3], r, br.alpha), flags } : { id, x, y, r, flags };
    });
  }

  function steer(now: number, dt: number): void {
    const id = selfId();
    const shown = holes.find((o) => o.id === id);
    const latest = live.buffer.latest?.holes.find((o) => o[0] === id);
    if (!shown || !latest || !live.w) {
      self.ready = false;
      return;
    }
    if (!self.ready || Math.hypot(latest[1] - self.x, latest[2] - self.y) > 160) {
      self.x = self.ax = latest[1];
      self.y = self.ay = latest[2];
      self.ready = true;
      input.reset();
    }
    self.r = shown.r;
    const aim = input.aim(self, view);
    self.ax = Math.min(live.w, Math.max(0, aim.x));
    self.ay = Math.min(live.h, Math.max(0, aim.y));
    // slowed or boosted exactly as the server moves it, so the prediction stays true
    moveHole(self, live.w, live.h, dt, speedFactor(latest[4]));
    // the server has the last word; lean toward it gently so a lost message cannot leave us adrift
    const pull = Math.min(1, dt * 1.5);
    self.x += (latest[1] - self.x) * pull;
    self.y += (latest[2] - self.y) * pull;
    shown.x = self.x;
    shown.y = self.y;

    if (now - lastAimAt >= AIM_EVERY_MS && (Math.abs(self.ax - sentX) > 0.5 || Math.abs(self.ay - sentY) > 0.5)) {
      lastAimAt = now;
      sentX = self.ax;
      sentY = self.ay;
      send({ type: 'aim', x: Math.round(sentX * 10) / 10, y: Math.round(sentY * 10) / 10 });
    }
  }

  function aimCamera(dt: number): void {
    let scale: number;
    let x: number;
    let y: number;
    if (self.ready) {
      // the bigger the hole, the more of the table it gets to see
      scale = Math.sqrt(view.cw * view.ch) / (1.15 * (400 + 6 * self.r));
      x = self.x;
      y = self.y;
    } else {
      scale = Math.min(view.cw / (live.w + 80), view.ch / (live.h + 80));
      x = live.w / 2;
      y = live.h / 2;
    }
    if (!camReady) {
      view.scale = scale;
      camReady = true;
    } else view.scale += (scale - view.scale) * Math.min(1, dt * 2.5);
    // near an edge the camera stops short, so the screen shows table rather than grass
    const halfW = view.cw / 2 / view.scale;
    const halfH = view.ch / 2 / view.scale;
    view.x = live.w + 2 * EDGE_VIEW > 2 * halfW ? Math.min(live.w + EDGE_VIEW - halfW, Math.max(halfW - EDGE_VIEW, x)) : live.w / 2;
    view.y = live.h + 2 * EDGE_VIEW > 2 * halfH ? Math.min(live.h + EDGE_VIEW - halfH, Math.max(halfH - EDGE_VIEW, y)) : live.h / 2;
  }

  function draw(now: number, dt: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { cw, ch, scale } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, cw, ch);
    if (!live.w) return;
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    const x0 = view.x - cw / 2 / scale;
    const x1 = view.x + cw / 2 / scale;
    const y0 = view.y - ch / 2 / scale;
    const y1 = view.y + ch / 2 / scale;
    drawBlanket(ctx, live.w, live.h, x0, y0, x1, y1);

    const me = self.ready ? self : null;
    for (const o of holes) {
      const p = pulses.get(o.id) ?? 0;
      if (p > 0) pulses.set(o.id, Math.max(0, p - dt * 4));
      drawHole(ctx, o.x, o.y, o.r, colorOf(o.id), p);
      if (o.flags) drawEffects(o, now);
    }

    // food, small under big, each easing to where the server has it
    for (const list of byTier) list.length = 0;
    const ease = Math.min(1, dt * 22);
    for (const f of live.foods.values()) {
      if (f.state === 'on') {
        f.x += (f.tx - f.x) * ease;
        f.y += (f.ty - f.y) * ease;
        if (f.nudge > 0) f.nudge = Math.max(0, f.nudge - dt * 2.5);
      } else if (now - f.at >= (f.state === 'eaten' ? SWALLOW_MS : 420)) {
        live.foods.delete(f.id);
        continue;
      }
      if (f.x + f.r + 8 < x0 || f.x - f.r - 8 > x1 || f.y + f.r + 8 < y0 || f.y - f.r - 8 > y1) continue;
      byTier[f.tier].push(f);
    }
    for (const list of byTier) {
      for (const f of list) {
        // every piece lies at its own angle; round food at any angle, the rest only a little askew
        const lie = f.tier === 0 || f.tier === 2 || f.tier >= TIERS.length ? (((f.id * 53) % 100) / 100 - 0.5) * 0.9 : (f.id * 2.399) % 6.283;
        const turn = lie + Math.sin(now / 70 + f.id) * 0.16 * f.nudge;
        if (f.state === 'on') {
          const age = (now - f.at) / 260;
          if (age < 1) {
            // dropped back onto the blanket
            ctx.globalAlpha = age;
            drawFood(ctx, f.tier, f.x, f.y, 1.7 - 0.7 * age, turn);
            ctx.globalAlpha = 1;
          } else drawFood(ctx, f.tier, f.x, f.y, f.tier === PRIZE ? 1 + 0.12 * Math.sin(now / 180 + f.id) : 1, turn);
          if (me && !canEat(me.r, f.r) && Math.hypot(f.x - me.x, f.y - me.y) < me.r + f.r + 22) {
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r + 5, 0, Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.setLineDash([9, 7]);
            ctx.lineDashOffset = -now / 40;
            ctx.strokeStyle = '#ff5d73';
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (f.state === 'eaten') {
          const t = (now - f.at) / SWALLOW_MS;
          const to = holes.find((o) => o.id === f.by);
          const k = t * t;
          drawFood(ctx, f.tier, to ? lerp(f.x, to.x, k) : f.x, to ? lerp(f.y, to.y, k) : f.y, 1 - 0.85 * t, turn + t * 2);
        } else {
          const t = (now - f.at) / 420;
          ctx.globalAlpha = 1 - t;
          drawFood(ctx, f.tier, f.x, f.y, 1 - 0.7 * t, turn + t * 3);
          ctx.globalAlpha = 1;
        }
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      const t = (now - s.at) / 380;
      if (t >= 1) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(s.x + s.vx * t * 0.38, s.y + s.vy * t * 0.38, 3.2 * (1 - t) + 1, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // everything below is drawn in screen pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (x: number): number => (x - view.x) * scale + cw / 2;
    const sy = (y: number): number => (y - view.y) * scale + ch / 2;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = "16px 'Patrick Hand', cursive";
    const id = selfId();
    for (const o of holes) {
      if (o.id === id) continue;
      const px = sx(o.x);
      const py = sy(o.y);
      const off = px < 0 || py < 0 || px > cw || py > ch;
      if (off) {
        // a teammate out of sight: point the way from the edge of the screen
        const a = Math.atan2(py - ch / 2, px - cw / 2);
        const ex = Math.min(cw - 18, Math.max(18, px));
        const ey = Math.min(ch - 18, Math.max(18, py));
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-8, -9);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fillStyle = colorOf(o.id);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const name = player(o.id)?.name ?? '';
      const ty = py - o.r * scale - 9;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,250,240,.9)';
      ctx.strokeText(name, px, ty);
      ctx.fillStyle = INK;
      ctx.fillText(name, px, ty);
    }
    ctx.font = "26px 'Chewy', cursive";
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      const t = (now - f.at) / 1100;
      if (t >= 1) {
        floats.splice(i, 1);
        continue;
      }
      const px = Math.min(cw - 30, Math.max(30, sx(f.x)));
      const py = Math.min(ch - 30, Math.max(60, sy(f.y))) - t * 40;
      ctx.globalAlpha = 1 - t * t;
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(f.text, px, py);
      ctx.fillStyle = '#ff5d73';
      ctx.fillText(f.text, px, py);
    }
    ctx.globalAlpha = 1;
    drawMap(x0, y0, x1, y1);
  }

  /** Rings round a hole for whatever is acting on it. */
  function drawEffects(o: HoleView, now: number): void {
    ctx.lineCap = 'round';
    if (o.flags & FLAG_GRAVITY) {
      // how far the pull reaches, slowly turning inwards
      const reach = o.r * (1 + PULL_REACH * GRAVITY_REACH);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(142,68,217,.55)';
      for (let i = 0; i < 3; i++) {
        const k = ((now / 900 + i / 3) % 1 + 1) % 1;
        ctx.globalAlpha = k;
        ctx.setLineDash([14, 12]);
        ctx.lineDashOffset = now / 30;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r + (reach - o.r) * (1 - k), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
    if (o.flags & FLAG_TURBO) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffb000';
      ctx.setLineDash([10, 9]);
      ctx.lineDashOffset = -now / 12;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (o.flags & FLAG_SLOW) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(122,154,58,.9)';
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 16) {
        const rr = o.r + 6 + Math.sin(a * 6 + now / 220) * 3;
        ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
  }

  /** The whole table in the top right corner, once it no longer fits on the screen. */
  function drawMap(x0: number, y0: number, x1: number, y1: number): void {
    if (x0 <= 0 && y0 <= 0 && x1 >= live.w && y1 >= live.h) return;
    const mw = Math.min(140, view.cw * 0.28);
    const k = mw / live.w;
    const mh = live.h * k;
    const ox = view.cw - mw - 8;
    const oy = 8;
    ctx.fillStyle = 'rgba(255,247,234,.88)';
    ctx.fillRect(ox, oy, mw, mh);
    for (const f of live.foods.values()) {
      if (f.state !== 'on') continue;
      const s = Math.max(1.5, f.r * k);
      ctx.fillStyle = DOT[f.tier];
      ctx.fillRect(ox + f.x * k - s, oy + f.y * k - s, s * 2, s * 2);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(31,36,64,.5)';
    ctx.strokeRect(ox + Math.max(0, x0) * k, oy + Math.max(0, y0) * k, (Math.min(live.w, x1) - Math.max(0, x0)) * k, (Math.min(live.h, y1) - Math.max(0, y0)) * k);
    for (const o of holes) {
      ctx.beginPath();
      ctx.arc(ox + o.x * k, oy + o.y * k, Math.max(3, o.r * k), 0, Math.PI * 2);
      ctx.fillStyle = colorOf(o.id);
      ctx.fill();
      ctx.lineWidth = o.id === selfId() ? 2.5 : 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.strokeRect(ox, oy, mw, mh);
  }

  function labels(now: number): void {
    const s = store.state;
    if (!s) return;
    // countdown
    const c = live.cd > 0 ? Math.ceil(live.cd / 1000) : 0;
    if (c !== shownCount) {
      if (c > 0) sfx.count();
      else if (shownCount > 0) sfx.go();
      count.replaceChildren(c > 0 ? h('span', null, c) : shownCount > 0 ? h('span', null, 'Slurp!') : '');
      clearTimeout(goTimer);
      if (c === 0) goTimer = window.setTimeout(() => count.replaceChildren(), 850);
      shownCount = c;
    }
    // clock
    const ms = clockLeft(now);
    const second = Math.ceil(ms / 1000);
    if (second !== shownSecond) {
      shownSecond = second;
      clock.textContent = `${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}`;
      const low = second <= 10 && live.cd === 0;
      clock.classList.toggle('low', low);
      if (low && second > 0 && s.phase === 'play') sfx.tick();
    }
    left.textContent = live.n === 1 ? 'Last one!' : `${live.n} to go`;

    // what our hole can eat, and how far off the next size is
    const tiers = s.course?.tiers ?? TIERS.length;
    grow.hidden = !self.ready;
    if (self.ready) {
      const can = Math.min(tiers, tiersEdible(self.r));
      if (can > edible && edible > 0) {
        sfx.grow();
        buzz(40);
        // said in the badge at the bottom of the screen, so nothing ever covers the table
        unlockedName = TIER_NAMES[can - 1];
        unlockedUntil = performance.now() + 2500;
        grow.classList.remove('bump');
        void grow.offsetWidth;
        grow.classList.add('bump');
      }
      edible = can;
      const done = can >= tiers;
      nextIcon.hidden = bar.parentElement!.hidden = done;
      const fresh = performance.now() < unlockedUntil;
      grow.classList.toggle('fresh', fresh);
      setText(growText, fresh ? `${unlockedName[0].toUpperCase()}${unlockedName.slice(1)} unlocked!` : done ? 'You can eat everything!' : 'Next');
      if (!done) {
        if (shownIcon !== can) {
          shownIcon = can;
          const ic = nextIcon.getContext('2d')!;
          ic.clearRect(0, 0, 60, 60);
          const sprite = foodSprites()[can];
          ic.drawImage(sprite.img, 0, 0, 60, 60);
        }
        const from = massForTier(can - 1);
        const share = (massForRadius(self.r) - from) / (massForTier(can) - from);
        bar.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
      }
    }

    // the Use button and what is acting on our hole, from the newest snapshot
    const mine = live.buffer.latest?.holes.find((o) => o[0] === s.selfId);
    const held = s.phase === 'play' && mine ? mine[5] : 0;
    const flags = mine ? mine[4] : 0;
    if (held !== shownHeld) {
      shownHeld = held;
      use.hidden = held === 0;
      if (held) {
        use.replaceChildren(h('small', null, 'USE'), POWER_NAMES[held - 1]);
        use.classList.remove('bump');
        void use.offsetWidth;
        use.classList.add('bump');
      }
    }
    if (flags !== shownFlags) {
      shownFlags = flags;
      const chips: HTMLElement[] = [];
      if (flags & FLAG_SLOW) chips.push(h('span', { class: 'bad' }, '🤢 Slowed'));
      if (flags & FLAG_GRAVITY) chips.push(h('span', null, POWER_NAMES[0]));
      if (flags & FLAG_TURBO) chips.push(h('span', null, POWER_NAMES[1]));
      effects.replaceChildren(...chips);
    }

    if (now - teamAt > 250) {
      teamAt = now;
      team.replaceChildren(
        ...s.players
          .filter((p) => !p.spectator)
          .map((p) => h('span', { class: p.connected ? '' : 'away', style: `--c:${p.color}` }, h('i'), p.id === s.selfId ? 'You' : p.name, h('b', null, live.eaten.get(p.id) ?? 0))),
      );
    }
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    view.cw = cw;
    view.ch = ch;
    holes = holesNow(now);
    steer(now, dt);
    aimCamera(dt);
    draw(now, dt);
    labels(now);
  }
  raf = requestAnimationFrame(frame);

  return {
    el,
    update() {
      watching.hidden = isSeated();
      teamAt = 0;
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      clearTimeout(goTimer);
      input.destroy();
      if (live.onEvent === onEvent) live.onEvent = null;
    },
  };
}
