import { describe, expect, it } from 'vitest';
import { Game } from '../server/src/game';
import { BETWEEN_MS, DRAWER_GRACE_MS, DRAW_LIMITS, MAX_PLAYERS, ROUND_MS } from '../shared/src/constants';
import { chatOf, join, seeded, T0, table, wordOf } from './helpers';

const score = (g: Game, id: string): number => g.viewFor(id).players.find((p) => p.id === id)!.score;

describe('lobby', () => {
  it('seats sixteen, lets the rest watch, and needs three to start', () => {
    const { g, ids } = table(2);
    g.start(ids[0], T0);
    expect(g.phase).toBe('lobby');
    for (let i = 3; i <= MAX_PLAYERS + 2; i++) join(g, `P${i}`);
    const v = g.viewFor(ids[0]);
    expect(v.players.filter((p) => !p.spectator)).toHaveLength(16);
    expect(v.players.filter((p) => p.spectator)).toHaveLength(2);
    g.start(ids[1], T0); // not the host
    expect(g.phase).toBe('lobby');
    g.start(ids[0], T0);
    expect(g.phase).toBe('draw');
    expect(g.drawerId).toBe(ids[0]);
  });

  it('only the host changes settings, and only to offered values', () => {
    const { g, ids } = table(3);
    g.configure(ids[1], 5, false);
    expect(g.settings).toEqual({ rounds: 10, hints: true });
    g.configure(ids[0], 7);
    expect(g.settings.rounds).toBe(10);
    g.configure(ids[0], 5, false);
    expect(g.settings).toEqual({ rounds: 5, hints: false });
  });

  it('a human takes a bot seat at a full table; bots leave an empty lobby', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < 20; i++) g.addBot(ids[0]);
    expect(g.players.size).toBe(MAX_PLAYERS);
    const late = join(g, 'Late');
    expect(g.viewFor(late.id).players.find((p) => p.id === late.id)!.spectator).toBe(false);
    expect(g.botCount()).toBe(MAX_PLAYERS - 2);
    g.drop(late.id, T0);
    g.drop(ids[0], T0);
    expect(g.players.size).toBe(0);
  });
});

describe('a round', () => {
  it('pays the first correct guesser and the drawer the same, by speed', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    const word = wordOf(g);
    g.chat(ids[1], 'banana?', undefined, T0 + 5_000);
    expect(g.phase).toBe('draw');
    g.chat(ids[2], word.toUpperCase(), undefined, T0 + 34_000);
    expect(g.phase).toBe('between');
    expect(score(g, ids[2])).toBe(90);
    expect(score(g, ids[0])).toBe(90);
    expect(score(g, ids[1])).toBe(0);
    expect(g.viewFor(ids[3]).result).toEqual({ word, drawerId: ids[0], winnerId: ids[2], award: 90 });
    // too late: the round is over, this is just chat
    g.chat(ids[3], word, undefined, T0 + 35_000);
    expect(score(g, ids[3])).toBe(0);
  });

  it('the guess sent first wins, not the one on the quicker line', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    const word = wordOf(g);
    const [near, far] = [ids[1], ids[2]];
    g.notePing(near, 4);
    g.notePing(far, 250);
    // `near` sends at 9 990 ms; `far` sent at 9 900, but word of it takes 250 ms longer to arrive
    g.chat(near, word, undefined, T0 + 9_994);
    expect(g.phase).toBe('draw'); // held: `far` may yet have been first
    expect(g.guessDueAt()).toBe(T0 + 9_990 + 250);
    g.chat(far, word, undefined, T0 + 10_150);
    expect(g.phase).toBe('between');
    expect(g.viewFor(ids[3]).result).toMatchObject({ winnerId: far, award: 120 }); // sent before the ten-second step
    expect(score(g, near)).toBe(0);
  });

  it('a held guess wins once nobody slower could still beat it, and is paid for when it was sent', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    const word = wordOf(g);
    g.notePing(ids[1], 4);
    g.notePing(ids[2], 250);
    g.chat(ids[1], word, undefined, T0 + 9_994);
    g.tick(T0 + 10_100);
    expect(g.phase).toBe('draw');
    g.tick(T0 + 10_241);
    expect(g.phase).toBe('between');
    expect(g.viewFor(ids[3]).result).toMatchObject({ winnerId: ids[1], award: 120 });
  });

  it('moves to the next drawer after the pause, and ends after the last round', () => {
    const { g, ids } = table(3);
    g.configure(ids[0], 5);
    g.start(ids[0], T0);
    let now = T0;
    const drawers: string[] = [];
    for (let r = 1; r <= 5; r++) {
      expect(g.round).toBe(r);
      drawers.push(g.drawerId!);
      const guesser = ids.find((id) => id !== g.drawerId)!;
      g.chat(guesser, wordOf(g), undefined, (now += 1_000));
      g.tick((now += BETWEEN_MS - 1));
      expect(g.phase).toBe('between');
      g.tick((now += 1));
    }
    expect(drawers).toEqual([ids[0], ids[1], ids[2], ids[0], ids[1]]);
    expect(g.phase).toBe('finale');
    expect(g.viewFor(ids[0]).round).toBeNull();
    g.again(ids[1]);
    expect(g.phase).toBe('finale');
    g.again(ids[0]);
    expect(g.phase).toBe('lobby');
  });

  it('gives nobody points when the clock runs out', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    const word = wordOf(g);
    g.tick(T0 + ROUND_MS - 1);
    expect(g.phase).toBe('draw');
    // a guess that arrives after the buzzer is not a win
    g.chat(ids[1], word, undefined, T0 + ROUND_MS);
    expect(g.phase).toBe('between');
    expect(g.viewFor(ids[1]).result).toEqual({ word, drawerId: ids[0], winnerId: null, award: 0 });
    expect(ids.map((id) => score(g, id))).toEqual([0, 0, 0]);
  });

  it('a pass hands the pen on with a new word and keeps the round number', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    const first = wordOf(g);
    const turn = g.turnNo;
    g.pass(ids[1], T0 + 1_000); // not the drawer
    expect(g.drawerId).toBe(ids[0]);
    g.pass(ids[0], T0 + 2_000);
    expect(g.drawerId).toBe(ids[1]);
    expect(g.round).toBe(1);
    expect(g.turnNo).toBe(turn + 1);
    expect(wordOf(g)).not.toBe(first);
    expect(g.viewFor(ids[2]).round!.startedAt).toBe(T0 + 2_000);
    expect(g.strokes).toEqual([]);
  });

  it('the drawer cannot type the answer, in chat or in a whisper', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    const word = wordOf(g);
    g.chat(ids[0], `it is ${word}!!`, undefined, T0 + 1_000);
    g.chat(ids[0], word, ids[1], T0 + 2_000);
    expect(chatOf(g, ids[1]).join('|')).not.toContain(word);
    expect(chatOf(g, ids[0]).at(-1)).toMatch(/spelling/);
    expect(g.phase).toBe('draw');
    expect(score(g, ids[0])).toBe(0);
  });

  it('spectators and the drawer cannot win', () => {
    const { g, ids } = table(MAX_PLAYERS);
    g.start(ids[0], T0);
    const watcher = join(g, 'Watcher', T0 + 500);
    expect(g.viewFor(watcher.id).players.at(-1)!.spectator).toBe(true);
    g.chat(watcher.id, wordOf(g), undefined, T0 + 1_000);
    expect(g.phase).toBe('draw');
  });
});

describe('the canvas', () => {
  const ink = (g: Game) => g.takeInk().map((e) => e.type);

  it('takes ink from the drawer only, stroke by stroke', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.inkAdd(ids[1], 0, 0, 5, [1, 1]);
    expect(g.strokes).toEqual([]);
    g.inkAdd(ids[0], 0, 2, 11, [10, 10]);
    g.inkAdd(ids[0], 0, 9, 99, [20.4, 20, 30, 9999]); // more of the same stroke: colour and width stay
    g.inkAdd(ids[0], 1, -1, 16, [5, 5]);
    expect(g.strokes).toEqual([
      { c: 2, w: 11, p: [10, 10, 20, 20, 30, 750] },
      { c: -1, w: 16, p: [5, 5] },
    ]);
    expect(g.takeInk()).toEqual([
      { type: 'ink', turn: g.turnNo, i: 0, c: 2, w: 11, p: [10, 10] },
      { type: 'ink', turn: g.turnNo, i: 0, c: 2, w: 11, p: [20, 20, 30, 750] },
      { type: 'ink', turn: g.turnNo, i: 1, c: -1, w: 16, p: [5, 5] },
    ]);
    g.inkUndo(ids[0]);
    g.inkClear(ids[0]);
    g.inkClear(ids[0]); // already empty
    g.inkUndo(ids[1]);
    expect(ink(g)).toEqual(['undo', 'clear']);
    expect(g.strokes).toEqual([]);
    expect(g.takeResync()).toBe(false);
  });

  it('refuses ink that does not fit and asks for a resync', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.inkAdd(ids[0], 3, 0, 5, [1, 1]); // skips ahead
    expect(g.takeResync()).toBe(true);
    g.inkAdd(ids[0], 0, 99, 5, [1, 1]); // no such colour
    expect(g.takeResync()).toBe(true);
    g.inkAdd(ids[0], 0, 0, 5, Array(DRAW_LIMITS.maxPointsPerStroke * 2).fill(1));
    g.inkAdd(ids[0], 0, 0, 5, [1, 1]); // that stroke is full
    expect(g.takeResync()).toBe(true);
    expect(g.strokes).toHaveLength(1);
    expect(ink(g)).toEqual(['ink']);
  });

  it('takes bucket fills as strokes of their own, up to a limit', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.inkAdd(ids[0], 0, 0, 5, [10, 10, 20, 20]);
    g.inkAdd(ids[0], 1, 3, 5, [400, 300], 1);
    expect(g.strokes[1]).toEqual({ c: 3, w: 5, p: [400, 300], f: 1 });
    expect(g.takeInk()[1]).toEqual({ type: 'ink', turn: g.turnNo, i: 1, c: 3, w: 5, p: [400, 300], f: 1 });
    g.inkAdd(ids[0], 1, 3, 5, [5, 5]); // a fill cannot grow
    g.inkAdd(ids[0], 2, 0, 5, [1, 1]);
    g.inkAdd(ids[0], 2, 3, 5, [5, 5], 1); // nor can a line turn into one
    expect(g.strokes).toHaveLength(3);
    expect(g.strokes[2]).toEqual({ c: 0, w: 5, p: [1, 1] });
    expect(g.takeResync()).toBe(true);
    for (let i = 3; i < 3 + DRAW_LIMITS.maxFills + 5; i++) g.inkAdd(ids[0], g.strokes.length, 1, 5, [i, i], 1);
    expect(g.strokes.filter((s) => s.f)).toHaveLength(DRAW_LIMITS.maxFills);
    g.inkUndo(ids[0]);
    expect(g.strokes.filter((s) => s.f)).toHaveLength(DRAW_LIMITS.maxFills - 1);
  });

  it('is wiped for the next turn but stays up while the answer is shown', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.inkAdd(ids[0], 0, 0, 5, [1, 1, 2, 2]);
    g.chat(ids[1], wordOf(g), undefined, T0 + 1_000);
    expect(g.strokes).toHaveLength(1);
    g.inkAdd(ids[0], 1, 0, 5, [1, 1]); // pens down
    expect(g.strokes).toHaveLength(1);
    g.tick(T0 + 1_000 + BETWEEN_MS);
    expect(g.strokes).toEqual([]);
    expect(g.takeInk()).toEqual([]);
  });
});

describe('chat', () => {
  it('whispers reach only the two players involved', () => {
    const { g, ids } = table(3);
    g.chat(ids[0], 'psst', ids[1], T0);
    g.chat(ids[0], 'hello all', undefined, T0 + 1_000);
    const secret = (id: string) => g.chatFor(id, 0).filter((l) => l.kind === 'whisper');
    expect(secret(ids[0])).toHaveLength(1);
    expect(secret(ids[1])[0]).toMatchObject({ text: 'psst', fromId: ids[0], toId: ids[1] });
    expect(secret(ids[2])).toEqual([]);
    expect(chatOf(g, ids[2])).toContain('hello all');
    expect(JSON.stringify(g.chatFor(ids[1], 0))).not.toContain('only');
  });

  it('only sends lines newer than the one asked for, and drops floods', () => {
    const { g, ids } = table(3);
    g.chat(ids[0], 'one', undefined, T0 + 1_000);
    g.chat(ids[0], 'two', undefined, T0 + 1_001); // too soon
    g.chat(ids[0], 'three', undefined, T0 + 2_000);
    const all = g.chatFor(ids[1], 0);
    expect(all.filter((l) => l.kind === 'say').map((l) => l.text)).toEqual(['one', 'three']);
    expect(g.chatFor(ids[1], all.at(-1)!.seq)).toEqual([]);
    expect(g.chatFor(ids[1], all.at(-2)!.seq).map((l) => l.text)).toEqual(['three']);
  });
});

describe('coming and going', () => {
  it('a seat survives a dropped socket and is reclaimed with its token', () => {
    const { g, ids, tokens } = table(3);
    g.start(ids[0], T0);
    g.chat(ids[1], wordOf(g), undefined, T0 + 1_000);
    g.drop(ids[1], T0 + 2_000);
    expect(g.viewFor(ids[0]).players[1]).toMatchObject({ connected: false, score: 120 });
    expect(g.join('whoever', tokens[1], T0 + 3_000)).toEqual({ id: ids[1], token: tokens[1], resumed: true });
    expect(g.viewFor(ids[0]).players[1].connected).toBe(true);
  });

  it('a newcomer mid-game sits straight down and gets a turn', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    const late = join(g, 'Late', T0 + 1_000);
    expect(g.viewFor(late.id).players.at(-1)).toMatchObject({ spectator: false, score: 0 });
    expect(g.taskFor(late.id)).toBeNull();
    g.pass(ids[0], T0 + 2_000);
    g.pass(ids[1], T0 + 3_000);
    g.pass(ids[2], T0 + 4_000);
    expect(g.drawerId).toBe(late.id);
  });

  it('an absent drawer passes automatically after the grace period', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.drop(ids[0], T0 + 1_000);
    g.tick(T0 + 1_000 + DRAWER_GRACE_MS - 1);
    expect(g.drawerId).toBe(ids[0]);
    g.tick(T0 + 1_000 + DRAWER_GRACE_MS);
    expect(g.drawerId).toBe(ids[1]);
    expect(g.round).toBe(1);
  });

  it('absent players are skipped when the pen moves on', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    g.drop(ids[1], T0 + 500);
    g.pass(ids[0], T0 + 1_000);
    expect(g.drawerId).toBe(ids[2]);
  });

  it('the drawer leaving hands the pen on; too few players ends the game', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.leave(ids[0], T0 + 1_000);
    expect(g.phase).toBe('draw');
    expect(g.drawerId).toBe(ids[1]);
    expect(g.players.has(ids[0])).toBe(false);
    g.leave(ids[2], T0 + 2_000);
    expect(g.phase).toBe('finale');
    expect(g.viewFor(ids[1]).result).toBeNull();
  });

  it('the drawer leaving between rounds does not skip the next player', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    g.chat(ids[1], wordOf(g), undefined, T0 + 1_000);
    g.leave(ids[0], T0 + 2_000);
    g.tick(T0 + 1_000 + BETWEEN_MS);
    expect(g.drawerId).toBe(ids[1]);
  });

  it('bots never draw, and now and then one guesses right', () => {
    const g = new Game(seeded(3));
    const me = join(g, 'Solo').id;
    g.addBot(me);
    g.addBot(me);
    g.start(me, T0);
    expect(g.drawerId).toBe(me);
    g.inkAdd(me, 0, 0, 5, [1, 1, 50, 50]);
    let wins = 0;
    let now = T0;
    for (let i = 0; i < 4000 && g.phase !== 'finale'; i++) {
      g.tick((now += 500));
      expect(g.drawerId).toBe(me);
      if (g.phase === 'between' && g.viewFor(me).result?.winnerId) wins++;
      if (g.phase === 'draw' && !g.strokes.length) g.inkAdd(me, 0, 0, 5, [1, 1, 50, 50]);
    }
    expect(g.phase).toBe('finale');
    expect(wins).toBeGreaterThan(0);
    expect(g.chatFor(me, 0).some((l) => l.kind === 'say')).toBe(true);
  });

  it('host abort returns everyone to the lobby and forgets absent players', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.drop(ids[2], T0 + 100);
    g.abort(ids[1]);
    expect(g.phase).toBe('draw');
    g.abort(ids[0]);
    expect(g.phase).toBe('lobby');
    expect([...g.players.keys()]).toEqual([ids[0], ids[1]]);
  });
});

describe('voting someone out', () => {
  it('takes more than half of the seated humans who are here', () => {
    const { g, ids, tokens } = table(5);
    g.start(ids[0], T0);
    expect(g.viewFor(ids[0]).bootNeed).toBe(3);
    g.boot(ids[0], ids[4], T0);
    g.boot(ids[1], ids[4], T0);
    g.boot(ids[4], ids[4], T0); // not yourself
    expect(g.viewFor(ids[1])).toMatchObject({ myBoots: [ids[4]] });
    expect(g.viewFor(ids[2]).players[4].boots).toBe(2);
    g.boot(ids[1], ids[4], T0); // changed their mind
    expect(g.viewFor(ids[2]).players[4].boots).toBe(1);
    g.boot(ids[1], ids[4], T0);
    g.boot(ids[2], ids[4], T0);
    expect(g.players.has(ids[4])).toBe(false);
    expect(g.takeKicked()).toEqual([ids[4]]);
    expect(g.takeKicked()).toEqual([]);
    // the same seat token does not get back in
    expect(g.join('Sneaky', tokens[4], T0)).toBe('booted');
    g.reset();
    expect(g.join('Sneaky', tokens[4], T0)).not.toBe('booted');
  });

  it('booting the drawer passes the pen', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    g.boot(ids[1], ids[0], T0);
    g.boot(ids[2], ids[0], T0);
    expect(g.phase).toBe('draw');
    expect(g.drawerId).toBe(ids[1]);
  });

  it('a vote leaves with its voter, and spectators have none', () => {
    const { g, ids } = table(MAX_PLAYERS);
    const watcher = join(g, 'Watcher').id;
    g.boot(watcher, ids[3], T0);
    g.boot(ids[1], ids[3], T0);
    expect(g.viewFor(ids[0]).players[3].boots).toBe(1);
    g.leave(ids[1], T0);
    expect(g.viewFor(ids[0]).players.find((p) => p.id === ids[3])!.boots).toBe(0);
    // the freed seat went to the watcher
    expect(g.viewFor(ids[0]).players.find((p) => p.id === watcher)!.spectator).toBe(false);
  });
});

describe('only watching', () => {
  it('a screen that joins to watch has no seat, costs no bot theirs, and is never dealt in', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < 20; i++) g.addBot(ids[0]);
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
