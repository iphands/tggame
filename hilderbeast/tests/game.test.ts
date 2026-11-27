import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, CUTSCENE_MS, DREAD_STEPS, ESCAPE_CLOCK_MS, F_HELD, HEAD_START_MS, LAST_CLOCK_MS, MAX_PLAYERS, TICK_MS, tasksFor } from '../shared/src/constants';
import { MAP } from '../shared/src/maps';
import { Game } from '../server/src/game';
import { join, place, run, seeded, started, table } from './helpers';

const snap = (g: Game, id: string) => g.snapFor(id, { fx: [], noisy: false })!;

describe('the lobby', () => {
  it('needs two players and the host to start', () => {
    const { g, ids } = table(1);
    g.start(ids[0]);
    expect(g.phase).toBe('lobby');
    const b = join(g, 'B');
    g.start(b.id);
    expect(g.phase).toBe('lobby');
    g.start(ids[0]);
    expect(g.phase).toBe('countdown');
  });
  it('lets only the host pick the mode', () => {
    const { g, ids } = table(2);
    g.configure(ids[1], 'escape');
    expect(g.settings.mode).toBe('last');
    g.configure(ids[0], 'escape');
    expect(g.settings.mode).toBe('escape');
  });
  it('lets the host pick the map, or leaves it to chance without a repeat', () => {
    const { g, ids } = table(3);
    g.configure(ids[1], undefined, 5);
    expect(g.settings.map).toBe(0);
    g.configure(ids[0], undefined, 99);
    expect(g.settings.map).toBe(0);
    g.configure(ids[0], undefined, 5);
    g.start(ids[0]);
    expect(g.viewFor(ids[0]).round!.map).toBe(5);
    expect(g.world!.map.name).toBe('The Boathouse');
    g.abort(ids[0]);
    g.configure(ids[0], undefined, -1);
    let last = 5;
    for (let i = 0; i < 12; i++) {
      g.start(ids[0]);
      const now = g.viewFor(ids[0]).round!.map;
      expect(now).not.toBe(last);
      expect(g.world!.tasks).toHaveLength(0);
      last = now;
      g.abort(ids[0]);
    }
  });
  it('seats bots up to the limit and gives a human a bot\'s seat', () => {
    const { g, ids } = table(1);
    for (let i = 0; i < 20; i++) g.addBot(ids[0]);
    expect(g.players.size).toBe(MAX_PLAYERS);
    const j = join(g, 'Late');
    expect(g.players.size).toBe(MAX_PLAYERS);
    expect(g.viewFor(j.id).players.find((p) => p.id === j.id)!.spectator).toBe(false);
  });
});

describe('a round', () => {
  it('starts with exactly one Beast, held in its den, and everyone agrees who', () => {
    const { g, ids, w } = started(5);
    const views = ids.map((id) => g.viewFor(id).round!);
    for (const v of views) expect(v.sides).toEqual(views[0].sides);
    expect(Object.values(views[0].sides).filter((s) => s === 'b')).toHaveLength(1);
    expect(Object.values(views[0].sides).filter((s) => s === 'c')).toHaveLength(4);
    const beast = w.beasts()[0];
    expect(w.flags(beast) & F_HELD).toBeTruthy();
    run(g, HEAD_START_MS);
    expect(w.flags(beast) & F_HELD).toBeFalsy();
  });
  it('holds everyone still through the countdown', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    const w = g.world!;
    const c = w.cousins()[0];
    const x = c.x;
    g.input(c.id, 1, 0, false, false);
    run(g, COUNTDOWN_MS - 100);
    expect(c.x).toBe(x);
    run(g, 300);
    expect(c.x).toBeGreaterThan(x);
  });
  it('takes turns at being the Beast', () => {
    const { g, ids } = table(3, 5);
    const firsts: string[] = [];
    for (let i = 0; i < 3; i++) {
      g.start(ids[0]);
      firsts.push(g.world!.firstBeast);
      g.abort(ids[0]);
    }
    expect(new Set(firsts).size).toBe(3);
  });
  it('ignores controls from someone who is not in it', () => {
    const { g, w } = started(3);
    const late = join(g, 'Late');
    expect(g.viewFor(late.id).players.find((p) => p.id === late.id)!.spectator).toBe(true);
    g.input(late.id, 1, 0, true, true);
    expect(w.body(late.id)).toBeUndefined();
    expect(snap(g, late.id).me).toBeNull();
  });
});

describe('what a player is told', () => {
  it('leaves out the other side when a wall is in the way', () => {
    const { g, w } = started(3);
    const beast = w.beasts()[0];
    const [a, c] = w.cousins();
    // the den is far from the hall and round several corners
    const ids = (viewer: string) => snap(g, viewer).bodies.map((b) => b[0]).sort();
    expect(ids(beast.id)).toEqual([beast.id]);
    expect(ids(a.id)).toEqual([a.id, c.id].sort());
    place(w, a.id, beast.x + 60, beast.y);
    expect(ids(beast.id)).toEqual([a.id, beast.id].sort());
    expect(ids(a.id)).toEqual([a.id, beast.id, c.id].sort());
    expect(ids(c.id)).toEqual([a.id, c.id].sort());
  });
  it('shows a watcher everything', () => {
    const { g, w } = started(3);
    const late = join(g, 'Late');
    expect(snap(g, late.id).bodies).toHaveLength(w.bodies.length);
  });
  it('tells only Beasts about noises, and only those in sight about dashes', () => {
    const { g, w } = started(3, 'escape');
    const beast = w.beasts()[0];
    const [a] = w.cousins();
    const frame = { fx: [['n', 100, 100, 1], ['l', beast.id], ['d', 0]] as never, noisy: true };
    expect(g.snapFor(beast.id, frame)!.fx.map((e) => e[0])).toEqual(['n', 'l', 'd']);
    expect(g.snapFor(a.id, frame)!.fx.map((e) => e[0])).toEqual(['d']);
    a.working = true;
    expect(g.snapFor(a.id, frame)!.fx.map((e) => e[0])).toEqual(['d', 'h']);
  });
  it('carries its own energy and waits', () => {
    const { g, w } = started(2);
    const c = w.cousins()[0];
    c.energy = 37.4;
    expect(snap(g, c.id).me![0]).toBe(37);
    expect(snap(g, c.id).pl).toBe((1 << MAP.pills.length) - 1);
  });
  it('lets a Cousin feel a Beast coming, through walls, without saying where', () => {
    const { g, w } = started(3);
    const beast = w.beasts()[0];
    const [a, c] = w.cousins();
    const dread = (id: string) => snap(g, id).me![4];
    // still in its den: no threat yet
    place(w, a.id, beast.x + 60, beast.y);
    expect(dread(a.id)).toBe(0);
    run(g, HEAD_START_MS);
    expect(dread(a.id)).toBe(DREAD_STEPS);
    expect(dread(c.id)).toBe(0);
    expect(dread(beast.id)).toBe(0);
    // the same from either side, and with a wall between: the Kitchen and the Library share one
    place(w, beast.id, 13.5 * 40, 6.5 * 40);
    place(w, a.id, 13.5 * 40 - 200, 6.5 * 40);
    place(w, c.id, 13.5 * 40 + 200, 6.5 * 40);
    expect(dread(a.id)).toBeGreaterThan(0);
    expect(dread(a.id)).toBeLessThan(DREAD_STEPS);
    expect(dread(a.id)).toBe(dread(c.id));
    expect(snap(g, a.id).bodies.map((b) => b[0])).not.toContain(beast.id);
    // further off it fades, and a Beast that is still turning does not count
    place(w, a.id, 13.5 * 40 - 400, 6.5 * 40);
    expect(dread(a.id)).toBeLessThan(dread(c.id));
    beast.convertMs = 1000;
    expect(dread(c.id)).toBe(0);
  });
});

/** Turn a Cousin by hand, as a catch would. */
function turn(g: Game, id: string): void {
  // by nobody: a catch by a Beast would stop the round for the cutscene, which has its own tests
  (g.world as unknown as { convert(c: unknown, by: string): void }).convert(g.world!.body(id), '');
}

describe('Last Cousin Standing', () => {
  it('has no chores', () => {
    const { g, ids, w } = started(4);
    expect(w.tasks).toHaveLength(0);
    expect(g.viewFor(ids[0]).round!.tasks).toEqual([]);
    expect(snap(g, ids[0]).tk).toEqual([]);
  });
  it('is won by the last Cousin left', () => {
    const { g, ids, w } = started(4);
    const [a, b, c] = w.cousins().map((x) => x.id);
    turn(g, a);
    run(g, TICK_MS * 2);
    expect(g.phase).toBe('play');
    turn(g, b);
    run(g, TICK_MS * 2);
    expect(g.phase).toBe('finale');
    const r = g.viewFor(ids[0]).result!;
    expect(r).toMatchObject({ winner: 'cousins', why: 'last', survivors: [c] });
    expect(r.catches.map((x) => x.who)).toEqual([a, b]);
  });
  it('goes to the Beasts when the last two fall together', () => {
    const { g, ids, w } = started(3);
    for (const c of w.cousins()) turn(g, c.id);
    run(g, TICK_MS * 2);
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: 'beasts', why: 'caught', survivors: [] });
  });
  it('with two players, the Cousin must outlast the clock', () => {
    const { g, ids } = started(2);
    run(g, 5000);
    expect(g.phase).toBe('play');
    run(g, LAST_CLOCK_MS);
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: 'cousins', why: 'clock' });
  });
});

describe('Escape', () => {
  it('lays out one chore more than there are Cousins', () => {
    const { g, ids, w } = started(4, 'escape');
    expect(w.tasks).toHaveLength(tasksFor(3));
    expect(g.viewFor(ids[0]).round!.tasks).toHaveLength(tasksFor(3));
    expect(snap(g, ids[0]).tk).toHaveLength(tasksFor(3));
  });
  it('goes on until every Cousin still free has got out or been caught', () => {
    const { g, ids, w } = started(4, 'escape');
    for (const t of w.tasks) t.progress = 1;
    w.exitsOpen = true;
    const [a, b, c] = w.cousins();
    for (const x of [a, b]) {
      place(w, x.id, MAP.exits[0].x, MAP.exits[0].y);
      g.input(x.id, 0, 0, false, true);
    }
    run(g, 2000);
    // two are out, one is still in the house: the round is not over
    expect(w.escaped).toEqual([a.id, b.id]);
    expect(g.phase).toBe('play');
    expect(g.viewFor(ids[0]).round!.sides[a.id]).toBe('x');
    // someone who is out sees the whole house
    expect(snap(g, a.id).bodies.map((s) => s[0])).toContain(w.firstBeast);
    turn(g, c.id);
    run(g, TICK_MS * 2);
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: 'cousins', why: 'escaped', escaped: [a.id, b.id], survivors: [] });
  });
  it('ends at once when the last Cousin in the house gets out', () => {
    const { g, ids, w } = started(3, 'escape');
    for (const t of w.tasks) t.progress = 1;
    w.exitsOpen = true;
    for (const x of w.cousins()) {
      place(w, x.id, MAP.exits[1].x, MAP.exits[1].y);
      g.input(x.id, 0, 0, false, true);
    }
    run(g, 2000);
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: 'cousins', why: 'escaped' });
    expect(g.viewFor(ids[0]).result!.escaped).toHaveLength(2);
  });
  it('counts whoever got out if the clock runs out on the rest', () => {
    const { g, ids, w } = started(4, 'escape');
    for (const t of w.tasks) t.progress = 1;
    w.exitsOpen = true;
    const [a, b, c] = w.cousins();
    place(w, a.id, MAP.exits[0].x, MAP.exits[0].y);
    g.input(a.id, 0, 0, false, true);
    run(g, 2000);
    // the Beast and the other two stand apart for the rest of the night
    place(w, w.firstBeast, MAP.den.x, MAP.den.y);
    place(w, b.id, MAP.cousinStarts[0].x, MAP.cousinStarts[0].y);
    place(w, c.id, MAP.cousinStarts[1].x, MAP.cousinStarts[1].y);
    run(g, ESCAPE_CLOCK_MS);
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: 'cousins', why: 'escaped', escaped: [a.id], survivors: [b.id, c.id] });
  });
  it('goes to the Beasts when everyone is caught, or the clock runs out', () => {
    const one = started(3, 'escape');
    for (const c of one.w.cousins()) turn(one.g, c.id);
    run(one.g, TICK_MS * 2);
    expect(one.g.viewFor(one.ids[0]).result).toMatchObject({ winner: 'beasts', why: 'caught' });
    const two = started(3, 'escape');
    run(two.g, ESCAPE_CLOCK_MS + 100);
    expect(two.g.viewFor(two.ids[0]).result).toMatchObject({ winner: 'beasts', why: 'clock' });
  });
  it('does not end when only one Cousin is left', () => {
    const { g, w } = started(4, 'escape');
    const [a, b] = w.cousins();
    turn(g, a.id);
    turn(g, b.id);
    run(g, TICK_MS * 2);
    expect(g.phase).toBe('play');
  });
});

describe('a catch', () => {
  it('stops the whole round for the cutscene, then lets it go on', () => {
    const { g, ids, w } = started(4);
    const beast = w.beasts()[0];
    const [a, b] = w.cousins();
    run(g, HEAD_START_MS);
    const left = snap(g, ids[0]).left;
    place(w, a.id, beast.x + 10, beast.y);
    run(g, TICK_MS);
    expect(a.role).toBe('beast');
    expect(snap(g, ids[0]).hold).toBeGreaterThan(CUTSCENE_MS - 100);
    // nobody moves, the clock stands still, nobody else is caught
    const at = b.x;
    g.input(b.id, 1, 0, false, false);
    place(w, b.id, at, b.y);
    run(g, CUTSCENE_MS - 200);
    expect(b.x).toBe(at);
    expect(snap(g, ids[0]).left).toBeGreaterThan(left - 100);
    expect(snap(g, ids[0]).hold).toBeGreaterThan(0);
    run(g, 400);
    expect(snap(g, ids[0]).hold).toBe(0);
    expect(b.x).toBeGreaterThan(at);
  });
  it('that ends the round is shown before the result', () => {
    const { g, w } = started(2);
    const beast = w.beasts()[0];
    const [a] = w.cousins();
    run(g, HEAD_START_MS);
    place(w, a.id, beast.x + 10, beast.y);
    run(g, TICK_MS * 2);
    expect(g.phase).toBe('play');
    run(g, CUTSCENE_MS);
    expect(g.phase).toBe('finale');
  });
});

describe('ghosts', () => {
  it('are what a caught Cousin becomes in Escape: the Beast stays alone', () => {
    const { g, ids, w } = started(4, 'escape');
    const beast = w.beasts()[0];
    const [a, b] = w.cousins();
    run(g, HEAD_START_MS);
    place(w, a.id, beast.x + 10, beast.y);
    run(g, TICK_MS * 2);
    expect(a.ghost).toBe(true);
    expect(a.role).toBe('cousin');
    expect(w.beasts()).toHaveLength(1);
    expect(w.cousins()).toHaveLength(2);
    expect(g.viewFor(ids[0]).round!.sides[a.id]).toBe('g');
    expect(g.phase).toBe('play');
    // cannot be caught again, and does not stop the Beast catching someone else behind it
    run(g, CUTSCENE_MS + 1000);
    expect(w.catches).toHaveLength(1);
    place(w, b.id, beast.x + 12, beast.y);
    run(g, TICK_MS * 2);
    expect(b.ghost).toBe(true);
  });
  it('see everyone and are seen by nobody living', () => {
    const { g, w } = started(4, 'escape');
    const beast = w.beasts()[0];
    const [a, b] = w.cousins();
    turn(g, a.id);
    const seen = (id: string) => snap(g, id).bodies.map((s) => s[0]);
    expect(seen(a.id)).toHaveLength(4);
    expect(seen(b.id)).not.toContain(a.id);
    place(w, a.id, beast.x + 40, beast.y);
    expect(seen(beast.id)).not.toContain(a.id);
    expect(snap(g, a.id).me![4]).toBe(0);
    // another ghost does see them
    turn(g, b.id);
    expect(seen(b.id)).toContain(a.id);
  });
  it('drift through walls but not out of the house, and can do nothing', () => {
    const { g, w } = started(3, 'escape');
    const [a] = w.cousins();
    for (const t of w.tasks) t.progress = 0;
    turn(g, a.id);
    place(w, a.id, MAP.cousinStarts[0].x, MAP.cousinStarts[0].y);
    g.input(a.id, -1, 0, true, false);
    run(g, 20_000);
    // from the Hall, through every wall, to the inside of the west wall
    expect(a.x).toBe(40);
    const t = w.tasks[0];
    place(w, a.id, t.x, t.y);
    g.input(a.id, 0, 0, false, true);
    run(g, 2000);
    expect(t.progress).toBe(0);
    const pill = MAP.pills[0];
    a.energy = 0;
    place(w, a.id, pill.x, pill.y);
    run(g, 100);
    expect(a.energy).toBe(0);
  });
  it('do not happen in Last Cousin Standing', () => {
    const { g, w } = started(4);
    const [a] = w.cousins();
    turn(g, a.id);
    expect(a.ghost).toBe(false);
    expect(a.role).toBe('beast');
  });
  it('are not who takes over when the Beast leaves', () => {
    const { g, w } = started(5, 'escape');
    const [a] = w.cousins();
    turn(g, a.id);
    g.leave(w.firstBeast);
    expect(w.beasts()).toHaveLength(1);
    expect(w.beasts()[0].ghost).toBe(false);
    expect(g.phase).toBe('play');
  });
});

describe('only watching', () => {
  it('gives up the seat, is never dealt in, and sees the whole house', () => {
    const { g, ids } = table(3);
    const tv = join(g, 'TV');
    g.watch(tv.id, true);
    const me = () => g.viewFor(tv.id).players.find((p) => p.id === tv.id)!;
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    g.start(ids[0]);
    run(g, COUNTDOWN_MS + TICK_MS);
    const w = g.world!;
    expect(w.bodies).toHaveLength(3);
    expect(snap(g, tv.id).bodies).toHaveLength(3);
    expect(snap(g, tv.id).me).toBeNull();
    // still only watching in the next lobby, and the host is still a player
    g.abort(ids[0]);
    expect(me()).toMatchObject({ spectator: true, watcher: true });
    expect(g.hostId()).toBe(ids[0]);
    g.watch(tv.id, false);
    expect(me()).toMatchObject({ spectator: false, watcher: false });
  });
  it('does not take up a seat or count toward the two a round needs', () => {
    const { g, ids } = table(1);
    const tv = join(g, 'TV');
    g.watch(tv.id, true);
    g.start(ids[0]);
    expect(g.phase).toBe('lobby');
    for (let i = 0; i < 20; i++) g.addBot(ids[0]);
    expect(g.viewFor(ids[0]).players.filter((p) => !p.spectator)).toHaveLength(MAX_PLAYERS);
  });
  it('chosen mid-round takes the body out of the round', () => {
    const { g, ids, w } = started(4);
    const c = w.cousins()[0];
    g.watch(c.id, true);
    expect(w.body(c.id)).toBeUndefined();
    expect(g.phase).toBe('play');
    expect(g.viewFor(ids[0]).round!.sides[c.id]).toBeUndefined();
  });
});

describe('coming and going', () => {
  it('keeps a dropped player\'s body, plays it, and hands it back', () => {
    const { g, ids, tokens, w } = started(3);
    g.drop(ids[1]);
    expect(g.viewFor(ids[0]).players.find((p) => p.id === ids[1])!.connected).toBe(false);
    expect(w.body(ids[1])).toBeDefined();
    const back = join(g, 'whoever', tokens[1]);
    expect(back).toMatchObject({ id: ids[1], resumed: true });
  });
  it('gives the hunt to a Cousin when the only Beast leaves', () => {
    const { g, w } = started(4);
    g.leave(w.firstBeast);
    expect(g.phase).toBe('play');
    expect(w.beasts()).toHaveLength(1);
    expect(w.cousins()).toHaveLength(2);
  });
  it('ends the round when a leaving Cousin leaves one behind', () => {
    const { g, ids, w } = started(3);
    const [a, b] = w.cousins();
    g.leave(a.id);
    expect(g.phase).toBe('finale');
    expect(g.viewFor(ids[0]).result).toMatchObject({ winner: 'cousins', survivors: [b.id] });
  });
  it('goes back to the lobby when one player is left', () => {
    const { g, ids } = started(2);
    g.leave(ids[1]);
    expect(g.phase).toBe('lobby');
  });
  it('goes back to the lobby after the result, with watchers seated', () => {
    const { g, ids, w } = started(3);
    const late = join(g, 'Late');
    for (const c of w.cousins()) turn(g, c.id);
    run(g, TICK_MS * 2);
    g.again(ids[0]);
    expect(g.phase).toBe('lobby');
    expect(g.viewFor(late.id).players.every((p) => !p.spectator)).toBe(true);
  });
  it('clears an abandoned table', () => {
    const g = new Game(seeded(1));
    const a = join(g, 'A');
    g.addBot(a.id);
    g.start(a.id);
    g.reset();
    expect(g.players.size).toBe(0);
    expect(g.phase).toBe('lobby');
  });
});
