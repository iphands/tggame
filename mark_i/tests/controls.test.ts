import { describe, it, expect, beforeEach } from 'vitest';
import { mergeInput, setTouchInput, touchInput } from '../client/src/controls.js';

describe('input merge (keyboard OR touch)', () => {
  beforeEach(() => {
    touchInput.left = false;
    touchInput.right = false;
    touchInput.jump = false;
  });

  it('neither source wins when both are neutral', () => {
    const merged = mergeInput(
      { left: false, right: false, jump: false },
      { left: false, right: false, jump: false }
    );
    expect(merged).toEqual({ left: false, right: false, jump: false });
  });

  it('keyboard alone', () => {
    const merged = mergeInput({ left: true, right: false, jump: false }, { left: false, right: false, jump: false });
    expect(merged.left).toBe(true);
    expect(merged.right).toBe(false);
  });

  it('touch alone', () => {
    const merged = mergeInput({ left: false, right: false, jump: false }, { left: false, right: true, jump: true });
    expect(merged.right).toBe(true);
    expect(merged.jump).toBe(true);
    expect(merged.left).toBe(false);
  });

  it('keyboard and touch together (left + jump)', () => {
    const merged = mergeInput({ left: true, right: false, jump: false }, { left: false, right: false, jump: true });
    expect(merged).toEqual({ left: true, right: false, jump: true });
  });

  it('touchInput reflects setTouchInput', () => {
    setTouchInput('jump', true);
    expect(touchInput.jump).toBe(true);
    setTouchInput('jump', false);
    expect(touchInput.jump).toBe(false);
  });
});
