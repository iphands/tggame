import Phaser from 'phaser';
import { GameClient } from './net';
import { store, setJoinHandler } from './store';
import { initTouchControls, isTouchDevice, setTouchControlsVisible } from './controls';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ArenaScene } from './scenes/ArenaScene';

let client: GameClient | null = null;

/** Detect touch up-front and wire the on-screen control bar. */
store.touchMode = isTouchDevice();
document.body.classList.toggle('touch-mode', store.touchMode);
initTouchControls();

/** Best effort: force landscape (works on Android / PWA; ignored elsewhere). */
try {
  // @ts-expect-error — orientation lock is not in the standard lib
  void screen.orientation?.lock?.('landscape')?.catch?.(() => {});
} catch {
  /* not supported — the portrait gate covers us */
}

function joinArena(name: string): void {
  store.selfName = name;
  store.joined = true;
  try {
    localStorage.setItem('lsa-name', name);
  } catch {
    /* private mode */
  }
  client?.disconnect();
  client = new GameClient({
    name,
    onWelcome: (selfId, capacity) => {
      store.selfId = selfId;
      store.capacity = capacity;
    },
    onSnapshot: (snap) => {
      store.snapshot = snap;
    },
    onStatus: (conn) => {
      store.conn = conn;
    },
  });
  store.client = client;
  client.connect();
}

setJoinHandler(joinArena);

// the touch bar is only for gameplay — never show it in the lobby
setTouchControlsVisible(false);

// force-reload controls (wired once; the handlers read store.client at click time)
const forceReload = () => store.client?.sendRestart();
document.getElementById('restart-btn')?.addEventListener('click', forceReload);
document.getElementById('go-btn')?.addEventListener('click', forceReload);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-root',
  backgroundColor: '#0b0e1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
  scene: [BootScene, LobbyScene, ArenaScene],
});

void game;
