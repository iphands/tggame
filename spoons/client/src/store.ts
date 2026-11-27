import type { ClientMessage } from '../../shared/src/protocol';
import type { PlayerView, StateView, Task } from '../../shared/src/types';
import { partyStore } from '@tggame/base/party/store';
import { clock, serverNow } from '@tggame/base/client/clock';
import { savedBits } from '@tggame/base/client/storage';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const { store, wire, send, refresh, player, me, nameOf, isHost } = partyStore<StateView, PlayerView, Task, ClientMessage>()({
});

/** What the server last said our cards are; `store.task` may be a guess ahead of it. */
let serverTask: Task | null = null;
let guessTimer: ReturnType<typeof setTimeout> | null = null;

/** The server's word on our cards. */
export function setTask(task: Task | null): void {
  serverTask = task;
  store.task = task;
  if (guessTimer) clearTimeout(guessTimer);
  guessTimer = null;
}

/**
 * Show our cards as they will be once the server has done what we just sent, without waiting a
 * round trip for it to say so. Its next `task` replaces the guess; if none comes (the move was
 * refused, so nothing changed for it to send), the guess is taken back.
 */
export function guessTask(task: Task): void {
  store.task = task;
  refresh();
  if (guessTimer) clearTimeout(guessTimer);
  guessTimer = setTimeout(() => {
    guessTimer = null;
    if (store.task !== task) return;
    store.task = serverTask;
    refresh();
  }, 2000 + clock.rtt);
}

export const isSeated = (): boolean => !!me() && !me()!.spectator;
/** The server's idea of now, from the socket's ping/pong pairs. */
export { serverNow };

/** Small persisted bits. */
export const saved = savedBits('sp');
