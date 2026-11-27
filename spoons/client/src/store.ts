import type { ClientMessage } from '../../shared/src/protocol';
import type { PlayerView, StateView, Task } from '../../shared/src/types';
import type { ConnectionStatus } from './net';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const store = {
  status: 'connecting' as ConnectionStatus,
  state: null as StateView | null,
  /** This player's own cards. */
  task: null as Task | null,
  /** Server clock minus ours, so timers agree with the server's. */
  clockOffset: 0,
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
/** The server's idea of now. */
export const serverNow = (): number => Date.now() + store.clockOffset;

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
  name: () => get('sp-name') ?? '',
  setName: (v: string) => set('sp-name', v),
  token: () => get('sp-token') ?? undefined,
  setToken: (v: string | null) => set('sp-token', v),
  muted: () => get('sp-muted') === '1',
  setMuted: (m: boolean) => set('sp-muted', m ? '1' : '0'),
};
