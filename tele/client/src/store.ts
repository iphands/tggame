import type { ClientMessage } from '../../shared/src/protocol';
import type { Page, PlayerView, StateView, Task } from '../../shared/src/types';
import type { ConnectionStatus } from './net';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const store = {
  status: 'connecting' as ConnectionStatus,
  state: null as StateView | null,
  task: null as Task | null,
  /** Revealed pages, by book then page index. */
  books: new Map<number, Page[]>(),
  /** Game number the cached pages belong to. */
  pagesGame: -1,
  /** Turn the player reopened after handing it in ("change it"). */
  editingTurn: -1,
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
export const isSeated = (): boolean => !!store.state && store.state.seats.includes(store.state.selfId);

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
  name: () => get('dt-name') ?? '',
  setName: (v: string) => set('dt-name', v),
  token: () => get('dt-token') ?? undefined,
  setToken: (v: string | null) => set('dt-token', v),
  draft: () => get('dt-draft'),
  setDraft: (v: string | null) => set('dt-draft', v),
  muted: () => get('dt-muted') === '1',
  setMuted: (m: boolean) => set('dt-muted', m ? '1' : '0'),
};
