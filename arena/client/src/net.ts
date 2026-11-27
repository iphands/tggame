import type { ClientMessage, ServerMessage, SnapshotMessage } from '../../shared/src/protocol';
import { SocketClient, wsUrl, type ConnectionStatus } from '@tggame/base/client/net';

export type { ConnectionStatus };

/** The Vite dev server (port 5173) talks to the game server on :8090; see `wsUrl`. */
export const defaultWsUrl = (loc: Parameters<typeof wsUrl>[0]): string => wsUrl(loc, '5173', 8090);

export type GameClientOptions = {
  name: string;
  url?: string;
  onWelcome?: (selfId: string) => void;
  onSnapshot?: (snap: SnapshotMessage) => void;
  onStatus?: (status: ConnectionStatus) => void;
};

/** This game's socket: auto-reconnects and re-joins under the same name. */
export class GameClient extends SocketClient<ClientMessage, ServerMessage> {
  private lastInput = '';
  private lastInputAt = 0;

  constructor(opts: GameClientOptions) {
    super({
      url: opts.url ?? defaultWsUrl(window.location),
      name: opts.name,
      onStatus: opts.onStatus,
      onMessage: (msg) => {
        if (msg.type === 'snapshot') opts.onSnapshot?.(msg);
        else if (msg.type === 'welcome') opts.onWelcome?.(msg.selfId);
      },
    });
  }

  protected override opened(): void {
    this.lastInput = '';
  }

  /**
   * Send held-button state when it changes, plus a heartbeat every 400 ms so
   * a held key survives server-side resets (new round) and dropped messages.
   */
  sendInput(input: { left: boolean; right: boolean; jump: boolean }): void {
    const key = `${+input.left}${+input.right}${+input.jump}`;
    const now = performance.now();
    if (key === this.lastInput && now - this.lastInputAt < 400) return;
    this.lastInput = key;
    this.lastInputAt = now;
    this.send({ type: 'input', ...input });
  }
}
