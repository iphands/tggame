import { describe, expect, it } from 'vitest';
import { Roster, type Seated } from '../src/party/roster.js';

class Table extends Roster<Seated> {
  phase = 'lobby';
  constructor() {
    super(Math.random, 8, ['#111', '#222']);
  }
  protected toLobby(): void {
    this.phase = 'lobby';
  }
  sit(name: string, extra: Partial<Seated> = {}): string {
    const id = `p${this.nextId++}`;
    this.players.set(id, { id, name, color: '#111', bot: false, token: id, connected: true, spectator: false, ...extra });
    return id;
  }
}

describe('who hosts', () => {
  it('is the first connected human, seated before watching', () => {
    const t = new Table();
    t.sit('Bot', { bot: true });
    t.sit('Watcher', { spectator: true });
    const mo = t.sit('Mo');
    expect(t.hostId()).toBe(mo);
  });

  it('is EasyE whenever he is connected, taking over from whoever was hosting', () => {
    const t = new Table();
    const mo = t.sit('Mo');
    expect(t.hostId()).toBe(mo);
    const easy = t.sit('EasyE');
    expect(t.hostId()).toBe(easy);
  });

  it('ignores case and still applies when he is only watching', () => {
    const t = new Table();
    t.sit('Mo');
    const easy = t.sit('easye', { spectator: true });
    expect(t.hostId()).toBe(easy);
  });

  it('goes back to someone else while he is disconnected', () => {
    const t = new Table();
    const mo = t.sit('Mo');
    const easy = t.sit('EasyE');
    t.players.get(easy)!.connected = false;
    expect(t.hostId()).toBe(mo);
    t.players.get(easy)!.connected = true;
    expect(t.hostId()).toBe(easy);
  });

  it('does not fall for a lookalike name or a bot', () => {
    const t = new Table();
    const mo = t.sit('Mo');
    t.sit('EasyE 2');
    t.sit('EasyE', { bot: true });
    expect(t.hostId()).toBe(mo);
  });
});
