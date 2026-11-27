import type { ClientMessage } from '../../shared/src/protocol';
import type { Page, PlayerView, StateView, Task } from '../../shared/src/types';
import { partyStore } from '@tggame/base/party/store';
import { getItem, setItem, savedBits } from '@tggame/base/client/storage';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const { store, wire, send, refresh, player, me, nameOf, isHost } = partyStore<StateView, PlayerView, Task, ClientMessage>()({
  /** Revealed pages, by book then page index. */
  books: new Map<number, Page[]>(),
  /** Game number the cached pages belong to. */
  pagesGame: -1,
  /** Turn the player reopened after handing it in ("change it"). */
  editingTurn: -1,
});

export const isSeated = (): boolean => !!store.state && store.state.seats.includes(store.state.selfId);

/** Small persisted bits. */
export const saved = { ...savedBits('dt'), draft: () => getItem('dt-draft'), setDraft: (v: string | null) => setItem('dt-draft', v) };
