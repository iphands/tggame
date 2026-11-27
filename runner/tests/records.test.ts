import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../server/src/sim/game.js';
import { loadRecords, saveRecords } from '../server/src/records.js';
import { LEVELS } from '../shared/src/levels.js';
import { MATCH, TICK_MS } from '../shared/src/constants.js';
import type { Records } from '../shared/src/types.js';

/** Bots race one round of `courseId`; returns the game once the results are in. */
function race(courseId: string, opts: { records?: Records; onRecord?: (r: Records) => void; seed?: number } = {}): Game {
  const g = new Game({ seed: opts.seed ?? 1, records: opts.records, onRecord: opts.onRecord, now: () => 1234 });
  g.nextLevelIndex = LEVELS.findIndex((l) => l.id === courseId);
  const host = g.join('Host')!.id;
  for (let i = 0; i < 4; i++) g.addBot();
  g.restart();
  g.players.get(host)!.lives = 0; // the idle host just watches
  for (let i = 0; g.phase !== 'ended' && i < (MATCH.durationMs + 20_000) / TICK_MS; i++) g.step(TICK_MS);
  expect(g.phase).toBe('ended');
  return g;
}

describe('course records', () => {
  it('the first finisher on a course sets its record', () => {
    const told: Records[] = [];
    const g = race('sky', { onRecord: (r) => told.push(r) });
    const winner = g.results!.find((r) => r.timeMs !== null)!;
    expect(winner, 'a bot should finish Sky Sprint').toBeDefined();
    expect(g.records.sky).toEqual({ name: winner.name, color: winner.color, bot: true, timeMs: winner.timeMs, at: 1234 });
    expect(told).toHaveLength(1);
    expect(Object.keys(g.records)).toEqual(['sky']);
  });

  it('is the winning time, which no other finisher beat', () => {
    const g = race('sky');
    const times = g.results!.filter((r) => r.timeMs !== null).map((r) => r.timeMs!);
    expect(g.records.sky.timeMs).toBe(Math.min(...times));
  });

  it('stands until somebody is faster', () => {
    const records: Records = { sky: { name: 'Legend', color: '#fff', bot: false, timeMs: 1, at: 1 } };
    let calls = 0;
    race('sky', { records, onRecord: () => calls++ });
    expect(records.sky.name).toBe('Legend');
    expect(calls).toBe(0);
  });

  it('falls to a faster run', () => {
    const records: Records = { sky: { name: 'Snail', color: '#fff', bot: false, timeMs: 10 * 60_000, at: 1 } };
    let calls = 0;
    const g = race('sky', { records, onRecord: () => calls++ });
    expect(records.sky.name).toBe(g.results![0].name);
    expect(records.sky.timeMs).toBeLessThan(10 * 60_000);
    expect(calls).toBe(1);
  });

  it('is kept per course', () => {
    const records: Records = { frost: { name: 'Legend', color: '#fff', bot: false, timeMs: 1, at: 1 } };
    race('sky', { records });
    expect(records.frost.name).toBe('Legend');
    expect(records.sky).toBeDefined();
  });

  it('is not set by a round nobody finished', () => {
    const g = new Game({ seed: 1 });
    g.join('Host');
    g.restart();
    // the lone idle runner is swept off by the scrolling screen
    for (let i = 0; g.phase !== 'ended' && i < (MATCH.durationMs + 20_000) / TICK_MS; i++) g.step(TICK_MS);
    expect(g.results!.every((r) => r.timeMs === null)).toBe(true);
    expect(g.records).toEqual({});
  });
});

describe('the records file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'records-'));
  const file = path.join(dir, 'records.json');

  it('starts empty when there is no file', () => {
    expect(loadRecords(file)).toEqual({});
  });

  it('gives back what was saved', () => {
    const records: Records = { sky: { name: 'Mo', color: '#ff0', bot: false, timeMs: 41_230, at: 99 } };
    saveRecords(file, records);
    expect(loadRecords(file)).toEqual(records);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('drops entries that are not records, and survives a damaged file', () => {
    fs.writeFileSync(file, JSON.stringify({ sky: { name: 'Mo', color: '#ff0', bot: false, timeMs: 5000, at: 1 }, frost: { name: 'X' }, neon: 7, forge: { name: 'Y', color: '#000', bot: false, timeMs: -1, at: 1 } }));
    expect(Object.keys(loadRecords(file))).toEqual(['sky']);
    fs.writeFileSync(file, '{ not json');
    expect(loadRecords(file)).toEqual({});
  });

  it('does not stop the game when it cannot be written', () => {
    expect(() => saveRecords(path.join(dir, 'missing', 'deep', 'records.json'), {})).not.toThrow();
  });
});
