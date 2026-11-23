import type { SnapshotMessage } from '../../shared/src/protocol';
import type { Fx } from '../../shared/src/types';
import type { ConnectionStatus, GameClient } from './net';
import { SnapshotBuffer } from './interp';

/** Mutable state shared by the network client, the Phaser scenes and the DOM overlay. */
export const store = {
  conn: 'connecting' as ConnectionStatus,
  selfId: null as string | null,
  name: '',
  joined: false,
  client: null as GameClient | null,
  /** Most recent snapshot (HUD / phase decisions). */
  snapshot: null as SnapshotMessage | null,
  /** Interpolation buffer (world rendering). */
  buffer: new SnapshotBuffer(),
  /** Effects waiting for the render clock to reach their sim time. */
  fxQueue: [] as { t: number; fx: Fx }[],
  touchMode: false,
};

export function onSnapshot(snap: SnapshotMessage): void {
  store.snapshot = snap;
  store.selfId = snap.selfId || store.selfId;
  store.buffer.push(snap, performance.now());
  for (const fx of snap.fx) store.fxQueue.push({ t: snap.simTimeMs, fx });
  if (store.fxQueue.length > 400) store.fxQueue.splice(0, store.fxQueue.length - 400);
}

export function selfState() {
  const snap = store.snapshot;
  if (!snap || !store.selfId) return null;
  return snap.players.find((p) => p.id === store.selfId) ?? null;
}
