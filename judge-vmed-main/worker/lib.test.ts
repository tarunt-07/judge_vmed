import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { clerkErrorMessage, isUniqueViolation, str } from './lib';

describe('str', () => {
  it('trims and returns valid text', () => {
    expect(str({ name: '  Team A  ' }, 'name', 'Name')).toBe('Team A');
  });

  it('rejects missing, non-string, and out-of-range values', () => {
    expect(() => str({}, 'name', 'Name')).toThrow(HTTPException);
    expect(() => str({ name: 5 }, 'name', 'Name')).toThrow('Name is required.');
    expect(() => str({ name: '   ' }, 'name', 'Name')).toThrow(HTTPException);
    expect(() => str({ name: 'abcdef' }, 'name', 'Name', 1, 5)).toThrow('between 1 and 5');
  });
});

describe('isUniqueViolation', () => {
  it('detects D1 unique constraint errors only', () => {
    expect(isUniqueViolation(new Error('D1_ERROR: UNIQUE constraint failed: accounts.username'))).toBe(true);
    expect(isUniqueViolation(new Error('CHECK constraint failed'))).toBe(false);
    expect(isUniqueViolation('UNIQUE constraint failed')).toBe(false);
  });
});

describe('clerkErrorMessage', () => {
  it('prefers Clerk long message, then message, then fallback', () => {
    expect(clerkErrorMessage({ errors: [{ longMessage: 'Username taken', message: 'taken' }] }, 'x')).toBe('Username taken');
    expect(clerkErrorMessage({ errors: [{ message: 'taken' }] }, 'x')).toBe('taken');
    expect(clerkErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
