import Phaser from 'phaser';
import { GameClient } from './net';
import { store, setJoinHandler } from './store';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ArenaScene } from './scenes/ArenaScene';

let client: GameClient | null = null;

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
