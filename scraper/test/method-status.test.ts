import { describe, expect, it } from 'vitest';
import type { LabTest } from '../../shared/types.js';
import { RETIRED_TEST_SLUGS, methodStatusOf, validateMethodStatuses } from '../src/method-status.js';
import { labTest } from './helpers.js';

const test = (over: Partial<LabTest> & Pick<LabTest, 'id' | 'slug'>): LabTest => labTest(over);

function validCatalogue(): LabTest[] {
  return [
    test({ id: 10, slug: 'outsole-hardness', methodStatus: 'retired' }),
    test({ id: 15, slug: 'stiffness-in-cold', methodStatus: 'retired' }),
    test({ id: 16, slug: 'difference-in-stiffness-in-cold', methodStatus: 'retired' }),
    test({ id: 11, slug: 'midsole-softness', updateId: 70, methodStatus: 'retired' }),
    test({ id: 70, slug: 'midsole-softness-22', previousId: 11, methodStatus: null }),
    test({ id: 6, slug: 'heel-stack', methodStatus: null }),
  ];
}

describe('methodStatusOf', () => {
  it('has exactly the initial curated registry', () => {
    expect(RETIRED_TEST_SLUGS).toEqual([
      'outsole-hardness',
      'stiffness-in-cold',
      'difference-in-stiffness-in-cold',
    ]);
  });

  it('resolves formal predecessors and every curated test as retired', () => {
    expect(methodStatusOf(test({ id: 11, slug: 'midsole-softness', updateId: 70, methodStatus: null }))).toBe('retired');
    for (const [i, slug] of RETIRED_TEST_SLUGS.entries()) {
      expect(methodStatusOf(test({ id: 100 + i, slug, methodStatus: null })), slug).toBe('retired');
    }
  });

  it('makes no claim for an unlinked test, regardless of isNew', () => {
    expect(methodStatusOf(test({ id: 6, slug: 'heel-stack', isNew: true, methodStatus: 'retired' }))).toBeNull();
  });
});

describe('validateMethodStatuses', () => {
  it('accepts a catalogue whose published fields agree with both sources', () => {
    expect(() => validateMethodStatuses(validCatalogue())).not.toThrow();
  });

  it('rejects malformed and source-disagreeing fields', () => {
    const malformed = validCatalogue();
    (malformed.at(-1) as any).methodStatus = 'current';
    expect(() => validateMethodStatuses(malformed)).toThrow(/methodStatus.*current/);

    for (const slug of RETIRED_TEST_SLUGS) {
      const mismatched = validCatalogue();
      mismatched.find((t) => t.slug === slug)!.methodStatus = null;
      expect(() => validateMethodStatuses(mismatched), slug).toThrow(/methodStatus/);
    }
  });

  it('rejects stale, duplicate and formally linked registry entries', () => {
    for (const slug of RETIRED_TEST_SLUGS) {
      const missing = validCatalogue().filter((t) => t.slug !== slug);
      expect(() => validateMethodStatuses(missing), slug).toThrow(new RegExp(slug));
    }

    const duplicate = validCatalogue();
    duplicate.push(test({ id: 999, slug: RETIRED_TEST_SLUGS[0]!, methodStatus: 'retired' }));
    expect(() => validateMethodStatuses(duplicate)).toThrow(/outsole-hardness.*exactly once/);

    const redundant = validCatalogue();
    redundant[0]!.updateId = 999;
    expect(() => validateMethodStatuses(redundant)).toThrow(/outsole-hardness.*updateId|redundant/);
  });

  it('rejects loss of a retirement published by a previous catalogue', () => {
    const next = validCatalogue();
    const previous = [test({ id: 6, slug: 'heel-stack', methodStatus: 'retired' })];
    expect(() => validateMethodStatuses(next, previous)).toThrow(/heel-stack.*retired/);
  });

  it('does not turn an absent pre-feature field into a published claim', () => {
    const previous = [test({ id: 6, slug: 'heel-stack', methodStatus: null })];
    delete (previous[0] as any).methodStatus;
    expect(() => validateMethodStatuses(validCatalogue(), previous)).not.toThrow();
  });
});
