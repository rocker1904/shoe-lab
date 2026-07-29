import { describe, expect, it } from 'vitest';
import { displayNumber, indexTests, isoYearsAgo, numericValue, priceOf } from './dataset';
import { FLEET, PRICE_TEST, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);

describe('dataset', () => {
  it('indexes tests by slug and id', () => {
    expect(idx.bySlug.get('heel-stack')?.id).toBe(6);
    expect(idx.byId.get('65')?.slug).toBe('energy-return-heel');
  });
  it('numericValue reads shoe fields and test values', () => {
    expect(numericValue(FLEET[0]!, 'score', idx)).toBe(92);
    expect(numericValue(FLEET[0]!, 'msrpGbp', idx)).toBe(140);
    expect(numericValue(FLEET[0]!, 'heel-stack', idx)).toBe(40);
    expect(numericValue(FLEET[4]!, 'heel-stack', idx)).toBeUndefined();
    expect(numericValue(FLEET[4]!, 'score', idx)).toBeUndefined();       // null -> undefined
    expect(numericValue(FLEET[0]!, 'tongue-gusset-type', idx)).toBeUndefined(); // non-numeric test
    expect(numericValue(FLEET[0]!, 'nope', idx)).toBeUndefined();
  });
});

describe('dataset edge cases', () => {
  it('numericValue rejects non-numeric readings stored against a numeric test', () => {
    const s = shoe({ slug: 'weird', values: { '6': 'n/a', '65': true } });
    expect(numericValue(s, 'heel-stack', idx)).toBeUndefined();
    expect(numericValue(s, 'energy-return-heel', idx)).toBeUndefined();
  });
  it('numericValue accepts zero and negative readings', () => {
    const s = shoe({ slug: 'zero', values: { '6': 0 }, msrpGbp: 0 });
    expect(numericValue(s, 'heel-stack', idx)).toBe(0);
    expect(numericValue(s, 'msrpGbp', idx)).toBe(0);
  });
});

describe('isoYearsAgo', () => {
  it('subtracts whole years and returns a date-only string', () => {
    expect(isoYearsAgo(new Date('2026-07-26T12:00:00Z'), 2)).toBe('2024-07-26');
    expect(isoYearsAgo(new Date('2026-07-26T12:00:00Z'), 1)).toBe('2025-07-26');
  });
  it('does not shift with the time of day', () => {
    expect(isoYearsAgo(new Date('2026-07-26T00:00:00Z'), 2)).toBe('2024-07-26');
    expect(isoYearsAgo(new Date('2026-07-26T23:59:59Z'), 2)).toBe('2024-07-26');
  });
  it('rolls 29 Feb into March rather than back into February', () => {
    expect(isoYearsAgo(new Date('2028-02-29T12:00:00Z'), 2)).toBe('2026-03-01');
  });
  it('reads the UTC calendar date, not the viewer local one', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      // 2026-07-28T02:00Z is still the 27th in Los Angeles; the cut-off follows UTC.
      expect(isoYearsAgo(new Date('2026-07-28T02:00:00Z'), 2)).toBe('2024-07-28');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

// The catalogue carries the same GBP list price twice; a column that disagrees with the filter
// beside it is the failure this guards (docs/app.md §Resolved price).
describe('priceOf', () => {
  const idx = indexTests([...TESTS, PRICE_TEST]);
  it('prefers the lab-test price, which refreshes weekly', () => {
    const s = shoe({ slug: 'both', msrpGbp: 140, values: { '52': 150 } });
    expect(priceOf(s, idx)).toBe(150);
    expect(numericValue(s, 'msrpGbp', idx)).toBe(150);
  });
  it('falls back to the details field when the test has no reading', () => {
    const s = shoe({ slug: 'field-only', msrpGbp: 140, values: {} });
    expect(priceOf(s, idx)).toBe(140);
    expect(numericValue(s, 'msrpGbp', idx)).toBe(140);
  });
  it('reads undefined when neither source has a price', () => {
    expect(priceOf(shoe({ slug: 'none', msrpGbp: null }), idx)).toBeUndefined();
  });
  it('keeps a zero from the test rather than falling through to the field', () => {
    expect(priceOf(shoe({ slug: 'free', msrpGbp: 140, values: { '52': 0 } }), idx)).toBe(0);
  });
  it('sorts and filters through the same resolved number', () => {
    const cheap = shoe({ slug: 'cheap', msrpGbp: 300, values: { '52': 100 } });
    const dear = shoe({ slug: 'dear', msrpGbp: 100, values: { '52': 300 } });
    expect([cheap, dear].map((s) => numericValue(s, 'msrpGbp', idx))).toEqual([100, 300]);
  });
});

describe('displayNumber', () => {
  it('trims the twelve-figure shock-absorption readings to two decimals', () => {
    expect(displayNumber(131.57894736842)).toBe('131.58');
    expect(displayNumber(23.634348271029)).toBe('23.63');
  });
  it('leaves values that are already short alone', () => {
    expect(displayNumber(32.7)).toBe('32.7');
    expect(displayNumber(250)).toBe('250');
    expect(displayNumber(0)).toBe('0');
    expect(displayNumber(-0.8)).toBe('-0.8');
  });
});
