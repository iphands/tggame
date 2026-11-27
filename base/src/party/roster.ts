/** Who is at the table. The part of a party game's server that every game does the same way. */

export type Rng = () => number;

export type Seated = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  /** Secret that lets a reconnecting client reclaim this seat. */
  token: string;
  connected: boolean;
  /** Joined mid-game or beyond the last seat: watching until the next game. */
  spectator: boolean;
};

export abstract class Roster<P extends Seated> {
  /** Everyone at the table, in arrival order. */
  readonly players = new Map<string, P>();
  protected nextId = 1;

  protected constructor(
    protected readonly rng: Rng,
    /** Most players a game seats. */
    private readonly maxSeats: number,
    private readonly colors: readonly string[],
  ) {}

  abstract phase: string;
  /** End whatever is running and put everyone back in the lobby. */
  protected abstract toLobby(): void;

  removeBot(by: string): void {
    if (this.phase !== 'lobby' || by !== this.hostId()) return;
    const bot = [...this.players.values()].reverse().find((p) => p.bot);
    if (bot) this.players.delete(bot.id);
  }

  /** The first connected human: seated players first, then anyone. Null when nobody is here. */
  hostId(): string | null {
    const humans = [...this.players.values()].filter((p) => !p.bot && p.connected);
    return (humans.find((p) => !p.spectator) ?? humans[0])?.id ?? null;
  }

  /** Back to the lobby after the finale. */
  again(by: string): void {
    if (this.phase === 'finale' && by === this.hostId()) this.toLobby();
  }

  /** Host bails out of a running game. */
  abort(by: string): void {
    if (this.phase !== 'lobby' && by === this.hostId()) this.toLobby();
  }

  humansConnected(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot && p.connected) n++;
    return n;
  }

  botCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.bot) n++;
    return n;
  }

  protected participants(): P[] {
    return [...this.players.values()].filter((p) => !p.spectator);
  }

  /** May the host add a bot right now? */
  protected canAddBot(by: string): boolean {
    return this.phase === 'lobby' && by === this.hostId() && this.participants().length < this.maxSeats;
  }

  /** A bot name nobody at the table has, or `fallback` (made unique) when all are taken. */
  protected botName(names: readonly string[], fallback: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const free = names.filter((n) => !taken.has(n));
    return this.uniqueName(free.length ? free[Math.floor(this.rng() * free.length)] : fallback);
  }

  protected uniqueName(base: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  protected freeColor(): string {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return this.colors.find((c) => !used.has(c)) ?? this.colors[this.players.size % this.colors.length];
  }
}

export function shuffle<T>(list: T[], rng: Rng): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
