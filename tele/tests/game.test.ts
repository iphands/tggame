import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../shared/src/constants';
import { turnCount } from '../shared/src/rotation';
import { Game } from '../server/src/game';
import { doodle, playToReveal, playTurn, seeded, table } from './helpers';

describe('lobby', () => {
  it('names are cleaned, defaulted and made unique; colours differ', () => {
    const g = new Game(seeded());
    const a = g.join('Mo!')!.id;
    const b = g.join('mo')!.id;
    const c = g.join('')!.id;
    const v = g.viewFor(a);
    expect(v.players.map((p) => p.name)).toEqual(['Mo', 'mo 2', 'Doodler']);
    expect(new Set(v.players.map((p) => p.color)).size).toBe(3);
    expect(v.hostId).toBe(a);
    expect(g.viewFor(b).selfId).toBe(b);
    expect(g.viewFor(c).phase).toBe('lobby');
  });

  it('only the host can add bots and start, and only with enough players', () => {
    const { g, ids } = table(2);
    g.start(ids[0]);
    expect(g.phase).toBe('lobby');
    g.addBot(ids[1]);
    expect(g.botCount()).toBe(0);
    g.addBot(ids[0]);
    expect(g.botCount()).toBe(1);
    g.start(ids[1]);
    expect(g.phase).toBe('lobby');
    g.start(ids[0]);
    expect(g.phase).toBe('pick');
  });

  it('leaving the lobby frees the seat and passes the host on', () => {
    const { g, ids } = table(3);
    g.drop(ids[0]);
    expect(g.players.size).toBe(2);
    expect(g.hostId()).toBe(ids[1]);
  });

  it('a human joining a full lobby replaces a bot; otherwise they watch', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < MAX_PLAYERS; i++) g.addBot(ids[0]);
    expect(g.players.size).toBe(MAX_PLAYERS);
    const j = g.join('Late')!;
    expect(g.players.size).toBe(MAX_PLAYERS);
    expect(g.viewFor(j.id).players.find((p) => p.id === j.id)!.spectator).toBe(false);
    while (g.botCount()) g.removeBot(ids[0]);
    for (let i = 0; g.players.size < MAX_PLAYERS; i++) g.join(`F${i}`);
    const extra = g.join('Extra')!;
    expect(g.viewFor(extra.id).players.find((p) => p.id === extra.id)!.spectator).toBe(true);
  });
});

describe('a full game', () => {
  for (const n of [3, 4, 5, 8]) {
    it(`${n} players: word → drawing → word … each owner draws their own word`, () => {
      const { g, ids } = table(n);
      g.start(ids[0]);
      expect(g.turns).toBe(turnCount(n));
      const phases: string[] = [];
      while (g.phase !== 'reveal') {
        phases.push(g.phase);
        playTurn(g, ids);
      }
      expect(phases[0]).toBe('pick');
      phases.slice(1).forEach((p, i) => expect(p).toBe(i % 2 === 0 ? 'draw' : 'guess'));
      expect(g.books).toHaveLength(n);
      g.books.forEach((book, b) => {
        expect(book).toHaveLength(1 + turnCount(n));
        book.forEach((page, i) => expect(page.kind).toBe(i % 2 === 0 ? 'word' : 'drawing'));
        expect(book[0].by).toBe(ids[b]);
        expect(book[book.length - 1].kind).toBe('word');
        expect(book[1].by).toBe(ids[b]);
        expect(new Set(book.slice(1).map((p) => p.by)).size).toBe(book.length - 1);
      });
    });
  }

  it('each player works from exactly the previous page of the book they hold', () => {
    const { g, ids } = table(4);
    g.start(ids[0]);
    ids.forEach((id, i) => g.pick(id, i % 4));
    // everyone draws their own word first
    ids.forEach((id, seat) => {
      const t = g.taskFor(id)!;
      expect(t.kind).toBe('draw');
      if (t.kind === 'draw') expect(t.word).toBe(g.books[seat][0].kind === 'word' ? (g.books[seat][0] as { text: string }).text : '');
    });
    ids.forEach((id, i) => g.draw(id, doodle(100 + i)));
    // now seat s guesses the drawing made by seat s-1
    ids.forEach((id, seat) => {
      const t = g.taskFor(id)!;
      expect(t.kind).toBe('guess');
      if (t.kind === 'guess') {
        expect(t.strokes).toEqual(doodle(100 + ((seat + 3) % 4)));
        expect(t.from).toBe(`P${((seat + 3) % 4) + 1}`);
      }
    });
  });

  it('a turn only ends when everyone has handed in, and a page can be replaced until then', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    g.pick(ids[0], 0);
    g.pick(ids[0], 2);
    g.pick(ids[1], 0);
    expect(g.phase).toBe('pick');
    expect(g.viewFor(ids[0]).submitted).toBe(true);
    expect(g.viewFor(ids[2]).submitted).toBe(false);
    expect(g.viewFor(ids[2]).players.map((p) => p.done)).toEqual([true, true, false]);
    const card = g.taskFor(ids[0])!;
    g.pick(ids[2], 1);
    expect(g.phase).toBe('draw');
    expect(g.books[0][0]).toMatchObject({ kind: 'word', text: card.kind === 'pick' ? card.card[2] : '' });
  });

  it('rejects out-of-phase, invalid and empty submissions', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    g.draw(ids[0], doodle());
    g.guess(ids[0], 'nope');
    g.pick(ids[0], 99);
    expect(g.viewFor(ids[0]).submitted).toBe(false);
    playTurn(g, ids);
    g.draw(ids[0], []);
    g.draw(ids[0], [{ c: -1, w: 30, p: [1, 1] }]);
    g.draw(ids[0], 'scribble');
    g.pick(ids[0], 0);
    expect(g.viewFor(ids[0]).submitted).toBe(false);
    playTurn(g, ids);
    g.guess(ids[0], '   ');
    expect(g.viewFor(ids[0]).submitted).toBe(false);
    g.guess(ids[0], '  a   cat ');
    expect(g.viewFor(ids[0]).submitted).toBe(true);
  });

  it('the host can skip a stalled player with a blank page', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    g.pick(ids[0], 0);
    g.pick(ids[1], 0);
    g.skip(ids[1], ids[2]);
    expect(g.phase).toBe('pick');
    g.skip(ids[0], ids[2]);
    expect(g.phase).toBe('draw');
    expect(g.books[2][0]).toMatchObject({ kind: 'word', skipped: true });
    g.draw(ids[0], doodle());
    g.draw(ids[1], doodle());
    g.skip(ids[0], ids[2]);
    expect(g.phase).toBe('guess');
    g.guess(ids[0], 'x');
    g.guess(ids[1], 'y');
    g.skip(ids[0], ids[2]);
    expect(g.phase).toBe('reveal');
    expect(g.books.flat().filter((p) => p.skipped)).toHaveLength(3);
  });

  it('bots take their turns one step at a time', () => {
    const { g, ids } = table(1);
    g.addBot(ids[0]);
    g.addBot(ids[0]);
    g.start(ids[0]);
    for (let guard = 0; guard < 100 && g.phase !== 'reveal'; guard++) {
      if (g.botsPending()) g.stepBot();
      else playTurn(g, ids);
    }
    expect(g.phase).toBe('reveal');
    expect(g.botsPending()).toBe(false);
    for (const book of g.books) for (const page of book) {
      if (page.kind === 'drawing') expect(page.strokes.length).toBeGreaterThan(0);
      else expect(page.text.length).toBeGreaterThan(0);
    }
  });
});

describe('connections', () => {
  it('a dropped player keeps their seat and reclaims it with their token', () => {
    const { g, ids, tokens } = table(3);
    g.start(ids[0]);
    g.drop(ids[1]);
    expect(g.players.size).toBe(3);
    expect(g.viewFor(ids[0]).players[1].connected).toBe(false);
    const back = g.join('whoever', tokens[1])!;
    expect(back).toMatchObject({ id: ids[1], resumed: true });
    expect(g.viewFor(ids[0]).players[1]).toMatchObject({ connected: true, name: 'P2' });
    expect(g.taskFor(ids[1])!.kind).toBe('pick');
  });

  it('a wrong token just makes a new player; mid-game joiners watch', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    const j = g.join('Nosy', 'f'.repeat(32))!;
    expect(j.resumed).toBe(false);
    const me = g.viewFor(j.id).players.find((p) => p.id === j.id)!;
    expect(me.spectator).toBe(true);
    expect(g.taskFor(j.id)).toBeNull();
    g.pick(j.id, 0);
    g.skip(j.id, ids[0]);
    expect(g.viewFor(ids[0]).players.every((p) => !p.done)).toBe(true);
  });

  it('the host role moves on when the host drops, and a lone watcher can end a dead game', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    g.drop(ids[0]);
    expect(g.hostId()).toBe(ids[1]);
    const watcher = g.join('W')!.id;
    expect(g.hostId()).toBe(ids[1]);
    g.drop(ids[1]);
    g.drop(ids[2]);
    expect(g.hostId()).toBe(watcher);
    g.abort(watcher);
    expect(g.phase).toBe('lobby');
    expect([...g.players.keys()]).toEqual([watcher]);
    expect(g.viewFor(watcher).players[0].spectator).toBe(false);
  });
});

describe('abandoned games', () => {
  it('bots leave the lobby with the last human', () => {
    const { g, ids } = table(2);
    g.addBot(ids[0]);
    g.drop(ids[0]);
    expect(g.players.size).toBe(2);
    g.drop(ids[1]);
    expect(g.players.size).toBe(0);
  });

  it('reset clears the table, bots and all', () => {
    const { g, ids } = table(1);
    g.addBot(ids[0]);
    g.addBot(ids[0]);
    g.start(ids[0]);
    expect(g.humansConnected()).toBe(1);
    g.drop(ids[0]);
    expect(g.humansConnected()).toBe(0);
    g.reset();
    expect(g.phase).toBe('lobby');
    expect(g.players.size).toBe(0);
    const fresh = g.join('New')!;
    expect(g.viewFor(fresh.id).players.map((p) => p.spectator)).toEqual([false]);
    expect(g.hostId()).toBe(fresh.id);
  });
});

describe('reveal and finale', () => {
  it('pages turn one at a time, by the book owner or the host only', () => {
    const { g, ids } = table(3);
    playToReveal(g, ids);
    expect(g.viewFor(ids[2]).reveal).toEqual({ book: 0, shown: 1, pageCount: 3, ownerId: ids[0] });
    g.next(ids[2]);
    expect(g.viewFor(ids[2]).reveal!.shown).toBe(1);
    g.next(ids[0]);
    g.next(ids[0]);
    expect(g.viewFor(ids[2]).reveal!.shown).toBe(3);
    g.next(ids[0]); // on to book 1, owned by ids[1]
    expect(g.viewFor(ids[2]).reveal).toMatchObject({ book: 1, shown: 1, ownerId: ids[1] });
    g.next(ids[2]);
    expect(g.viewFor(ids[2]).reveal!.shown).toBe(1);
    g.next(ids[1]);
    expect(g.viewFor(ids[2]).reveal!.shown).toBe(2);
    for (let i = 0; i < 20 && g.phase === 'reveal'; i++) g.next(ids[0]);
    expect(g.phase).toBe('finale');
    expect(g.visiblePages()).toHaveLength(9);
  });

  it('hearts toggle, only on visible pages, never on your own', () => {
    const { g, ids } = table(3);
    playToReveal(g, ids);
    g.heart(ids[1], 0, 0);
    g.heart(ids[2], 0, 0);
    g.heart(ids[0], 0, 0); // own page
    g.heart(ids[1], 0, 1); // not shown yet
    g.heart(ids[1], 2, 0); // later book
    expect(g.viewFor(ids[1]).hearts).toEqual({ '0:0': 2 });
    expect(g.viewFor(ids[1]).myHearts).toEqual(['0:0']);
    expect(g.viewFor(ids[0]).myHearts).toEqual([]);
    g.heart(ids[1], 0, 0);
    expect(g.viewFor(ids[1]).hearts).toEqual({ '0:0': 1 });
    g.heart(ids[1], 7, 7);
  });

  it('play again returns everyone to the lobby and seats the watchers', () => {
    const { g, ids } = table(3);
    playToReveal(g, ids);
    const watcher = g.join('W')!.id;
    g.drop(ids[2]);
    for (let i = 0; i < 20 && g.phase === 'reveal'; i++) g.next(ids[0]);
    g.again(ids[1]);
    expect(g.phase).toBe('finale');
    g.again(ids[0]);
    expect(g.phase).toBe('lobby');
    const v = g.viewFor(ids[0]);
    expect(v.players.map((p) => p.id)).toEqual([ids[0], ids[1], watcher]);
    expect(v.players.every((p) => !p.spectator)).toBe(true);
    expect(v.hearts).toEqual({});
    const before = g.gameNo;
    g.start(ids[0]);
    expect(g.gameNo).toBe(before + 1);
    expect(g.seats).toEqual([ids[0], ids[1], watcher]);
  });
});
