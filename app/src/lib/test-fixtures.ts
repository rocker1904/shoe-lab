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
  // The forefoot halves of two side pairs, mirroring the real catalogue: stack is unlinked
  // upstream and energy return is linked (docs/app.md §Columns and sorting).
  labTest({ id: 5, slug: 'forefoot-stack', name: 'Forefoot stack', units: 'mm', groupId: '3' }),
  labTest({ id: 24, slug: 'weight', name: 'Weight', units: 'g', groupId: '10' }),
  labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return (heel)', type: 'percent', groupId: '3', chartLabel: 'Energy return', secondaryTestIds: [66] }),
  labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', type: 'percent', groupId: null, chartLabel: 'Energy return', primaryTestId: 65 }),
  labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', groupId: '3', updateId: 70 }),
  labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', groupId: '3', previousId: 11 }),
  labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option' }),
  // A pair carrying no method year on either side and sharing both name and units — the case the
  // generation label cannot derive from a slug (docs/scraping.md §Test lineage).
  labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', groupId: '3', updateId: 55 }),
  labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', groupId: '3', previousId: 27 }),
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

/**
 * Weights (test 24) are spread so a fleet-percentile bound admits some shoes and excludes others;
 * `mystery` stays bare because it exists to be the shoe with no reading at all.
 *
 * The forefoot halves (5, 66) sit on a **visibly different scale** from their heel counterparts
 * (6, 65), which is the premise of a per-side percentile: a bound computed on the wrong side is
 * only detectable because the two distributions do not overlap. They carry readings on all four
 * reading-carrying shoes, not three — Easy under forefoot excludes `racer` on plate, so three
 * readings would leave coverage at exactly the sparse threshold.
 */
export const FLEET: Shoe[] = [
  shoe({ slug: 'cushy', values: { '5': 30, '6': 40, '24': 210, '65': 70, '66': 62, '70': 40 }, plate: 'none', releasedAt: '2025-06-01', score: 92 }),
  shoe({ slug: 'racer', values: { '5': 29, '6': 39, '24': 220, '65': 75, '66': 68, '70': 42 }, plate: 'carbon', releasedAt: '2026-01-01', score: 90, msrpGbp: 250 }),
  shoe({ slug: 'trainer', values: { '5': 25, '6': 35, '24': 280, '65': 60, '66': 51, '70': 30 }, plate: 'plated-other', releasedAt: '2023-05-01', score: 85 }),
  shoe({ slug: 'oldie', values: { '5': 20, '6': 30, '24': 300, '65': 55, '66': 45 }, releasedAt: '2021-01-01', score: 70, discontinued: true, brand: 'Other' }),
  shoe({ slug: 'mystery', values: {}, releasedAt: null, preciseReleaseDate: false, score: null, msrpGbp: null }),
];
