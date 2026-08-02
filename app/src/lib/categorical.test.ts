import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { categoricalEntries, categoricalValue, facetValues, isCategorical, isNegativeReading } from './categorical';
import { indexTests } from './dataset';
import { TESTS, labTest, shoe } from './test-fixtures';
import type { LabTest } from '../../../shared/types.js';

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

/**
 * The rows a facet checklist draws. Both fixtures carry the real catalogue's choices, because the
 * rule is about the shape of a real list: gusset declares None seventh of seven, heel-tab third of
 * four, and only the second one moves.
 */
describe('facetValues', () => {
  const gusset = labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option', options: [
    { value: 'both-sides-full', name: 'Both sides (full)' }, { value: 'both-sides-semi', name: 'Both sides (semi)' },
    { value: 'one-side-full', name: 'One side (full)' }, { value: 'one-side-semi', name: 'One side (semi)' },
    { value: 'sock-like', name: 'Sock like' }, { value: 'bootie', name: 'Bootie' }, { value: 'none', name: 'None' },
  ] });
  const heelTab = labTest({ id: 40, slug: 'heel-tab', name: 'Heel tab', type: 'option', options: [
    { value: 'pull-tab', name: 'Pull tab' }, { value: 'finger-loop', name: 'Finger loop' },
    { value: 'none', name: 'None' }, { value: 'extended-heel-collar', name: 'Extended heel collar' },
  ] });

  it('carries the option slug as the value and its declared name as the label', () => {
    expect(facetValues(heelTab)[0]).toEqual({ value: 'pull-tab', label: 'Pull tab' });
  });
  it('keeps the catalogue order of everything that is not none', () => {
    expect(facetValues(gusset).map((v) => v.value)).toEqual([
      'both-sides-full', 'both-sides-semi', 'one-side-full', 'one-side-semi', 'sock-like', 'bootie', 'none',
    ]);
  });
  it('sinks none from the middle of the list to the end', () => {
    expect(facetValues(heelTab).map((v) => v.value)).toEqual([
      'pull-tab', 'finger-loop', 'extended-heel-collar', 'none',
    ]);
  });
  it('ends both real lists on None, whichever place the catalogue declared it', () => {
    for (const t of [gusset, heelTab]) {
      expect(facetValues(t).at(-1), t.slug).toEqual({ value: 'none', label: 'None' });
    }
  });
  it('is empty for a bool, for a numeric test, and for an option test declaring no choices', () => {
    expect(facetValues(idx.bySlug.get('removable-insole')!)).toEqual([]);
    expect(facetValues(idx.bySlug.get('heel-stack')!)).toEqual([]);
    expect(facetValues(labTest({ id: 99, slug: 'empty-option', name: 'Empty', type: 'option' }))).toEqual([]);
  });
  it('is empty for a test whose slug a shoe field owns, even typed option', () => {
    expect(facetValues(labTest({ id: 69, slug: 'plate', name: 'Plate', type: 'option',
      options: [{ value: 'carbon', name: 'Carbon' }] }))).toEqual([]);
  });
});

/**
 * `isNegativeReading` keys on the literal slug `none`, which is how both option tests in the
 * catalogue spell "this shoe has none of it". A new option test spelling it `no-gusset` or
 * `absent` would put a redundant chip on the phone's name line with nothing failing.
 *
 * This is a **tripwire, not a law**: an option test with no absence among its choices is perfectly
 * legitimate, and `isNegativeReading` correctly never fires for it. What the assertion buys is
 * that a human looks once, when the catalogue's shape changes, rather than never. If a test
 * arrives that genuinely has no absence, exempt it here and say why.
 */
describe('the none choice, against the published catalogue', () => {
  const published = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8'),
  ) as { tests: LabTest[] };

  it('spells the absence `none` on every option test that can become a column', () => {
    const options = published.tests.filter((t) => t.type === 'option' && isCategorical(t));
    expect(options.map((t) => t.slug)).toEqual(['tongue-gusset-type', 'heel-tab']);
    for (const t of options) {
      expect(t.options?.map((o) => o.value), t.slug).toContain('none');
    }
  });
});
