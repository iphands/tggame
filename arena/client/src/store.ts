import type { SnapshotMessage } from '../../shared/src/protocol';
import type { Fx } from '../../shared/src/types';
import type { ConnectionStatus, GameClient } from './net';
import { clock } from '@tggame/base/client/clock';
import { netMeterShown, setNetExtra } from '@tggame/base/client/netMeter';
import { SnapshotBuffer } from '@tggame/base/platformer/interp';
import { Predictor, isMoveFx } from './predict';
import { QualityManager } from '@tggame/base/platformer/quality';

/** Mutable state shared by the network client, the Phaser scenes and the DOM overlay. */
export const store = {
  conn: 'connecting' as ConnectionStatus,
  selfId: null as string | null,
  name: '',
  joined: false,
  /** This screen only watches (a TV): it has no fighter of its own. */
  watching: false,
  client: null as GameClient | null,
  /** Most recent snapshot (HUD / phase decisions). */
  snapshot: null as SnapshotMessage | null,
  /** Interpolation buffer (world rendering). */
  buffer: new SnapshotBuffer<SnapshotMessage>(),
  /** Effects waiting for the render clock to reach their sim time. */
  fxQueue: [] as { t: number; fx: Fx }[],
  /** Effects our own fighter caused in the prediction: played at once. */
  localFx: [] as Fx[],
  /** Our own fighter, carried ahead of the snapshots (`predict.ts`). */
  predictor: new Predictor((fx) => localFx(fx)),
  /** When each of our own shots was shown ahead of the server's word (local clock, ms). */
  ownShots: [] as number[],
  /** Has the predictor's lead been set from the measured line yet? */
  leadSeeded: false,
  touchMode: false,
  /** Graphics tier (set up in main.ts from the saved setting). */
  quality: new QualityManager('auto'),
};

/** Was this shot of ours already shown? (One shown and never confirmed is forgotten after a while.) */
function takeOwnShot(): boolean {
  const now = performance.now();
  while (store.ownShots.length && now - store.ownShots[0] > 1500) store.ownShots.shift();
  return store.ownShots.shift() !== undefined;
}

function localFx(fx: Fx): void {
  store.localFx.push(fx);
  if (store.localFx.length > 40) store.localFx.shift();
}

/** A new connection is a new fighter: nothing predicted for the old one holds. */
export function resetPrediction(): void {
  store.predictor.reset();
  store.leadSeeded = false;
  store.localFx.length = 0;
}

export function onSnapshot(snap: SnapshotMessage): void {
  store.snapshot = snap;
  store.selfId = snap.selfId || store.selfId;
  store.buffer.push(snap, performance.now());
  const pred = store.predictor;
  if (!store.leadSeeded && clock.synced) {
    pred.seedLead(clock.rtt, clock.jitter);
    store.leadSeeded = true;
  }
  pred.jitterMs = clock.jitter;
  // several snapshots after a stall each land here; the predictor only ever keeps the newest
  pred.onSnapshot(snap);
  if (netMeterShown()) {
    setNetExtra('lead', `${pred.leadMs.toFixed(0)} ms · late ${pred.late}×`);
    setNetExtra('fixed', `${pred.corrections}× · last ${pred.lastCorrection.toFixed(0)} px`);
    setNetExtra('others', `${store.buffer.delayMs.toFixed(0)} ms behind · ran dry ${store.buffer.underruns}×`);
  }
  for (const fx of snap.fx) {
    // our own jumps and landings were already played, from the prediction
    if (pred.active && isMoveFx(fx) && 'id' in fx && fx.id === snap.selfId) continue;
    // …and so was the flash and bang of a shot we showed the moment the trigger was pulled
    if (fx.k === 'shot' && fx.id === snap.selfId && takeOwnShot()) continue;
    store.fxQueue.push({ t: snap.simTimeMs, fx });
  }
  if (store.fxQueue.length > 400) store.fxQueue.splice(0, store.fxQueue.length - 400);
}

export function selfState() {
  const snap = store.snapshot;
  if (!snap || !store.selfId) return null;
  return snap.players.find((p) => p.id === store.selfId) ?? null;
}
