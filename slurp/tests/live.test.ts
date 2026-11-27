import { beforeEach, describe, expect, it } from 'vitest';
import type { CourseMessage, SnapMessage } from '../shared/src/protocol';
import type { Fx } from '../shared/src/types';
import { clearLive, guessEat, live, onCourse, onSnap, settleGuesses } from '../client/src/live';

const course = (): CourseMessage => ({ type: 'course', seq: 1, no: 1, w: 1000, h: 1000, foods: [[7, 0, 100, 100], [8, 0, 300, 300]] });
let t = 0;
const snap = (fx: Fx[] = []): SnapMessage => ({ type: 'snap', simTimeMs: (t += 33), cd: 0, left: 60_000, n: 2, holes: [], foods: [], fx });

describe('a bite shown going down our own hole before the server says so', () => {
  let eats: string[];
  beforeEach(() => {
    clearLive();
    onCourse(course());
    eats = [];
    live.onEvent = (e) => e.kind === 'eat' && eats.push(e.hole);
  });

  it('goes down at once, is counted, and the server confirming it changes nothing', () => {
    const f = live.foods.get(7)!;
    guessEat(f, 'me', 1000);
    expect(f.state).toBe('eaten');
    expect(live.eaten.get('me')).toBe(1);
    guessEat(f, 'me', 1010); // already down
    onSnap(snap([['e', 7, 'me']]));
    expect(live.eaten.get('me')).toBe(1);
    expect(eats).toEqual(['me']);
    settleGuesses(99_999, 500);
    expect(f.state).toBe('eaten');
  });

  it('is credited to whoever the server says really had it', () => {
    guessEat(live.foods.get(7)!, 'me', 1000);
    onSnap(snap([['e', 7, 'them']]));
    expect(live.eaten.get('me')).toBe(0);
    expect(live.eaten.get('them')).toBe(1);
  });

  it('is put back when the server never confirms it', () => {
    const f = live.foods.get(7)!;
    guessEat(f, 'me', 1000);
    live.foods.delete(7); // the play screen drops a bite once it has gone down
    settleGuesses(1400, 500);
    expect(live.foods.has(7)).toBe(false);
    settleGuesses(1600, 500);
    expect(live.foods.get(7)).toBe(f);
    expect(f.state).toBe('on');
    expect(live.eaten.get('me')).toBe(0);
  });
});
