/** DOM overlay helpers (the Phaser canvas sits underneath). */
import { store } from './store';

export function syncOverlay(): void {
  const form = document.getElementById('name-form');
  const roster = document.getElementById('roster');
  const header = document.getElementById('status-line');

  if (form) form.style.display = store.joined ? 'none' : 'block';
  if (roster) roster.style.display = store.joined ? 'block' : 'none';
  if (header) header.style.display = store.joined ? 'block' : 'none';
}

export function hideChrome(): void {
  for (const id of ['roster', 'status-line']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  const form = document.getElementById('name-form');
  if (form) form.style.display = 'none';
}

export function setHeader(text: string): void {
  const header = document.getElementById('status-line');
  if (header) header.textContent = text;
}

/** Toggle the force-restart button (arena only). Shown big on the win banner. */
export function syncRestartButton(visible: boolean, ended: boolean): void {
  const el = document.getElementById('restart-btn');
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
  el.classList.toggle('big', visible && ended);
}

/** Toggle the GO button (lobby only). Anyone can press it to force-reload the level. */
export function syncGoButton(visible: boolean): void {
  const el = document.getElementById('go-btn');
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
}
