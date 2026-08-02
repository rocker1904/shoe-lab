import { describe, expect, it } from 'vitest';
import { CoercionError, coerceValue, isEmptyValue, METRIC_TYPES } from '../src/coerce.js';

describe('coerceValue', () => {
  it.each([
    ['float', '32.7', 32.7], ['float', 241, 241], ['score', '4', 4],
    ['percent', '70.6', 70.6], ['rating', '3.26', 3.26],
  ] as const)('%s coerces %j to number', (type, raw, want) => {
    expect(coerceValue(raw, type)).toBe(want);
  });
  it.each([['bool', '1', true], ['bool', 1, true], ['bool', true, true],
           ['bool', '0', false], ['bool', 0, false], ['bool', false, false]] as const)(
    'bool coerces %j', (type, raw, want) => expect(coerceValue(raw, type)).toBe(want));
  it('option/text coerce to string', () => {
    expect(coerceValue('both-sides-semi', 'option')).toBe('both-sides-semi');
    expect(coerceValue(270, 'text')).toBe('270');
  });
  it('rejects the shapes a bare String() cast would forge a reading out of', () => {
    for (const type of ['option', 'text'] as const) {
      expect(() => coerceValue({ text: 'Both sides', slug: 'both-sides' }, type)).toThrow(CoercionError);
      expect(() => coerceValue([{ text: 'Both sides' }], type)).toThrow(CoercionError);
      expect(() => coerceValue([1, 2], type)).toThrow(CoercionError);
      expect(() => coerceValue(true, type)).toThrow(CoercionError);
      expect(() => coerceValue(Number.NaN, type)).toThrow(CoercionError);
    }
  });
  it('rejects a number for an option, whose readings are vocabulary slugs', () => {
    expect(() => coerceValue(12.5, 'option')).toThrow(CoercionError);
    expect(coerceValue(12.5, 'text')).toBe('12.5');
  });
  it('throws on non-numeric floats and junk bools', () => {
    expect(() => coerceValue('abc', 'float')).toThrow(CoercionError);
    expect(() => coerceValue('maybe', 'bool')).toThrow(CoercionError);
    expect(() => coerceValue('', 'score')).toThrow(CoercionError);
  });
  it('throws on whitespace-only numerics rather than coercing to 0', () => {
    expect(() => coerceValue(' ', 'float')).toThrow(CoercionError);
    expect(() => coerceValue('\t', 'score')).toThrow(CoercionError);
  });
  it('isEmptyValue', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
  });
  it('METRIC_TYPES covers exactly the numeric-ish types', () => {
    expect([...METRIC_TYPES].sort()).toEqual(['bool', 'float', 'percent', 'rating', 'score']);
  });
});
