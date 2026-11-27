import { askName } from '@tggame/base/client/rename';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/chewy/400.css';
import { NAME_MAX } from '../../shared/src/constants';
import { sanitizeName } from '../../shared/src/drawing';
import type { ServerMessage } from '../../shared/src/protocol';
import { isMuted, setMuted, sfx, unlockAudio } from './audio';
import { GameClient, type ConnectionStatus } from './net';
import { makeScreen, screenKey, type Screen } from './screens/index';
import { amDrawing, canvasChanged, isHost, isSeated, me, saved, send, store, wire } from './store';

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
const TITLE = document.title;

// ---- connection

function connect(name: string): void {
  client?.disconnect();
  client = new GameClient({ name, token: saved.token, onMessage, onStatus });
  wire((msg) => client?.send(msg), render);
  client.connect();
}

function onStatus(status: ConnectionStatus): void {
  store.status = status;
  if (status === 'full' || status === 'booted') {
    backToJoin(status === 'full' ? 'The table is full right now. Try again in a bit!' : 'You were voted out of this table.');
    return;
  }
  render();
}

function onMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'welcome':
      saved.setToken(msg.token);
      store.clockOffset = msg.now - Date.now();
      // the server replays the recent chat to a fresh socket
      store.chat = [];
      store.chatEpoch++;
      break;
    case 'task':
      store.task = msg.task;
      render();
      break;
    case 'chat':
      store.chat.push(...msg.lines);
      if (store.chat.length > 300) store.chat.splice(0, store.chat.length - 200);
      render();
      break;
    case 'canvas':
      store.canvas = { turn: msg.turn, strokes: msg.strokes };
      canvasChanged({ kind: 'load' });
      break;
    case 'ink': {
      const strokes = store.canvas.strokes;
      if (msg.turn !== store.canvas.turn || msg.i > strokes.length) break;
      if (msg.i === strokes.length) strokes.push({ c: msg.c, w: msg.w, p: [], ...(msg.f ? { f: 1 as const } : {}) });
      const stroke = strokes[msg.i];
      const from = stroke.p.length / 2;
      for (const v of msg.p) stroke.p.push(v);
      canvasChanged({ kind: 'grew', i: msg.i, from });
      break;
    }
    case 'undo':
    case 'clear':
      if (msg.turn !== store.canvas.turn) break;
      if (msg.type === 'undo') store.canvas.strokes.pop();
      else store.canvas.strokes.length = 0;
      canvasChanged({ kind: 'repaint' });
      break;
    case 'state': {
      const prev = store.state;
      store.state = msg.state;
      const s = msg.state;
      if (prev && s.round && s.phase === 'draw' && prev.round?.turn !== s.round.turn) {
        if (amDrawing()) {
          sfx.turn();
          if (document.hidden) document.title = '✏️ Your turn to draw! · ' + TITLE;
        } else sfx.flip();
      }
      if (prev?.phase === 'draw' && s.phase === 'between' && s.result) {
        const mine = s.result.winnerId === s.selfId || (s.result.winnerId && s.result.drawerId === s.selfId);
        if (mine) sfx.tada();
        else if (s.result.winnerId) sfx.done();
        else sfx.nope();
      }
      render();
      break;
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) document.title = TITLE;
});

function backToJoin(error = ''): void {
  client?.disconnect();
  client = null;
  store.state = null;
  store.task = null;
  store.chat = [];
  store.whisperTo = null;
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
  const label =
    s.phase === 'lobby' ? 'Lobby' : s.phase === 'finale' ? 'Final scores' : s.round ? `Round ${s.round.round} of ${s.round.rounds}` : '';
  progressEl.textContent = label;

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
  if (inGame && !confirm('Leave the game? You give up your seat and your score.')) return;
  send({ type: 'leave' });
  saved.setToken(null);
  backToJoin();
});
$('end-game').addEventListener('click', () => {
  if (confirm('End this game for everyone and go back to the lobby?')) send({ type: 'abort' });
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
// double-tap: swallow the second tap's default (the zoom) but still deliver its click,
// so quick repeated taps on Undo, hearts and swatches keep working
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
    target.click();
  },
  { passive: false },
);

nameInput.maxLength = NAME_MAX;
nameInput.value = saved.name();
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = sanitizeName(nameInput.value) || 'Doodler';
  saved.setName(name);
  joinError.textContent = '';
  unlockAudio();
  sfx.pop();
  connect(name);
  render();
});

// A saved seat means a reload mid-game: go straight back in.
if (saved.token() && saved.name()) connect(saved.name());
render();
