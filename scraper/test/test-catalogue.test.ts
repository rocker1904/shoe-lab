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
  it('rejects a slug that would become more than one aria-labelledby reference before crawling', () => {
    const page = loadAzuraPageData();
    const first = Object.values<any>(page.lab_tests.tests)[0]!;
    first.slug = 'heel stack';
    expect(() => extractTestCatalogue(page, 's', 't')).toThrow(/invalid slug.*heel stack/);
  });
  it('accepts punctuation that is valid inside one id reference', () => {
    const page = loadAzuraPageData();
    const first = Object.values<any>(page.lab_tests.tests)[0]!;
    first.slug = 'heel_stack.v2';
    expect(extractTestCatalogue(page, 's', 't').tests[0]!.slug).toBe('heel_stack.v2');
  });
});

// RunRepeat revised nine test methods and kept the old names, so the catalogue is the only
// place that says which reading supersedes which (docs/scraping.md §Test lineage).
describe('extractTestCatalogue lineage', () => {
  const tf = extractTestCatalogue(loadAzuraPageData(), 'saucony-endorphin-azura', 't');
  const byId = (id: number) => tf.tests.find((t) => t.id === id)!;

  it('carries the supersession chain in both directions', () => {
    expect(byId(11)).toMatchObject({ slug: 'midsole-softness', updateId: 70, previousId: null, methodStatus: 'retired' });
    expect(byId(70)).toMatchObject({ slug: 'midsole-softness-22', previousId: 11, updateId: null, methodStatus: null });
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
  it('publishes curated retirement without deriving it from coverage', () => {
    expect(tf.tests.filter((t) => [
      'outsole-hardness',
      'stiffness-in-cold',
      'difference-in-stiffness-in-cold',
    ].includes(t.slug))).toMatchObject([
      { slug: 'outsole-hardness', updateId: null, methodStatus: 'retired' },
      { slug: 'stiffness-in-cold', updateId: null, methodStatus: 'retired' },
      { slug: 'difference-in-stiffness-in-cold', updateId: null, methodStatus: 'retired' },
    ]);
    expect(byId(6).methodStatus).toBeNull();
  });
  it('defaults every lineage field when the payload omits them', () => {
    const bare = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [i, { id: i + 1, slug: `t${i}`, name: `T${i}`, type: 'float', units: '' }]));
    const t = extractTestCatalogue({ lab_tests: { tests: bare, groups: {} } }, 's', 't').tests[0]!;
    expect(t).toMatchObject({ chartLabel: null, isNew: false, previousId: null, updateId: null, primaryTestId: null, secondaryTestIds: [], methodStatus: null });
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

describe('declared option choices', () => {
  const page = (tests: Record<string, unknown>) => ({ lab_tests: { tests, groups: {} } });
  const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 100, { id: i + 100, slug: `t${i}`, name: `T${i}`, type: 'float' }]));

  it('keeps value and English name for an option test, dropping weights and translations', () => {
    const t = extractTestCatalogue(page({ ...many, 39: { id: 39, slug: 'g', name: 'G', type: 'option',
      config: { options: [{ value: 'none', name: 'None' }], weights: { 1: 0 }, translations: { es: {} } } } }), 's', 'T');
    expect(t.tests.find((x) => x.id === 39)!.options).toEqual([{ value: 'none', name: 'None' }]);
  });

  it('leaves options null on a non-option test, and on an option test that declares none', () => {
    const t = extractTestCatalogue(page({ ...many, 6: { id: 6, slug: 'h', name: 'H', type: 'float', config: { options: [{ value: 'x', name: 'X' }] } },
      39: { id: 39, slug: 'g', name: 'G', type: 'option', config: {} } }), 's', 'T');
    expect(t.tests.find((x) => x.id === 6)!.options).toBeNull();
    expect(t.tests.find((x) => x.id === 39)!.options).toBeNull();
  });
});
