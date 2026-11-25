import '@fontsource/patrick-hand/400.css';
import '@fontsource/chewy/400.css';
import { NAME_MAX } from '../../shared/src/constants';
import { sanitizeName } from '../../shared/src/drawing';
import type { ServerMessage } from '../../shared/src/protocol';
import { isMuted, setMuted, sfx, unlockAudio } from './audio';
import { h } from './dom';
import { GameClient, type ConnectionStatus } from './net';
import { makeScreen, screenKey, type Screen } from './screens/index';
import { isHost, isSeated, saved, send, store, wire } from './store';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const joinEl = $('join');
const gameEl = $('game');
const screenEl = $('screen');
const joinForm = $<HTMLFormElement>('join-form');
const nameInput = $<HTMLInputElement>('name');
const joinError = $('join-error');
const progressEl = $('progress');
const rosterEl = $('roster');
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
  if (status === 'full') {
    backToJoin('The table is full right now. Try again in a bit!');
    return;
  }
  render();
}

function onMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'welcome':
      saved.setToken(msg.token);
      break;
    case 'task':
      store.task = msg.task;
      break;
    case 'pages':
      if (msg.game !== store.pagesGame) {
        store.pagesGame = msg.game;
        store.books.clear();
      }
      for (const ref of msg.pages) {
        const book = store.books.get(ref.book) ?? [];
        book[ref.index] = ref.page;
        store.books.set(ref.book, book);
      }
      break;
    case 'state': {
      const prev = store.state;
      store.state = msg.state;
      const s = msg.state;
      const turnPhase = s.phase === 'pick' || s.phase === 'draw' || s.phase === 'guess';
      if (turnPhase && isSeated() && (!prev || prev.turn !== s.turn || prev.game !== s.game || prev.phase !== s.phase)) {
        // a fresh page just landed in front of this player
        if (prev) sfx.turn();
        if (document.hidden) document.title = '✏️ Your turn! · ' + TITLE;
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
  store.books.clear();
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
    s.phase === 'lobby'
      ? 'Lobby'
      : s.phase === 'pick'
        ? 'Pick a word'
        : s.phase === 'reveal'
          ? 'The reveal'
          : s.phase === 'finale'
            ? 'Finale'
            : `${s.phase === 'draw' ? 'Draw' : 'Guess'} · page ${s.turn} of ${s.turns}`;
  const pips =
    s.phase === 'draw' || s.phase === 'guess' || s.phase === 'pick'
      ? Array.from({ length: s.turns + 1 }, (_, i) => h('i', { class: `pip${i < s.turn ? ' past' : i === s.turn ? ' now' : ''}` }))
      : [];
  progressEl.replaceChildren(h('span', null, label), h('span', { class: 'pips' }, pips));

  const shown = s.phase === 'lobby' ? [] : s.seats.map((id) => s.players.find((p) => p.id === id)).filter((p) => !!p);
  rosterEl.replaceChildren(
    ...shown.map((p) =>
      h(
        'span',
        {
          class: `avatar${p.done ? ' done' : ''}${p.connected ? '' : ' away'}${p.id === s.selfId ? ' me' : ''}`,
          style: `--c:${p.color}`,
          title: p.name + (p.connected ? '' : ' (away)'),
        },
        p.name.slice(0, 1).toUpperCase(),
      ),
    ),
  );

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
$('leave').addEventListener('click', () => {
  const inGame = store.state && store.state.phase !== 'lobby' && isSeated();
  if (inGame && !confirm('Leave the game? Your seat stays, but the others may have to skip you.')) return;
  send({ type: 'leave' });
  saved.setToken(null);
  backToJoin();
});
$('end-game').addEventListener('click', () => {
  if (confirm('End this game for everyone and go back to the lobby?')) send({ type: 'abort' });
});

document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });
// iOS: keep pinch and double-tap zoom from hijacking the drawing surface
document.addEventListener('gesturestart', (e) => e.preventDefault());

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
