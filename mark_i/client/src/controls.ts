/**
 * Input sources. Touch buttons (DOM) write into `touchInput` / one-shot
 * flags; the arena scene merges them with the keyboard every frame.
 * Nothing here touches the DOM at import time (unit-tested in node).
 */
export type InputState = { left: boolean; right: boolean; jump: boolean };

export const touchInput: InputState = { left: false, right: false, jump: false };

/** Held "fire" from touch / mouse. */
export const fireHeld = { touch: false, mouse: false };

/** One-shot requests (consumed by the arena scene). */
export const requests = { drop: false };

export function setTouchInput(name: keyof InputState, value: boolean): void {
  touchInput[name] = value;
}

export function mergeInput(keyboard: InputState, touch: InputState): InputState {
  return {
    left: keyboard.left || touch.left,
    right: keyboard.right || touch.right,
    jump: keyboard.jump || touch.jump,
  };
}

export function resetTouch(): void {
  touchInput.left = touchInput.right = touchInput.jump = false;
  fireHeld.touch = fireHeld.mouse = false;
  requests.drop = false;
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse || (navigator?.maxTouchPoints ?? 0) > 0;
}

/** Wire the on-screen buttons. Call once. */
export function initTouchControls(onAnyPress: () => void): void {
  const held = (id: string, set: (v: boolean) => void) => {
    const el = document.getElementById(id);
    if (!el) return;
    const pointers = new Set<number>();
    const down = (e: PointerEvent) => {
      e.preventDefault();
      pointers.add(e.pointerId);
      el.setPointerCapture?.(e.pointerId);
      set(true);
      el.classList.add('pressed');
      onAnyPress();
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        set(false);
        el.classList.remove('pressed');
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  const tap = (id: string, fire: () => void) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fire();
      onAnyPress();
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 140);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  held('ctrl-left', (v) => setTouchInput('left', v));
  held('ctrl-right', (v) => setTouchInput('right', v));
  held('ctrl-jump', (v) => setTouchInput('jump', v));
  held('ctrl-fire', (v) => (fireHeld.touch = v));
  tap('ctrl-down', () => (requests.drop = true));
}

export function setTouchControlsVisible(visible: boolean): void {
  const el = document.getElementById('touch-controls');
  if (el) el.classList.toggle('hidden', !visible);
  if (!visible) resetTouch();
}
