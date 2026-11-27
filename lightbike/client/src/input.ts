/** Fingers and keys, turned into "face this way", "turn left/right", "boost" and "bust". */

export type Controls = {
  /** Face this way: 0 right, 1 down, 2 left, 3 up. */
  face(d: number): void;
  /** Turn left (-1) or right (+1) of the way the bike is heading. */
  veer(side: -1 | 1): void;
  boost(on: boolean): void;
  bust(): void;
};

/** A finger has to travel this far to count as a swipe and not a tap. */
const SWIPE_PX = 26;

const FACE: Record<string, number> = { ArrowRight: 0, KeyD: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowUp: 3, KeyW: 3 };
const VEER: Record<string, -1 | 1> = { KeyQ: -1, KeyE: 1, Comma: -1, Period: 1 };

/**
 * Touch: tap the left or right half of the floor to turn that way, or swipe to face a direction.
 * Keys: arrows or WASD face a direction, Q and E turn left and right, Shift boosts, Space busts.
 */
export function createInput(el: HTMLElement, c: Controls): { destroy(): void } {
  const fingers = new Map<number, { x: number; y: number; swiped: boolean }>();

  const down = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, swiped: false });
  };
  const move = (e: PointerEvent): void => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    if (Math.hypot(dx, dy) < SWIPE_PX) return;
    c.face(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3);
    // a finger kept down can swipe again from here
    Object.assign(f, { x: e.clientX, y: e.clientY, swiped: true });
  };
  const up = (e: PointerEvent): void => {
    const f = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (!f || f.swiped || e.type === 'pointercancel') return;
    const box = el.getBoundingClientRect();
    c.veer(e.clientX < box.left + box.width / 2 ? -1 : 1);
  };
  const key = (e: KeyboardEvent): void => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code in FACE) c.face(FACE[e.code]);
    else if (e.code in VEER) c.veer(VEER[e.code]);
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') c.boost(true);
    else if (e.code === 'Space') c.bust();
    else return;
    e.preventDefault();
  };
  const keyUp = (e: KeyboardEvent): void => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') c.boost(false);
  };
  const blur = (): void => c.boost(false);

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);

  return {
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    },
  };
}
