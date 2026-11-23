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
