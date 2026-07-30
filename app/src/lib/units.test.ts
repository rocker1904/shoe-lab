import { describe, expect, it } from 'vitest';
import { EASY } from './score-defs';
import { headerUnits } from './units';
import { labTest } from './test-fixtures';

// `test-fixtures.ts` TESTS carries only `float`, `percent` and `option`, so the `score` and
// `rating` branches are unreachable through ShoeTable and are exercised here instead.
const floatTest = labTest({ id: 24, slug: 'weight', name: 'Weight', units: 'g' });
const percentTest = labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return', type: 'percent' });
const scoreTest = labTest({ id: 3, slug: 'breathability', name: 'Breathability', type: 'score' });
const ratingTest = labTest({ id: 4, slug: 'size-rating', name: 'Size', type: 'rating' });
const stackTest = labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm' });

describe('headerUnits', () => {
  it('takes a float test at its declared units and marks the direction', () => {
    expect(headerUnits('weight', floatTest)).toBe('g ↓');
  });

  it('reads a percent test as % and a lab score out of five', () => {
    expect(headerUnits('energy-return-heel', percentTest)).toBe('% ↑');
    expect(headerUnits('breathability', scoreTest)).toBe('/5 ↑');
  });

  it('reads a rating out of five as well', () => {
    expect(headerUnits('toebox-durability', ratingTest)).toBe('/5 ↑');
  });

  it('shows 3 = true for size rating rather than a false five-point score', () => {
    expect(headerUnits('size-rating', ratingTest)).toBe('3 = true');
  });

  it('knows the two shoe fields, which are not catalogue tests', () => {
    expect(headerUnits('score', undefined)).toBe('/100 ↑');
    expect(headerUnits('msrpGbp', undefined)).toBe('£ ↓');
  });

  it('says nothing for a neutral metric or a non-numeric column', () => {
    expect(headerUnits('heel-stack', stackTest)).toBe('mm');
    expect(headerUnits('plate', undefined)).toBe('');
    expect(headerUnits('releasedAt', undefined)).toBe('');
    const option = labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option' });
    expect(headerUnits('tongue-gusset-type', option)).toBe('');
  });
});

describe('the synthetic Easy score', () => {
  it('leaves the Easy score unitless rather than claiming a ceiling it does not have', () => {
    // Never `/100`: the anchors are frozen, so a shoe better than the 2026-07-30 fleet reads above
    // 100 by design. The direction arrow is all the header can honestly carry.
    for (const key of Object.values(EASY.keys)) {
      expect(headerUnits(key, undefined)).toBe('↑');
      expect(headerUnits(key, undefined)).not.toContain('/100');
    }
  });
});
