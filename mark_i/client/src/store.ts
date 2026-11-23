import type { GameClient, Snapshot } from './net';

/** Mutable shared state between the ws client, scenes, and the DOM overlay. */
export const store = {
  conn: 'connecting' as 'connecting' | 'connected' | 'disconnected',
  selfId: null as string | null,
  capacity: 16,
  selfName: 'Adventurer',
  snapshot: null as Snapshot | null,
  selfPlayer: null as { name: string; color: string } | null,
  client: null as GameClient | null,
  joined: false,
};

let onJoinHandler: (name: string) => void = () => {};
export function setJoinHandler(fn: (name: string) => void): void {
  onJoinHandler = fn;
}
export function triggerJoin(name: string): void {
  onJoinHandler(name);
}

let rosterKey = '';
export function renderRoster(containerId: string): void {
  const el = document.getElementById(containerId);
  if (!el) return;
  const snap = store.snapshot;
  if (!snap || (snap.phase !== 'lobby' && snap.phase !== 'starting')) {
    if (rosterKey !== '') { el.innerHTML = ''; rosterKey = ''; }
    return;
  }
  const active = snap.players.filter((p) => !p.waiting);
  const key = active.map((p) => `${p.id}:${p.name}`).join('|');
  if (key === rosterKey) return;
  rosterKey = key;
  el.innerHTML = active
    .map(
      (p) =>
        `<div class="roster-item"><span class="dot" style="background:${p.color}"></span><span>${escapeHtml(p.name)}</span>${p.id === store.selfId ? '<span class="you">you</span>' : ''}</div>`
    )
    .join('');
}

export function setStatusPill(kind: 'ok' | 'warn' | 'off', text: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = `pill ${kind}`;
}

export function updateSelf(selfId: string, selfName: string | null, color?: string): void {
  store.selfId = selfId;
  if (selfName) store.selfName = selfName;
  if (color) store.selfPlayer = { name: store.selfName, color };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
