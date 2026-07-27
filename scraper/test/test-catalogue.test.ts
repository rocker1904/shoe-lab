import { describe, expect, it } from 'vitest';
import { PayloadError } from '../src/page-payload.js';
import { extractTestCatalogue, extractTestGroups } from '../src/test-catalogue.js';
import { loadAzuraPageData } from './helpers.js';

describe('extractTestCatalogue', () => {
  it('extracts all tests with group mapping from the real fixture', () => {
    const tf = extractTestCatalogue(loadAzuraPageData(), 'saucony-endorphin-azura', '2026-07-26T00:00:00Z');
    expect(tf.tests.length).toBeGreaterThanOrEqual(60);
    expect(tf.seedSlug).toBe('saucony-endorphin-azura');
    const heel = tf.tests.find((t) => t.slug === 'heel-stack');
    expect(heel).toMatchObject({ id: 6, type: 'float', units: 'mm' });
    expect(tf.groups[heel!.groupId!]).toBe('Cushioning');
    // sorted by id ascending
    expect([...tf.tests].map((t) => t.id)).toEqual([...tf.tests].map((t) => t.id).sort((a, b) => a - b));
  });
  it('throws PayloadError when lab_tests missing or too few tests', () => {
    expect(() => extractTestCatalogue({}, 's', 't')).toThrow(PayloadError);
    expect(() => extractTestCatalogue({ lab_tests: { tests: { '1': { id: 1, slug: 'x', name: 'X', type: 'float', units: '' } }, groups: {} } }, 's', 't')).toThrow(PayloadError);
  });
});

// RunRepeat revised nine test methods and kept the old names, so the catalogue is the only
// place that says which reading supersedes which (docs/scraping.md §Test lineage).
describe('extractTestCatalogue lineage', () => {
  const tf = extractTestCatalogue(loadAzuraPageData(), 'saucony-endorphin-azura', 't');
  const byId = (id: number) => tf.tests.find((t) => t.id === id)!;

  it('carries the supersession chain in both directions', () => {
    expect(byId(11)).toMatchObject({ slug: 'midsole-softness', updateId: 70, previousId: null });
    expect(byId(70)).toMatchObject({ slug: 'midsole-softness-22', previousId: 11, updateId: null });
  });
  it('agrees with itself: every updateId has a matching previousId', () => {
    for (const t of tf.tests) {
      if (t.updateId !== null) expect(byId(t.updateId).previousId).toBe(t.id);
      if (t.previousId !== null) expect(byId(t.previousId).updateId).toBe(t.id);
    }
  });
  it('carries the heel/forefoot pairing', () => {
    expect(byId(67)).toMatchObject({ slug: 'shock-absorption-heel', secondaryTestIds: [68], primaryTestId: null });
    expect(byId(68)).toMatchObject({ slug: 'shock-absorption-forefoot', primaryTestId: 67, secondaryTestIds: [] });
    // chartLabel is the shared family name for such a pair, not a per-test label
    expect(byId(67).chartLabel).toBe('Shock absorption');
    expect(byId(68).chartLabel).toBe('Shock absorption');
  });
  it('records isNew, which does NOT track which generation is current', () => {
    // Recheck if this ever changes upstream: #59 and #55 are the current-method tests of their
    // pairs (#14 and #27 name them as their update) yet both read isNew false, while their
    // superseded predecessors are false too. Only previousId/updateId settle which is current.
    expect(byId(70).isNew).toBe(true);
    expect(byId(59)).toMatchObject({ previousId: 14, updateId: null, isNew: false });
    expect(byId(55)).toMatchObject({ previousId: 27, updateId: null, isNew: false });
    expect(byId(14).isNew).toBe(false);
  });
  it('defaults every lineage field when the payload omits them', () => {
    const bare = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [i, { id: i + 1, slug: `t${i}`, name: `T${i}`, type: 'float', units: '' }]));
    const t = extractTestCatalogue({ lab_tests: { tests: bare, groups: {} } }, 's', 't').tests[0]!;
    expect(t).toMatchObject({ chartLabel: null, isNew: false, previousId: null, updateId: null, primaryTestId: null, secondaryTestIds: [] });
  });
});

describe('extractTestGroups', () => {
  it('maps every test the page groups to its group id', () => {
    const groups = extractTestGroups(loadAzuraPageData());
    expect(groups['6']).toBe('3');                    // heel stack -> Cushioning
    expect(Object.keys(groups).length).toBeGreaterThan(20);
    // the seed's own run leaves plenty ungrouped — that is what the fleet-wide union fixes
    expect(groups['11']).toBeUndefined();
  });
  it('returns an empty map for a payload with no groups', () => {
    expect(extractTestGroups({})).toEqual({});
    expect(extractTestGroups({ lab_tests: { groups: { '1': { tests: 'not-an-array' } } } })).toEqual({});
  });
});
