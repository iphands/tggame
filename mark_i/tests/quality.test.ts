import { describe, it, expect } from 'vitest';
import { QualityManager, FLAGS, nextSetting } from '../client/src/quality.js';

describe('graphics quality', () => {
  it('auto starts at medium everywhere; manual settings are used as-is', () => {
    expect(new QualityManager('auto').tier).toBe('medium');
    expect(new QualityManager('high').tier).toBe('high');
    expect(new QualityManager('low').tier).toBe('low');
  });

  it('steps down to low after ~3s of low FPS, and never below low', () => {
    const q = new QualityManager('auto');
    let changed = false;
    for (let t = 0; t <= 3000; t += 100) changed = q.sample(30, t) || changed;
    expect(changed).toBe(true);
    expect(q.tier).toBe('low');
    for (let t = 3100; t <= 30000; t += 100) expect(q.sample(10, t)).toBe(false);
    expect(q.tier).toBe('low');
  });

  it('waits out the cooldown before stepping again (from a manual high → auto restart)', () => {
    const q = new QualityManager('auto');
    q.tier = 'high';
    for (let t = 0; t <= 3000; t += 100) q.sample(30, t);
    expect(q.tier).toBe('medium');
    for (let t = 3100; t <= 9000; t += 100) q.sample(30, t);
    expect(q.tier).toBe('medium');
    for (let t = 9100; t <= 16000; t += 100) q.sample(30, t);
    expect(q.tier).toBe('low');
  });

  it('a brief dip does not downgrade', () => {
    const q = new QualityManager('auto');
    for (let t = 0; t <= 6000; t += 100) q.sample(t > 2000 && t < 2600 ? 20 : 60, t);
    expect(q.tier).toBe('medium');
  });

  it('manual settings are never changed by the monitor', () => {
    const q = new QualityManager('high');
    for (let t = 0; t <= 20000; t += 100) q.sample(10, t);
    expect(q.tier).toBe('high');
  });

  it('low tier disables every expensive effect', () => {
    const f = FLAGS.low;
    expect(f.vignette || f.shadows || f.afterimages || f.ribbons).toBe(false);
    expect(nextSetting('low')).toBe('auto');
  });
});
