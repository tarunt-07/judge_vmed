import type { Criterion, MarkEntry } from './api';

export class ScoreError extends Error {}

type Weighted = Pick<MarkEntry, 'marks' | 'maxMarks' | 'weight'>;

// 100 × Σ(marks ÷ max × weight) ÷ Σ weight, rounded to 2 decimals.
export function weightedTotal(entries: Weighted[]): number {
  const weightSum = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (weightSum <= 0) return 0;
  const score = entries.reduce((sum, entry) => sum + (entry.marks / entry.maxMarks) * entry.weight, 0);
  return Math.round(((100 * score) / weightSum) * 100) / 100;
}

export function scoreEvaluation(criteria: Criterion[], marks: unknown): { entries: MarkEntry[]; total: number } {
  if (criteria.length === 0) throw new ScoreError('This round has no criteria yet.');
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) {
    throw new ScoreError('Enter marks for every criterion.');
  }
  const input = marks as Record<string, unknown>;
  const known = new Set(criteria.map((criterion) => criterion.id));
  if (Object.keys(input).some((key) => !known.has(key))) {
    throw new ScoreError('The criteria for this round changed. Reload and try again.');
  }

  const entries = criteria.map((criterion) => {
    const value = input[criterion.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ScoreError(`Enter marks for ${criterion.name}.`);
    }
    if (value < 0 || value > criterion.maxMarks) {
      throw new ScoreError(`${criterion.name} must be between 0 and ${criterion.maxMarks}.`);
    }
    if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) {
      throw new ScoreError(`${criterion.name} can have at most 2 decimal places.`);
    }
    return {
      criterionId: criterion.id,
      name: criterion.name,
      maxMarks: criterion.maxMarks,
      weight: criterion.weight,
      marks: value,
    };
  });
  return { entries, total: weightedTotal(entries) };
}

// Standard competition ranking (1, 1, 3) for totals already sorted high to low, unscored last.
export function competitionRanks(totals: (number | null)[]): (number | null)[] {
  return totals.map((total, index) => {
    if (total === null) return null;
    let first = index;
    while (first > 0 && totals[first - 1] === total) first--;
    return first + 1;
  });
}
