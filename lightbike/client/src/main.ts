import { askName } from '@tggame/base/client/rename';
import { NAME_MAX } from '../../shared/src/constants';
import { sanitizeName } from '@tggame/base/shared/text';
import type { ServerMessage } from '../../shared/src/protocol';
import { isMuted, setMuted, sfx, unlockAudio } from './audio';
import { FLOOR, drawBike, drawLine } from './art';
import { clearLive, live, onArena, onSnap } from './live';
import { GameClient, type ConnectionStatus } from './net';
import { makeScreen, screenKey, type Screen } from './screens/index';
import { isHost, isSeated, me, saved, send, store, watching, wire } from './store';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const joinEl = $('join');
const gameEl = $('game');
const screenEl = $('screen');
const joinForm = $<HTMLFormElement>('join-form');
const nameInput = $<HTMLInputElement>('name');
const joinError = $('join-error');
const progressEl = $('progress');
const connEl = $('conn');
const muteBtn = $<HTMLButtonElement>('mute');
const menuBtn = $<HTMLButtonElement>('menu');
const menuEl = $('menu-pop');

let client: GameClient | null = null;
let current: { key: string; screen: Screen } | null = null;

// three bikes, one of them about to regret something
const demo = document.createElement('canvas');
demo.width = 640;
demo.height = 192;
$('demo').append(demo);
function drawDemo(): void {
  const c = demo.getContext('2d')!;
  const k = 16;
  c.setTransform(2 * k, 0, 0, 2 * k, 0, 0);
  c.fillStyle = FLOOR;
  c.fillRect(0, 0, 20, 6);
  drawLine(c, [0, 4, 6, 4, 6, 1], 13.5, 1.5, '#3de0e0', k, 1);
  drawLine(c, [19, 0, 16, 0, 16, 3], 10.5, 3.5, '#ff6bcb', k, 1);
  drawLine(c, [11, 5], 11.5, 4.6, '#ffc23d', k, 1);
  drawBike(c, 13.5, 1.5, 0, '#3de0e0', k);
  drawBike(c, 10.5, 3.5, 2, '#ff6bcb', k);
  drawBike(c, 11.5, 4.6, 3, '#ffc23d', k);
}
drawDemo();

// `?debug` puts the floor as this page sees it on `window.lightbikes`, for poking at from the console
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { lightbikes: typeof live }).lightbikes = live;

// ---- connection

function connect(name: string): void {
  client?.disconnect();
  client = new GameClient({ name, token: saved.token, watch: watching.on, onMessage, onStatus });
  wire((msg) => client?.send(msg), render);
  client.connect();
}

function onStatus(status: ConnectionStatus): void {
  store.status = status;
  if (status === 'full') {
    backToJoin('The floor is full right now. Try again in a bit!');
    return;
  }
  render();
}

function onMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'welcome':
      saved.setToken(msg.token);
      break;
    case 'state':
      store.state = msg.state;
      if (msg.state.phase === 'lobby') clearLive();
      render();
      break;
    case 'arena':
      onArena(msg);
      break;
    case 'snap':
      onSnap(msg);
      break;
  }
}

function backToJoin(error = ''): void {
  client?.disconnect();
  client = null;
  store.state = null;
  clearLive();
  joinError.textContent = error;
  render();
}

// ---- rendering

function render(): void {
  const s = store.state;
  joinEl.hidden = !!s || !!client;
  gameEl.hidden = !s;
  $('connecting').hidden = !!s || !client;
  document.body.dataset.phase = s?.phase ?? 'join';
  if (!s) {
    current?.screen.destroy?.();
    current = null;
    return;
  }
  const key = screenKey();
  if (key !== current?.key) {
    current?.screen.destroy?.();
    current = { key, screen: makeScreen(key) };
    screenEl.replaceChildren(current.screen.el);
    gameEl.dataset.screen = key.split(':')[0];
  }
  current.screen.update();
  renderHeader();
}

function renderHeader(): void {
  const s = store.state!;
  progressEl.textContent = s.phase === 'lobby' ? 'Lobby' : s.phase === 'finale' ? 'Podium' : s.round ? `Round ${s.round.no} · ${s.round.arena}` : '';
  connEl.hidden = store.status === 'connected';
  connEl.textContent = store.status === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  $('end-game').hidden = !isHost() || s.phase === 'lobby';
}

// ---- chrome wiring

function setMuteIcon(): void {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
}
muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  setMuteIcon();
  sfx.pop();
});
setMuteIcon();

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuEl.hidden = !menuEl.hidden;
});
document.addEventListener('click', () => (menuEl.hidden = true));
$('rename').addEventListener('click', () => {
  const name = askName(me()?.name ?? saved.name());
  if (!name) return;
  saved.setName(name);
  client?.setName(name);
  send({ type: 'rename', name });
});
$('leave').addEventListener('click', () => {
  const inGame = store.state && store.state.phase !== 'lobby' && isSeated();
  if (inGame && !confirm('Leave the match? Your bike and your line go with you.')) return;
  send({ type: 'leave' });
  saved.setToken(null);
  backToJoin();
});
$('end-game').addEventListener('click', () => {
  if (confirm('End this match for everyone and go back to the lobby?')) send({ type: 'abort' });
});

document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });
// ---- no touch zoom
// `touch-action` in styles.css covers most browsers; iOS Safari also needs the events cancelled.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
// pinch: any move with two or more fingers down
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);
// double-tap: swallow the second tap's default (the zoom) but still deliver its click
let lastTapAt = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = e.timeStamp;
    const quick = now - lastTapAt < 300;
    lastTapAt = now;
    const target = e.target as HTMLElement | null;
    if (!quick || e.touches.length > 0 || !target || target.closest('input, textarea')) return;
    e.preventDefault();
    (target.closest('button') ?? target).click();
  },
  { passive: false },
);

nameInput.maxLength = NAME_MAX;
nameInput.value = saved.name();
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = sanitizeName(nameInput.value) || 'Rider';
  saved.setName(name);
  watching.set(false);
  joinError.textContent = '';
  unlockAudio();
  sfx.pop();
  connect(name);
  render();
});

// a screen that only watches: a TV in the room
$('watch').addEventListener('click', () => {
  const name = sanitizeName(nameInput.value) || 'TV';
  saved.setName(name);
  watching.set(true);
  joinError.textContent = '';
  unlockAudio();
  connect(name);
  render();
});

// A saved seat means a reload mid-game: go straight back in.
if (saved.token() && saved.name()) connect(saved.name());
// a TV sent here with ?watch=1 needs nobody to press anything
else if (watching.straightIn) connect(saved.name() || 'TV');
render();
