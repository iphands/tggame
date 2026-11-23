/**
 * Touch input state + detection.
 * DOM buttons (wired in initTouchControls) set `touchInput`; the arena scene
 * merges it with keyboard every frame and forwards the result to the server.
 */
export type InputState = { left: boolean; right: boolean; jump: boolean };

export const touchInput: InputState = { left: false, right: false, jump: false };

export function setTouchInput(name: 'left' | 'right' | 'jump', value: boolean): void {
  touchInput[name] = value;
}

export function mergeInput(keyboard: InputState, touch: InputState): InputState {
  return {
    left: keyboard.left || touch.left,
    right: keyboard.right || touch.right,
    jump: keyboard.jump || touch.jump,
  };
}

/** Held fire state (mouse / F key / FIRE button). ArenaScene samples it. */
export const fireInput = { held: false };

export function setFireHeld(value: boolean): void {
  fireInput.held = value;
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touchPoints = (navigator?.maxTouchPoints ?? 0) > 0;
  return coarse || touchPoints;
}

/** Wire the DOM touch buttons to touchInput. Safe to call multiple times. */
export function initTouchControls(): void {
  const bind = (id: string, name: 'left' | 'right' | 'jump') => {
    const el = document.getElementById(id);
    if (!el) return;
    let pressed = 0;
    const down = (e: Event) => {
      e.preventDefault();
      pressed++;
      setTouchInput(name, true);
      el.classList.add('pressed');
    };
    const up = (e: Event) => {
      e.preventDefault();
      pressed = Math.max(0, pressed - 1);
      if (pressed === 0) {
        setTouchInput(name, false);
        el.classList.remove('pressed');
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  bind('ctrl-left', 'left');
  bind('ctrl-right', 'right');
  bind('ctrl-jump', 'jump');

  // FIRE: held-state button (one shot per press feels faster)
  const fire = document.getElementById('ctrl-fire');
  if (fire) {
    const down = (e: Event) => {
      e.preventDefault();
      setFireHeld(true);
      fire.classList.add('pressed');
    };
    const up = (e: Event) => {
      e.preventDefault();
      setFireHeld(false);
      fire.classList.remove('pressed');
    };
    fire.addEventListener('pointerdown', down);
    fire.addEventListener('pointerup', up);
    fire.addEventListener('pointercancel', up);
    fire.addEventListener('pointerleave', up);
    fire.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

/** Show or hide the on-screen control bar. */
export function setTouchControlsVisible(visible: boolean): void {
  const el = document.getElementById('touch-controls');
  if (el) el.style.display = visible ? 'block' : 'none';
}
