import type { LabTest, Shoe } from '../../../shared/types.js';

export function labTest(over: Partial<LabTest> & Pick<LabTest, 'id' | 'slug' | 'name'>): LabTest {
  return {
    type: 'float', units: '', groupId: null, chartLabel: null, isNew: false,
    previousId: null, updateId: null, primaryTestId: null, secondaryTestIds: [], options: null,
    ...over,
  };
}

export const TESTS: LabTest[] = [
  labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm', groupId: '3' }),
  // The forefoot halves of two zone pairs, mirroring the real catalogue: stack is unlinked
  // upstream and energy return is linked (docs/app.md §Columns and sorting).
  labTest({ id: 5, slug: 'forefoot-stack', name: 'Forefoot stack', units: 'mm', groupId: '3' }),
  labTest({ id: 24, slug: 'weight', name: 'Weight', units: 'g', groupId: '10' }),
  labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return (heel)', type: 'percent', groupId: '3', chartLabel: 'Energy return', secondaryTestIds: [66] }),
  labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', type: 'percent', groupId: null, chartLabel: 'Energy return', primaryTestId: 65 }),
  labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', groupId: '3', updateId: 70 }),
  labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', groupId: '3', previousId: 11 }),
  labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option', groupId: '3',
    options: [{ value: 'none', name: 'None' }, { value: 'both-sides-semi', name: 'Both sides (semi)' }] }),
  // A second option test whose choices overlap the first's labels: two categorical columns reading
  // "None" at once is the ordinary case, not a contrived one (docs/app.md §Categorical columns).
  labTest({ id: 40, slug: 'heel-tab', name: 'Heel tab', type: 'option', groupId: '3',
    options: [{ value: 'none', name: 'None' }, { value: 'pull-tab', name: 'Pull tab' }] }),
  labTest({ id: 41, slug: 'removable-insole', name: 'Removable insole', type: 'bool', groupId: '3' }),
  // The catalogue's own `plate` test, whose slug collides with the shoe field of that name. Present
  // in the fixture because the collision is only visible when both exist
  // (docs/app.md §Categorical columns).
  labTest({ id: 69, slug: 'plate', name: 'Plate', type: 'bool' }),
  // A pair carrying no method year on either zone and sharing both name and units — the case the
  // generation label cannot derive from a slug (docs/scraping.md §Test lineage).
  labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', groupId: '3', updateId: 55 }),
  labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', groupId: '3', previousId: 27 }),
  // The metrics the Easy score reads. Carried by all four reading-carrying shoes and absent on
  // `mystery`, because `score.test.ts` needs exactly one unscoreable shoe.
  labTest({ id: 68, slug: 'shock-absorption-heel', name: 'Shock absorption (heel)', units: 'SA', groupId: '3', chartLabel: 'Shock absorption', secondaryTestIds: [67] }),
  labTest({ id: 67, slug: 'shock-absorption-forefoot', name: 'Shock absorption forefoot', units: 'SA', groupId: null, chartLabel: 'Shock absorption', primaryTestId: 68 }),
  labTest({ id: 4, slug: 'outsole-durability', name: 'Outsole durability', units: 'mm', groupId: '2', chartLabel: 'Outsole wear' }),
  labTest({ id: 9, slug: 'outsole-thickness', name: 'Outsole thickness', units: 'mm', groupId: '2' }),
  labTest({ id: 19, slug: 'heel-counter-stiffness', name: 'Heel counter stiffness', type: 'score', groupId: '5' }),
  labTest({ id: 26, slug: 'midsole-width-in-the-heel', name: 'Midsole width in the heel', units: 'mm', groupId: '5' }),
  labTest({ id: 25, slug: 'midsole-width-in-the-forefoot', name: 'Midsole width in the forefoot', units: 'mm', groupId: '5' }),
];

/** Kept out of TESTS: it is the one test that resolves against a shoe field, so it belongs to
 *  the price cases alone rather than to every component fixture (docs/app.md §Resolved price). */
export const PRICE_TEST: LabTest = labTest({ id: 52, slug: 'price', name: 'Price', units: '£', groupId: '8' });

export function shoe(overrides: Partial<Shoe> & { slug: string }): Shoe {
  return {
    name: overrides.slug, brand: 'Brand', url: `https://runrepeat.com/${overrides.slug}`,
    releasedAt: '2025-01-01', releaseDateSource: 'page', score: 80, msrpGbp: 140, discontinued: false,
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
 * (6, 65), which is the premise of a per-zone percentile: a bound computed on the wrong zone is
 * only detectable because the two distributions do not overlap. They carry readings on all four
 * reading-carrying shoes, not three — Easy under forefoot excludes `racer` on plate, so three
 * readings would leave coverage at exactly the sparse threshold. Forefoot energy return also
 * **ranks** the fleet differently from heel, so a story's count moves when the zone does; without
 * that, counts pinned to one zone would look correct.
 *
 * Every metric the Easy score reads (68/67, 4, 9, 19, 26, 25) is carried by all four
 * reading-carrying shoes and by none of `mystery`, because `score.test.ts` needs exactly one
 * unscoreable shoe and every other shoe scoreable under either zone and either stability state.
 */
export const FLEET: Shoe[] = [
  shoe({ slug: 'cushy', values: { '5': 30, '6': 40, '24': 210, '65': 70, '66': 55, '70': 40, '68': 140, '67': 115, '4': 0.8, '9': 3.2, '19': 4, '26': 95, '25': 118 }, plate: 'none', releasedAt: '2025-06-01', score: 92 }),
  shoe({ slug: 'racer', values: { '5': 29, '6': 39, '24': 220, '65': 75, '66': 68, '70': 42, '68': 150, '67': 125, '4': 2.0, '9': 1.5, '19': 2, '26': 82, '25': 108 }, plate: 'carbon', releasedAt: '2026-01-01', score: 90, msrpGbp: 250 }),
  shoe({ slug: 'trainer', values: { '5': 25, '6': 35, '24': 280, '65': 60, '66': 60, '70': 30, '68': 120, '67': 100, '4': 0.5, '9': 3.0, '19': 5, '26': 98, '25': 120 }, plate: 'plated-other', releasedAt: '2023-05-01', score: 85 }),
  shoe({ slug: 'oldie', values: { '5': 20, '6': 30, '24': 300, '65': 55, '66': 45, '68': 100, '67': 90, '4': 1.2, '9': 2.4, '19': 3, '26': 92, '25': 112 }, releasedAt: '2021-01-01', score: 70, discontinued: true, brand: 'Other' }),
  shoe({ slug: 'mystery', values: {}, releasedAt: null, releaseDateSource: null, score: null, msrpGbp: null }),
];
