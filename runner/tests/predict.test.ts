import { describe, expect, it } from 'vitest';
import { Predictor } from '../client/src/predict';
import type { LevelDef } from '../shared/src/levels';
import type { SnapshotMessage } from '../shared/src/protocol';
import type { Fx } from '../shared/src/types';
import { flatWorld, newCustom, startMatch, run, P, TICK_MS } from './sim/helpers';

type Buttons = { left: boolean; right: boolean; jump: boolean };
const NONE: Buttons = { left: false, right: false, jump: false };

/**
 * A real `Game` and a `Predictor` with `lag` ticks of line between them, each way. One call of
 * `frame` is one sixtieth of a second for both.
 */
function line(lag: number, level: LevelDef, names = ['A']) {
  const g = newCustom(level);
  const [a, ...rest] = startMatch(g, names);
  run(g, 300);
  const fxs: Fx[] = [];
  const pred = new Predictor((fx) => fxs.push(fx), [level]);
  pred.leadMs = (2 * lag + 2) * TICK_MS;
  const up: { at: number; go: () => void }[] = [];
  const down: { at: number; snap: SnapshotMessage }[] = [];
  const truth = new Map<number, { x: number; y: number; scroll: number }>();
  const drawn: { tick: number; frac: number; x: number; y: number; scroll: number }[] = [];
  let n = 0;
  let held = NONE;

  const frame = (buttons: Buttons = held): void => {
    let newest: SnapshotMessage | null = null;
    while (down.length && down[0].at <= n) newest = down.shift()!.snap;
    if (newest) pred.onSnapshot(newest);
    const simEdge = (g.tick - lag + 0.25) * TICK_MS;
    if (buttons.left !== held.left || buttons.right !== held.right || buttons.jump !== held.jump) {
      held = buttons;
      const stamp = pred.command(buttons, simEdge);
      up.push({ at: n + lag, go: () => g.setInput(a, buttons, stamp) });
    }
    const out = pred.advance(simEdge, n * TICK_MS);
    if (out) {
      const target = (simEdge + pred.leadMs) / TICK_MS;
      drawn.push({ tick: Math.floor(target), frac: target - Math.floor(target), x: out.x, y: out.y, scroll: out.scrollX });
    }
    while (up.length && up[0].at <= n) up.shift()!.go();
    g.step(TICK_MS);
    truth.set(g.tick, { x: P(g, a).x, y: P(g, a).y, scroll: g.w.scrollX });
    if (g.tick % 2 === 0) {
      const snap = { type: 'snapshot', selfId: a, you: g.selfState(a), ...g.snapshot() } as SnapshotMessage;
      down.push({ at: n + lag, snap: JSON.parse(JSON.stringify(snap)) as SnapshotMessage });
    }
    n++;
  };

  /** The furthest the drawn runner (and screen) was from where the server really had it. */
  const worst = (from = 0): { body: number; scroll: number } => {
    let body = 0;
    let scroll = 0;
    for (const d of drawn.slice(from)) {
      const t0 = truth.get(d.tick - 1);
      const t1 = truth.get(d.tick);
      if (!t0 || !t1) continue;
      body = Math.max(body, Math.hypot(d.x - (t0.x + (t1.x - t0.x) * d.frac), d.y - (t0.y + (t1.y - t0.y) * d.frac)));
      scroll = Math.max(scroll, Math.abs(d.scroll - (t0.scroll + (t1.scroll - t0.scroll) * d.frac)));
    }
    return { body, scroll };
  };

  return { g, a, rest, pred, frame, fxs, drawn, worst };
}

/** Run right, hopping now and then. */
function dash(frame: (b: Buttons) => void, frames: number): void {
  for (let f = 0; f < frames; f++) frame({ left: false, right: true, jump: f % 50 > 40 });
}

describe('our own runner, a slow line away', () => {
  for (const lag of [1, 8, 12]) {
    it(`is drawn exactly where the server will have it, and so is the screen (${lag} ticks each way)`, () => {
      const l = line(lag, flatWorld());
      for (let i = 0; i < 30; i++) l.frame(NONE);
      dash(l.frame, 420);
      expect(P(l.g, l.a).life).toBe('alive');
      expect(l.g.w.scrollX).toBeGreaterThan(300); // the screen really did chase us
      const w = l.worst();
      expect(w.body).toBeLessThan(0.01);
      expect(w.scroll).toBeLessThan(0.01);
      expect(l.pred.corrections).toBe(0);
    });
  }

  it('stops at the side of a box and jumps onto it, as the server does', () => {
    const level = flatWorld({ boxes: [{ x: 700, y: 480, w: 60, h: 60 }, { x: 1100, y: 420, w: 80, h: 120 }] });
    const l = line(8, level);
    for (let f = 0; f < 150; f++) l.frame({ ...NONE, right: true }); // into the first box's side
    expect(P(l.g, l.a).x).toBeLessThan(700);
    for (let f = 0; f < 200; f++) l.frame({ left: false, right: true, jump: f % 30 < 12 });
    expect(P(l.g, l.a).x).toBeGreaterThan(760);
    expect(l.worst().body).toBeLessThan(0.01);
  });

  it('is held by a standing gate', () => {
    const level = flatWorld({ gates: [{ x: 900, w: 40 }] } as Partial<LevelDef>);
    const l = line(8, level);
    dash(l.frame, 300);
    expect(P(l.g, l.a).x).toBeLessThan(900);
    expect(l.worst().body).toBeLessThan(0.01);
  });

  it('follows the screen closely when someone else is the leader it chases', () => {
    const l = line(8, flatWorld(), ['A', 'B']);
    const b = l.rest[0];
    l.g.setInput(b, { left: false, right: true, jump: false });
    for (let i = 0; i < 400; i++) l.frame(NONE);
    // B is only known as of a snapshot and assumed to keep its speed: near enough for a camera
    expect(l.g.w.scrollX).toBeGreaterThan(200);
    expect(l.worst(120).scroll).toBeLessThan(12);
  });
});
