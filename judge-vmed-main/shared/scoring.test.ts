import { describe, expect, it } from 'vitest';
import type { Criterion } from './api';
import { ScoreError, competitionRanks, scoreEvaluation, weightedTotal } from './scoring';

const criteria: Criterion[] = [
  { id: 'a', name: 'Innovation', maxMarks: 10, weight: 30 },
  { id: 'b', name: 'Impact', maxMarks: 20, weight: 70 },
];

describe('weightedTotal', () => {
  it('computes the weighted percentage', () => {
    // 100 × (8/10 × 30 + 10/20 × 70) ÷ 100 = 24 + 35
    expect(
      weightedTotal([
        { marks: 8, maxMarks: 10, weight: 30 },
        { marks: 10, maxMarks: 20, weight: 70 },
      ]),
    ).toBe(59);
  });

  it('does not need weights to add up to 100', () => {
    expect(
      weightedTotal([
        { marks: 8, maxMarks: 10, weight: 3 },
        { marks: 10, maxMarks: 20, weight: 7 },
      ]),
    ).toBe(59);
  });

  it('rounds to 2 decimals and handles full and zero marks', () => {
    expect(weightedTotal([{ marks: 1, maxMarks: 3, weight: 1 }])).toBe(33.33);
    expect(weightedTotal([{ marks: 10, maxMarks: 10, weight: 1 }])).toBe(100);
    expect(weightedTotal([{ marks: 0, maxMarks: 10, weight: 1 }])).toBe(0);
  });
});

describe('scoreEvaluation', () => {
  it('returns a criteria snapshot and total', () => {
    expect(scoreEvaluation(criteria, { a: 8, b: 10 })).toEqual({
      entries: [
        { criterionId: 'a', name: 'Innovation', maxMarks: 10, weight: 30, marks: 8 },
        { criterionId: 'b', name: 'Impact', maxMarks: 20, weight: 70, marks: 10 },
      ],
      total: 59,
    });
  });

  it('accepts up to 2 decimal places', () => {
    expect(scoreEvaluation(criteria, { a: 7.25, b: 0.1 }).entries[0].marks).toBe(7.25);
    expect(() => scoreEvaluation(criteria, { a: 7.255, b: 1 })).toThrow('at most 2 decimal places');
  });

  it('rejects missing, out-of-range, wrong-type and unknown marks', () => {
    expect(() => scoreEvaluation(criteria, { a: 8 })).toThrow('Enter marks for Impact.');
    expect(() => scoreEvaluation(criteria, { a: '8', b: 1 })).toThrow('Enter marks for Innovation.');
    expect(() => scoreEvaluation(criteria, { a: 11, b: 1 })).toThrow('Innovation must be between 0 and 10.');
    expect(() => scoreEvaluation(criteria, { a: -1, b: 1 })).toThrow('between 0 and 10');
    expect(() => scoreEvaluation(criteria, { a: 1, b: 1, old: 5 })).toThrow('criteria for this round changed');
    expect(() => scoreEvaluation(criteria, null)).toThrow(ScoreError);
    expect(() => scoreEvaluation([], {})).toThrow('no criteria');
  });
});

describe('competitionRanks', () => {
  it('shares ranks on ties and skips the next rank', () => {
    expect(competitionRanks([90, 90, 80, 70, 70, 70, 50])).toEqual([1, 1, 3, 4, 4, 4, 7]);
  });

  it('leaves unscored teams unranked', () => {
    expect(competitionRanks([88.5, null, null])).toEqual([1, null, null]);
    expect(competitionRanks([])).toEqual([]);
  });
});
