import { describe, expect, it } from 'vitest';
import { Game } from '../server/src/game';
import { HECKLE_BUTTON_MIN_MS, HECKLE_COOLDOWN_MS, HECKLE_STEP_MS } from '../shared/src/constants';
import { playToQuad, started } from './helpers';

const shout = (g: Game, id: string) => g.viewFor(id).shout;
const pv = (g: Game, id: string) => g.viewFor(id).players.find((p) => p.id === id)!;

describe('automatic heckling', () => {
  it('leaves a brisk table alone', () => {
    const { g, ids, now } = started(3);
    g.tick(now + HECKLE_STEP_MS - 1);
    expect(shout(g, ids[1])).toBeNull();
  });
  it('heckles the player sitting on a card, a level ruder each step, where everyone sees it', () => {
    const { g, ids, now } = started(3);
    // only the dealer holds a card at the start
    g.tick(now + HECKLE_STEP_MS);
    for (const id of ids) expect(shout(g, id)).toMatchObject({ kind: 'heckle', targetId: ids[0], byId: null, level: 1, at: now + HECKLE_STEP_MS });
    const first = shout(g, ids[1])!;
    g.tick(now + HECKLE_STEP_MS + 500);
    expect(shout(g, ids[1])!.seq).toBe(first.seq); // not every tick
    g.tick(now + 2 * HECKLE_STEP_MS);
    expect(shout(g, ids[1])).toMatchObject({ level: 2 });
    expect(shout(g, ids[1])!.text).not.toBe(first.text);
    g.tick(now + 3 * HECKLE_STEP_MS);
    expect(shout(g, ids[1])).toMatchObject({ level: 3 });
    const third = shout(g, ids[1])!.seq;
    g.tick(now + 5 * HECKLE_STEP_MS);
    expect(shout(g, ids[1])).toMatchObject({ level: 3 }); // capped, but it keeps coming
    expect(shout(g, ids[1])!.seq).toBeGreaterThan(third);
  });
  it('picks on the slowest player only, and starts over once they pass', () => {
    const { g, ids, now } = started(3);
    g.pass(ids[0], g.taskFor(ids[0])!.drawn!, now + 1_000); // P2 picks up at +1000, P1 again at +1000
    g.pass(ids[0], g.taskFor(ids[0])!.drawn!, now + 3_000); // P1's clock restarts at +3000
    g.tick(now + 1_000 + HECKLE_STEP_MS);
    expect(shout(g, ids[2])).toMatchObject({ targetId: ids[1], level: 1 });
    g.pass(ids[1], g.taskFor(ids[1])!.drawn!, now + 1_100 + HECKLE_STEP_MS); // picks the queued card up straight away
    g.tick(now + 3_000 + HECKLE_STEP_MS);
    expect(shout(g, ids[2])).toMatchObject({ targetId: ids[0], level: 1 });
  });
  it('stops once the scramble for spoons is on', () => {
    const { g, ids, now } = started(4);
    const q = playToQuad(g, ids, now);
    g.grab(q.id, q.now);
    g.tick(q.now + HECKLE_STEP_MS + 1_000);
    expect(shout(g, ids[0])).toBeNull();
  });
});

describe('the Heckle button', () => {
  it('shouts at the slowest player, in the presser\'s name', () => {
    const { g, ids, now } = started(3);
    g.heckle(ids[1], now + HECKLE_BUTTON_MIN_MS - 1);
    expect(shout(g, ids[0])).toBeNull(); // not slow enough yet
    g.heckle(ids[1], now + HECKLE_BUTTON_MIN_MS);
    for (const id of ids) expect(shout(g, id)).toMatchObject({ kind: 'heckle', targetId: ids[0], byId: ids[1], level: 1 });
  });
  it('cannot be aimed at yourself, and cools down', () => {
    const { g, ids, now } = started(3);
    g.heckle(ids[0], now + 2_600); // the slow one is P1 themself
    expect(shout(g, ids[0])).toBeNull();
    g.heckle(ids[1], now + 2_600);
    expect(shout(g, ids[0])).toMatchObject({ byId: ids[1] });
    g.heckle(ids[2], now + 2_700); // somebody else may pile on
    expect(shout(g, ids[0])).toMatchObject({ byId: ids[2] });
    const seq = shout(g, ids[0])!.seq;
    g.heckle(ids[1], now + 3_900); // too soon after their last one
    expect(shout(g, ids[0])!.seq).toBe(seq);
    g.heckle(ids[1], now + 2_600 + HECKLE_COOLDOWN_MS);
    expect(shout(g, ids[0])).toMatchObject({ byId: ids[1] });
  });
  it('gets ruder with the wait', () => {
    const { g, ids, now } = started(3);
    g.tick(now + 2 * HECKLE_STEP_MS + 100);
    g.heckle(ids[2], now + 2 * HECKLE_STEP_MS + 200);
    expect(shout(g, ids[0])).toMatchObject({ byId: ids[2], level: 2 });
  });
});

describe('the slowpoke award', () => {
  it('adds up time spent holding the table past the first heckle, per round and per game', () => {
    const { g, ids, now } = started(3);
    g.pass(ids[0], g.taskFor(ids[0])!.drawn!, now + HECKLE_STEP_MS + 2_500); // 2.5 s over
    g.pass(ids[1], g.taskFor(ids[1])!.drawn!, now + HECKLE_STEP_MS + 2_600); // brisk
    const q = playToQuad(g, ids, now + HECKLE_STEP_MS + 2_700);
    g.grab(q.id, q.now);
    for (const id of ids) g.grab(id, q.now + 10);
    const r = g.viewFor(ids[0]).result!;
    expect(r.slowpokeId).toBe(ids[0]);
    expect(r.slowpokeMs).toBe(2_500);
    expect(pv(g, ids[0]).slowMs).toBe(2_500);
    expect(pv(g, ids[1]).slowMs).toBe(0);
  });
});
