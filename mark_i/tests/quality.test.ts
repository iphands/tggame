import { describe, it, expect } from 'vitest';
import { QualityManager, FLAGS, nextSetting } from '../client/src/quality.js';

describe('graphics quality', () => {
  it('auto starts high on desktop and medium on touch', () => {
    expect(new QualityManager('auto', false).tier).toBe('high');
    expect(new QualityManager('auto', true).tier).toBe('medium');
    expect(new QualityManager('low', false).tier).toBe('low');
  });

  it('steps down one tier after ~3s of low FPS, then waits before stepping again', () => {
    const q = new QualityManager('auto', false);
    let changed = false;
    for (let t = 0; t <= 3000; t += 100) changed = q.sample(30, t) || changed;
    expect(changed).toBe(true);
    expect(q.tier).toBe('medium');
    // still slow, but inside the cooldown window
    for (let t = 3100; t <= 9000; t += 100) q.sample(30, t);
    expect(q.tier).toBe('medium');
    for (let t = 9100; t <= 16000; t += 100) q.sample(30, t);
    expect(q.tier).toBe('low');
  });

  it('a brief dip does not downgrade', () => {
    const q = new QualityManager('auto', false);
    for (let t = 0; t <= 6000; t += 100) q.sample(t > 2000 && t < 2600 ? 20 : 60, t);
    expect(q.tier).toBe('high');
  });

  it('manual settings are never changed by the monitor', () => {
    const q = new QualityManager('high', false);
    for (let t = 0; t <= 20000; t += 100) q.sample(10, t);
    expect(q.tier).toBe('high');
  });

  it('low tier disables every expensive effect', () => {
    const f = FLAGS.low;
    expect(f.bloom || f.vignette || f.shadows || f.afterimages || f.ribbons).toBe(false);
    expect(nextSetting('low')).toBe('auto');
  });
});
