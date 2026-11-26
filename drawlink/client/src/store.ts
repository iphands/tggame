import type { ClientMessage } from '../../shared/src/protocol';
import type { ChatLine, Drawing, PlayerView, StateView, Task } from '../../shared/src/types';
import type { ConnectionStatus } from './net';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const store = {
  status: 'connecting' as ConnectionStatus,
  state: null as StateView | null,
  task: null as Task | null,
  /** Server clock minus ours, so the round timer agrees with the server's. */
  clockOffset: 0,
  /** The shared page of turn `turn`. The pad draws on this very list. */
  canvas: { turn: -1, strokes: [] as Drawing },
  chat: [] as ChatLine[],
  /** Bumped when the chat log is replaced wholesale (a fresh join). */
  chatEpoch: 0,
  /** Player the next chat line is whispered to. */
  whisperTo: null as string | null,
};

let sender: (msg: ClientMessage) => void = () => {};
let rerender: () => void = () => {};

export function wire(send: (msg: ClientMessage) => void, render: () => void): void {
  sender = send;
  rerender = render;
}
export const send = (msg: ClientMessage): void => sender(msg);
export const refresh = (): void => rerender();

export function player(id: string | null | undefined): PlayerView | undefined {
  return store.state?.players.find((p) => p.id === id);
}
export const nameOf = (id: string | null | undefined): string => player(id)?.name ?? 'someone';
export const isHost = (): boolean => !!store.state && store.state.hostId === store.state.selfId;
export const isSeated = (): boolean => !!me() && !me()!.spectator;
export const me = (): PlayerView | undefined => player(store.state?.selfId);
/** Is this player holding the pen in a running round? */
export const amDrawing = (): boolean => !!store.state && store.state.phase === 'draw' && store.state.round?.drawerId === store.state.selfId;
/** The server's idea of now. */
export const serverNow = (): number => Date.now() + store.clockOffset;

/** Canvas changes are painted as they arrive, by whichever screen shows the page. */
export type CanvasChange = { kind: 'load' } | { kind: 'grew'; i: number; from: number } | { kind: 'repaint' };
let canvasListener: (c: CanvasChange) => void = () => {};
export const onCanvas = (fn: ((c: CanvasChange) => void) | null): void => void (canvasListener = fn ?? (() => {}));
export const canvasChanged = (c: CanvasChange): void => canvasListener(c);

// ---- small persisted bits

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

export const saved = {
  name: () => get('dl-name') ?? '',
  setName: (v: string) => set('dl-name', v),
  token: () => get('dl-token') ?? undefined,
  setToken: (v: string | null) => set('dl-token', v),
  muted: () => get('dl-muted') === '1',
  setMuted: (m: boolean) => set('dl-muted', m ? '1' : '0'),
};
