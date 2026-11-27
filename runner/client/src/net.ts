import type { ClientMessage, ServerMessage, SnapshotMessage, Stamp } from '../../shared/src/protocol';
import type { Records } from '../../shared/src/types';
import { SocketClient, wsUrl, type ConnectionStatus } from '@tggame/base/client/net';

export type { ConnectionStatus };

/** The Vite dev server (port 5174) talks to the game server on :8091; see `wsUrl`. */
export const defaultWsUrl = (loc: Parameters<typeof wsUrl>[0]): string => wsUrl(loc, '5174', 8091);

export type GameClientOptions = {
  name: string;
  url?: string;
  onWelcome?: (selfId: string) => void;
  onSnapshot?: (snap: SnapshotMessage) => void;
  onStatus?: (status: ConnectionStatus) => void;
  onRecords?: (records: Records) => void;
  onRenamed?: (id: string, name: string) => void;
  /** The socket opened (again): whatever was known about the old connection is void. */
  onOpen?: () => void;
};

/** This game's socket: auto-reconnects and re-joins under the same name. */
export class GameClient extends SocketClient<ClientMessage, ServerMessage> {
  private lastInput = '';
  private lastInputAt = 0;

  private readonly onOpen?: () => void;

  constructor(opts: GameClientOptions) {
    super({
      url: opts.url ?? defaultWsUrl(window.location),
      name: opts.name,
      onStatus: opts.onStatus,
      onMessage: (msg) => {
        if (msg.type === 'snapshot') opts.onSnapshot?.(msg);
        else if (msg.type === 'welcome') opts.onWelcome?.(msg.selfId);
        else if (msg.type === 'records') opts.onRecords?.(msg.records);
        else if (msg.type === 'renamed') opts.onRenamed?.(msg.id, msg.name);
      },
    });
    this.onOpen = opts.onOpen;
  }

  protected override opened(): void {
    this.lastInput = '';
    this.onOpen?.();
  }

  /**
   * Let go of everything (the tab was hidden: its keys can no longer be seen coming up, and the
   * server would run our runner on with the last thing it heard).
   */
  releaseAll(): void {
    this.lastInput = '';
    this.send({ type: 'input', left: false, right: false, jump: false });
  }

  /**
   * Send held-button state when it changes, plus a heartbeat every 400 ms so
   * a held key survives server-side resets (new round) and dropped messages.
   */
  sendInput(input: { left: boolean; right: boolean; jump: boolean }, stamp?: () => Stamp): void {
    const key = `${+input.left}${+input.right}${+input.jump}`;
    const now = performance.now();
    if (key === this.lastInput && now - this.lastInputAt < 400) return;
    this.lastInput = key;
    this.lastInputAt = now;
    // stamped with the tick it is for, when the prediction is running (see `predict.ts`)
    this.send({ type: 'input', ...input, ...stamp?.() });
  }
}
