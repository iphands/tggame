import type { ClientMessage } from '../../shared/src/protocol';
import type { PlayerView, StateView } from '../../shared/src/types';
import { partyStore } from '@tggame/base/party/store';
import { savedBits } from '@tggame/base/client/storage';

/** Everything the client knows about the game's state. Screens read this and re-render when `main.ts` says so. */
export const { store, wire, send, refresh, player, me, nameOf, isHost } = partyStore<StateView, PlayerView, null, ClientMessage>()({});

export const isSeated = (): boolean => !!me() && !me()!.spectator;

/** Small persisted bits. */
export const saved = savedBits('lb');
