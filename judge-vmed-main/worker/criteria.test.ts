import { describe, expect, it } from 'vitest';
import { MAX_CRITERIA, parseCriteria } from './criteria';

const valid = { name: 'Innovation', maxMarks: 10, weight: 30 };

describe('parseCriteria', () => {
  it('accepts valid criteria and trims names', () => {
    expect(
      parseCriteria([
        { name: '  Innovation ', maxMarks: 10, weight: 30 },
        { name: 'Impact', maxMarks: 20, weight: 2.5 },
      ]),
    ).toEqual([
      { name: 'Innovation', maxMarks: 10, weight: 30 },
      { name: 'Impact', maxMarks: 20, weight: 2.5 },
    ]);
  });

  it('requires 1 to MAX_CRITERIA items', () => {
    expect(() => parseCriteria([])).toThrow('at least one criterion');
    expect(() => parseCriteria('nope')).toThrow('at least one criterion');
    const tooMany = Array.from({ length: MAX_CRITERIA + 1 }, (_, i) => ({ ...valid, name: `C${i}` }));
    expect(() => parseCriteria(tooMany)).toThrow(`at most ${MAX_CRITERIA}`);
  });

  it('rejects missing and case-insensitive duplicate names', () => {
    expect(() => parseCriteria([{ ...valid, name: '  ' }])).toThrow('Criterion 1: name is required');
    expect(() => parseCriteria([valid, { ...valid, name: 'INNOVATION' }])).toThrow('Criterion 2: "INNOVATION" is repeated');
  });

  it('requires whole-number max marks from 1 to 1000', () => {
    for (const maxMarks of [0, -1, 1001, 7.5, '10', null]) {
      expect(() => parseCriteria([{ ...valid, maxMarks }])).toThrow('max marks must be a whole number');
    }
  });

  it('requires weightage above 0 and at most 1000', () => {
    for (const weight of [0, -5, 1000.1, Number.NaN, Number.POSITIVE_INFINITY, '30']) {
      expect(() => parseCriteria([{ ...valid, weight }])).toThrow('weightage must be more than 0');
    }
  });
});
