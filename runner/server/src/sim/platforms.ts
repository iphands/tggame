/** Platform runtime: motion and crumbling. */
import { PHYS } from '../../../shared/src/constants.js';
import { platformPos, type LevelDef } from '../../../shared/src/levels.js';
import type { Plat, World } from './model.js';

/** Level platforms (same order as level.platforms) followed by one solid plat per box. */
export function buildPlats(level: LevelDef, t: number): Plat[] {
  const plats: Plat[] = level.platforms.map((def) => {
    const pos = platformPos(def, t);
    return {
      def,
      kind: def.kind ?? 'normal',
      x: pos.x,
      y: pos.y,
      prevX: pos.x,
      prevY: pos.y,
      w: def.w,
      h: def.h,
      state: 'solid',
      timer: 0,
    };
  });
  level.boxes.forEach((b, idx) => {
    const hp = b.hp ?? Infinity;
    plats.push({
      def: { x: b.x, y: b.y, w: b.w, h: b.h },
      kind: 'normal',
      x: b.x,
      y: b.y,
      prevX: b.x,
      prevY: b.y,
      w: b.w,
      h: b.h,
      state: 'solid',
      timer: 0,
      box: { idx, hp, max: hp, arms: b.arms === true },
    });
  });
  return plats;
}

/** Indices of the box plats. */
export function solidIndices(plats: Plat[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < plats.length; i++) if (plats[i].box) out.push(i);
  return out;
}

/** Advance platform motion and crumble timers by one tick. */
export function updatePlats(w: World, dtMs: number): void {
  for (let i = 0; i < w.plats.length; i++) {
    const pl = w.plats[i];
    if (pl.box) continue; // boxes never move
    pl.prevX = pl.x;
    pl.prevY = pl.y;
    const pos = platformPos(pl.def, w.t);
    pl.x = pos.x;
    pl.y = pos.y;

    if (pl.kind !== 'crumble') continue;
    if (pl.state === 'shaking') {
      pl.timer += dtMs;
      if (pl.timer >= PHYS.crumbleMs) {
        pl.state = 'gone';
        pl.timer = 0;
        w.fx.push({ k: 'crumble', x: pl.x, y: pl.y, w: pl.w });
        // anyone standing here starts falling
        for (const p of w.players.values()) {
          if (p.platIdx === i) {
            p.grounded = false;
            p.platIdx = -1;
          }
        }
        for (const c of w.crates) if (c.platIdx === i) c.platIdx = -1;
      }
    } else if (pl.state === 'gone') {
      pl.timer += dtMs;
      if (pl.timer >= PHYS.crumbleRespawnMs) {
        pl.state = 'solid';
        pl.timer = 0;
      }
    }
  }
}

/** Platforms that can currently be stood on. */
export function isSolid(pl: Plat): boolean {
  return pl.state !== 'gone';
}

/**
 * Index of the platform a falling box lands on this tick, or -1.
 * `prevBottom` is the box bottom before the move, `newBottom` after.
 */
export function findLanding(
  plats: Plat[],
  left: number,
  width: number,
  prevBottom: number,
  newBottom: number,
  skipIdx = -1
): number {
  let best = -1;
  let bestY = Infinity;
  for (let i = 0; i < plats.length; i++) {
    if (i === skipIdx) continue;
    const pl = plats[i];
    if (!isSolid(pl)) continue;
    const overlapX = left + width > pl.x && left < pl.x + pl.w;
    if (!overlapX) continue;
    // must have been above the (previous) top surface and now be at/below it
    if (prevBottom <= Math.max(pl.prevY, pl.y) + 8 && newBottom >= pl.y && pl.y < bestY) {
      best = i;
      bestY = pl.y;
    }
  }
  return best;
}
