/** Keys, a thumb stick and two buttons, read as one set of controls. */
import { h } from '@tggame/base/client/dom';
import { unit } from '../../shared/src/sim';

export type Controls = { x: number; y: number; boost: boolean; act: boolean };

/** How far the thumb travels for a full push, in CSS pixels. */
const STICK_R = 46;
/** A stick this close to rest counts as let go. */
const DEAD = 0.18;

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const BOOST = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const ACT = new Set(['KeyE', 'Enter', 'KeyJ', 'KeyF']);

export function createInput(el: HTMLElement, boostPad: HTMLElement, actPad: HTMLElement) {
  const keys = new Set<string>();
  const knob = h('i');
  const base = h('div', { class: 'stick', hidden: true }, knob);
  el.append(base);
  let stickId = -1;
  let ox = 0;
  let oy = 0;
  let sx = 0;
  let sy = 0;
  let padBoost = false;
  let padAct = false;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.target instanceof HTMLInputElement) return;
    if (MOVE[ev.code] || BOOST.has(ev.code) || ACT.has(ev.code)) {
      ev.preventDefault();
      keys.add(ev.code);
    }
  };
  const onKeyUp = (ev: KeyboardEvent): void => void keys.delete(ev.code);
  const letGo = (): void => {
    keys.clear();
    stickId = -1;
    sx = sy = 0;
    padBoost = padAct = false;
    base.hidden = true;
  };

  const onDown = (ev: PointerEvent): void => {
    if (stickId !== -1 || ev.pointerType === 'mouse') return;
    stickId = ev.pointerId;
    const box = el.getBoundingClientRect();
    ox = ev.clientX - box.left;
    oy = ev.clientY - box.top;
    sx = sy = 0;
    base.hidden = false;
    base.style.left = `${ox}px`;
    base.style.top = `${oy}px`;
    knob.style.translate = '0 0';
    el.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== stickId) return;
    const box = el.getBoundingClientRect();
    const u = unit((ev.clientX - box.left - ox) / STICK_R, (ev.clientY - box.top - oy) / STICK_R);
    sx = u.x;
    sy = u.y;
    knob.style.translate = `${sx * STICK_R}px ${sy * STICK_R}px`;
  };
  const onUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== stickId) return;
    stickId = -1;
    sx = sy = 0;
    base.hidden = true;
  };

  /** A pad is held while a finger (or the mouse button) is down on it; the press never starts the stick. */
  function pad(target: HTMLElement, set: (on: boolean) => void): void {
    target.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      target.setPointerCapture?.(ev.pointerId);
      set(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(type, () => set(false));
  }
  pad(boostPad, (on) => (padBoost = on));
  pad(actPad, (on) => (padAct = on));

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', letGo);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  return {
    read(): Controls {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const m = MOVE[code];
        if (m) {
          x += m[0];
          y += m[1];
        }
      }
      if (x === 0 && y === 0 && Math.hypot(sx, sy) > DEAD) {
        x = sx;
        y = sy;
      }
      const u = unit(x, y);
      let boost = padBoost;
      let act = padAct;
      for (const code of keys) {
        if (BOOST.has(code)) boost = true;
        if (ACT.has(code)) act = true;
      }
      // two decimals is plenty for a direction, and keeps the message short
      return { x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100, boost, act };
    },
    reset: letGo,
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', letGo);
    },
  };
}
