/**
 * Steering. A mouse points at where the hole should go; a finger drags it from anywhere on the
 * screen (so the finger never has to cover the hole); arrow keys and WASD push it along.
 */
import { AIM_LEASH } from '../../shared/src/constants';

/** How far the aim point moves per unit of finger travel. */
const TOUCH_GAIN = 1.6;

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0],
  ArrowUp: [0, -1], w: [0, -1],
  ArrowDown: [0, 1], s: [0, 1],
};

export type View = { x: number; y: number; scale: number; cw: number; ch: number };
type Point = { x: number; y: number };

export function createInput(el: HTMLElement) {
  /** Last mouse position, in pixels from the element's corner. */
  let mouse: Point | null = null;
  /** The finger steering right now, and where it was last. */
  let finger: { id: number; x: number; y: number } | null = null;
  /** Finger travel not yet turned into aim. */
  let dragX = 0;
  let dragY = 0;
  const held = new Set<string>();
  const aim: Point = { x: 0, y: 0 };
  let started = false;

  const local = (e: PointerEvent): Point => {
    const box = el.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  function down(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (finger) return;
    finger = { id: e.pointerId, ...local(e) };
    mouse = null;
    el.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      mouse = local(e);
      return;
    }
    if (!finger || e.pointerId !== finger.id) return;
    const p = local(e);
    dragX += p.x - finger.x;
    dragY += p.y - finger.y;
    finger.x = p.x;
    finger.y = p.y;
  }
  function up(e: PointerEvent): void {
    if (finger && e.pointerId === finger.id) finger = null;
  }
  function key(e: KeyboardEvent): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!(k in KEYS) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.type === 'keydown') held.add(k);
    else held.delete(k);
    e.preventDefault();
  }
  const blur = (): void => held.clear();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);
  window.addEventListener('blur', blur);

  return {
    /** Where the hole at `pos` should head, given what the player is doing. Call once a frame. */
    aim(pos: Point, view: View): Point {
      if (!started) {
        started = true;
        aim.x = pos.x;
        aim.y = pos.y;
      }
      if (held.size) {
        let kx = 0;
        let ky = 0;
        for (const k of held) {
          kx += KEYS[k][0];
          ky += KEYS[k][1];
        }
        const len = Math.hypot(kx, ky) || 1;
        aim.x = pos.x + (kx / len) * AIM_LEASH;
        aim.y = pos.y + (ky / len) * AIM_LEASH;
        mouse = null;
      } else if (mouse) {
        aim.x = view.x + (mouse.x - view.cw / 2) / view.scale;
        aim.y = view.y + (mouse.y - view.ch / 2) / view.scale;
      } else {
        aim.x += (dragX / view.scale) * TOUCH_GAIN;
        aim.y += (dragY / view.scale) * TOUCH_GAIN;
      }
      dragX = dragY = 0;
      // never let the aim run far ahead: the hole answers the next change of mind at once
      const dx = aim.x - pos.x;
      const dy = aim.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d > AIM_LEASH) {
        aim.x = pos.x + (dx / d) * AIM_LEASH;
        aim.y = pos.y + (dy / d) * AIM_LEASH;
      }
      return aim;
    },
    /** Start again from the hole (after it was moved for us). */
    reset(): void {
      started = false;
    },
    destroy(): void {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      window.removeEventListener('blur', blur);
    },
  };
}
