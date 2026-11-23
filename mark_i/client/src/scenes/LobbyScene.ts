import Phaser from 'phaser';
import { store, renderRoster, setStatusPill, triggerJoin } from '../store';
import { syncOverlay, setHeader, syncRestartButton, syncGoButton } from '../ui';
import { setTouchControlsVisible } from '../controls';
import { WORLD } from '../../../shared/src/constants';

export class LobbyScene extends Phaser.Scene {
  private syncAccum = 0;
  private formHandler: ((e: Event) => void) | null = null;

  constructor() {
    super('Lobby');
  }

  create(): void {
    this.add.image(0, 0, 'bg').setOrigin(0, 0).setDisplaySize(1280, 720);
    this.add.rectangle(640, 360, 1280, 720, 0x0a0618, 0.55).setOrigin(0.5, 0.5);

    this.add
      .text(640, 150, 'LAST SURVIVOR', {
        fontFamily: 'Courier New, monospace',
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#ffb347',
        stroke: '#2a1230',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(640, 205, 'A N  E R A   P L A T F O R M E R', {
        fontFamily: 'Courier New, monospace',
        fontSize: '18px',
        color: '#e8d8ff',
      })
      .setOrigin(0.5);

    this.add
      .text(640, 545, 'Knock each other off the island — last one standing wins.', {
        fontFamily: 'Courier New, monospace',
        fontSize: '18px',
        color: '#d6c9f0',
      })
      .setOrigin(0.5);

    // name form (dedup across scene restarts)
    const form = document.getElementById('name-form-inner');
    const input = document.getElementById('name-input') as HTMLInputElement | null;
    const stored = localStorage.getItem('lsa-name');
    if (input && stored) input.value = stored;
    if (this.formHandler) form?.removeEventListener('submit', this.formHandler);
    this.formHandler = (e: Event) => {
      e.preventDefault();
      const name = (input?.value ?? '').trim() || `Adventurer-${Math.floor(1000 + Math.random() * 9000)}`;
      triggerJoin(name);
    };
    form?.addEventListener('submit', this.formHandler);

    // hide arena-only chrome if we were coming from the arena
    setTouchControlsVisible(false);
    syncRestartButton(false, false);

    // GO button (lobby): visible once you're in, so anyone can force-reload
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown', (e: KeyboardEvent) => {
        if (e.code === 'Enter' && !e.repeat && store.joined && store.snapshot?.phase === 'lobby') {
          store.client?.sendRestart();
        }
      });
    }
    syncGoButton(!!store.snapshot && store.snapshot.phase === 'lobby' && store.joined);

    // device-appropriate hint text
    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.textContent = store.touchMode
        ? 'Use the ◀ ▶ and JUMP buttons to move. Knock each other off the island — last one standing wins.'
        : '← → or A / D to move · Space to jump · Knock each other off the island — last one standing wins.';
    }

    // hide arena-only chrome if we were coming from the arena
    this.showDOMChrome();

    // sync initial DOM
    this.syncDOM();
  }

  update(_time: number, delta: number): void {
    const snap = store.snapshot;
    if (snap && snap.phase !== 'lobby') {
      this.scene.start('Arena');
      return;
    }

    this.syncAccum += delta;
    if (this.syncAccum > 150) {
      this.syncAccum = 0;
      this.syncDOM();
    }
  }

  private showDOMChrome(): void {
    syncOverlay();
    // re-show the roster + header in the lobby (the arena hides them)
    const roster = document.getElementById('roster');
    const header = document.getElementById('status-line');
    if (store.joined) {
      if (roster) roster.style.display = 'block';
      if (header) header.style.display = 'block';
    }
  }

  private syncDOM(): void {
    const snap = store.snapshot;

    syncOverlay();

    // keep the GO button in sync (only in the lobby, only when joined)
    syncGoButton(!!snap && snap.phase === 'lobby' && store.joined);

    if (!snap) {
      setStatusPill('off', 'Connecting…');
      setHeader('Waiting for connection…');
      renderRoster('roster');
      return;
    }

    const active = snap.players.filter((p) => !p.waiting);
    const count = active.length;

    if (snap.phase === 'starting' && snap.countdownMs !== null) {
      const s = Math.ceil(snap.countdownMs / 1000);
      setHeader(`Starting in ${s}…`);
      setStatusPill('ok', '● Starting soon');
    } else if (count < WORLD.fallbackStartPlayers) {
      setHeader('Waiting for players…');
      setStatusPill('warn', '● Waiting for players');
    } else if (count >= WORLD.quickStartPlayers) {
      setHeader(`Arena full-ish — starting in a moment…`);
      setStatusPill('ok', `● ${count}/${WORLD.capacity} players`);
    } else {
      setHeader(`Waiting for ${WORLD.fallbackStartPlayers - count > 0 ? WORLD.fallbackStartPlayers - count : 0} more player(s)…`);
      setStatusPill('warn', `● ${count}/${WORLD.capacity} players`);
    }

    renderRoster('roster');
  }
}
