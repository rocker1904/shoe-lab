import type { LabTest, Shoe } from '../../../shared/types.js';

export function labTest(over: Partial<LabTest> & Pick<LabTest, 'id' | 'slug' | 'name'>): LabTest {
  return {
    type: 'float', units: '', groupId: null, chartLabel: null, isNew: false,
    previousId: null, updateId: null, primaryTestId: null, secondaryTestIds: [],
    ...over,
  };
}

export const TESTS: LabTest[] = [
  labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm', groupId: '3' }),
  labTest({ id: 24, slug: 'weight', name: 'Weight', units: 'g', groupId: '10' }),
  labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return (heel)', type: 'percent', groupId: '3' }),
  labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', groupId: '3', previousId: 11 }),
  labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option' }),
];

/** Kept out of TESTS: it is the one test that resolves against a shoe field, so it belongs to
 *  the price cases alone rather than to every component fixture (docs/app.md §Resolved price). */
export const PRICE_TEST: LabTest = labTest({ id: 52, slug: 'price', name: 'Price', units: '£', groupId: '8' });

export function shoe(overrides: Partial<Shoe> & { slug: string }): Shoe {
  return {
    name: overrides.slug, brand: 'Brand', url: `https://runrepeat.com/${overrides.slug}`,
    releasedAt: '2025-01-01', preciseReleaseDate: true, score: 80, msrpGbp: 140, discontinued: false,
    plate: 'none', imageUrl: null, values: {}, details: null,
    facts: {}, previousVersion: null, nextVersion: null, latestVersion: null, reviewLanguage: null,
    ...overrides,
  };
}

export const FLEET: Shoe[] = [
  shoe({ slug: 'cushy', values: { '6': 40, '65': 70, '70': 40 }, plate: 'none', releasedAt: '2025-06-01', score: 92 }),
  shoe({ slug: 'racer', values: { '6': 39, '65': 75, '70': 42 }, plate: 'carbon', releasedAt: '2026-01-01', score: 90, msrpGbp: 250 }),
  shoe({ slug: 'trainer', values: { '6': 35, '65': 60, '70': 30 }, plate: 'plated-other', releasedAt: '2023-05-01', score: 85 }),
  shoe({ slug: 'oldie', values: { '6': 30, '65': 55 }, releasedAt: '2021-01-01', score: 70, discontinued: true, brand: 'Other' }),
  shoe({ slug: 'mystery', values: {}, releasedAt: null, preciseReleaseDate: false, score: null, msrpGbp: null }),
];
