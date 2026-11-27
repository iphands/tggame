/** A round being ridden: one canvas for the floor, a few floating labels over it, one frame loop. */
import { clock } from '@tggame/base/client/clock';
import { h, reducedMotion } from '@tggame/base/client/dom';
import { netMeterShown, setNetExtra } from '@tggame/base/client/netMeter';
import { BUST_COST, ERASE_FADE_MS, FLAG_BOOST, FLAG_BUST, FLAG_SLIP } from '../../../shared/src/constants';
import { DX, DY, arriveAndTurn, queueTurn, relative } from '../../../shared/src/sim';
import type { How } from '../../../shared/src/types';
import { VOID, drawBike, drawFloor, drawLine } from '../art';
import { buzz, sfx } from '../audio';
import { createInput } from '../input';
import { leadFor, patienceFor } from '../lead';
import { drawnX, drawnY, live, type BikeView, type LiveEvent } from '../live';
import { isSeated, player, send, store } from '../store';
import type { Screen } from './index';

type Spark = { x: number; y: number; vx: number; vy: number; at: number; life: number; color: string };

/** Cells are never drawn smaller than this; on a small screen the camera follows the bike instead. */
const MIN_CELL_PX = 9;
/** With no word from the server, bikes ride on by at most this many cells. */
const COAST_CELLS = 4;
/** Our own bike is put back where the server has it when it is this many cells off its place. */
const ADOPT_CELLS = 2.5;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export function playScreen(): Screen {
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  const board = h('div', { class: 'board' });
  const feed = h('div', { class: 'feed' });
  const count = h('div', { class: 'count' });
  const alarm = h('div', { class: 'alarm', hidden: true });
  const status = h('div', { class: 'watching', hidden: true });
  const fill = h('i');
  const bar = h('div', { class: 'energy' }, fill, h('b'));
  const boostBtn = h('button', { class: 'pad boost', type: 'button' }, 'BOOST', h('small', null, 'hold'));
  const bustBtn = h('button', { class: 'pad bust', type: 'button' }, 'BUST', h('small', null, 'half a bar'));
  const hud = h('div', { class: 'hud' }, h('div', { class: 'corner' }, board, feed), count, alarm, status, bar, boostBtn, bustBtn);
  const el = h('section', { class: 'screen play' }, canvas, hud);

  /**
   * The camera, in cells as they lie on the screen. On a tall screen the (wide) floor is shown
   * turned a quarter turn clockwise (`turned`), so a phone held upright sees as much of it as it can.
   */
  const view = { x: 0, y: 0, k: MIN_CELL_PX, cw: 1, ch: 1, follow: false, ready: false, turned: false };
  /** Where a spot on the floor lies on the screen, in cells. */
  const sx = (wx: number, wy: number): number => (view.turned ? live.h - wy : wx);
  const sy = (wx: number, wy: number): number => (view.turned ? wx : wy);
  const sparks: Spark[] = [];
  const calmMotion = reducedMotion();
  let raf = 0;
  let last = performance.now();
  let seenSnap = -1;
  let agreedAt = 0;
  /** The server's turn count when it last agreed with us, or last caught up by a turn. */
  let agreedTurns = 0;
  /** How far ahead of the snapshots our bike rides, in seconds (`lead.ts`); follows the line slowly. */
  let lead = leadFor(clock.rtt, clock.jitter);
  let shakeUntil = 0;
  let shakeBy = 0;
  let flashUntil = 0;
  let shownCount = -1;
  let shownAlarm = '';
  let goTimer = 0;
  let boardAt = 0;
  let watching = '';
  let outLine = '';

  const selfId = (): string => store.state?.selfId ?? '';
  const colorOf = (id: string): string => player(id)?.color ?? '#fff';
  const nameOf = (id: string): string => (id === selfId() ? 'You' : (player(id)?.name ?? 'Somebody'));
  /** Our own bike, while it is still riding. */
  const mine = (): BikeView | null => {
    const b = live.bikes.get(selfId());
    return b && !b.dead ? b : null;
  };

  live.selfId = isSeated() ? selfId() : '';

  // ---- steering

  /** Turn our bike to face `d` on the floor. */
  function turnTo(d: number): void {
    const me = mine();
    const at = me ? queueTurn(me, d) : 0;
    if (at) send({ type: 'turn', d, at });
  }
  const controls = {
    // a swipe or an arrow key points across the screen, which may not be how the floor lies
    face(d: number): void {
      turnTo(view.turned ? (d + 3) % 4 : d);
    },
    veer(side: -1 | 1): void {
      const me = mine();
      if (me) turnTo(relative(me, side));
    },
    boost(on: boolean): void {
      if (!store.state?.settings.boost || !mine()) return;
      send({ type: 'boost', on });
      boostBtn.classList.toggle('held', on);
      if (on) sfx.boost();
    },
    bust(): void {
      const me = mine();
      if (!store.state?.settings.bust || !me || store.state.phase !== 'play') return;
      if (me.energy < BUST_COST || me.flags & FLAG_BUST) return sfx.nope();
      send({ type: 'bust' });
    },
  };
  const input = createInput(el, controls);
  // pressed, not clicked: they must answer at once, and the press must not count as a tap on the floor
  boostBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    boostBtn.setPointerCapture(e.pointerId);
    controls.boost(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) boostBtn.addEventListener(type, () => controls.boost(false));
  bustBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    controls.bust();
  });

  // ---- things that happen on the floor

  function burst(x: number, y: number, color: string, n: number, speed: number): void {
    if (calmMotion) n = Math.ceil(n / 4);
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, at: now, life: 350 + Math.random() * 500, color: i % 3 === 0 ? '#fff' : color });
    }
  }

  function say(...parts: (string | HTMLElement)[]): void {
    const line = h('p', null, ...parts);
    feed.append(line);
    while (feed.children.length > 4) feed.firstElementChild!.remove();
    setTimeout(() => line.remove(), 5000);
  }
  const who = (id: string): HTMLElement => h('b', { style: `color:${colorOf(id)}` }, nameOf(id));

  /** What went wrong, said to the rider it went wrong for. */
  function epitaph(how: How, by: string): string {
    switch (how) {
      case 'wall':
        return pick(['You found the wall.', 'The wall did not move.', 'That was a wall.']);
      case 'own':
        return pick(['You lapped yourself.', 'That line was yours.', 'Own goal.']);
      case 'line':
        return `${nameOf(by)} got there first.`;
      case 'headon':
        return `You and ${nameOf(by)} wanted the same square.`;
      default:
        return '';
    }
  }

  function onEvent(e: LiveEvent): void {
    const me = selfId();
    if (e.kind === 'bust') return sfx.bust(e.id === me);
    if (e.kind === 'shrink') return sfx.shrink();
    const b = e.bike;
    const isMe = b.id === me;
    burst(b.x + 0.5 + DX[b.dir] * 0.5, b.y + 0.5 + DY[b.dir] * 0.5, colorOf(b.id), isMe ? 46 : 28, isMe ? 16 : 11);
    sfx.crash(isMe);
    if (!calmMotion) {
      shakeUntil = performance.now() + (isMe ? 420 : 180);
      shakeBy = isMe ? 9 : 3;
    }
    if (isMe) {
      buzz(220);
      flashUntil = performance.now() + 260;
      outLine = epitaph(e.how, e.by);
      boostBtn.classList.remove('held');
    } else if (e.by === me && e.how === 'line') sfx.point();
    switch (e.how) {
      case 'wall':
        say(who(b.id), pick([' found the wall', ' tested the wall. The wall won', ' ran out of floor']));
        break;
      case 'own':
        say(who(b.id), pick([b.id === me ? ' lapped yourself' : ' lapped themselves', ' tripped over that line again', ' scored an own goal']));
        break;
      case 'line':
        if (Math.random() < 0.5) say(who(e.by), pick([' cut off ', ' boxed in ', ' fenced off ']), who(b.id));
        else say(who(b.id), ' met a line of ', who(e.by));
        break;
      case 'headon':
        // one line for the pair
        if (b.id < e.by) say(who(b.id), ' and ', who(e.by), ' shared a square');
        break;
      case 'left':
        say(who(b.id), ' left the floor');
        break;
    }
    boardAt = 0;
  }
  live.onEvent = onEvent;

  // ---- riding between snapshots

  /** Our bike rides ahead of the server; this pulls the guess back in line with what the server says happened. */
  function reconcile(b: BikeView, now: number): void {
    const adopt = (): void => {
      b.x = b.sx;
      b.y = b.sy;
      b.dir = b.sdir;
      b.p = b.sp;
      b.turns = b.sturns;
      b.odo = b.sodo;
      b.pts = [...b.spts];
      b.queue.length = 0;
      agreedAt = now;
      agreedTurns = b.sturns;
      live.adopted++;
    };
    lead += (leadFor(clock.rtt, clock.jitter) - lead) * 0.05;
    if (netMeterShown()) setNetExtra('lead', `${(lead * 1000).toFixed(0)} ms · put back ${live.adopted}×`);
    if (b.pts === b.spts || b.snapNo <= 1) return adopt();
    const n = b.pts.length;
    const sn = b.spts.length;
    // turns we have made that the server has not got to yet: on a slow line there is nearly
    // always one, and a quick pair of turns makes it two
    const pending = b.turns - b.sturns;
    if (pending < 0) {
      // the server turned where we did not
      if (b.queue.length === 0) adopt();
      return;
    }
    // the last corner the server made must be the corner we made for that same turn
    const at = n - 2 - 2 * pending;
    if (at < 0 || b.pts[at] !== b.spts[sn - 2] || b.pts[at + 1] !== b.spts[sn - 1]) return adopt();
    if (pending === 0 && b.sdir !== b.dir) return adopt();
    if (pending === 0 || b.sturns !== agreedTurns) {
      // level with us, or one turn nearer to it
      agreedAt = now;
      agreedTurns = b.sturns;
    } else if (now - agreedAt > patienceFor(clock.rtt, clock.jitter)) {
      return adopt(); // it never made a turn we did
    }
    // where we should be (the server's bike, plus the lead) less where we are, along the line ridden
    const ahead = b.speed * lead;
    const gap = b.sodo + b.sp - (b.odo + b.p) + ahead;
    // too far ahead, or behind the server itself: start again from what it says
    if (gap < -ADOPT_CELLS || gap > ADOPT_CELLS + ahead) return adopt();
    b.p = Math.max(0, b.p + gap * 0.2);
  }

  function ride(now: number, dt: number): void {
    const me = live.selfId;
    const ease = Math.exp(-dt * 18);
    for (const b of live.bikes.values()) {
      if (b.dead) continue;
      b.ox *= ease;
      b.oy *= ease;
      if (b.id === me && b.snapNo !== seenSnap) {
        seenSnap = b.snapNo;
        reconcile(b, now);
      }
      if (b.speed <= 0 || b.coasted >= COAST_CELLS) continue;
      b.p += b.speed * dt;
      while (b.p >= 1) {
        b.p -= 1;
        b.x += DX[b.dir];
        b.y += DY[b.dir];
        b.coasted++;
        if (b.id !== me) b.odo++;
        else if (arriveAndTurn(b)) {
          b.turns++;
          b.pts.push(b.x, b.y);
          sfx.turn();
        }
      }
    }
  }

  // ---- camera

  function aimCamera(dt: number): void {
    const { cw, ch } = view;
    const turned = ch > cw * 1.15;
    if (turned !== view.turned) view.ready = false;
    view.turned = turned;
    const fw = turned ? live.h : live.w;
    const fh = turned ? live.w : live.h;
    const fit = Math.min(cw / (fw + 2), ch / (fh + 2));
    view.k = Math.max(fit, MIN_CELL_PX);
    view.follow = view.k > fit + 0.01;
    let tx = fw / 2;
    let ty = fh / 2;
    if (view.follow) {
      // our bike; once it is out, whoever we were already watching, or anybody still going
      let f = mine();
      if (!f) {
        const kept = live.bikes.get(watching);
        f = kept && !kept.dead ? kept : ([...live.bikes.values()].find((b) => !b.dead) ?? null);
        watching = f?.id ?? '';
      }
      if (f) {
        // a little ahead of the bike, so there is more to see of where it is going
        const ax = drawnX(f) + DX[f.dir] * 3;
        const ay = drawnY(f) + DY[f.dir] * 3;
        tx = sx(ax, ay);
        ty = sy(ax, ay);
      }
      const halfW = cw / view.k / 2;
      const halfH = ch / view.k / 2;
      tx = halfW * 2 >= fw + 2 ? fw / 2 : Math.min(fw + 1 - halfW, Math.max(halfW - 1, tx));
      ty = halfH * 2 >= fh + 2 ? fh / 2 : Math.min(fh + 1 - halfH, Math.max(halfH - 1, ty));
    }
    const pull = view.ready ? Math.min(1, dt * 5) : 1;
    view.x += (tx - view.x) * pull;
    view.y += (ty - view.y) * pull;
    view.ready = true;
  }

  // ---- drawing

  function draw(now: number, dt: number): void {
    const { cw, ch, k } = view;
    const dpr = canvas.width / cw;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, cw, ch);
    if (live.seq < 0) return;

    let jx = 0;
    let jy = 0;
    if (now < shakeUntil) {
      jx = (Math.random() - 0.5) * shakeBy;
      jy = (Math.random() - 0.5) * shakeBy;
    }
    const ox = cw / 2 - view.x * k + jx;
    const oy = ch / 2 - view.y * k + jy;
    if (view.turned) {
      ctx.setTransform(0, dpr * k, -dpr * k, 0, dpr * (ox + live.h * k), dpr * oy);
      drawFloor(ctx, live.w, live.h, live.blocks, live.ring, k, -oy / k, live.h - (cw - ox) / k, (ch - oy) / k, live.h + ox / k);
    } else {
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
      drawFloor(ctx, live.w, live.h, live.blocks, live.ring, k, -ox / k, -oy / k, (cw - ox) / k, (ch - oy) / k);
    }

    const me = selfId();
    for (const b of live.bikes.values()) {
      let alpha = b.dead ? 0.5 : 1;
      if (b.goneAt) {
        alpha *= 1 - (now - b.goneAt) / ERASE_FADE_MS;
        if (alpha <= 0) {
          live.bikes.delete(b.id);
          continue;
        }
      }
      drawLine(ctx, b.pts, drawnX(b), drawnY(b), colorOf(b.id), k, alpha);
    }
    for (const b of live.bikes.values()) {
      if (b.dead) continue;
      drawBike(ctx, drawnX(b), drawnY(b), b.dir, colorOf(b.id), k, {
        boost: !!(b.flags & FLAG_BOOST),
        bust: !!(b.flags & FLAG_BUST),
        slip: !!(b.flags & FLAG_SLIP),
        mine: b.id === me && live.cd > 0,
        t: now,
      });
    }

    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      const age = (now - s.at) / s.life;
      if (age >= 1) {
        sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.94;
      s.vy *= 0.94;
      const size = Math.max(0.3, 3 / k) * (1 - age);
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    // names over the bikes, and everything else that is measured in pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 12px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const b of live.bikes.values()) {
      if (b.dead) continue;
      const label = b.id === me ? (live.cd > 0 ? '▼ YOU' : '') : (player(b.id)?.name ?? '');
      if (!label) continue;
      ctx.fillStyle = b.id === me ? '#fff' : colorOf(b.id);
      ctx.globalAlpha = b.id === me ? 1 : 0.85;
      ctx.fillText(label, ox + sx(drawnX(b), drawnY(b)) * k, oy + sy(drawnX(b), drawnY(b)) * k - Math.max(k, 12) * 1.5);
    }
    ctx.globalAlpha = 1;
    if (view.follow) drawMap(me);
    if (now < flashUntil) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * ((flashUntil - now) / 260)})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  /** The whole floor, small, when the screen only shows part of it. */
  function drawMap(me: string): void {
    const fw = view.turned ? live.h : live.w;
    const fh = view.turned ? live.w : live.h;
    const m = Math.min(Math.min(150, view.cw * 0.34) / fw, 150 / fh);
    const mw = fw * m;
    const mh = fh * m;
    const mx = view.cw - mw - 8;
    const my = 8;
    const px = (wx: number, wy: number): number => mx + sx(wx, wy) * m;
    const py = (wx: number, wy: number): number => my + sy(wx, wy) * m;
    ctx.fillStyle = 'rgba(7, 4, 26, 0.8)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = 'rgba(124, 108, 255, 0.45)';
    for (const [bx, by, bw, bh] of live.blocks) {
      const x0 = px(bx, by + (view.turned ? bh : 0));
      ctx.fillRect(x0, py(bx, by), (view.turned ? bh : bw) * m, (view.turned ? bw : bh) * m);
    }
    ctx.lineJoin = 'round';
    for (const b of live.bikes.values()) {
      if (b.goneAt) continue;
      ctx.beginPath();
      ctx.moveTo(px(b.pts[0] + 0.5, b.pts[1] + 0.5), py(b.pts[0] + 0.5, b.pts[1] + 0.5));
      for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(px(b.pts[i] + 0.5, b.pts[i + 1] + 0.5), py(b.pts[i] + 0.5, b.pts[i + 1] + 0.5));
      const hx = px(drawnX(b), drawnY(b));
      const hy = py(drawnX(b), drawnY(b));
      ctx.lineTo(hx, hy);
      ctx.strokeStyle = colorOf(b.id);
      ctx.globalAlpha = b.dead ? 0.4 : 1;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (!b.dead) {
        ctx.fillStyle = b.id === me ? '#fff' : colorOf(b.id);
        ctx.fillRect(hx - 2, hy - 2, 4, 4);
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = live.ring > 0 ? '#ff3d6e' : '#7c6cff';
    ctx.strokeRect(mx + live.ring * m, my + live.ring * m, mw - live.ring * 2 * m, mh - live.ring * 2 * m);
    // what the screen is showing
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + (view.x - view.cw / view.k / 2) * m, my + (view.y - view.ch / view.k / 2) * m, (view.cw / view.k) * m, (view.ch / view.k) * m);
  }

  // ---- labels

  function labels(now: number): void {
    const s = store.state;
    if (!s) return;
    // countdown
    // counted on our own bike's timeline: it rides `lead` ahead of the snapshots, and starts there
    const c = live.cd > 0 ? Math.ceil(Math.max(0, live.cd - (now - live.stampedAt) - lead * 1000) / 1000) : 0;
    if (c !== shownCount) {
      if (c > 0) sfx.count();
      else if (shownCount > 0) sfx.go();
      count.replaceChildren(
        c > 0 ? h('span', null, c) : shownCount > 0 ? h('span', null, 'GO!') : '',
        c > 0 && s.round ? h('small', null, `Round ${s.round.no} · ${s.round.arena}`) : '',
      );
      clearTimeout(goTimer);
      if (c === 0) goTimer = window.setTimeout(() => count.replaceChildren(), 800);
      shownCount = c;
    }

    // the rim
    const calmLeft = live.calm - (live.cd > 0 ? 0 : now - live.stampedAt + lead * 1000);
    const warn = live.ring > 0 ? 'The walls are closing in!' : live.cd === 0 && calmLeft < 5000 && live.seq >= 0 ? `Walls close in ${Math.max(1, Math.ceil(calmLeft / 1000))}…` : '';
    if (warn !== shownAlarm) {
      if (warn && (!shownAlarm || live.ring === 1)) sfx.alarm();
      shownAlarm = warn;
      alarm.textContent = warn;
      alarm.hidden = !warn;
      alarm.classList.toggle('on', live.ring > 0);
    }

    // the bar and the two buttons
    const me = mine();
    const toys = s.settings.boost || s.settings.bust;
    bar.hidden = !me || !toys;
    boostBtn.hidden = !me || !s.settings.boost;
    bustBtn.hidden = !me || !s.settings.bust;
    if (me && toys) {
      fill.style.width = `${Math.round(me.energy * 100)}%`;
      bar.classList.toggle('half', s.settings.bust);
      bar.classList.toggle('low', me.energy < BUST_COST);
      bustBtn.classList.toggle('spent', me.energy < BUST_COST);
      bustBtn.classList.toggle('held', !!(me.flags & FLAG_BUST));
    }

    // who is watching what
    const seated = isSeated();
    const text = !seated ? 'Watching. You ride from the next round.' : !me && live.seq >= 0 && live.stampedAt ? `${outLine || 'You are out.'}${view.follow && watching ? ` Watching ${nameOf(watching)}.` : ''}` : '';
    if (status.textContent !== text) status.textContent = text;
    status.hidden = !text;

    if (now - boardAt > 300) {
      boardAt = now;
      const riders = s.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score);
      board.replaceChildren(
        ...riders.map((p) => {
          const b = live.bikes.get(p.id);
          const out = !b || b.dead;
          return h('span', { class: `${out ? 'out' : ''}${p.connected ? '' : ' away'}`, style: `--c:${p.color}` }, h('i'), p.id === s.selfId ? 'You' : p.name, h('b', null, p.score));
        }),
        s.round ? h('small', null, `first to ${s.round.target}`) : '',
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
    ride(now, dt);
    aimCamera(dt);
    draw(now, dt);
    labels(now);
  }
  raf = requestAnimationFrame(frame);

  return {
    el,
    update() {
      live.selfId = isSeated() ? selfId() : '';
      boardAt = 0;
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(goTimer);
      input.destroy();
      if (live.onEvent === onEvent) live.onEvent = null;
    },
  };
}
