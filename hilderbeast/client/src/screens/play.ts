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
  F_BEAST,
  F_BOOST,
  F_CONVERT,
  F_DASH,
  F_GHOST,
  F_HELD,
  F_HURT,
  F_OUT,
  F_PORTAL,
  F_SLOW,
  F_WORK,
  NOISE_SHOW_MS,
  PORTALS_ON,
  SIGHT_R,
  SPEEDS,
  TASK_R,
  TILE,
  tasksNeeded,
} from '../../../shared/src/constants';
import { T_GOO, kindAt, roomAt } from '../../../shared/src/map';
import { MAPS } from '../../../shared/src/maps';
import { moveBody, rayDist, sees, speedOf } from '../../../shared/src/sim';
import type { Fx } from '../../../shared/src/types';
import { INK, NIGHT, PORTAL_COLORS, drawBody, drawExit, drawHouse, drawPill, drawPortal, drawTask, mapPicture } from '../art';
import { buzz, sfx } from '../audio';
import { endCutscene, playCutscene } from '../cutscene';
import { createInput } from '../input';
import { clockLeft, goLeft, live } from '../live';
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
/** How much larger everybody is drawn for a screen that shows the whole house. */
const WATCH_SCALE = 2.2;
/** Minimap pixels per square. */
const MINI = 4;

export function playScreen(): Screen {
  /** The map this round is played on. A new round is a new play screen, so it never changes under us. */
  const MAP = MAPS[store.state?.round?.map ?? 0] ?? MAPS[0];
  /** The round's speed setting: what everybody's speed is multiplied by. */
  const PACE = SPEEDS[store.state?.round?.speed ?? 0]?.x ?? 1;
  /** The two ways out, in the order they open: the first with one chore to spare, the second with the last chore. */
  const firstExit = (store.state?.round?.exit ?? 0) % Math.max(1, MAP.exits.length);
  const exitSpots = MAP.exits.length ? [MAP.exits[firstExit], ...MAP.exits.filter((_, i) => i !== firstExit)] : [];
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  const clock = h('div', { class: 'clock' }, '');
  const sides = h('div', { class: 'sides' });
  const role = h('div', { class: 'role' });
  const chores = h('div', { class: 'chores' });
  /** A red edge to the screen that closes in as a Beast nears a Cousin. */
  const dreadEl = h('div', { class: 'dread' });
  /** The count before the Beast is let loose: big, faint, and on every screen. */
  const count = h('div', { class: 'count' });
  const watching = h('div', { class: 'watching', hidden: true });
  const boostFill = h('i');
  const boostPad = h('button', { class: 'pad boost', type: 'button' }, boostFill, h('span', null, 'BOOST'), h('small', null, 'Space'));
  const actFill = h('i');
  const actText = h('span', null, 'DASH');
  const actPad = h('button', { class: 'pad act', type: 'button' }, actFill, actText, h('small', null, 'E'));
  const mini = h('canvas', { class: 'minimap', width: MAP.cols * MINI, height: MAP.lines * MINI });
  const hud = h('div', { class: 'hud' }, dreadEl, sides, clock, role, chores, count, watching, mini, boostPad, actPad);
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

  // the walls and traps of the minimap never change: draw them once
  const miniWalls = mapPicture(MAP, MINI);

  // ---- what we know

  const selfId = (): string => store.state?.selfId ?? '';
  const colorOf = (id: string): string => player(id)?.color ?? '#fff';
  const sideOf = (id: string): string | undefined => store.state?.round?.sides[id];
  const who = (id: string): string => (id === selfId() ? 'You' : nameOf(id));
  const escape = (): boolean => store.state?.round?.mode === 'escape';
  const choresDone = (): number => live.tasks.filter((p) => p >= 100).length;
  /** All but one of the chores will do: see `tasksNeeded`. */
  /** How many exits are open: 0, 1 (all but one chore done) or 2 (every chore done). */
  const openCount = (): number => (!live.tasks.length ? 0 : choresDone() >= live.tasks.length ? 2 : choresDone() >= tasksNeeded(live.tasks.length) ? 1 : 0);

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
        // a catch by a Beast stops the round and is shown to everyone; the sounds are the cutscene's
        if (e[1]) {
          playCutscene(el, {
            beast: who(e[1]),
            victim: who(e[2]),
            beastColor: colorOf(e[1]),
            victimColor: colorOf(e[2]),
            ghost: escape(),
            seed: e[3] * 31 + e[4] * 17 + (store.state?.round?.seq ?? 0),
            mine,
          });
        } else sfx.caught(mine);
        say(e[1] ? `${who(e[2])} ${mine ? 'were' : 'was'} caught by ${who(e[1]).replace(/^You$/, 'you')}!` : `${who(e[2])} turned into a Beast!`);
        if (mine) {
          buzz(250);
          if (!reducedMotion()) shake = 1;
          say(escape() ? 'Caught! You are a ghost now: roam and watch' : 'Caught! You are a Hilder Beast now', 3000, escape() ? 'news' : 'beast');
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
        say(`A chore is done: ${choresDone()} of ${live.tasks.length}`);
        break;
      }
      case 'o':
        sfx.doors();
        if (e[1] === 0 && live.tasks.length > 1) say(sideOf(me) === 'b' ? 'An exit is open! One chore left opens the other' : 'An exit is open! Get out, or do the last chore for the other', 4500, 'open');
        else say(sideOf(me) === 'b' ? 'Both exits are open!' : 'Both exits are open. Get out!', 4000, 'open');
        break;
      case 'x':
        say(`${who(e[1])} got out!`);
        break;
      case 'g': {
        // a ghost bumped a Beast: everybody sees the bump, though the living never see the ghost
        sfx.boo();
        floats.push({ x: e[3], y: e[4] - 30, at: performance.now(), text: 'Boo!' });
        if (e[2] === me) {
          buzz(80);
          if (!reducedMotion()) shake = 0.5;
          say(`${who(e[1])} bumped you from beyond!`, 2200);
        } else if (e[1] === me) say('Boo! And back you go…', 2200);
        break;
      }
      case 's':
        sfx.ouch(e[1] === me);
        floats.push({ x: e[2], y: e[3] - 24, at: performance.now(), text: 'Ouch!' });
        if (e[1] === me) {
          buzz(120);
          if (!reducedMotion()) shake = 0.6;
          say('Spikes! You are limping', 1600);
        }
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
    const ghost = (flags & F_GHOST) !== 0;
    if (ghost) {
      // a ghost has no boosts: it only drifts
    } else if (flags & F_BEAST) {
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
      cousinBoost = ctl.boost && !(flags & F_HURT) && (cousinBoost ? energy > 0 : energy >= ENERGY_TO_START);
      if (cousinBoost && !was && moving) sfx.dash();
      if (ctl.boost && !boostWas && !cousinBoost) sfx.empty();
      flags = cousinBoost && moving ? flags | F_BOOST : flags & ~F_BOOST;
    }
    boostWas = ctl.boost;
    actWas = ctl.act;

    // goo is in the map, so we know we are in it without being told: the flag is worked out here, per place
    const wades = !ghost && !(flags & F_BEAST);
    const dry = flags & ~F_SLOW;
    const speedAt = (x: number, y: number): number => speedOf(wades && kindAt(MAP, x, y) === T_GOO ? dry | F_SLOW : dry, PACE);
    flags = wades && self.ready && kindAt(MAP, self.x, self.y) === T_GOO ? dry | F_SLOW : dry;
    const speed = speedOf(flags, PACE);
    // while the server holds the body (the den, a Beast door, turning, a catch being shown) we only follow
    const steering = speedOf(dry) > 0 && live.hold <= 0;
    const ahead = steering ? predictBody({ x: latest[1], y: latest[2] }, live.stampedAt, netClock.rtt, sticks, now, speedAt, MAP, ghost) : { x: latest[1], y: latest[2] };
    const off = Math.hypot(ahead.x - self.x, ahead.y - self.y);
    if (!self.ready || off > SNAP_UNITS) {
      self.x = ahead.x;
      self.y = ahead.y;
      if (!self.ready) sticks.length = 0;
      self.ready = true;
    }
    if (steering) moveBody(self, ctl.x * speed * dt, ctl.y * speed * dt, MAP, ghost);
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
    // how far into the round we are: the spikes go by it, here just as on the server
    const timeMs = (s.round?.clockMs ?? 0) - clockLeft(now, netClock.rtt / 2);
    drawHouse(ctx, MAP, x0, y0, x1, y1, timeMs, now);

    (PORTALS_ON ? MAP.portals : []).forEach((p, i) => {
      if (flares[i] > 0) flares[i] = Math.max(0, flares[i] - dt * 1.6);
      drawPortal(ctx, p.x, p.y, now, flares[i], i >> 1);
    });
    if (escape() && s.round) {
      const open = openCount();
      s.round.tasks.forEach((spot, i) => {
        const t = MAP.tasks[spot];
        const busy = bodies.some((b) => b.flags & F_WORK && Math.hypot(b.x - t.x, b.y - t.y) <= TASK_R + 4);
        drawTask(ctx, t.x, t.y, live.tasks[i] ?? 0, now, busy);
      });
      exitSpots.forEach((e, i) => drawExit(ctx, e.x, e.y, i < open, now));
    }
    MAP.pills.forEach((p, i) => drawPill(ctx, p.x, p.y, now, ((live.pills >> i) & 1) === 1));

    const me = bodies.find((b) => b.id === s.selfId);
    // a ghost sees the whole house: the dark is for the living
    const lit = self.ready && !!me && !(me.flags & F_GHOST);
    const sorted = bodies.filter((b) => !(b.flags & (F_PORTAL | F_OUT))).sort((a, b) => a.y - b.y);
    // our own side is always sent, wall or no wall: those out of sight are drawn over the dark, as markers
    const unseen = lit ? sorted.filter((b) => b.id !== s.selfId && !sees(MAP, self.x, self.y, b.x, b.y, SIGHT_R * 0.9)) : [];
    // with the whole house on screen (a TV, or anyone only watching) everybody is drawn larger, to be seen across a room
    const big = self.ready ? 1 : WATCH_SCALE;
    for (const b of sorted) {
      if (unseen.includes(b)) continue;
      if (big === 1) drawBody(ctx, b.x, b.y, colorOf(b.id), b.facing, b.flags, now);
      else {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(big, big);
        drawBody(ctx, 0, 0, colorOf(b.id), b.facing, b.flags, now);
        ctx.restore();
      }
      if (b.id !== s.selfId) label(nameOf(b.id), b.x, b.y - 26 * big - (b.flags & F_BEAST ? 14 * big : 0), '#f4ecd8');
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
    if (PORTALS_ON) MAP.portals.forEach((p, i) => dot(p.x, p.y, 2.5, PORTAL_COLORS[(i >> 1) % PORTAL_COLORS.length].bright));
    if (escape() && s.round) {
      s.round.tasks.forEach((spot, i) => {
        const t = MAP.tasks[spot];
        m.fillStyle = (live.tasks[i] ?? 0) >= 100 ? '#3ddc97' : '#c98b5b';
        m.fillRect(t.x * k - 3, t.y * k - 3, 6, 6);
      });
      exitSpots.forEach((e, i) => {
        m.strokeStyle = i < openCount() ? '#3ddc97' : '#8a8298';
        m.lineWidth = 2;
        m.strokeRect(e.x * k - 3.5, e.y * k - 3.5, 7, 7);
      });
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
    const ghost = sideOf(s.selfId) === 'g';

    // the count to the Beast being let loose: the Cousins are already running
    const cd = s.phase === 'play' || s.phase === 'countdown' ? Math.ceil(goLeft(now, netClock.rtt / 2) / 1000) : 0;
    if (cd !== shownCount) {
      if (cd > 0) sfx.count();
      else if (shownCount > 0) sfx.go();
      count.textContent = cd > 0 ? String(cd) : '';
      // the number pops in afresh each second
      count.classList.remove('tick');
      void count.offsetWidth;
      if (cd > 0) count.classList.add('tick');
      shownCount = cd;
    }

    // the one line of words: the countdown, then news while it is fresh, otherwise what you are
    let words: string;
    let kind = beast ? 'beast' : 'cousin';
    if (cd > 0) words = !mine ? `Hilder is loose in ${cd}` : beast ? `You are the Hilder Beast · loose in ${cd}` : `You are a Cousin · run! Hilder is loose in ${cd}`;
    else if (performance.now() < newsUntil) {
      words = news;
      kind = newsKind;
    } else words = !mine ? '' : out ? 'You got out!' : ghost ? 'Ghost · roam and watch' : beast ? 'Hilder Beast' : 'Cousin';
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
      // from a slow heartbeat (about one a second) to a frantic 240 a minute when she is nearly on us
      const beatMs = 1000 - 750 * Math.pow(dread, 0.8);
      if (dread > 0.04 && now - heartAt > beatMs) {
        heartAt = now;
        sfx.dread(dread, heartStep++, beatMs / 1000);
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
    const ghosts = all.filter((x) => x === 'g').length;
    const outs = all.filter((x) => x === 'x').length;
    setText(sides, `Cousins ${all.filter((x) => x === 'c').length} · Beasts ${all.filter((x) => x === 'b').length}${outs ? ` · Out ${outs}` : ''}${ghosts ? ` · Ghosts ${ghosts}` : ''}`);
    chores.hidden = !escape();
    if (escape()) {
      const open = openCount();
      setText(chores, open >= 2 ? 'Both exits open!' : `${open ? '1 exit open · ' : ''}Chores ${choresDone()} of ${live.tasks.length}`);
      chores.classList.toggle('open', open > 0);
    }
    watching.hidden = isSeated() && !out;
    setText(watching, out ? 'You are out and safe. Watching the rest.' : player(s.selfId)?.watcher ? 'Watching' : 'Watching. You are in the next round.');
    // with the whole house on screen there is nothing for the little map to add
    mini.hidden = !mine || out;

    // the two pads
    const playing = !!mine && !out && !ghost && s.phase === 'play';
    boostPad.hidden = !playing;
    if (playing && live.me) {
      const [energy, boostWait, dashWait] = live.me;
      boostFill.style.height = `${Math.round(100 * (beast ? 1 - boostWait / BEAST_BOOST_COOLDOWN_MS : energy / ENERGY_MAX))}%`;
      boostPad.classList.toggle('off', beast ? boostWait > 0 : energy < ENERGY_TO_START && !cousinBoost);
      let act = '';
      if (beast) act = 'DASH';
      else if (escape() && round && self.ready) {
        if (round.tasks.some((spot, i) => (live.tasks[i] ?? 0) < 100 && Math.hypot(MAP.tasks[spot].x - self.x, MAP.tasks[spot].y - self.y) <= TASK_R)) act = 'WORK';
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
      endCutscene();
      input.destroy();
      if (live.onEvent === onEvent) live.onEvent = null;
    },
  };
}
