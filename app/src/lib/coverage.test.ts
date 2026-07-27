import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse, oldestReading, SPARSE_BELOW } from './coverage';
import { indexTests } from './dataset';
import { FLEET, TESTS } from './test-fixtures';

const idx = indexTests(TESTS);

describe('coverageOf', () => {
  it('counts shoes carrying a reading', () => {
    const c = coverageOf(FLEET, 'heel-stack', idx);
    expect(c.total).toBe(FLEET.length);
    expect(c.n).toBe(FLEET.filter((s) => typeof s.values['6'] === 'number').length);
    expect(c.fraction).toBeCloseTo(c.n / c.total);
  });
  it('reports nothing for a non-numeric test, which cannot be ranged', () => {
    // reading shoe.values directly instead of via numericValue would wrongly count these
    expect(coverageOf(FLEET, 'tongue-gusset-type', idx).n).toBe(0);
  });
  it('reports nothing for an unknown key', () => {
    expect(coverageOf(FLEET, 'no-such-test', idx).n).toBe(0);
  });
  it('is zero-safe on an empty population', () => {
    expect(coverageOf([], 'heel-stack', idx)).toEqual({ n: 0, total: 0, fraction: 0 });
  });
});

describe('isSparse', () => {
  it('is true strictly below the threshold', () => {
    expect(isSparse({ n: 49, total: 100, fraction: 0.49 })).toBe(true);
    expect(isSparse({ n: 50, total: 100, fraction: SPARSE_BELOW })).toBe(false);
  });
  it('is never true for an empty population, which says nothing', () => {
    expect(isSparse({ n: 0, total: 0, fraction: 0 })).toBe(false);
  });
});

describe('oldestReading', () => {
  it('returns the earliest release date among shoes carrying a reading', () => {
    expect(oldestReading(FLEET, 'heel-stack', idx)).toBe(
      FLEET.filter((s) => typeof s.values['6'] === 'number' && s.releasedAt)
        .map((s) => s.releasedAt!).sort()[0]);
  });
  it('is null when nothing carries a reading or nothing is dated', () => {
    expect(oldestReading([], 'heel-stack', idx)).toBeNull();
    expect(oldestReading(FLEET, 'no-such-test', idx)).toBeNull();
  });
});
