import './prefs';
import Phaser from 'phaser';
import { GameClient } from './net';
import { store, onSnapshot, resetPrediction } from './store';
import { initTouchControls, isTouchDevice, setTouchControlsVisible } from '@tggame/base/platformer/controls';
import { initLobbyDom, renderLobby, showScreen } from './lobby';
import { unlockAudio } from '@tggame/base/platformer/audio';
import { QualityManager, SETTINGS, type Setting } from '@tggame/base/platformer/quality';
import { perfEnabled, reportCpu, startPerfMeter } from '@tggame/base/platformer/perfMeter';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ArenaScene } from './scenes/ArenaScene';
import { HudScene } from './scenes/HudScene';

store.touchMode = isTouchDevice();
// graphics quality: ?gfx=high|medium|low|auto overrides the saved setting
{
  let saved: Setting = 'auto';
  try {
    saved = (localStorage.getItem('lsr-gfx') as Setting | null) ?? 'auto';
  } catch {
    /* private mode */
  }
  const fromUrl = new URLSearchParams(location.search).get('gfx') as Setting | null;
  const setting = fromUrl && SETTINGS.includes(fromUrl) ? fromUrl : SETTINGS.includes(saved) ? saved : 'auto';
  store.quality = new QualityManager(setting);
}
document.body.classList.toggle('touch-mode', store.touchMode);
initTouchControls(unlockAudio);
setTouchControlsVisible(false);

// first gesture anywhere unlocks audio
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlockAudio, { passive: true });

try {
  // best effort; the portrait gate covers browsers that refuse
  void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape')?.catch(() => {});
} catch {
  /* unsupported */
}

// `?debug` puts what this page knows on `window.runner`, for poking at from the console
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { runner: typeof store }).runner = store;

function join(name: string): void {
  store.name = name;
  store.joined = true;
  try {
    localStorage.setItem('lsr-name', name);
  } catch {
    /* private mode */
  }
  store.client?.disconnect();
  store.buffer.clear();
  store.snapshot = null;
  const client = new GameClient({
    name,
    onWelcome: (id) => (store.selfId = id),
    onOpen: resetPrediction,
    onSnapshot,
    onRenamed: (id, newName) => {
      // the newest snapshot predates the change: correct it, then tell whatever has the name drawn
      const p = store.snapshot?.players.find((q) => q.id === id);
      if (p) p.name = newName;
      renderLobby();
      window.dispatchEvent(new CustomEvent('lsr-renamed', { detail: { id, name: newName } }));
    },
    onRecords: (records) => {
      store.records = records;
      renderLobby();
    },
    onStatus: (s) => {
      store.conn = s;
      renderLobby();
    },
  });
  store.client = client;
  client.connect();
  showScreen('lobby');
}

initLobbyDom(join);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-root',
  backgroundColor: '#07041a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { pixelArt: true, antialias: false },
  audio: { noAudio: true },
  input: { activePointers: 4 },
  scene: [BootScene, LobbyScene, ArenaScene, HudScene], // Hud renders above Arena
});

// optional on-screen perf meter (?fps=1 to enable, remembered; ?fps=0 to disable)
if (perfEnabled()) {
  startPerfMeter();
  let t0 = 0;
  game.events.on(Phaser.Core.Events.PRE_STEP, () => (t0 = performance.now()));
  game.events.on(Phaser.Core.Events.POST_RENDER, () => reportCpu(performance.now() - t0));
}
