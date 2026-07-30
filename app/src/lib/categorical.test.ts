import { describe, expect, it } from 'vitest';
import { categoricalEntries, categoricalValue, isCategorical, isNegativeReading } from './categorical';
import { indexTests } from './dataset';
import { TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);

describe('categoricalValue', () => {
  it('renders an option reading with its declared label, not the stored slug', () => {
    const s = shoe({ slug: 'a', values: { '39': 'both-sides-semi' } });
    expect(categoricalValue(s, 'tongue-gusset-type', idx)).toBe('Both sides (semi)');
  });

  it('renders a bool reading as yes or no', () => {
    expect(categoricalValue(shoe({ slug: 'a', values: { '41': true } }), 'removable-insole', idx)).toBe('Yes');
    expect(categoricalValue(shoe({ slug: 'a', values: { '41': false } }), 'removable-insole', idx)).toBe('No');
  });

  it('falls back to the raw slug for a choice the catalogue does not declare', () => {
    // An upstream addition should read as an unfamiliar word, not vanish into a blank cell.
    const s = shoe({ slug: 'a', values: { '39': 'bootie' } });
    expect(categoricalValue(s, 'tongue-gusset-type', idx)).toBe('bootie');
  });

  it('is undefined for a shoe with no reading, and for a numeric column', () => {
    expect(categoricalValue(shoe({ slug: 'a', values: {} }), 'tongue-gusset-type', idx)).toBeUndefined();
    expect(categoricalValue(shoe({ slug: 'a', values: { '6': 30 } }), 'heel-stack', idx)).toBeUndefined();
  });

  it('is undefined for a column that names no test at all', () => {
    expect(categoricalValue(shoe({ slug: 'a' }), 'not-a-test', idx)).toBeUndefined();
  });

  // The catalogue carries a `bool` test slugged `plate`, on two shoes of 450. The column of that
  // name is the derived field, so the reading must not answer for it.
  it('is undefined for plate, which the shoe field owns', () => {
    expect(categoricalValue(shoe({ slug: 'a', values: { '69': true } }), 'plate', idx)).toBeUndefined();
  });
});

describe('isNegativeReading', () => {
  it('is true for a false bool and for the none choice', () => {
    expect(isNegativeReading(shoe({ slug: 'a', values: { '41': false } }), 'removable-insole', idx)).toBe(true);
    expect(isNegativeReading(shoe({ slug: 'a', values: { '39': 'none' } }), 'tongue-gusset-type', idx)).toBe(true);
  });
  it('is false for a reading that says something, and for no reading at all', () => {
    expect(isNegativeReading(shoe({ slug: 'a', values: { '41': true } }), 'removable-insole', idx)).toBe(false);
    expect(isNegativeReading(shoe({ slug: 'a', values: { '39': 'bootie' } }), 'tongue-gusset-type', idx)).toBe(false);
    expect(isNegativeReading(shoe({ slug: 'a', values: {} }), 'tongue-gusset-type', idx)).toBe(false);
  });
  it('is false for a numeric column and for a column naming no test', () => {
    expect(isNegativeReading(shoe({ slug: 'a', values: { '6': 0 } }), 'heel-stack', idx)).toBe(false);
    expect(isNegativeReading(shoe({ slug: 'a' }), 'not-a-test', idx)).toBe(false);
  });
});

describe('isCategorical and categoricalEntries', () => {
  it('recognises option and bool, and nothing else', () => {
    expect(isCategorical(idx.bySlug.get('tongue-gusset-type'))).toBe(true);
    expect(isCategorical(idx.bySlug.get('removable-insole'))).toBe(true);
    expect(isCategorical(idx.bySlug.get('heel-stack'))).toBe(false);
    expect(isCategorical(idx.bySlug.get('plate'))).toBe(false);
    expect(isCategorical(undefined)).toBe(false);
  });

  it('offers exactly the categorical tests, carrying their group', () => {
    expect(categoricalEntries(TESTS).map((e) => e.key).sort())
      .toEqual(['heel-tab', 'removable-insole', 'tongue-gusset-type']);
    expect(categoricalEntries(TESTS).every((e) => e.groupId === '3')).toBe(true);
  });
});
