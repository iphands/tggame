/** Damage to boxes and gates. */
import { BOX, RUN } from '../../../shared/src/constants.js';
import { armEveryone } from './items.js';
import { isSolid } from '../../../shared/src/sim/platforms.js';
import { breakGate, scrollLimit } from '../../../shared/src/sim/scroll.js';
import { activeGate, type Plat, type Player, type World } from '../../../shared/src/sim/model.js';

export type ShotKind = keyof typeof BOX.dmg;

/** Can this box be shot apart (and is it still there)? */
export function isBreakable(pl: Plat): boolean {
  return !!pl.box && isSolid(pl) && Number.isFinite(pl.box.hp);
}

/** Hurt the box at plat index `i`. Returns true if it broke. */
export function damageBox(w: World, i: number, dmg: number, by: Player | null): boolean {
  const pl = w.plats[i];
  if (!pl.box || !isSolid(pl)) return false;
  if (!Number.isFinite(pl.box.hp)) return false; // permanent block
  const dealt = Math.min(dmg, pl.box.hp);
  pl.box.hp -= dealt;
  if (by) by.smash += dealt;
  if (pl.box.hp > 0) return false;
  breakBox(w, i);
  return true;
}

/** Remove a box; anything breakable resting on it comes down too. */
function breakBox(w: World, i: number): void {
  const pl = w.plats[i];
  pl.box!.hp = 0;
  pl.state = 'gone';
  w.fx.push({ k: 'boxbreak', x: pl.x, y: pl.y, w: pl.w, h: pl.h });
  if (pl.box!.arms) armEveryone(w, pl.x + pl.w / 2, pl.y + pl.h / 2);
  for (const p of w.players.values()) {
    if (p.platIdx === i) {
      p.grounded = false;
      p.platIdx = -1;
    }
  }
  for (const c of w.crates) if (c.platIdx === i) c.platIdx = -1;
  for (const j of w.solids) {
    const up = w.plats[j];
    if (!isBreakable(up)) continue;
    const resting = Math.abs(up.y + up.h - pl.y) < 1 && up.x < pl.x + pl.w && up.x + up.w > pl.x;
    if (resting) breakBox(w, j);
  }
}

/** Hurt the standing gate. Returns true if it fell. */
export function damageGate(w: World, dmg: number, by: Player | null): boolean {
  if (!activeGate(w)) return false;
  const dealt = Math.min(dmg, w.gateHp);
  w.gateHp -= dealt;
  if (by) {
    by.smash += dealt;
    // working on the gate while the screen waits at it patches the shooter up
    if (w.scrollX >= scrollLimit(w)) by.dmg = Math.max(0, by.dmg - RUN.gateHeal);
  }
  if (w.gateHp > 0) return false;
  breakGate(w);
  return true;
}
