import Phaser from 'phaser';
import { GameClient } from './net';
import { store, onSnapshot } from './store';
import { initTouchControls, isTouchDevice, setTouchControlsVisible } from './controls';
import { initLobbyDom, renderLobby, showScreen } from './lobby';
import { unlockAudio } from './audio';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ArenaScene } from './scenes/ArenaScene';
import { HudScene } from './scenes/HudScene';

store.touchMode = isTouchDevice();
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

function join(name: string): void {
  store.name = name;
  store.joined = true;
  try {
    localStorage.setItem('lsa-name', name);
  } catch {
    /* private mode */
  }
  store.client?.disconnect();
  store.buffer.clear();
  store.snapshot = null;
  const client = new GameClient({
    name,
    onWelcome: (id) => (store.selfId = id),
    onSnapshot,
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

new Phaser.Game({
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
