import { describe, expect, it } from 'vitest';
import { botPass } from '../server/src/bots';
import { fourOfAKind, fullDeck, isCard, rankPlural } from '../shared/src/cards';
import { HECKLES, pickFumble, pickHeckle } from '../shared/src/heckles';
import { seeded } from './helpers';

describe('cards', () => {
  it('builds 52 distinct cards', () => {
    const d = fullDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
    expect(d.every(isCard)).toBe(true);
  });
  it('rejects things that are not cards', () => {
    for (const v of ['', 'Q', 'QHH', '1H', 'QX', 7, null, undefined]) expect(isCard(v)).toBe(false);
  });
  it('finds four of a kind among four or five cards', () => {
    expect(fourOfAKind(['QS', 'QH', 'QD', 'QC'])).toEqual(['QS', 'QH', 'QD', 'QC']);
    expect(fourOfAKind(['QS', '2H', 'QH', 'QD', 'QC'])).toEqual(['QS', 'QH', 'QD', 'QC']);
    expect(fourOfAKind(['QS', 'QH', 'QD', 'KC'])).toBeNull();
    expect(fourOfAKind(['QS', 'QH', 'QD', 'KC', 'KS'])).toBeNull();
  });
  it('names ranks', () => {
    expect(rankPlural('Q')).toBe('queens');
    expect(rankPlural('7')).toBe('sevens');
    expect(rankPlural('T')).toBe('tens');
    expect(rankPlural('6')).toBe('sixes');
  });
});

describe('bot passing', () => {
  it('passes the odd card out and keeps the set', () => {
    expect(botPass(['QS', 'QH', 'QD', '3C', 'QC'], seeded())).toBe('3C');
    expect(botPass(['QS', 'QH', '7D', '7C', '2C'], seeded())).toBe('2C');
  });
});

describe('heckles', () => {
  it('has lines for every level, the user-requested ones among them', () => {
    expect(HECKLES).toHaveLength(3);
    const all = HECKLES.flat();
    expect(all).toContain('Jeez you are dragging anchor!');
    expect(all).toContain('Hurry up {name}, HURRY UP');
    expect(all).toContain("What's taking you so long?!");
    expect(all).toContain('Hurr up slow poke');
  });
  it('fills in the name and clamps the level', () => {
    const rng = seeded(3);
    for (let i = 0; i < 60; i++) {
      for (const level of [-1, 1, 2, 3, 99]) expect(pickHeckle(level, 'EasyE', rng)).not.toContain('{name}');
    }
    expect(pickFumble('EasyE', rng)).toContain('EasyE');
  });
  it('never repeats the line it was told to avoid', () => {
    const rng = seeded(5);
    let last = '';
    for (let i = 0; i < 200; i++) {
      const next = pickHeckle(1, 'Sam', rng, last);
      expect(next).not.toBe(last);
      last = next;
    }
  });
});
