import type { ClientMessage } from '../../shared/src/protocol';
import type { Page, PlayerView, StateView, Task } from '../../shared/src/types';
import { watchPref } from '@tggame/base/client/watch';
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

/** What was last handed in, and the task it answered. */
let handedIn: { task: string; msg: ClientMessage } | null = null;

/**
 * Hand in a turn (a pick, a word, a drawing, a guess). A socket that is dying takes what was
 * just sent down with it, silently; so the page is kept, and `taskArrived` sends it again when a
 * new connection is told the very task it was the answer to.
 */
export function handIn(msg: ClientMessage): void {
  handedIn = { task: JSON.stringify(store.task), msg };
  send(msg);
}

/**
 * The server's word on our task. It only sends one when it changes, or to a fresh connection: so
 * the task we already answered, arriving again, means a reconnect, and the answer goes again
 * (handing in the same page twice does no harm).
 */
export function taskArrived(task: Task | null): void {
  store.task = task;
  if (!handedIn) return;
  if (JSON.stringify(task) === handedIn.task) send(handedIn.msg);
  else handedIn = null;
}

export const isSeated = (): boolean => !!store.state && store.state.seats.includes(store.state.selfId);

/** Small persisted bits. */
export const saved = { ...savedBits('dt'), draft: () => getItem('dt-draft'), setDraft: (v: string | null) => setItem('dt-draft', v) };

/** Is this screen only watching (a TV)? Remembered, and settable with `?watch=1`. */
export const watching = watchPref('dt');
