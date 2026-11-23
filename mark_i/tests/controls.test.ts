import { describe, it, expect, beforeEach } from 'vitest';
import { mergeInput, setTouchInput, touchInput, resetTouch, requests, fireHeld } from '../client/src/controls.js';

describe('input merge (keyboard OR touch)', () => {
  beforeEach(() => resetTouch());

  it('neutral when both sources are neutral', () => {
    const none = { left: false, right: false, jump: false };
    expect(mergeInput(none, none)).toEqual(none);
  });

  it('either source can drive each button', () => {
    expect(mergeInput({ left: true, right: false, jump: false }, { left: false, right: false, jump: true })).toEqual({
      left: true,
      right: false,
      jump: true,
    });
    expect(mergeInput({ left: false, right: false, jump: false }, { left: false, right: true, jump: false }).right).toBe(true);
  });

  it('setTouchInput writes the shared touch state', () => {
    setTouchInput('jump', true);
    expect(touchInput.jump).toBe(true);
  });

  it('resetTouch clears held buttons and one-shot requests', () => {
    setTouchInput('left', true);
    requests.punch = true;
    fireHeld.touch = true;
    resetTouch();
    expect(touchInput.left).toBe(false);
    expect(requests.punch).toBe(false);
    expect(fireHeld.touch).toBe(false);
  });
});
