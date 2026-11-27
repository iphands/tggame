/** DOM overlay: join screen, lobby panels, in-game buttons, connection pill. */
import { MATCH } from '../../shared/src/constants';
import { LEVELS, levelAt } from '../../shared/src/levels';
import { store } from './store';
import { isMuted, play, setMuted, unlockAudio } from '@tggame/base/platformer/audio';
import { nextSetting } from '@tggame/base/platformer/quality';
import { applyTextEdit } from '@tggame/base/client/textedit';
import { askName } from '@tggame/base/client/rename';
import { canFullscreen, enterFullscreen, isFullscreen, isIOS, isStandalone, toggleFullscreen } from '@tggame/base/platformer/fullscreen';

export type Screen = 'join' | 'lobby' | 'game';

const $ = (id: string) => document.getElementById(id);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function showScreen(screen: Screen): void {
  $('join')?.classList.toggle('hidden', screen !== 'join');
  $('lobby')?.classList.toggle('hidden', screen !== 'lobby');
  $('game-buttons')?.classList.toggle('hidden', screen === 'join');
  syncRestartButton(screen === 'game');
  syncMuteButton();
}

/** ↻ only where the server honors it: results screen, countdown, or solo vs bots. */
export function syncRestartButton(inGame: boolean): void {
  const snap = store.snapshot;
  const humans = snap ? snap.players.filter((p) => !p.bot).length : 0;
  const ok = inGame && !!snap && (snap.phase !== 'playing' || humans <= 1);
  $('restart-btn')?.classList.toggle('hidden', !ok);
}

export function syncGfxButton(): void {
  const b = $('gfx-btn');
  if (!b) return;
  const q = store.quality;
  b.textContent = q.setting === 'auto' ? `✨ AUTO·${q.tier[0].toUpperCase()}` : `✨ ${q.setting.toUpperCase()}`;
}

export function syncMuteButton(): void {
  const b = $('mute-btn');
  if (b) b.textContent = isMuted() ? '🔇' : '🔊';
}

/** Wire lobby buttons. `onJoin` receives the chosen name. */
export function initLobbyDom(onJoin: (name: string) => void): void {
  const input = $('name-input') as HTMLInputElement | null;
  try {
    const saved = localStorage.getItem('lsa-name');
    if (input && saved) input.value = saved;
  } catch {
    /* private mode */
  }
  // Typing natively would leave "Undo Typing" armed on iPadOS for the whole
  // session (shake / three-finger gestures), so apply the edits ourselves.
  input?.addEventListener('beforeinput', (e) => {
    if (e.isComposing) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? null;
    const edit = applyTextEdit(input.value, start, end, e.inputType, data, input.maxLength);
    if (!edit) return;
    e.preventDefault();
    input.value = edit.value;
    input.setSelectionRange(edit.caret, edit.caret);
  });
  // Belt and braces: keep iPadOS's three-finger editing gestures (undo / redo /
  // cut / copy / paste) from firing while several thumbs are on the controls.
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length >= 3 && e.target !== input) e.preventDefault();
    },
    { passive: false },
  );
  $('join-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    unlockAudio();
    if (store.touchMode) void enterFullscreen(); // the PLAY tap is our user gesture
    const name = (input?.value ?? '').trim();
    input?.blur();
    onJoin(name);
  });

  const click = (id: string, fn: () => void) =>
    $(id)?.addEventListener('click', (e) => {
      e.preventDefault();
      unlockAudio();
      play('click');
      fn();
    });
  // optimistic: show the new arena immediately; the next snapshot confirms it
  const pick = (dir: 1 | -1) => {
    store.client?.send({ type: 'pickLevel', dir });
    if (store.snapshot) {
      store.snapshot.nextLevel = (store.snapshot.nextLevel + dir + LEVELS.length) % LEVELS.length;
      renderLobby();
    }
  };
  click('lvl-prev', () => pick(-1));
  click('lvl-next', () => pick(1));
  click('bot-add', () => store.client?.send({ type: 'addBot' }));
  click('bot-remove', () => store.client?.send({ type: 'removeBot' }));
  click('go-btn', () => store.client?.send({ type: 'restart' }));
  click('restart-btn', () => store.client?.send({ type: 'restart' }));
  click('name-btn', () => {
    const current = store.snapshot?.players.find((p) => p.id === store.selfId)?.name ?? store.name;
    const name = askName(current);
    if (!name) return;
    store.name = name;
    try {
      localStorage.setItem('lsa-name', name);
    } catch {
      /* private mode */
    }
    store.client?.setName(name);
    store.client?.send({ type: 'rename', name });
  });
  click('fs-btn', () => void toggleFullscreen());
  click('gfx-btn', () => {
    const next = nextSetting(store.quality.setting);
    store.quality.set(next);
    try {
      localStorage.setItem('lsa-gfx', next);
    } catch {
      /* private mode */
    }
    syncGfxButton();
    window.dispatchEvent(new Event('lsa-quality'));
  });
  syncGfxButton();
  const syncFs = () => {
    const b = $('fs-btn');
    if (!b) return;
    b.classList.toggle('hidden', !canFullscreen() || isStandalone());
    b.textContent = isFullscreen() ? '🗗' : '⛶';
  };
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
  syncFs();

  // iPhone Safari can't go full screen: point people at "Add to Home Screen"
  let hintDismissed = false;
  try {
    hintDismissed = localStorage.getItem('lsa-ios-hint') === '1';
  } catch {
    /* private mode */
  }
  if (isIOS() && !isStandalone() && !canFullscreen() && !hintDismissed) $('ios-hint')?.classList.remove('hidden');
  $('ios-hint-close')?.addEventListener('click', () => {
    $('ios-hint')?.classList.add('hidden');
    try {
      localStorage.setItem('lsa-ios-hint', '1');
    } catch {
      /* private mode */
    }
  });

  click('mute-btn', () => {
    setMuted(!isMuted());
    syncMuteButton();
  });

  // Enter starts the round from the lobby
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && store.joined && store.snapshot?.phase === 'lobby' && document.activeElement?.tagName !== 'INPUT') {
      store.client?.send({ type: 'restart' });
    }
  });
}

let rosterKey = '';

/** Refresh the lobby panels and connection pill from the latest snapshot. */
export function renderLobby(): void {
  const pill = $('conn');
  if (pill) {
    const c = store.conn;
    const show = store.joined && c !== 'connected';
    pill.classList.toggle('hidden', !show);
    pill.textContent = c === 'full' ? 'Arena is full (16 players)' : c === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  }

  const snap = store.snapshot;
  if (!snap) {
    for (const id of ['go-btn', 'lvl-prev', 'lvl-next', 'bot-add', 'bot-remove']) $(id)?.toggleAttribute('disabled', true);
    return;
  }
  const level = levelAt(snap.nextLevel);
  const nameEl = $('lvl-name');
  if (nameEl && nameEl.textContent !== level.name) {
    nameEl.textContent = level.name;
    $('lvl-tag')!.textContent = level.tagline;
    $('lvl-index')!.textContent = `${snap.nextLevel + 1} / ${LEVELS.length}`;
  }

  const players = snap.players;
  const humans = players.filter((p) => !p.bot).length;
  const bots = players.length - humans;
  const key = players.map((p) => `${p.id}${p.name}${p.wins}${p.kos}`).join('|');
  if (key !== rosterKey) {
    rosterKey = key;
    const list = $('roster');
    if (list) {
      list.innerHTML = players
        .map(
          (p) => `<div class="roster-item${p.id === store.selfId ? ' me' : ''}">
            <span class="dot" style="background:${p.color}"></span>
            <span class="rname">${escapeHtml(p.name)}</span>
            ${p.bot ? '<span class="tag bot">BOT</span>' : ''}
            ${p.id === store.selfId ? '<span class="tag you">YOU</span>' : ''}
            <span class="stats">${p.wins ? `🏆${p.wins}` : ''} ${p.kos ? `💥${p.kos}` : ''}</span>
          </div>`
        )
        .join('');
    }
    $('roster-count')!.textContent = `${players.length}/${MATCH.capacity}`;
  }

  const status = $('lobby-status');
  if (status) {
    let msg: string;
    if (snap.autoStartMs !== null) msg = `Starting in ${Math.ceil(snap.autoStartMs / 1000)}…`;
    else if (players.length < 2) msg = 'Waiting for challengers. Add a bot or press START to practice.';
    else msg = 'Ready!';
    status.textContent = msg;
  }
  // nothing can be sent until the socket is up: don't let clicks vanish
  const offline = store.conn !== 'connected';
  ($('bot-add') as HTMLButtonElement | null)?.toggleAttribute('disabled', offline || players.length >= MATCH.capacity);
  ($('bot-remove') as HTMLButtonElement | null)?.toggleAttribute('disabled', offline || bots === 0);
  for (const id of ['go-btn', 'lvl-prev', 'lvl-next']) ($(id) as HTMLButtonElement | null)?.toggleAttribute('disabled', offline);
}
