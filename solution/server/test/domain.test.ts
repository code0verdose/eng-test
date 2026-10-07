import { describe, expect, it } from 'vitest';

import { pointsForTap, scoreForTaps } from '../src/domain/scoring.js';
import { roleForUsername } from '../src/domain/role.js';
import { roundStatus } from '../src/domain/round.js';

describe('scoring', () => {
  it('gives 1 point per tap and 10 for every eleventh', () => {
    expect([1, 2, 10, 11, 12, 22].map(pointsForTap)).toEqual([1, 1, 1, 10, 1, 10]);
  });

  it('totals the score of a number of taps', () => {
    expect(scoreForTaps(0)).toBe(0);
    expect(scoreForTaps(10)).toBe(10);
    expect(scoreForTaps(11)).toBe(20);
    expect(scoreForTaps(22)).toBe(40);
  });
});

describe('roleForUsername', () => {
  it('maps admin and Никита to their roles, everyone else survives', () => {
    expect(roleForUsername('admin')).toBe('admin');
    expect(roleForUsername('Никита')).toBe('nikita');
    expect(roleForUsername('Вася')).toBe('survivor');
  });
});

describe('roundStatus', () => {
  const round = { startAt: new Date('2026-01-01T00:00:30Z'), endAt: new Date('2026-01-01T00:01:30Z') };

  it('is cooldown before the start, active inside, finished from the end on', () => {
    expect(roundStatus(round, new Date('2026-01-01T00:00:00Z'))).toBe('cooldown');
    expect(roundStatus(round, new Date('2026-01-01T00:00:30Z'))).toBe('active');
    expect(roundStatus(round, new Date('2026-01-01T00:01:29Z'))).toBe('active');
    expect(roundStatus(round, new Date('2026-01-01T00:01:30Z'))).toBe('finished');
  });
});
