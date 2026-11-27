/** A round being played: one canvas for the house, a few floating labels over it, one frame loop. */
import { clock as netClock } from '@tggame/base/client/clock';
import { h, reducedMotion } from '@tggame/base/client/dom';
import { netMeterShown, setNetExtra } from '@tggame/base/client/netMeter';
import { lerp } from '@tggame/base/platformer/interp';
import {
  BEAST_BOOST_COOLDOWN_MS,
  BEAST_BOOST_MS,
  DASH_COOLDOWN_MS,
  DASH_MS,
  DREAD_STEPS,
  ENERGY_MAX,
  ENERGY_TO_START,
  EXIT_R,
  F_BEAST,
  F_BOOST,
  F_CONVERT,
  F_DASH,
  F_HELD,
  F_OUT,
  F_PORTAL,
  F_WORK,
  NOISE_SHOW_MS,
  SIGHT_R,
  TASK_R,
  TILE,
} from '../../../shared/src/constants';
import { MAP, roomAt, wallAt } from '../../../shared/src/map';
import { moveBody, rayDist, sees, speedOf } from '../../../shared/src/sim';
import type { Fx } from '../../../shared/src/types';
import { INK, NIGHT, drawBody, drawExit, drawHouse, drawPill, drawPortal, drawTask } from '../art';
import { buzz, sfx } from '../audio';
import { createInput } from '../input';
import { clockLeft, countdownLeft, live } from '../live';
import { noteStick, predictBody, type SentStick } from '../predict';
import { isSeated, nameOf, player, send, store } from '../store';
import type { Screen } from './index';

type BodyView = { id: string; x: number; y: number; flags: number; facing: number };
type Float = { x: number; y: number; at: number; text: string };

/** The drawn body jumps to the forecast when it is this far from it (a Beast door, a new round). */
const SNAP_UNITS = 120;
/** The stick is sent at most this often; buttons go at once. */
const SEND_EVERY_MS = 33;
/** And at least this often, so a reconnected socket soon knows where the stick is. */
const RESEND_MS = 1000;
/** Rays cast for the edge of what we can see. */
const RAYS = 360;
/** How far light spills into a wall, so its face is lit. */
const WALL_GLOW = 18;
const FOG = 'rgba(8,6,16,0.74)';
/** Minimap pixels per square. */
const MINI = 4;

export function playScreen(): Screen {
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  const clock = h('div', { class: 'clock' }, '');
  const sides = h('div', { class: 'sides' });
  const role = h('div', { class: 'role' });
  const chores = h('div', { class: 'chores' });
  /** A red edge to the screen that closes in as a Beast nears a Cousin. */
  const dreadEl = h('div', { class: 'dread' });
  const watching = h('div', { class: 'watching', hidden: true });
  const boostFill = h('i');
  const boostPad = h('button', { class: 'pad boost', type: 'button' }, boostFill, h('span', null, 'BOOST'), h('small', null, 'Space'));
  const actFill = h('i');
  const actText = h('span', null, 'DASH');
  const actPad = h('button', { class: 'pad act', type: 'button' }, actFill, actText, h('small', null, 'E'));
  const mini = h('canvas', { class: 'minimap', width: MAP.cols * MINI, height: MAP.lines * MINI });
  const hud = h('div', { class: 'hud' }, dreadEl, sides, clock, role, chores, watching, mini, boostPad, actPad);
  const el = h('section', { class: 'screen play' }, canvas, hud);

  const input = createInput(el, boostPad, actPad);
  const view = { x: MAP.w / 2, y: MAP.h / 2, scale: 1, cw: 1, ch: 1 };
  /** Our own body, moved here ahead of the server so it answers the thumb at once. */
  const self = { x: 0, y: 0, ready: false };
  /** The stick positions sent lately: the body is carried forward through them from each snapshot. */
  const sticks: SentStick[] = [];
  const sent = { x: 0, y: 0, boost: false, act: false, at: 0 };
  const floats: Float[] = [];
  /** How brightly each Beast door is flaring, 0 to 1. */
  const flares = MAP.portals.map(() => 0);
  let bodies: BodyView[] = [];
  let raf = 0;
  let last = performance.now();
  let camReady = false;
  let cousinBoost = false;
  let burstUntil = 0;
  let dashUntil = 0;
  let actWas = false;
  let boostWas = false;
  let shownSecond = -1;
  let shownCount = -1;
  /** The news showing in the one line of words at the top, what kind it is, and until when. */
  let news = '';
  let newsKind = 'news';
  let newsUntil = 0;
  let heartAt = 0;
  let heartStep = 0;
  /** How near a Beast feels, 0 to 1: eased toward what the server says, so the red creeps rather than steps. */
  let dread = 0;
  let shownDread = -1;
  let crankAt = 0;
  let miniAt = 0;
  let hudAt = 0;
  /** How far the drawn body was from the forecast, smoothed, for the net graph. */
  let offBy = 0;
  let shake = 0;

  // the walls of the minimap never change: draw them once
  const miniWalls = document.createElement('canvas');
  miniWalls.width = mini.width;
  miniWalls.height = mini.height;
  {
    const m = miniWalls.getContext('2d')!;
    m.fillStyle = 'rgba(244,236,216,0.16)';
    m.fillRect(0, 0, mini.width, mini.height);
    m.fillStyle = 'rgba(12,10,20,0.9)';
    for (let r = 0; r < MAP.lines; r++) for (let c = 0; c < MAP.cols; c++) if (wallAt(MAP, c, r)) m.fillRect(c * MINI, r * MINI, MINI, MINI);
  }

  // ---- what we know

  const selfId = (): string => store.state?.selfId ?? '';
  const colorOf = (id: string): string => player(id)?.color ?? '#fff';
  const sideOf = (id: string): string | undefined => store.state?.round?.sides[id];
  const who = (id: string): string => (id === selfId() ? 'You' : nameOf(id));
  const escape = (): boolean => store.state?.round?.mode === 'escape';
  const exitsOpen = (): boolean => live.tasks.length > 0 && live.tasks.every((p) => p >= 100);

  /** Text is only touched when it changes: this runs every frame. */
  function setText(node: HTMLElement, text: string): void {
    if (node.textContent !== text) node.textContent = text;
  }

  /**
   * Put a piece of news in the line of words at the top. There is only the one line: news takes
   * the place of whatever was there, and when it has had its time the line goes back to saying
   * what you are. Nothing is ever written over the middle of the screen.
   */
  function say(text: string, ms = 3500, kind = 'news'): void {
    news = text;
    newsKind = kind;
    newsUntil = performance.now() + ms;
  }

  // ---- things that happen in the house

  function onEvent(e: Fx): void {
    const me = selfId();
    switch (e[0]) {
      case 'c': {
        const mine = e[2] === me;
        sfx.caught(mine);
        say(e[1] ? `${who(e[2])} ${mine ? 'were' : 'was'} caught by ${who(e[1]).replace(/^You$/, 'you')}!` : `${who(e[2])} turned into a Beast!`);
        floats.push({ x: e[3], y: e[4] - 24, at: performance.now(), text: 'Caught!' });
        if (mine) {
          buzz(250);
          if (!reducedMotion()) shake = 1;
          say('Caught! You are a Hilder Beast now', 2600, 'beast');
        } else if (e[1] === me) buzz(60);
        break;
      }
      case 'b':
        if (e[1] === me) {
          sfx.turned();
          say('Go and catch your cousins!');
        }
        break;
      case 'l':
        sfx.lunge(e[1] === me);
        break;
      case 'p':
        if (e[2] === me) {
          sfx.pill();
          buzz(10);
        }
        break;
      case 't':
        flares[e[2]] = flares[e[3]] = 1;
        if (e[1] === me || sideOf(me) !== 'b') sfx.portal();
        break;
      case 'n':
        sfx.noise();
        say(`A noise from the ${roomAt(MAP, e[1], e[2]).name}…`, NOISE_SHOW_MS);
        break;
      case 'h':
        sfx.heard();
        say('The Beasts heard that!', 2000);
        break;
      case 'd': {
        sfx.done();
        const doneNow = live.tasks.filter((p) => p >= 100).length;
        say(`A chore is done: ${doneNow} of ${live.tasks.length}`);
        break;
      }
      case 'o':
        sfx.doors();
        say(sideOf(me) === 'b' ? 'The exits are open. Guard them!' : 'The exits are open. Get out!', 4000, 'open');
        break;
      case 'x':
        say(`${who(e[1])} got out!`);
        break;
    }
  }
  live.onEvent = onEvent;

  // ---- one frame

  function bodiesNow(now: number): BodyView[] {
    const br = live.buffer.bracket(now);
    if (!br) return [];
    return br.b.bodies.map(([id, x, y, flags, facing]) => {
      const a = br.a.bodies.find((o) => o[0] === id);
      // a big jump is a trip through a Beast door: do not smear it across the house
      const near = a && Math.abs(a[1] - x) < SNAP_UNITS && Math.abs(a[2] - y) < SNAP_UNITS;
      return near ? { id, x: lerp(a[1], x, br.alpha), y: lerp(a[2], y, br.alpha), flags, facing: facing / 100 } : { id, x, y, flags, facing: facing / 100 };
    });
  }

  function steer(now: number, dt: number): void {
    const id = selfId();
    const shown = bodies.find((o) => o.id === id);
    const latest = live.buffer.latest?.bodies.find((o) => o[0] === id);
    if (!shown || !latest || latest[3] & F_OUT) {
      self.ready = false;
      return;
    }
    const ctl = input.read();
    const moving = ctl.x !== 0 || ctl.y !== 0;
    // our own boost starts the moment the button goes down, not a round trip later
    let flags = latest[3];
    if (flags & F_BEAST) {
      const free = !(flags & (F_HELD | F_CONVERT | F_PORTAL));
      if (ctl.act && !actWas && free && (live.me?.[2] ?? 1) <= 0) dashUntil = now + Math.min(DASH_MS, netClock.rtt + 200);
      if (now < dashUntil && free) flags |= F_DASH;
      if (ctl.boost && !boostWas && free && (live.me?.[1] ?? 1) <= 0) {
        burstUntil = now + Math.min(BEAST_BOOST_MS, netClock.rtt + 200);
        sfx.burst();
      }
      if (now < burstUntil && free) flags |= F_BOOST;
    } else {
      const energy = live.me?.[0] ?? 0;
      const was = cousinBoost;
      cousinBoost = ctl.boost && (cousinBoost ? energy > 0 : energy >= ENERGY_TO_START);
      if (cousinBoost && !was && moving) sfx.dash();
      if (ctl.boost && !boostWas && !cousinBoost) sfx.empty();
      flags = cousinBoost && moving ? flags | F_BOOST : flags & ~F_BOOST;
    }
    boostWas = ctl.boost;
    actWas = ctl.act;

    const speed = speedOf(flags);
    // while the server holds the body (the den, a Beast door, turning) we only follow
    const steering = speed > 0;
    const ahead = steering ? predictBody({ x: latest[1], y: latest[2] }, live.stampedAt, netClock.rtt, sticks, now, speed, MAP) : { x: latest[1], y: latest[2] };
    const off = Math.hypot(ahead.x - self.x, ahead.y - self.y);
    if (!self.ready || off > SNAP_UNITS) {
      self.x = ahead.x;
      self.y = ahead.y;
      if (!self.ready) sticks.length = 0;
      self.ready = true;
    }
    if (steering) moveBody(self, ctl.x * speed * dt, ctl.y * speed * dt, MAP);
    // the server has the last word: close on the forecast, which is its word carried forward
    const pull = Math.min(1, dt * (steering ? 8 : 20));
    self.x += (ahead.x - self.x) * pull;
    self.y += (ahead.y - self.y) * pull;
    shown.x = self.x;
    shown.y = self.y;
    shown.flags = flags;
    if (moving && steering) shown.facing = Math.atan2(ctl.y, ctl.x);
    offBy += (off - offBy) * 0.05;
    if (netMeterShown()) {
      setNetExtra('body', `off by ${offBy.toFixed(1)}`);
      setNetExtra('others', `${live.buffer.delayMs.toFixed(0)} ms behind`);
    }

    const buttons = ctl.boost !== sent.boost || ctl.act !== sent.act;
    const stick = ctl.x !== sent.x || ctl.y !== sent.y;
    if (buttons || (stick && now - sent.at >= SEND_EVERY_MS) || now - sent.at >= RESEND_MS) {
      Object.assign(sent, ctl, { at: now });
      send({ type: 'in', x: ctl.x, y: ctl.y, b: ctl.boost ? 1 : 0, a: ctl.act ? 1 : 0 });
      noteStick(sticks, { at: now, x: ctl.x, y: ctl.y });
    }
  }

  function aimCamera(dt: number): void {
    let scale: number;
    let x: number;
    let y: number;
    if (self.ready) {
      // enough to see as far as the eye does along the long side of the screen
      scale = Math.max(view.cw, view.ch) / (SIGHT_R * 2.3);
      x = self.x;
      y = self.y;
    } else {
      scale = Math.min(view.cw / MAP.w, view.ch / MAP.h);
      x = MAP.w / 2;
      y = MAP.h / 2;
    }
    if (!camReady) {
      view.scale = scale;
      camReady = true;
    } else view.scale += (scale - view.scale) * Math.min(1, dt * 3);
    // at the edge of the house the camera stops short, so the screen shows house rather than night
    const halfW = view.cw / 2 / view.scale;
    const halfH = view.ch / 2 / view.scale;
    view.x = MAP.w > 2 * halfW ? Math.min(MAP.w - halfW, Math.max(halfW, x)) : MAP.w / 2;
    view.y = MAP.h > 2 * halfH ? Math.min(MAP.h - halfH, Math.max(halfH, y)) : MAP.h / 2;
  }

  /** The outline of everything in sight from `(x, y)`. */
  function sightPath(x: number, y: number): void {
    ctx.moveTo(x + Math.min(SIGHT_R, rayDist(MAP, x, y, 1, 0, SIGHT_R) + WALL_GLOW), y);
    for (let i = 1; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = Math.min(SIGHT_R, rayDist(MAP, x, y, dx, dy, SIGHT_R) + WALL_GLOW);
      ctx.lineTo(x + dx * d, y + dy * d);
    }
    ctx.closePath();
  }

  function label(text: string, x: number, y: number, color: string): void {
    // never smaller than 13 pixels on the screen, however far out the camera is (a TV shows the whole house)
    ctx.font = `${Math.max(12, 13 / view.scale).toFixed(1)}px "Patrick Hand", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function draw(now: number, dt: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { cw, ch, scale } = view;
    const s = store.state!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2);
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
      shake = Math.max(0, shake - dt * 3);
    }
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    const x0 = view.x - cw / 2 / scale - 20;
    const x1 = view.x + cw / 2 / scale + 20;
    const y0 = view.y - ch / 2 / scale - 20;
    const y1 = view.y + ch / 2 / scale + 20;
    drawHouse(ctx, MAP, x0, y0, x1, y1);

    MAP.portals.forEach((p, i) => {
      if (flares[i] > 0) flares[i] = Math.max(0, flares[i] - dt * 1.6);
      drawPortal(ctx, p.x, p.y, now, flares[i]);
    });
    if (escape() && s.round) {
      const open = exitsOpen();
      s.round.tasks.forEach((spot, i) => {
        const t = MAP.tasks[spot];
        const busy = bodies.some((b) => b.flags & F_WORK && Math.hypot(b.x - t.x, b.y - t.y) <= TASK_R + 4);
        drawTask(ctx, t.x, t.y, live.tasks[i] ?? 0, now, busy);
      });
      for (const e of MAP.exits) drawExit(ctx, e.x, e.y, open, now);
    }
    MAP.pills.forEach((p, i) => drawPill(ctx, p.x, p.y, now, ((live.pills >> i) & 1) === 1));

    const me = bodies.find((b) => b.id === s.selfId);
    const lit = self.ready && !!me;
    const sorted = bodies.filter((b) => !(b.flags & (F_PORTAL | F_OUT))).sort((a, b) => a.y - b.y);
    // our own side is always sent, wall or no wall: those out of sight are drawn over the dark, as markers
    const unseen = lit ? sorted.filter((b) => b.id !== s.selfId && !sees(MAP, self.x, self.y, b.x, b.y, SIGHT_R * 0.9)) : [];
    for (const b of sorted) {
      if (unseen.includes(b)) continue;
      drawBody(ctx, b.x, b.y, colorOf(b.id), b.facing, b.flags, now);
      if (b.id !== s.selfId) label(nameOf(b.id), b.x, b.y - 26, '#f4ecd8');
    }

    // the dark: everything our own eyes cannot reach
    if (lit) {
      ctx.fillStyle = FOG;
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      sightPath(self.x, self.y);
      ctx.fill('evenodd');
      // and a soft edge where sight gives out
      ctx.save();
      ctx.beginPath();
      sightPath(self.x, self.y);
      ctx.clip();
      const g = ctx.createRadialGradient(self.x, self.y, SIGHT_R * 0.6, self.x, self.y, SIGHT_R);
      g.addColorStop(0, 'rgba(8,6,16,0)');
      g.addColorStop(1, FOG);
      ctx.fillStyle = g;
      ctx.fillRect(self.x - SIGHT_R, self.y - SIGHT_R, SIGHT_R * 2, SIGHT_R * 2);
      ctx.restore();
      for (const b of unseen) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = colorOf(b.id);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (b.flags & F_BEAST) {
          ctx.moveTo(b.x, b.y - 9);
          ctx.lineTo(b.x + 9, b.y);
          ctx.lineTo(b.x, b.y + 9);
          ctx.lineTo(b.x - 9, b.y);
          ctx.closePath();
        } else ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        label(nameOf(b.id), b.x, b.y - 13, '#f4ecd8');
        ctx.globalAlpha = 1;
      }
    }

    // what a Beast heard: rings that spread and fade
    for (let i = live.noises.length - 1; i >= 0; i--) {
      const n = live.noises[i];
      const t = (now - n.at) / NOISE_SHOW_MS;
      if (t >= 1) {
        live.noises.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(255,210,63,${0.9 * (1 - t)})`;
      ctx.lineWidth = 3;
      for (let k = 0; k < Math.min(3, n.k + 1); k++) {
        const r = 20 + ((now / 14 + k * 26) % 78);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      const t = (now - f.at) / 1200;
      if (t >= 1) {
        floats.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - t;
      ctx.font = '22px Chewy, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(f.text, f.x, f.y - t * 30);
      ctx.fillStyle = '#ff5d73';
      ctx.fillText(f.text, f.x, f.y - t * 30);
      ctx.globalAlpha = 1;
    }
  }

  function drawMini(now: number): void {
    const s = store.state!;
    const m = mini.getContext('2d')!;
    m.clearRect(0, 0, mini.width, mini.height);
    m.drawImage(miniWalls, 0, 0);
    const k = MINI / TILE;
    const dot = (x: number, y: number, r: number, color: string): void => {
      m.fillStyle = color;
      m.beginPath();
      m.arc(x * k, y * k, r, 0, Math.PI * 2);
      m.fill();
    };
    MAP.pills.forEach((p, i) => (live.pills >> i) & 1 && dot(p.x, p.y, 1.5, '#ffd23f'));
    for (const p of MAP.portals) dot(p.x, p.y, 2, '#b388ff');
    if (escape() && s.round) {
      s.round.tasks.forEach((spot, i) => {
        const t = MAP.tasks[spot];
        m.fillStyle = (live.tasks[i] ?? 0) >= 100 ? '#3ddc97' : '#c98b5b';
        m.fillRect(t.x * k - 3, t.y * k - 3, 6, 6);
      });
      for (const e of MAP.exits) {
        m.strokeStyle = exitsOpen() ? '#3ddc97' : '#8a8298';
        m.lineWidth = 2;
        m.strokeRect(e.x * k - 3.5, e.y * k - 3.5, 7, 7);
      }
    }
    for (const n of live.noises) {
      m.strokeStyle = '#ffd23f';
      m.lineWidth = 1.5;
      m.beginPath();
      m.arc(n.x * k, n.y * k, 4 + ((now / 60) % 6), 0, Math.PI * 2);
      m.stroke();
    }
    for (const b of bodies) {
      if (b.flags & (F_PORTAL | F_OUT)) continue;
      // Beasts are diamonds and Cousins dots: shape, not only colour
      if (b.flags & F_BEAST) {
        m.fillStyle = b.id === s.selfId ? '#fff' : colorOf(b.id);
        m.beginPath();
        m.moveTo(b.x * k, b.y * k - 4.5);
        m.lineTo(b.x * k + 4.5, b.y * k);
        m.lineTo(b.x * k, b.y * k + 4.5);
        m.lineTo(b.x * k - 4.5, b.y * k);
        m.fill();
      } else dot(b.x, b.y, b.id === s.selfId ? 3.5 : 3, b.id === s.selfId ? '#fff' : colorOf(b.id));
    }
  }

  function labels(now: number): void {
    const s = store.state!;
    const mine = live.buffer.latest?.bodies.find((o) => o[0] === s.selfId);
    const flags = mine?.[3] ?? 0;
    const beast = (flags & F_BEAST) !== 0;
    const out = sideOf(s.selfId) === 'x';

    const cd = Math.ceil(countdownLeft(now, netClock.rtt / 2) / 1000);
    if (cd !== shownCount) {
      if (cd > 0) sfx.count();
      else if (shownCount > 0) sfx.go();
      shownCount = cd;
    }

    // the one line of words: the countdown, then news while it is fresh, otherwise what you are
    let words: string;
    let kind = beast ? 'beast' : 'cousin';
    if (cd > 0) words = !mine ? `Starting in ${cd}` : beast ? `You are the Hilder Beast · ${cd}` : `You are a Cousin · run in ${cd}`;
    else if (performance.now() < newsUntil) {
      words = news;
      kind = newsKind;
    } else words = !mine ? '' : out ? 'You got out!' : beast ? (flags & F_HELD ? 'Hilder Beast · the Cousins get a head start' : 'Hilder Beast') : 'Cousin';
    setText(role, words);
    if (role.className !== `role ${kind}`) role.className = `role ${kind}`;

    const ms = clockLeft(now, netClock.rtt / 2);
    const second = Math.ceil(ms / 1000);
    if (second !== shownSecond) {
      shownSecond = second;
      clock.textContent = `${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}`;
      const low = second <= 10 && live.cd === 0;
      clock.classList.toggle('low', low);
      if (low && second > 0 && s.phase === 'play') sfx.tick();
    }

    // a heart that beats faster the nearer a Beast is
    if (mine && !beast && !out && self.ready) {
      // the music of a Beast somewhere near: faster and louder the nearer it is, and never says where
      if (dread > 0.04 && now - heartAt > 980 - 680 * dread) {
        heartAt = now;
        sfx.dread(dread, heartStep++);
      }
      if (flags & F_WORK && now - crankAt > 260) {
        crankAt = now;
        sfx.crank();
      }
    }

    if (now - hudAt < 100) return;
    hudAt = now;
    const round = s.round;
    const all = Object.values(round?.sides ?? {});
    setText(sides, `Cousins ${all.filter((x) => x === 'c').length} · Beasts ${all.filter((x) => x === 'b').length}`);
    chores.hidden = !escape();
    if (escape()) {
      setText(chores, exitsOpen() ? 'Exits open!' : `Chores ${live.tasks.filter((p) => p >= 100).length} of ${live.tasks.length}`);
      chores.classList.toggle('open', exitsOpen());
    }
    watching.hidden = isSeated() && !out;
    setText(watching, out ? 'You are out and safe. Watching the rest.' : player(s.selfId)?.watcher ? 'Watching' : 'Watching. You are in the next round.');
    // with the whole house on screen there is nothing for the little map to add
    mini.hidden = !mine || out;

    // the two pads
    const playing = !!mine && !out && s.phase === 'play';
    boostPad.hidden = !playing;
    if (playing && live.me) {
      const [energy, boostWait, dashWait] = live.me;
      boostFill.style.height = `${Math.round(100 * (beast ? 1 - boostWait / BEAST_BOOST_COOLDOWN_MS : energy / ENERGY_MAX))}%`;
      boostPad.classList.toggle('off', beast ? boostWait > 0 : energy < ENERGY_TO_START && !cousinBoost);
      let act = '';
      if (beast) act = 'DASH';
      else if (escape() && round && self.ready) {
        if (exitsOpen() && MAP.exits.some((e) => Math.hypot(e.x - self.x, e.y - self.y) <= EXIT_R)) act = 'GET OUT';
        else if (round.tasks.some((spot, i) => (live.tasks[i] ?? 0) < 100 && Math.hypot(MAP.tasks[spot].x - self.x, MAP.tasks[spot].y - self.y) <= TASK_R)) act = 'WORK';
      }
      actPad.hidden = !act;
      setText(actText, act);
      actFill.style.height = `${beast ? Math.round(100 * (1 - dashWait / DASH_COOLDOWN_MS)) : 100}%`;
      actPad.classList.toggle('off', beast && dashWait > 0);
    } else actPad.hidden = true;

    if (now - miniAt > 120) {
      miniAt = now;
      drawMini(now);
    }
  }

  /** The red at the edge of the screen: how near a Beast is to us as a Cousin, and nothing about where. */
  function feel(now: number, dt: number): void {
    const s = store.state!;
    const cousin = s.phase === 'play' && sideOf(s.selfId) === 'c';
    const want = cousin ? (live.me?.[4] ?? 0) / DREAD_STEPS : 0;
    dread += (want - dread) * Math.min(1, dt * (want > dread ? 5 : 2));
    // it throbs with the heartbeat, unless the player has asked for less motion
    const beat = reducedMotion() ? 0 : Math.max(0, 1 - (now - heartAt) / 260) * 0.12 * dread;
    const shown = Math.round(Math.min(1, dread + beat) * 100);
    if (shown !== shownDread) {
      shownDread = shown;
      dreadEl.style.opacity = String(shown / 100);
    }
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch || !store.state) return;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    view.cw = cw;
    view.ch = ch;
    bodies = bodiesNow(now);
    feel(now, dt);
    steer(now, dt);
    aimCamera(dt);
    draw(now, dt);
    labels(now);
  }
  raf = requestAnimationFrame(frame);

  return {
    el,
    update() {},
    destroy() {
      cancelAnimationFrame(raf);
      input.destroy();
      if (live.onEvent === onEvent) live.onEvent = null;
    },
  };
}
