import { describe, expect, it } from 'vitest';
import { ageMonths, indexTests, isoYearsAgo, numericValue } from './dataset';
import { FLEET, TESTS, shoe } from './test-fixtures';

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
  it('ageMonths computes whole months, null-safe', () => {
    expect(ageMonths('2026-01-26', new Date('2026-07-26'))).toBe(6);
    expect(ageMonths('2026-07-01', new Date('2026-07-26'))).toBe(0);
    expect(ageMonths(null, new Date())).toBeNull();
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
  it('ageMonths clamps future releases to 0', () => {
    expect(ageMonths('2026-12-01', new Date('2026-07-26'))).toBe(0);
  });
  it('ageMonths spans year boundaries', () => {
    expect(ageMonths('2024-11-01', new Date('2026-07-26'))).toBe(20);
  });
  it('ageMonths uses UTC so negative-offset runners do not gain a month', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      // Local accessors would read 2025-03-01T00:00Z as Feb 28 and 2025-03-15T00:00Z as Mar 14 -> 1 month.
      expect(ageMonths('2025-03-01', new Date('2025-03-15'))).toBe(0);
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
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
