import type { ClientMessage } from '../../shared/src/protocol';
import type { PlayerView, StateView, Task } from '../../shared/src/types';
import { partyStore } from '@tggame/base/party/store';
import { serverNow } from '@tggame/base/client/clock';
import { savedBits } from '@tggame/base/client/storage';

/** Everything the client knows. Screens read this and re-render when `main.ts` says so. */
export const { store, wire, send, refresh, player, me, nameOf, isHost } = partyStore<StateView, PlayerView, Task, ClientMessage>()({
});

export const isSeated = (): boolean => !!me() && !me()!.spectator;
/** The server's idea of now, from the socket's ping/pong pairs. */
export { serverNow };

/** Small persisted bits. */
export const saved = savedBits('sp');
