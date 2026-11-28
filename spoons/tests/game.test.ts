import { describe, expect, it } from 'vitest';
import { Game } from '../server/src/game';
import { DEAL_MS, FALSE_GRAB_LOCK_MS, GRAB_CAP_MS, MAX_PLAYERS, REVEAL_MS, decksFor } from '../shared/src/constants';
import { T0, cardsOf, join, playRound, playToQuad, seeded, started, table } from './helpers';

const view = (g: Game, id: string) => g.viewFor(id);
const pv = (g: Game, id: string) => view(g, id).players.find((p) => p.id === id)!;

describe('lobby', () => {
  it('seats players, makes the first one host and needs three to start', () => {
    const { g, ids } = table(2);
    expect(view(g, ids[0]).hostId).toBe(ids[0]);
    g.start(ids[0], T0);
    expect(g.phase).toBe('lobby');
    g.addBot(ids[1]); // not the host
    expect(g.players.size).toBe(2);
    g.addBot(ids[0]);
    g.start(ids[1], T0); // not the host
    expect(g.phase).toBe('lobby');
    g.start(ids[0], T0);
    expect(g.phase).toBe('play');
  });
  it('caps the table and gives a human a bot seat', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < MAX_PLAYERS + 5; i++) g.addBot(ids[0]);
    expect(g.players.size).toBe(MAX_PLAYERS);
    const late = join(g, 'Late');
    expect(g.players.size).toBe(MAX_PLAYERS);
    expect(pv(g, late.id).spectator).toBe(false);
  });
  it('only lets the host pick a listed number of rounds', () => {
    const { g, ids } = table(3);
    g.configure(ids[1], 5);
    expect(g.settings.rounds).toBe(8);
    g.configure(ids[0], 7);
    expect(g.settings.rounds).toBe(8);
    g.configure(ids[0], 5);
    expect(g.settings.rounds).toBe(5);
  });
  it('gives a reconnecting token its seat back', () => {
    const { g, ids, tokens } = table(3);
    g.start(ids[0], T0);
    g.drop(ids[1], T0 + 10);
    expect(pv(g, ids[1]).connected).toBe(false);
    const back = join(g, 'whoever', T0 + 20, tokens[1]);
    expect(back).toMatchObject({ id: ids[1], resumed: true });
    expect(pv(g, ids[1]).connected).toBe(true);
  });
});

describe('the deal', () => {
  it('deals four cards each, one spoon fewer than players, and waits before moving', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    const r = view(g, ids[0]).round!;
    expect(r).toMatchObject({ round: 1, spoons: 3, spoonsLeft: 3, startsAt: T0 + DEAL_MS, dealerId: ids[0] });
    expect(r.order).toEqual(ids);
    const all = ids.flatMap((id) => g.taskFor(id)!.hand);
    expect(all).toHaveLength(16);
    expect(new Set(all).size).toBe(16);
    g.tick(T0 + DEAL_MS - 1);
    expect(g.taskFor(ids[0])!.drawn).toBeNull();
    g.grab(ids[1], T0 + 5); // too early to count as anything
    expect(pv(g, ids[1]).losses).toBe(0);
    g.tick(T0 + DEAL_MS);
    expect(g.taskFor(ids[0])!.drawn).not.toBeNull();
    expect(g.taskFor(ids[1])!.drawn).toBeNull();
  });
});

describe('passing', () => {
  it('moves a card to the left, and the new card takes the old one\'s slot', () => {
    const { g, ids, now } = started(3);
    const before = g.taskFor(ids[0])!;
    const out = before.hand[1];
    g.pass(ids[0], out, now + 100);
    const after = g.taskFor(ids[0])!;
    expect(after.hand[1]).toBe(before.drawn);
    expect(after.hand).not.toContain(out);
    // the dealer picks up again at once; the neighbour now holds the passed card
    expect(after.drawn).not.toBeNull();
    expect(g.taskFor(ids[1])!.drawn).toBe(out);
    expect(pv(g, ids[1]).heldSince).toBe(now + 100);
  });
  it('refuses cards you do not hold, and passing with nothing picked up', () => {
    const { g, ids, now } = started(3);
    const mine = cardsOf(g, ids[0]);
    const theirs = g.taskFor(ids[1])!.hand[0];
    g.pass(ids[0], theirs, now);
    expect(cardsOf(g, ids[0])).toEqual(mine);
    g.pass(ids[1], theirs, now);
    expect(g.taskFor(ids[1])!.hand).toContain(theirs);
  });
  it('queues cards behind a slow player', () => {
    const { g, ids, now } = started(3);
    for (let i = 0; i < 3; i++) g.pass(ids[0], g.taskFor(ids[0])!.drawn!, now + i);
    expect(pv(g, ids[1]).waiting).toBe(2);
    expect(view(g, ids[2]).players.find((p) => p.id === ids[1])!.waiting).toBe(2);
  });
  it('never loses or duplicates a card, through a reshuffle of the discard pile', () => {
    const { g, ids, now } = started(3);
    let t = now;
    // 52 - 12 = 40 cards in the deck: 200 passes each recycles the discard pile several times
    for (let i = 0; i < 200; i++) {
      for (const id of ids) {
        const task = g.taskFor(id)!;
        if (task.drawn) g.pass(id, task.drawn, t);
      }
      t += 5;
    }
    const held = ids.flatMap((id) => cardsOf(g, id));
    expect(new Set(held).size).toBe(held.length);
    // the deck ran dry five times over and the dealer still has a card to pick up
    expect(held).toHaveLength(13);
    expect(g.taskFor(ids[0])!.drawn).not.toBeNull();
  });
});

describe('grabbing', () => {
  it('in the scramble the quicker hand wins, not the quicker line', () => {
    const { g, ids, now } = started(3);
    const q = playToQuad(g, ids, now);
    const [near, far] = ids.filter((id) => id !== q.id);
    g.notePing(near, 4);
    g.notePing(far, 250);
    g.grab(q.id, q.now);
    // `near` reaches after 300 ms. `far` reached after 200, but word of it takes 250 ms longer.
    g.grab(near, q.now + 304);
    expect(view(g, ids[0]).round!.spoonsLeft).toBe(1); // held: `far` may yet have been quicker
    g.grab(far, q.now + 450);
    expect(g.phase).toBe('reveal');
    const r = view(g, ids[0]).result!;
    expect(r.loserIds).toEqual([near]);
    expect(r.grabs[1]).toEqual({ id: far, ms: 200 });
  });
  it('a held grab gets its spoon once nobody slower could still beat it', () => {
    const { g, ids, now } = started(3);
    const q = playToQuad(g, ids, now);
    const [near, far] = ids.filter((id) => id !== q.id);
    g.notePing(near, 4);
    g.notePing(far, 250);
    g.grab(q.id, q.now);
    g.grab(near, q.now + 304);
    g.tick(q.now + 500);
    expect(g.phase).toBe('play');
    g.tick(q.now + 560); // 300 + the slow line's 250 have passed with no word from `far`
    expect(g.phase).toBe('reveal');
    expect(view(g, ids[0]).result!.loserIds).toEqual([far]);
  });
  it('a line cannot claim more than the cap, and a grab is never before the first one', () => {
    const { g, ids, now } = started(3);
    const q = playToQuad(g, ids, now);
    const [a, b] = ids.filter((id) => id !== q.id);
    g.notePing(a, 60_000);
    g.grab(q.id, q.now);
    g.grab(a, q.now + 100);
    g.tick(q.now + 500);
    expect(view(g, ids[0]).result!.grabs[1]).toEqual({ id: a, ms: 0 });
    expect(view(g, ids[0]).result!.loserIds).toEqual([b]);
  });
  it('a grab at nothing is a loss on the spot and a short lockout', () => {
    const { g, ids, now } = started(4);
    expect(g.taskFor(ids[2])!.quad).toBe(false);
    g.grab(ids[2], now + 10);
    const p = pv(g, ids[2]);
    expect(p).toMatchObject({ losses: 1, fumbles: 1, hasSpoon: false, lockedUntil: now + 10 + FALSE_GRAB_LOCK_MS });
    expect(view(g, ids[0]).round!.spoonsLeft).toBe(3);
    expect(view(g, ids[0]).shout).toMatchObject({ kind: 'fumble', targetId: ids[2], byId: null });
    expect(view(g, ids[0]).shout!.text).toContain('P3');
    g.grab(ids[2], now + 20); // locked: not a second loss
    expect(pv(g, ids[2]).losses).toBe(1);
  });
  it('four of a kind takes the first spoon; then anyone may grab, and the last one out loses', () => {
    const { g, ids, now } = started(4);
    const q = playToQuad(g, ids, now);
    expect(g.taskFor(q.id)!.quad).toBe(true);
    g.grab(q.id, q.now);
    expect(pv(g, q.id).hasSpoon).toBe(true);
    expect(view(g, ids[0]).round!.spoonsLeft).toBe(2);
    g.grab(q.id, q.now + 1); // one spoon each
    expect(view(g, ids[0]).round!.spoonsLeft).toBe(2);
    const rest = ids.filter((id) => id !== q.id);
    g.grab(rest[0], q.now + 300);
    expect(g.phase).toBe('play');
    g.grab(rest[1], q.now + 700);
    expect(g.phase).toBe('reveal');
    const r = view(g, ids[0]).result!;
    expect(r.winnerId).toBe(q.id);
    expect(r.cards).toHaveLength(4);
    expect(new Set(r.cards.map((c) => c[0])).size).toBe(1);
    expect(r.grabs).toEqual([{ id: q.id, ms: 0 }, { id: rest[0], ms: 300 }, { id: rest[1], ms: 700 }]);
    expect(r.loserIds).toEqual([rest[2]]);
    expect(pv(g, rest[2]).losses).toBe(1);
    expect(pv(g, rest[0]).losses).toBe(0);
    expect(g.taskFor(ids[0])).toBeNull();
  });
  it('ends the round for everyone still spoonless once the scramble times out', () => {
    const { g, ids, now } = started(4);
    const q = playToQuad(g, ids, now);
    g.grab(q.id, q.now);
    g.tick(q.now + GRAB_CAP_MS - 1);
    expect(g.phase).toBe('play');
    g.tick(q.now + GRAB_CAP_MS);
    expect(g.phase).toBe('reveal');
    expect(view(g, ids[0]).result!.loserIds).toHaveLength(3);
    for (const id of ids) expect(pv(g, id).losses).toBe(id === q.id ? 0 : 1);
  });
});

describe('rounds', () => {
  it('seats a full table of sixteen, with a second deck past eight players', () => {
    expect(MAX_PLAYERS).toBe(16);
    expect([3, 8, 9, 16].map(decksFor)).toEqual([1, 1, 2, 2]);
    const { g, ids } = table(MAX_PLAYERS);
    g.start(ids[0], T0);
    const r = view(g, ids[0]).round!;
    expect(r.order).toHaveLength(16);
    expect(r.spoons).toBe(15);
    expect(new Set(view(g, ids[0]).players.map((p) => p.color)).size).toBe(16);
    g.tick(T0 + DEAL_MS);
    const end = playRound(g, ids, T0 + DEAL_MS, ids[5]);
    g.tick(end + 1_000); // any grab still being judged has landed
    expect(g.phase).toBe('reveal');
    expect(view(g, ids[0]).result!.grabs).toHaveLength(15);
    expect(view(g, ids[0]).result!.loserIds).toHaveLength(1);
  });
  it('everyone plays every round, the deal moves on, and the game ends after the set number', () => {
    const { g, ids } = table(4);
    g.configure(ids[0], 5);
    g.start(ids[0], T0);
    let now = T0;
    const dealers: string[] = [];
    for (let round = 1; round <= 5; round++) {
      const r = view(g, ids[0]).round!;
      expect(r.round).toBe(round);
      expect(r.order).toHaveLength(4);
      expect(r.spoons).toBe(3);
      dealers.push(r.dealerId);
      expect(r.order[0]).toBe(r.dealerId);
      now += DEAL_MS;
      g.tick(now);
      now = playRound(g, ids, now, ids[3]);
      expect(g.phase).toBe('reveal');
      now += REVEAL_MS;
      g.tick(now);
    }
    expect(dealers).toEqual([ids[0], ids[1], ids[2], ids[3], ids[0]]);
    expect(g.phase).toBe('finale');
    const total = ids.reduce((n, id) => n + pv(g, id).losses, 0);
    expect(total).toBe(5);
    g.again(ids[1]);
    expect(g.phase).toBe('finale');
    g.again(ids[0]);
    expect(g.phase).toBe('lobby');
  });
  it('lets the host skip the result screen', () => {
    const { g, ids, now } = started(3);
    const end = playRound(g, ids, now);
    g.skip(ids[1], end + 1);
    expect(g.phase).toBe('reveal');
    g.skip(ids[0], end + 2);
    expect(g.phase).toBe('play');
    expect(view(g, ids[0]).round!.round).toBe(2);
  });
  it('seats a mid-game arrival at the next deal', () => {
    const { g, ids, now } = started(3);
    const late = join(g, 'Late', now + 5);
    expect(pv(g, late.id).spectator).toBe(true);
    expect(g.taskFor(late.id)).toBeNull();
    const end = playRound(g, ids, now + 10);
    g.tick(end + REVEAL_MS);
    expect(pv(g, late.id).spectator).toBe(false);
    expect(view(g, ids[0]).round).toMatchObject({ round: 2, spoons: 3 });
    expect(g.taskFor(late.id)!.hand).toHaveLength(4);
  });
  it('deals the round again when somebody leaves, and ends the game below two players', () => {
    const { g, ids, now } = started(3);
    g.leave(ids[1], now + 50);
    expect(g.phase).toBe('play');
    expect(view(g, ids[0]).round).toMatchObject({ round: 1, spoons: 1, startsAt: now + 50 + DEAL_MS });
    g.leave(ids[2], now + 60);
    expect(g.phase).toBe('finale');
  });
  it('lets only the host abort', () => {
    const { g, ids } = started(3);
    g.abort(ids[1]);
    expect(g.phase).toBe('play');
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
  });
});

describe('bots and absent players', () => {
  it('plays whole games with bots alone at the table besides one idle human', () => {
    const g = new Game(seeded(11));
    const me = join(g, 'Me');
    for (let i = 0; i < 4; i++) g.addBot(me.id);
    g.configure(me.id, 5);
    g.start(me.id, T0);
    let now = T0;
    // the human passes like a bot but never grabs, so every round ends with them spoonless
    for (let i = 0; i < 400_000 && g.phase !== 'finale'; i++) {
      now += 100;
      g.tick(now);
      const t = g.taskFor(me.id);
      if (t?.drawn) g.pass(me.id, t.drawn, now);
    }
    expect(g.phase).toBe('finale');
    expect(pv(g, me.id).losses).toBe(5);
    expect(g.botCount()).toBe(4);
  });
  it('passes for a human who dropped off, so the table never jams, but never grabs for them', () => {
    const { g, ids, now } = started(3);
    g.drop(ids[0], now + 10); // the dealer, holding a card
    const before = cardsOf(g, ids[1]).length;
    g.tick(now + 3_000);
    expect(cardsOf(g, ids[1]).length).toBe(before + 1);
    expect(view(g, ids[1]).shout).toBeNull();
  });
});

describe('only watching', () => {
  it('a screen that joins to watch has no seat, costs no bot theirs, and is never dealt in', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < MAX_PLAYERS + 5; i++) g.addBot(ids[0]);
    const tv = g.join('TV', undefined, T0, true) as { id: string };
    expect(g.players.size).toBe(MAX_PLAYERS + 1);
    const me = () => g.viewFor(tv.id).players.find((p) => p.id === tv.id)!;
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    g.start(ids[0], T0);
    expect(g.phase).not.toBe('lobby');
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    // still only watching in the next lobby, and the host is still a player
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    expect(g.hostId()).toBe(ids[0]);
    // a seat comes back when asked for, once there is one
    g.watch(tv.id, false);
    expect(me()).toMatchObject({ spectator: true, watcher: false });
    g.watch(tv.id, true);
    g.removeBot(ids[0]);
    g.watch(tv.id, false);
    expect(me()).toMatchObject({ spectator: false, watcher: false });
  });
  it('is said again by a screen that comes back with its token', () => {
    const { g } = table(2);
    const a = g.join('Mo', undefined, T0) as { id: string; token: string };
    g.join('Mo', a.token, T0, true);
    expect(g.viewFor(a.id).players.find((p) => p.id === a.id)).toMatchObject({ spectator: true, watcher: true });
  });
});
