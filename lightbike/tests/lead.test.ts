import { describe, expect, it } from 'vitest';
import { leadFor, patienceFor } from '../client/src/lead';

describe('the lead our own bike rides ahead by', () => {
  it('is the old 45 ms next to the server', () => {
    expect(leadFor(0, 0)).toBe(0.045);
    expect(leadFor(2, 1)).toBe(0.045);
  });

  it('covers the round trip, a tick, and the wander of the line', () => {
    expect(leadFor(250, 0)).toBeCloseTo(0.28);
    expect(leadFor(250, 20)).toBeCloseTo(0.32);
  });

  it('gives up on a hopeless line rather than ride half a second ahead', () => {
    expect(leadFor(2000, 100)).toBe(0.45);
  });

  it('waits a round trip longer for the server to agree with a turn', () => {
    expect(patienceFor(0, 0)).toBe(350);
    expect(patienceFor(250, 20)).toBe(540);
  });
});
