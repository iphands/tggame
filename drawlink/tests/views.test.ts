import { describe, expect, it } from 'vitest';
import { BETWEEN_MS, HINT_BLANK } from '../shared/src/constants';
import { bare } from '../shared/src/drawing';
import { join, T0, table, wordOf } from './helpers';

/**
 * The core promise of the game: while a round runs, only the drawer knows the
 * word. Everyone else gets the drawing, the chat and (in time) a few letters.
 */
describe('hidden information', () => {
  it('nothing sent to a guesser or a spectator contains the word', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    const watcher = join(g, 'Watcher', T0).id;
    let now = T0;
    for (let round = 0; round < 6; round++) {
      const word = wordOf(g);
      const drawer = g.drawerId!;
      g.chat(drawer, `psst it is ${word}`, ids.find((id) => id !== drawer), now + 500);
      for (const t of [0, 19_000, 21_000, 45_000, 65_000, 85_000, 105_000, 119_000]) {
        g.tick(now + t);
        for (const id of [...ids, watcher]) {
          if (id === drawer) continue;
          expect(g.taskFor(id)).toBeNull();
          const seen = JSON.stringify([g.viewFor(id), g.chatFor(id, 0)]);
          expect(bare(seen)).not.toContain(bare(word));
          expect(g.viewFor(id).result).toBeNull();
        }
        expect(g.taskFor(drawer)).toEqual({ word });
      }
      g.tick((now += 120_000));
      expect(g.viewFor(watcher).result!.word).toBe(word);
      g.tick((now += BETWEEN_MS));
    }
  });

  it('hints follow the clock and can be switched off', () => {
    const { g, ids } = table(3);
    g.start(ids[0], T0);
    const word = wordOf(g);
    g.tick(T0 + 5_000);
    const blanks = g.viewFor(ids[1]).round!.hint!;
    expect([...blanks]).toHaveLength([...word].length);
    expect(blanks).toContain(HINT_BLANK);
    expect(bare(blanks)).toBe('');
    g.tick(T0 + 15_000);
    expect(g.viewFor(ids[1]).round!.hint![0]).toBe(word[0]);

    const off = table(3);
    off.g.configure(off.ids[0], undefined, false);
    off.g.start(off.ids[0], T0);
    off.g.tick(T0 + 100_000);
    expect(off.g.viewFor(off.ids[1]).round!.hint).toBeNull();
  });

  it('a view never carries the drawing or anybody else\'s votes', () => {
    const { g, ids } = table(4);
    g.start(ids[0], T0);
    g.inkAdd(ids[0], 0, 0, 5, [123, 456, 321, 654]);
    g.boot(ids[1], ids[3], T0);
    expect(JSON.stringify(g.viewFor(ids[2]))).not.toContain('123,456');
    expect(g.viewFor(ids[2]).myBoots).toEqual([]);
    expect(g.viewFor(ids[1]).myBoots).toEqual([ids[3]]);
  });
});
