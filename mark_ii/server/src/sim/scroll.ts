/** The scrolling screen: creeps forward, chases the leader, waits at gates. */
import { ARENA, BOX, RUN } from '../../../shared/src/constants.js';
import { activeGate, centerX, isRacing, type World } from './model.js';

/** Racers still in the round (running or waiting to respawn). */
export function racerCount(w: World): number {
  let n = 0;
  for (const p of w.players.values()) if (isRacing(p)) n++;
  return n;
}

/** Give the gate at `w.gateIdx` its health bar. */
export function armGate(w: World): void {
  const gate = activeGate(w);
  w.gateMax = gate ? BOX.gateHpPerPlayer * Math.max(1, racerCount(w)) : 0;
  w.gateHp = w.gateMax;
}

/** Furthest the screen may scroll right now. */
export function scrollLimit(w: World): number {
  let limit = Math.max(0, w.level.length - ARENA.width);
  const gate = activeGate(w);
  if (gate) limit = Math.min(limit, Math.max(0, gate.x - RUN.gateHoldFrac * ARENA.width));
  return limit;
}

/** Advance the screen by one tick. It never moves backwards. */
export function updateScroll(w: World, dtMs: number): void {
  const s = dtMs / 1000;
  const limit = scrollLimit(w);
  const gate = activeGate(w);

  // a gate that has lost racers gets proportionally weaker
  if (gate) {
    const want = BOX.gateHpPerPlayer * Math.max(1, racerCount(w));
    if (want < w.gateMax) {
      w.gateHp *= want / w.gateMax;
      w.gateMax = want;
    }
  }

  if (w.scrollX >= limit) {
    // held at a gate: it slowly crumbles so an idle pack is never stuck for good
    if (gate && limit < w.level.length - ARENA.width) {
      w.gateHp -= (w.gateMax * dtMs) / BOX.gateDecayMs;
      if (w.gateHp <= 0) breakGate(w);
    }
    return;
  }

  let leader = -Infinity;
  for (const p of w.players.values()) if (p.life === 'alive') leader = Math.max(leader, centerX(p));
  const base = w.t - w.roundStartT < RUN.scrollDelayMs ? 0 : RUN.scrollBase * s;
  const want = leader - RUN.leadFrac * ARENA.width - w.scrollX;
  const step = Math.min(Math.max(want, base), RUN.catchup * s);
  w.scrollX = Math.min(limit, w.scrollX + Math.max(0, step));
}

/** Knock down the standing gate and arm the next one. */
export function breakGate(w: World): void {
  const gate = activeGate(w);
  if (!gate) return;
  w.fx.push({ k: 'gatebreak', x: gate.x, w: gate.w });
  w.gateIdx++;
  armGate(w);
}
