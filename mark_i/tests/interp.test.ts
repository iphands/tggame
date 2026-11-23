import { describe, it, expect } from 'vitest';
import { SnapshotBuffer, INTERP_DELAY_MS, lerpPlayer } from '../client/src/interp.js';
import type { SnapshotMessage } from '../shared/src/protocol.js';
import type { PlayerState } from '../shared/src/types.js';

function player(x: number, y = 100, life: PlayerState['life'] = 'alive'): PlayerState {
  return {
    id: 'p1', name: 'A', color: '#fff', bot: false, x, y, vx: 0, vy: 0, face: 1, grounded: true, life,
    dmg: 0, stocks: 3, weapon: 'pistol', ammo: -1, invuln: false, shield: false, launched: false,
    punchAt: -1, shotAt: -1, airJumps: 1, wins: 0, kos: 0,
  };
}

function snap(t: number, x: number): SnapshotMessage {
  return {
    type: 'snapshot', selfId: 'p1', tick: t, simTimeMs: t, phase: 'playing', countdownMs: null, autoStartMs: null,
    timeLeftMs: 1000, winnerId: null, level: 0, nextLevel: 0, players: [player(x)], platforms: [],
    projectiles: [], crates: [], fx: [], feed: [], results: null,
  };
}

describe('snapshot interpolation', () => {
  it('renders INTERP_DELAY_MS behind the server clock and interpolates between bracketing snapshots', () => {
    const buf = new SnapshotBuffer();
    // server time t arrives at local time 1000 + t (constant latency)
    for (let t = 0; t <= 200; t += 33) buf.push(snap(t, t), 1000 + t);
    const local = 1000 + 198;
    expect(buf.renderTime(local)).toBeCloseTo(198 - INTERP_DELAY_MS);
    const br = buf.bracket(local)!;
    expect(br.a.simTimeMs).toBeLessThanOrEqual(buf.renderTime(local));
    expect(br.b.simTimeMs).toBeGreaterThanOrEqual(buf.renderTime(local));
    const p = lerpPlayer(br.a.players[0], br.b.players[0], br.alpha);
    expect(p.x).toBeCloseTo(198 - INTERP_DELAY_MS, 0);
  });

  it('ignores duplicates and resets on a server restart', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(5000, 1), 0);
    buf.push(snap(5000, 2), 1);
    expect(buf.latest!.players[0].x).toBe(1);
    buf.push(snap(10, 3), 2);
    expect(buf.latest!.simTimeMs).toBe(10);
  });

  it('jitter: late packets do not drag the clock backwards', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0), 1000);
    buf.push(snap(33, 0), 1033);
    const before = buf.renderTime(2000);
    buf.push(snap(66, 0), 1200); // arrived 100ms late
    expect(buf.renderTime(2000)).toBeLessThanOrEqual(before);
    expect(before - buf.renderTime(2000)).toBeLessThan(10);
  });

  it('does not smear teleports or interpolate dead players', () => {
    expect(lerpPlayer(player(0), player(600), 0.5).x).toBe(600);
    expect(lerpPlayer(player(0, 100, 'respawning'), player(10), 0.5).x).toBe(10);
    expect(lerpPlayer(player(0), player(10), 0.5).x).toBe(5);
  });
});
