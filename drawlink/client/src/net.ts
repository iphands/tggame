import type { ClientMessage, ServerMessage } from '../../shared/src/protocol';
import { SocketClient, wsUrl, type ConnectionStatus, type SocketClientOptions } from '@tggame/base/client/net';

export type { ConnectionStatus };

/** The Vite dev server (port 5176) talks to the game server on :8093; see `wsUrl`. */
export const defaultWsUrl = (loc: Parameters<typeof wsUrl>[0]): string => wsUrl(loc, '5176', 8093);

export type GameClientOptions = Omit<SocketClientOptions<ServerMessage>, 'url'> & { url?: string };

/** This game's socket: auto-reconnects and re-joins with the seat token. */
export class GameClient extends SocketClient<ClientMessage, ServerMessage> {
  constructor(opts: GameClientOptions) {
    super({ ...opts, url: opts.url ?? defaultWsUrl(window.location) });
  }
}
