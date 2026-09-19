import type { CriterionInput } from '../shared/api';
import { fail } from './lib';

export const MAX_CRITERIA = 20;

export function parseCriteria(value: unknown): CriterionInput[] {
  if (!Array.isArray(value) || value.length === 0) fail(400, 'Add at least one criterion.');
  if (value.length > MAX_CRITERIA) fail(400, `A round can have at most ${MAX_CRITERIA} criteria.`);

  const seen = new Set<string>();
  return value.map((item, index) => {
    const n = index + 1;
    const raw = (item ?? {}) as Record<string, unknown>;

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 120) fail(400, `Criterion ${n}: name is required (up to 120 characters).`);
    const key = name.toLowerCase();
    if (seen.has(key)) fail(400, `Criterion ${n}: "${name}" is repeated.`);
    seen.add(key);

    const maxMarks = raw.maxMarks;
    if (typeof maxMarks !== 'number' || !Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 1000) {
      fail(400, `Criterion ${n}: max marks must be a whole number from 1 to 1000.`);
    }

    const weight = raw.weight;
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > 1000) {
      fail(400, `Criterion ${n}: weightage must be more than 0 and at most 1000.`);
    }

    return { name, maxMarks, weight };
  });
}
