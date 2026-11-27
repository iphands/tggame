import { describe, expect, it } from 'vitest';
import { Roster, type Seated } from '../src/party/roster.js';

class Table extends Roster<Seated> {
  phase = 'lobby';
  constructor() {
    super(Math.random, 8, ['#111', '#222']);
  }
  protected toLobby(): void {
    this.phase = 'lobby';
    this.reseat();
  }
  lobby(): void {
    this.toLobby();
  }
  sit(name: string, extra: Partial<Seated> = {}): string {
    const id = `p${this.nextId++}`;
    this.players.set(id, { id, name, color: '#111', bot: false, token: id, connected: true, spectator: false, watcher: false, ...extra });
    return id;
  }
}

describe('only watching', () => {
  const seatedOf = (t: Table): string[] => [...t.players.values()].filter((p) => !p.spectator).map((p) => p.name);

  it('gives up a seat in the lobby at once, and whoever was waiting gets it', () => {
    const t = new Table();
    for (let i = 0; i < 8; i++) t.sit(`P${i}`);
    t.sit('Late', { spectator: true });
    const tv = [...t.players.keys()][0];
    t.watch(tv, true);
    expect(t.players.get(tv)).toMatchObject({ spectator: true, watcher: true });
    expect(seatedOf(t)).toContain('Late');
    expect(seatedOf(t)).toHaveLength(8);
  });

  it('gets a seat back in the lobby only when one is free', () => {
    const t = new Table();
    const tv = t.sit('TV');
    t.watch(tv, true);
    for (let i = 0; i < 8; i++) t.sit(`P${i}`);
    t.watch(tv, false);
    expect(t.players.get(tv)).toMatchObject({ spectator: true, watcher: false });
    t.watch(tv, true);
    t.players.delete([...t.players.keys()][1]);
    t.watch(tv, false);
    expect(t.players.get(tv)).toMatchObject({ spectator: false, watcher: false });
  });

  it('keeps a seat held in a running game until the next lobby, and is never seated after', () => {
    const t = new Table();
    const tv = t.sit('TV');
    t.sit('Mo');
    t.phase = 'play';
    t.watch(tv, true);
    expect(t.players.get(tv)).toMatchObject({ spectator: false, watcher: true });
    t.lobby();
    expect(seatedOf(t)).toEqual(['Mo']);
    t.lobby();
    expect(seatedOf(t)).toEqual(['Mo']);
  });

  it('is not for bots', () => {
    const t = new Table();
    const bot = t.sit('Bot', { bot: true });
    t.watch(bot, true);
    expect(t.players.get(bot)!.watcher).toBe(false);
  });
});

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

describe('changing your name', () => {
  it('cleans the name and refuses an empty one', () => {
    const t = new Table();
    const mo = t.sit('Mo');
    expect(t.rename(mo, '  <b>Momo</b>  ')).toBe(true);
    expect(t.players.get(mo)!.name).toBe('bMomob');
    expect(t.rename(mo, '!!!')).toBe(false);
    expect(t.rename(mo, 7)).toBe(false);
    expect(t.players.get(mo)!.name).toBe('bMomob');
  });

  it('keeps names unique, but lets you change only the capitals of your own', () => {
    const t = new Table();
    const mo = t.sit('Mo');
    t.sit('Al');
    expect(t.rename(mo, 'al')).toBe(true);
    expect(t.players.get(mo)!.name).toBe('al 2');
    expect(t.rename(mo, 'MO')).toBe(true);
    expect(t.players.get(mo)!.name).toBe('MO');
    expect(t.rename(mo, 'MO')).toBe(false);
  });

  it('leaves bots and strangers alone', () => {
    const t = new Table();
    const bot = t.sit('Bot', { bot: true });
    expect(t.rename(bot, 'Human')).toBe(false);
    expect(t.rename('nobody', 'Human')).toBe(false);
  });

  it('makes whoever takes the house name the host', () => {
    const t = new Table();
    const mo = t.sit('Mo');
    const al = t.sit('Al');
    expect(t.hostId()).toBe(mo);
    t.rename(al, 'EasyE');
    expect(t.hostId()).toBe(al);
  });
});
