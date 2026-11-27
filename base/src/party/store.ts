/** The part of a party game's client state that is the same in every game. */
import type { ConnectionStatus } from '../client/net.js';

type PlayerLike = { id: string; name: string };
type StateLike<P> = { selfId: string; hostId: string | null; players: P[] };

/**
 * Builds the store and the helpers around it. `extra` holds the fields only this game has.
 * Screens read `store` and re-render when the game's `main.ts` says so.
 */
export function partyStore<State extends StateLike<P>, P extends PlayerLike, Task, Msg>() {
  return <Extra extends object>(extra: Extra) => {
    const store = {
      status: 'connecting' as ConnectionStatus,
      state: null as State | null,
      task: null as Task | null,
      ...extra,
    };

    let sender: (msg: Msg) => void = () => {};
    let rerender: () => void = () => {};

    function wire(send: (msg: Msg) => void, render: () => void): void {
      sender = send;
      rerender = render;
    }
    const send = (msg: Msg): void => sender(msg);
    const refresh = (): void => rerender();

    function player(id: string | null | undefined): P | undefined {
      return store.state?.players.find((p) => p.id === id);
    }
    const me = (): P | undefined => player(store.state?.selfId);
    const nameOf = (id: string | null | undefined): string => player(id)?.name ?? 'someone';
    const isHost = (): boolean => !!store.state && store.state.hostId === store.state.selfId;

    return { store, wire, send, refresh, player, me, nameOf, isHost };
  };
}
