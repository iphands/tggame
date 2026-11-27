import { describe, expect, it } from 'vitest';
import { Predictor } from '../client/src/predict';
import type { SnapshotMessage } from '../shared/src/protocol';
import type { Fx } from '../shared/src/types';
import { newGame, startMatch, run, place, park, P, TICK_MS } from './sim/helpers';

type Buttons = { left: boolean; right: boolean; jump: boolean };
const NONE: Buttons = { left: false, right: false, jump: false };

/**
 * A real `Game` and a `Predictor` with `lag` ticks of line between them, each way. One call of
 * `frame` is one sixtieth of a second for both.
 */
function line(lag: number, level = 'sky') {
  const g = newGame(level);
  const [a, b] = startMatch(g, ['A', 'B']);
  park(g, b);
  place(g, a, 640, 300);
  run(g, 800);
  const fxs: Fx[] = [];
  const pred = new Predictor((fx) => fxs.push(fx));
  pred.leadMs = (2 * lag + 2) * TICK_MS;
  const up: { at: number; go: () => void }[] = [];
  const down: { at: number; snap: SnapshotMessage }[] = [];
  const truth = new Map<number, { x: number; y: number }>();
  const drawn: { tick: number; frac: number; x: number; y: number }[] = [];
  let n = 0;
  let held = NONE;
  let worstErr = 0;

  const frame = (buttons: Buttons = held, drop = false): void => {
    // ---- the client's sixtieth
    let newest: SnapshotMessage | null = null;
    while (down.length && down[0].at <= n) newest = down.shift()!.snap;
    if (newest) pred.onSnapshot(newest);
    // a snapshot arriving now left the server `lag` ticks ago (a quarter tick in, to stay off the edges)
    const simEdge = (g.tick - lag + 0.25) * TICK_MS;
    if (buttons.left !== held.left || buttons.right !== held.right || buttons.jump !== held.jump) {
      held = buttons;
      const stamp = pred.command(buttons, simEdge);
      up.push({ at: n + lag, go: () => g.setInput(a, buttons, stamp) });
    }
    if (drop) {
      const stamp = pred.command(null, simEdge);
      up.push({ at: n + lag, go: () => g.drop(a, stamp) });
    }
    const out = pred.advance(simEdge, n * TICK_MS);
    if (out) {
      const target = (simEdge + pred.leadMs) / TICK_MS;
      drawn.push({ tick: Math.floor(target), frac: target - Math.floor(target), x: out.x, y: out.y });
      worstErr = Math.max(worstErr, Math.hypot(out.errX, out.errY));
    }
    // ---- the server's
    while (up.length && up[0].at <= n) up.shift()!.go();
    g.step(TICK_MS);
    truth.set(g.tick, { x: P(g, a).x, y: P(g, a).y });
    if (g.tick % 2 === 0) {
      const snap = { type: 'snapshot', selfId: a, you: g.selfState(a), ...g.snapshot() } as SnapshotMessage;
      down.push({ at: n + lag, snap: JSON.parse(JSON.stringify(snap)) as SnapshotMessage });
    }
    n++;
  };

  /** The furthest the drawn fighter was from where the server really had it at that moment. */
  const worstMiss = (from = 0): number => {
    let worst = 0;
    for (const d of drawn.slice(from)) {
      const t0 = truth.get(d.tick - 1);
      const t1 = truth.get(d.tick);
      if (!t0 || !t1) continue;
      const x = t0.x + (t1.x - t0.x) * d.frac;
      const y = t0.y + (t1.y - t0.y) * d.frac;
      worst = Math.max(worst, Math.hypot(d.x - x, d.y - y));
    }
    return worst;
  };

  return { g, a, pred, frame, fxs, drawn, worstMiss, worstErr: () => worstErr };
}

/** Run about, jump, double jump, turn round: all on the middle of the big island. */
function dance(frame: (b: Buttons) => void, loops: number): void {
  const moves: [number, Partial<Buttons>][] = [
    [14, { right: true }],
    [9, { right: true, jump: true }],
    [6, { right: true }],
    [4, { jump: true }],
    [30, { left: true }],
    [11, { left: true, jump: true }],
    [22, {}],
    [12, { right: true }],
    [2, { jump: true }],
    [25, {}],
  ];
  for (let i = 0; i < loops; i++) for (const [frames, b] of moves) for (let f = 0; f < frames; f++) frame({ ...NONE, ...b });
}

describe('our own fighter, a slow line away', () => {
  for (const lag of [1, 8, 12]) {
    it(`is drawn exactly where the server will have it (${lag} ticks each way)`, () => {
      const l = line(lag);
      dance(l.frame, 6);
      expect(P(l.g, l.a).life).toBe('alive');
      expect(l.drawn.length).toBeGreaterThan(600);
      expect(l.worstMiss()).toBeLessThan(0.01);
      expect(l.pred.corrections).toBe(0);
      expect(l.worstErr()).toBeLessThan(0.01);
    });
  }

  it('rides a moving platform in step with the server', () => {
    const l = line(8, 'frost');
    // the glider (platform 3) slides from side to side
    const glider = l.g.w.plats[3];
    place(l.g, l.a, glider.x + glider.w / 2, glider.y - 10);
    for (let i = 0; i < 400; i++) l.frame(NONE);
    expect(P(l.g, l.a).platIdx).toBe(3);
    expect(l.worstMiss(60)).toBeLessThan(0.01);
  });

  it('plays the effects of its own jumps once, at once', () => {
    const l = line(8);
    for (let i = 0; i < 20; i++) l.frame(NONE);
    for (let i = 0; i < 4; i++) l.frame({ ...NONE, jump: true });
    for (let i = 0; i < 80; i++) l.frame(NONE);
    expect(l.fxs.filter((fx) => fx.k === 'jump').length).toBe(1);
    expect(l.fxs.every((fx) => 'id' in fx && fx.id === l.a)).toBe(true);
  });

  it('takes a hit it could not foresee as one correction, then is right again', () => {
    const l = line(8);
    dance(l.frame, 1);
    const p = P(l.g, l.a);
    p.vx = 260;
    p.vy = -420;
    p.grounded = false;
    p.platIdx = -1;
    p.launchUntil = l.g.w.t + 200;
    p.boostUntil = l.g.w.t + 400;
    const before = l.drawn.length;
    for (let i = 0; i < 12; i++) l.frame(NONE);
    expect(l.pred.corrections).toBeGreaterThan(0);
    expect(l.worstErr()).toBeGreaterThan(5); // the drawing eases across…
    const settled = l.drawn.length + 20;
    for (let i = 0; i < 60; i++) l.frame(NONE);
    expect(P(l.g, l.a).life).toBe('alive');
    expect(l.worstMiss(settled)).toBeLessThan(0.01); // …while the simulation is already right
    expect(before).toBeGreaterThan(0);
  });

  it('leads by more when the server says its commands came late', () => {
    const l = line(8);
    l.pred.leadMs = TICK_MS; // far too little for this line
    dance(l.frame, 2);
    expect(l.pred.leadMs).toBeGreaterThan(16 * TICK_MS);
    const settled = l.drawn.length;
    dance(l.frame, 2);
    expect(l.worstMiss(settled + 30)).toBeLessThan(0.01);
  });

  it('does not lead by more for one stall', () => {
    const l = line(8);
    dance(l.frame, 1);
    const lead = l.pred.leadMs;
    // one snapshot says a command came 20 ticks late; the next say all is well again
    const snap = (slack: number | null) => ({ tick: 1e6, players: [], you: { ack: 0, slack } }) as unknown as SnapshotMessage;
    l.pred.onSnapshot(snap(-20));
    l.pred.onSnapshot(snap(2));
    expect(l.pred.leadMs).toBe(lead);
    for (let i = 0; i < 3; i++) l.pred.onSnapshot(snap(-20));
    expect(l.pred.leadMs).toBeGreaterThan(lead);
  });

  it('predicts nothing in the lobby or while knocked out', () => {
    const l = line(8);
    dance(l.frame, 1);
    P(l.g, l.a).life = 'respawning';
    P(l.g, l.a).respawnAt = Infinity;
    for (let i = 0; i < 30; i++) l.frame(NONE);
    expect(l.pred.active).toBe(false);
  });
});

describe('stamped commands on the server', () => {
  it('a command waits for its tick, and a late one is done on the next', () => {
    const g = newGame();
    const [a, b] = startMatch(g, ['A', 'B']);
    park(g, b);
    place(g, a, 640, 300);
    run(g, 800);
    g.setInput(a, { left: false, right: true, jump: false }, { seq: 1, tick: g.tick + 5 });
    run(g, 4 * TICK_MS);
    expect(P(g, a).vx).toBe(0);
    expect(g.selfState(a)).toMatchObject({ ack: 0, slack: 4 });
    run(g, TICK_MS);
    expect(P(g, a).vx).toBeGreaterThan(0);
    expect(g.selfState(a)).toMatchObject({ ack: 1, slack: null });
    g.setInput(a, { left: false, right: false, jump: false }, { seq: 2, tick: g.tick - 3 });
    expect(g.selfState(a)!.slack).toBe(-4);
    run(g, TICK_MS);
    expect(g.selfState(a)!.ack).toBe(2);
  });

  it('a stamped shot fires on its tick, not when it arrives', () => {
    const g = newGame();
    const [a, b] = startMatch(g, ['A', 'B']);
    park(g, b);
    place(g, a, 640, 300);
    run(g, 800);
    g.shoot(a, { seq: 1, tick: g.tick + 4 });
    run(g, 3 * TICK_MS);
    expect(g.w.projectiles.length).toBe(0);
    run(g, TICK_MS);
    expect(g.w.projectiles.length).toBe(1);
  });

  it('will not hold a command for a far-off tick', () => {
    const g = newGame();
    const [a] = startMatch(g, ['A', 'B']);
    g.setInput(a, { left: true, right: false, jump: false }, { seq: 1, tick: g.tick + 100_000 });
    run(g, 400);
    expect(g.selfState(a)!.ack).toBe(1);
  });
});
