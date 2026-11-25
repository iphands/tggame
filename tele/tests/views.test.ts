import { describe, expect, it } from 'vitest';
import { doodle, playTurn, table } from './helpers';

/**
 * The core promise of the game: until the reveal, a player learns nothing
 * except the one page in front of them.
 */
describe('hidden information', () => {
  it('no view, task or page list leaks another page before the reveal', () => {
    const n = 5;
    const { g, ids } = table(n);
    g.start(ids[0]);
    const watcher = g.join('Watcher')!.id;

    // distinct secret per seat so any leak is detectable
    const cards = ids.map((id) => {
      const t = g.taskFor(id)!;
      return t.kind === 'pick' ? t.card : [];
    });
    expect(new Set(cards.flat()).size).toBe(n * 4);
    ids.forEach((id) => g.pick(id, 1));

    while (g.phase !== 'reveal') {
      expect(g.visiblePages()).toEqual([]);
      const tasks = ids.map((id) => g.taskFor(id)!);
      ids.forEach((id, seat) => {
        const mine = JSON.stringify(tasks[seat]);
        const view = JSON.stringify(g.viewFor(id));
        // the state view never carries page content at all
        for (const book of g.books) for (const page of book) {
          if (page.kind === 'word') expect(view).not.toContain(`"${page.text}"`);
          else expect(view).not.toContain(JSON.stringify(page.strokes));
        }
        // and my task is exactly one page: no other seat's task content appears in it
        tasks.forEach((other, s) => {
          if (s === seat) return;
          if (other.kind === 'draw') expect(mine).not.toContain(`"${other.word}"`);
          if (other.kind === 'guess') expect(mine).not.toContain(JSON.stringify(other.strokes));
        });
      });
      expect(g.taskFor(watcher)).toBeNull();
      expect(JSON.stringify(g.viewFor(watcher))).not.toContain('"p":');
      playTurn(g, ids);
    }
  });

  it('the reveal exposes pages one at a time, and earlier books stay open', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    while (g.phase !== 'reveal') playTurn(g, ids);
    expect(g.visiblePages().map((r) => `${r.book}:${r.index}`)).toEqual(['0:0']);
    g.next(ids[0]);
    expect(g.visiblePages().map((r) => `${r.book}:${r.index}`)).toEqual(['0:0', '0:1']);
    g.next(ids[0]);
    g.next(ids[0]);
    expect(g.visiblePages().map((r) => `${r.book}:${r.index}`)).toEqual(['0:0', '0:1', '0:2', '1:0']);
    expect(g.taskFor(ids[0])).toBeNull();
  });

  it('a submitted player still only sees their own task', () => {
    const { g, ids } = table(3);
    g.start(ids[0]);
    ids.forEach((id) => g.pick(id, 0));
    const before = JSON.stringify(g.taskFor(ids[0]));
    g.draw(ids[0], doodle(7));
    expect(JSON.stringify(g.taskFor(ids[0]))).toBe(before);
    expect(JSON.stringify(g.viewFor(ids[1]))).not.toContain(JSON.stringify(doodle(7)));
  });
});
