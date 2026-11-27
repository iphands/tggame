import type { ClientMessage } from '../../shared/src/protocol';
import type { ChatLine, Drawing, PlayerView, StateView, Task } from '../../shared/src/types';
import { partyStore } from '@tggame/base/party/store';
import { savedBits } from '@tggame/base/client/storage';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const { store, wire, send, refresh, player, me, nameOf, isHost } = partyStore<StateView, PlayerView, Task, ClientMessage>()({
  /** Server clock minus ours, so the round timer agrees with the server's. */
  clockOffset: 0,
  /** The shared page of turn `turn`. The pad draws on this very list. */
  canvas: { turn: -1, strokes: [] as Drawing },
  chat: [] as ChatLine[],
  /** Bumped when the chat log is replaced wholesale (a fresh join). */
  chatEpoch: 0,
  /** Player the next chat line is whispered to. */
  whisperTo: null as string | null,
});

export const isSeated = (): boolean => !!me() && !me()!.spectator;
/** Is this player holding the pen in a running round? */
export const amDrawing = (): boolean => !!store.state && store.state.phase === 'draw' && store.state.round?.drawerId === store.state.selfId;
/** The server's idea of now. */
export const serverNow = (): number => Date.now() + store.clockOffset;

/** Canvas changes are painted as they arrive, by whichever screen shows the page. */
export type CanvasChange = { kind: 'load' } | { kind: 'grew'; i: number; from: number } | { kind: 'repaint' };
let canvasListener: (c: CanvasChange) => void = () => {};
export const onCanvas = (fn: ((c: CanvasChange) => void) | null): void => void (canvasListener = fn ?? (() => {}));
export const canvasChanged = (c: CanvasChange): void => canvasListener(c);

/** Small persisted bits. */
export const saved = savedBits('dl');
