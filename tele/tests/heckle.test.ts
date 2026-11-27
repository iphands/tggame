import { describe, expect, it } from 'vitest';
import { HECKLE_COOLDOWN_MS, HECKLES_PER_LEVEL } from '../shared/src/constants';
import { HECKLES, pickHeckle } from '../shared/src/heckles';
import { isClientMessage } from '../shared/src/protocol';
import { playTurn, seeded, table } from './helpers';

const T = 1_000_000;
const STEP = HECKLE_COOLDOWN_MS;

/** A started game in the word-picking turn, where player 0 has already handed in. */
function waiting() {
  const { g, ids } = table(4, 7);
  g.start(ids[0]);
  g.pick(ids[0], 0);
  return { g, ids };
}

describe('heckling', () => {
  it('lets a finished player shout at one who is still busy, for everyone to see', () => {
    const { g, ids } = waiting();
    g.heckle(ids[0], ids[1], T);
    for (const id of ids) {
      const h = g.viewFor(id).heckle;
      expect(h).toMatchObject({ seq: 1, byId: ids[0], targetId: ids[1], level: 1 });
      expect(h!.text.length).toBeGreaterThan(0);
    }
  });

  it('is not for players who have not handed in yet', () => {
    const { g, ids } = waiting();
    g.heckle(ids[2], ids[1], T);
    expect(g.viewFor(ids[0]).heckle).toBeNull();
  });

  it('cannot be aimed at someone who is done, at yourself, or at nobody', () => {
    const { g, ids } = waiting();
    g.pick(ids[1], 0);
    g.heckle(ids[0], ids[1], T);
    g.heckle(ids[0], ids[0], T);
    g.heckle(ids[0], 'p999', T);
    expect(g.viewFor(ids[0]).heckle).toBeNull();
  });

  it('can be spammed, but not faster than the cooldown', () => {
    const { g, ids } = waiting();
    g.heckle(ids[0], ids[1], T);
    g.heckle(ids[0], ids[1], T + STEP - 1);
    expect(g.viewFor(ids[0]).heckle!.seq).toBe(1);
    g.heckle(ids[0], ids[2], T + STEP);
    g.heckle(ids[0], ids[3], T + 2 * STEP);
    expect(g.viewFor(ids[0]).heckle).toMatchObject({ seq: 3, targetId: ids[3] });
  });

  it('gets louder the more one player is heckled, and never repeats a line back to back', () => {
    const { g, ids } = waiting();
    let last = '';
    const levels: number[] = [];
    for (let i = 0; i < HECKLES_PER_LEVEL * 3 + 2; i++) {
      g.heckle(ids[0], ids[1], T + i * STEP);
      const h = g.viewFor(ids[0]).heckle!;
      expect(h.text).not.toBe(last);
      last = h.text;
      levels.push(h.level);
    }
    expect(levels.slice(0, HECKLES_PER_LEVEL)).toEqual(Array(HECKLES_PER_LEVEL).fill(1));
    expect(levels[HECKLES_PER_LEVEL]).toBe(2);
    expect(levels[levels.length - 1]).toBe(3);
  });

  it('starts every turn quiet', () => {
    const { g, ids } = waiting();
    for (let i = 0; i < HECKLES_PER_LEVEL + 1; i++) g.heckle(ids[0], ids[1], T + i * STEP);
    expect(g.viewFor(ids[0]).heckle!.level).toBe(2);
    playTurn(g, ids);
    expect(g.phase).toBe('draw');
    expect(g.viewFor(ids[0]).heckle).toBeNull();
    // first one of the new turn is a nudge again
    g.draw(ids[0], [{ c: 0, w: 5, p: [10, 10, 60, 60] }]);
    g.heckle(ids[0], ids[1], T + 100 * STEP);
    expect(g.viewFor(ids[0]).heckle).toMatchObject({ level: 1, targetId: ids[1] });
  });

  it('is only possible while a turn is being played', () => {
    const { g, ids } = table(4, 7);
    g.heckle(ids[0], ids[1], T);
    expect(g.viewFor(ids[0]).heckle).toBeNull();
  });
});

describe('heckle lines', () => {
  it('name the slow player wherever the line asks for it', () => {
    for (const level of [1, 2, 3]) {
      for (let seed = 1; seed <= 40; seed++) {
        const line = pickHeckle(level, 'Mo', seeded(seed));
        expect(line).not.toContain('{name}');
      }
    }
    expect(HECKLES).toHaveLength(3);
  });

  it('travel as a message with a player id', () => {
    expect(isClientMessage({ type: 'heckle', playerId: 'p2' })).toBe(true);
    expect(isClientMessage({ type: 'heckle' })).toBe(false);
    expect(isClientMessage({ type: 'heckle', playerId: 'x'.repeat(17) })).toBe(false);
  });
});
