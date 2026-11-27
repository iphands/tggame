import { beforeEach, describe, expect, it } from 'vitest';
import { clock } from '@tggame/base/client/clock';
import { FLAG_DEAD } from '../shared/src/constants';
import type { ArenaMessage, SnapMessage } from '../shared/src/protocol';
import type { BikeSnap, Fx } from '../shared/src/types';
import { clearLive, drawnX, drawnY, live, onArena, onSnap, type LiveEvent } from '../client/src/live';

const arena = (trails: ArenaMessage['trails']): ArenaMessage => ({ type: 'arena', seq: 1, name: 'Test', w: 40, h: 30, blocks: [], ring: 0, trails });
let t = 0;
const snap = (bikes: BikeSnap[], fx: Fx[] = []): SnapMessage => ({ type: 'snap', simTimeMs: (t += 33), cd: 0, calm: 9000, bikes, fx });
/** `[id, x, y, dir, p, speed, flags, energy, turns, odo]` with the usual values filled in. */
const bike = (id: string, x: number, y: number, dir: number, more: Partial<{ p: number; flags: number; turns: number; odo: number }> = {}): BikeSnap => [
  id, x, y, dir, more.p ?? 0, 150, more.flags ?? 0, 100, more.turns ?? 0, more.odo ?? 0,
];

describe('the floor as the client knows it', () => {
  let events: LiveEvent[];
  beforeEach(() => {
    clearLive();
    live.selfId = '';
    events = [];
    live.onEvent = (e) => events.push(e);
  });

  it('starts from the floor message, lines and all', () => {
    onArena(arena([['a', 0, [5, 5]], ['b', 1, [9, 9, 9, 12]]]));
    expect([live.w, live.h, live.name]).toEqual([40, 30, 'Test']);
    expect(live.bikes.get('a')).toMatchObject({ x: 5, y: 5, dead: false });
    expect(live.bikes.get('b')).toMatchObject({ x: 9, y: 12, dead: true });
  });

  it("puts other riders where the server says, and grows their lines corner by corner", () => {
    onArena(arena([['a', 0, [5, 5]]]));
    onSnap(snap([bike('a', 7, 5, 0, { p: 50, odo: 2 })]));
    const a = live.bikes.get('a')!;
    expect([a.x, a.y, a.p, a.speed, a.odo]).toEqual([7, 5, 0.5, 15, 2]);
    expect(drawnX(a)).toBe(8);
    expect(drawnY(a)).toBe(5.5);
    onSnap(snap([bike('a', 8, 6, 1, { turns: 1, odo: 4 })], [['c', 'a', 8, 5]]));
    expect(a.pts).toEqual([5, 5, 8, 5]);
    expect(a.dir).toBe(1);
  });

  it('on a slow line carries other riders forward by one trip, to where the server has them by now', () => {
    clock.reset();
    clock.add({ rtt: 240, offset: 0 }, 0); // a trip of 120 ms: 1.8 cells at 15 cells a second
    try {
      onArena(arena([['a', 0, [5, 5]]]));
      onSnap(snap([bike('a', 7, 5, 0, { p: 50, odo: 2 })]));
      const a = live.bikes.get('a')!;
      expect([a.x, a.y, a.odo]).toEqual([9, 5, 4]);
      expect(a.p).toBeCloseTo(0.3);
      // what the server said is kept as it said it
      expect([a.sx, a.sodo]).toEqual([7, 2]);
    } finally {
      clock.reset();
      clock.add({ rtt: 0, offset: 0 }, 0);
    }
  });

  it('leaves our own bike to the play screen, but keeps what the server said', () => {
    onArena(arena([['me', 0, [5, 5]]]));
    live.selfId = 'me';
    onSnap(snap([bike('me', 5, 5, 0)]));
    const me = live.bikes.get('me')!;
    me.x = 9; // ridden ahead
    onSnap(snap([bike('me', 8, 5, 0, { odo: 3 })]));
    expect(me.x).toBe(9);
    expect([me.sx, me.sodo]).toEqual([8, 3]);
  });

  it('a crash ends the line there, an erase starts it fading, and both are passed on', () => {
    onArena(arena([['me', 0, [5, 5]], ['b', 0, [20, 20]]]));
    live.selfId = 'me';
    onSnap(snap([bike('me', 5, 5, 0), bike('b', 20, 20, 2)]));
    const me = live.bikes.get('me')!;
    me.pts = [5, 5, 7, 5]; // a turn we guessed at
    me.queue.push({ d: 1, at: 9 });
    onSnap(snap([bike('me', 8, 5, 0, { flags: FLAG_DEAD }), bike('b', 19, 20, 2)], [['x', 'me', 'b', 8, 5, 'line'], ['e', 'me'], ['b', 'b'], ['s', 1]]));
    expect(me).toMatchObject({ dead: true, x: 8, y: 5, p: 0, queue: [] });
    expect(me.pts).toEqual([5, 5, 8, 5]);
    expect(me.goneAt).toBeGreaterThan(0);
    expect(live.ring).toBe(1);
    expect(events.map((e) => e.kind)).toEqual(['crash', 'bust', 'shrink']);
    expect(events[0]).toMatchObject({ by: 'b', how: 'line' });
  });

  it('eases away a small correction and takes a big one at once', () => {
    onArena(arena([['a', 0, [5, 5]]]));
    onSnap(snap([bike('a', 5, 5, 0)]));
    const a = live.bikes.get('a')!;
    a.p = 0.9; // ridden on a little
    onSnap(snap([bike('a', 6, 5, 0, { p: 20 })]));
    expect(a.ox).toBeCloseTo(-0.3);
    expect(drawnX(a)).toBeCloseTo(6.4); // still drawn where it was
    onSnap(snap([bike('a', 20, 5, 0)]));
    expect(a.ox).toBe(0);
  });
});
