import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { applyFilters, EMPTY_FILTERS, narrowingNames, type FilterState } from './filters';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);
const slugs = (r: { visible: { slug: string }[] }) => r.visible.map((s) => s.slug);

describe('applyFilters', () => {
  it('empty filters pass everything', () => {
    expect(slugs(applyFilters(FLEET, EMPTY_FILTERS, idx))).toHaveLength(5);
  });
  it('range min/max inclusive at boundaries; missing values hidden and counted', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': { min: 35, max: 40 } } }, idx);
    expect(slugs(r)).toEqual(['cushy', 'racer', 'trainer']);
    expect(r.hiddenMissing).toBe(1); // mystery has no heel-stack
  });
  it('open-ended ranges work', () => {
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: { 'energy-return-heel': { min: 70 } } }, idx))).toEqual(['cushy', 'racer']);
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: { msrpGbp: { max: 150 } } }, idx))).toEqual(['cushy', 'trainer', 'oldie']);
  });
  it('plate filter matches the selected values exactly', () => {
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['carbon'] }, idx))).toEqual(['racer']);
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['carbon', 'plated-other'] }, idx))).toEqual(['racer', 'trainer']);
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['none'] }, idx))).toEqual(['cushy', 'oldie', 'mystery']);
  });
  it('releasedAfter excludes older and unknown dates', () => {
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, releasedAfter: '2025-01-01' }, idx))).toEqual(['cushy', 'racer']);
  });
  it('counts an undated shoe a date bound hides, rather than dropping it silently', () => {
    // `mystery` has no release date at all, so no bound can show it to qualify — but the receipt
    // has to be able to say so (docs/app.md §Filters).
    const r = applyFilters(FLEET, { categorical: {}, ranges: {}, releasedAfter: '2025-01-01' }, idx);
    expect(r.undatedHidden).toBe(1);
    expect(r.considered.map((s) => s.slug)).not.toContain('mystery');
  });
  it('counts no undated shoes when there is no date bound to hide them', () => {
    expect(applyFilters(FLEET, { categorical: {}, ranges: {} }, idx).undatedHidden).toBe(0);
  });
  it('brand, search, discontinued filters', () => {
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, brands: ['Other'] }, idx))).toEqual(['oldie']);
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, search: 'RAC' }, idx))).toEqual(['racer']);
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, discontinued: 'hide' }, idx))).not.toContain('oldie');
  });
  it('filters combine with AND semantics', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': { min: 35 } }, plate: ['none'], releasedAfter: '2025-01-01' }, idx);
    expect(slugs(r)).toEqual(['cushy']);
  });
});

describe('applyFilters edge cases', () => {
  const ranges = { 'heel-stack': { min: 1 }, 'energy-return-heel': { min: 1 }, 'midsole-softness-22': { min: 1 } };

  it('counts a shoe missing several filtered metrics only once', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges }, idx);
    expect(slugs(r)).toEqual(['cushy', 'racer', 'trainer']);
    expect(r.hiddenMissing).toBe(2); // oldie (no softness) and mystery (nothing), once each
  });
  it('counts missing values independently of range key order', () => {
    // oldie fails heel-stack on value AND has no midsole-softness reading: missing wins either way.
    const missFirst = applyFilters([FLEET[3]!], { categorical: {}, ranges: { 'midsole-softness-22': { min: 1 }, 'heel-stack': { min: 35 } } }, idx);
    const failFirst = applyFilters([FLEET[3]!], { categorical: {}, ranges: { 'heel-stack': { min: 35 }, 'midsole-softness-22': { min: 1 } } }, idx);
    expect(missFirst.visible).toEqual([]);
    expect(failFirst.visible).toEqual([]);
    expect(failFirst.hiddenMissing).toBe(missFirst.hiddenMissing);
    expect(missFirst.hiddenMissing).toBe(1);
  });
  it('empty range bounds are not a filter and hide nothing', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': {}, 'midsole-softness-22': {} } }, idx);
    expect(slugs(r)).toHaveLength(5);
    expect(r.hiddenMissing).toBe(0);
  });
  it('does not count shoes excluded by non-range filters as hiddenMissing', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges, search: 'cushy' }, idx);
    expect(slugs(r)).toEqual(['cushy']);
    expect(r.hiddenMissing).toBe(0);
  });
  it('releasedAfter includes shoes released exactly on the boundary date', () => {
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, releasedAfter: '2026-01-01' }, idx))).toEqual(['racer']);
  });
  it('an empty brands list is not a filter', () => {
    expect(slugs(applyFilters(FLEET, { categorical: {}, ranges: {}, brands: [] }, idx))).toHaveLength(5);
  });
  it('brand filter excludes shoes with no brand', () => {
    const anon = shoe({ slug: 'anon', brand: null });
    expect(slugs(applyFilters([anon, FLEET[0]!], { categorical: {}, ranges: {}, brands: ['Brand'] }, idx))).toEqual(['cushy']);
  });
  it('search matches a substring of the display name, not the slug', () => {
    const nike = shoe({ slug: 'nike-vaporfly-3', name: 'Nike Vaporfly 3' });
    expect(slugs(applyFilters([nike, FLEET[0]!], { categorical: {}, ranges: {}, search: 'vapor' }, idx))).toEqual(['nike-vaporfly-3']);
    expect(slugs(applyFilters([nike], { categorical: {}, ranges: {}, search: '' }, idx))).toEqual(['nike-vaporfly-3']); // blank search is inert
  });
  /**
   * The box and the brand facet sit one control apart and used to answer the same string with
   * different fleets, because the box read `name` and the facet reads `brand`. Most names begin
   * with their brand, which is why it looked right; the handful that shorten it — Topo, Hylo, On —
   * are exactly where the two parted company (docs/app.md §Filters).
   */
  it('search matches the brand as well as the name, without the brand being in the name', () => {
    const on = shoe({ slug: 'cloud-x', name: 'Cloud X 4', brand: 'On' });
    expect(on.name.toLowerCase()).not.toContain('on');   // or this would pass on the name alone
    expect(slugs(applyFilters([on, FLEET[0]!], { categorical: {}, ranges: {}, search: 'On' }, idx))).toEqual(['cloud-x']);
    expect(slugs(applyFilters([on], { categorical: {}, ranges: {}, search: 'topo' }, idx))).toEqual([]);
  });
  it('search survives a shoe carrying no brand at all', () => {
    const anon = shoe({ slug: 'anon', name: 'Anon Runner', brand: null });
    expect(slugs(applyFilters([anon], { categorical: {}, ranges: {}, search: 'runner' }, idx))).toEqual(['anon']);
    expect(slugs(applyFilters([anon], { categorical: {}, ranges: {}, search: 'nike' }, idx))).toEqual([]);
  });
  it('ranging a non-numeric test hides the whole fleet', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'tongue-gusset-type': { min: 0 } } }, idx);
    expect(r.visible).toEqual([]);
    expect(r.hiddenMissing).toBe(5);
  });
  it('preserves input order and does not mutate the input', () => {
    const input = [...FLEET];
    const r = applyFilters(input, { categorical: {}, ranges: { 'heel-stack': { min: 30 } } }, idx);
    expect(slugs(r)).toEqual(['cushy', 'racer', 'trainer', 'oldie']);
    expect(input.map((s) => s.slug)).toEqual(FLEET.map((s) => s.slug));
  });
});

describe('discontinued is three-valued', () => {
  it('hide excludes every discontinued shoe', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: {}, discontinued: 'hide' }, idx);
    expect(r.visible.length).toBe(FLEET.length - 1);
    expect(r.visible.every((s) => !s.discontinued)).toBe(true);
  });
  it('only returns exactly the discontinued shoes', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: {}, discontinued: 'only' }, idx);
    expect(slugs(r)).toEqual(['oldie']);                  // non-empty, so every() below is not vacuous
    expect(r.visible.every((s) => s.discontinued)).toBe(true);
  });
  it('absent returns both', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: {} }, idx);
    expect(r.visible.some((s) => s.discontinued)).toBe(true);
    expect(r.visible.some((s) => !s.discontinued)).toBe(true);
  });
});

describe('plate as a set', () => {
  it('keeps only the selected plate values', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['none', 'plated-other'] }, idx);
    expect(r.visible.length).toBeGreaterThan(0);          // an empty result would make every() vacuous
    expect(r.visible.map((s) => s.plate)).not.toContain('carbon');
    expect(r.visible.some((s) => s.plate === 'plated-other')).toBe(true);
  });
  it('a single selection is an exact match', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['carbon'] }, idx);
    expect(r.visible.length).toBeGreaterThan(0);
    expect(r.visible.every((s) => s.plate === 'carbon')).toBe(true);
  });
  it('an empty selection constrains nothing, exactly like no selection', () => {
    const none = applyFilters(FLEET, { categorical: {}, ranges: {} }, idx).visible.length;
    expect(applyFilters(FLEET, { categorical: {}, ranges: {}, plate: [] }, idx).visible.length).toBe(none);
  });
  it('is a strictly larger set than one of its members alone', () => {
    const notCarbon = applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['none', 'plated-other'] }, idx).visible;
    const none = applyFilters(FLEET, { categorical: {}, ranges: {}, plate: ['none'] }, idx).visible;
    expect(notCarbon.length).toBeGreaterThan(none.length);
    expect(none.every((s) => notCarbon.includes(s))).toBe(true);
  });
  it('still accounts for every shoe when combined with a range', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': { min: 36 } }, plate: ['none', 'plated-other'] }, idx);
    expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
  });
});

/**
 * Set-membership on the population side: a facet moves the coverage denominator exactly as a brand
 * tick does, so it is tested before `considered` is built (docs/app.md §Filters, §Coverage).
 */
describe('categorical selections', () => {
  const gusseted = shoe({ slug: 'gusseted', values: { '39': 'both-sides-semi', '41': true } });
  const plain = shoe({ slug: 'plain', values: { '39': 'none', '41': false } });
  const unread = shoe({ slug: 'unread', values: {} });
  const FEATURES = [gusseted, plain, unread];

  it('keeps only the shoes whose reading is in the selection', () => {
    const r = applyFilters(FEATURES, { ranges: {}, categorical: { 'tongue-gusset-type': ['both-sides-semi'] } }, idx);
    expect(slugs(r)).toEqual(['gusseted']);
  });
  it('several values in one facet are alternatives', () => {
    const r = applyFilters(FEATURES, { ranges: {}, categorical: { 'tongue-gusset-type': ['both-sides-semi', 'none'] } }, idx);
    expect(slugs(r)).toEqual(['gusseted', 'plain']);
  });
  it('two facets narrow together', () => {
    const r = applyFilters(FEATURES, { ranges: {}, categorical: { 'tongue-gusset-type': ['none'], 'removable-insole': ['true'] } }, idx);
    expect(slugs(r)).toEqual([]);
  });
  it('excludes a shoe with no reading, as a brandless shoe fails a brand selection', () => {
    const r = applyFilters(FEATURES, { ranges: {}, categorical: { 'tongue-gusset-type': ['none'] } }, idx);
    expect(slugs(r)).toEqual(['plain']);
    expect(r.considered.map((s) => s.slug)).not.toContain('unread');
  });
  it('matches a bool reading by the string of its raw value', () => {
    expect(slugs(applyFilters(FEATURES, { ranges: {}, categorical: { 'removable-insole': ['true'] } }, idx))).toEqual(['gusseted']);
    expect(slugs(applyFilters(FEATURES, { ranges: {}, categorical: { 'removable-insole': ['false'] } }, idx))).toEqual(['plain']);
  });
  it('an empty record constrains nothing', () => {
    expect(slugs(applyFilters(FEATURES, { ranges: {}, categorical: {} }, idx))).toEqual(['gusseted', 'plain', 'unread']);
  });
  it('an empty selection constrains nothing, exactly like no selection', () => {
    expect(slugs(applyFilters(FEATURES, { ranges: {}, categorical: { 'tongue-gusset-type': [] } }, idx))).toEqual(['gusseted', 'plain', 'unread']);
  });
  // The one honest edge the spec states rather than hides: every option ticked is not a no-op.
  it('selecting every declared option still excludes the shoes with no reading', () => {
    const r = applyFilters(FEATURES, { ranges: {}, categorical: { 'tongue-gusset-type': ['none', 'both-sides-semi'] } }, idx);
    expect(slugs(r)).toEqual(['gusseted', 'plain']);
  });
  it('moves the coverage denominator, so a bound is measured over the selection alone', () => {
    const r = applyFilters(FEATURES, { ranges: { 'heel-stack': { min: 1 } }, categorical: { 'tongue-gusset-type': ['none'] } }, idx);
    expect(r.considered.map((s) => s.slug)).toEqual(['plain']);
    expect(r.hiddenMissing).toBe(1);
  });
  // An unknown key has no control to untick, so it must not be the thing that empties the table;
  // `parseView` is where a key naming no categorical test is dropped (docs/app.md §URL encoding).
  it('a key naming no test in the catalogue constrains nothing', () => {
    expect(slugs(applyFilters(FEATURES, { ranges: {}, categorical: { nonesuch: ['x'] } }, idx))).toHaveLength(3);
  });
});

describe('applyFilters accounting', () => {
  it('reconciles across every filter state we exercise', () => {
    const states: FilterState[] = [
      { categorical: {}, ranges: {} },
      { categorical: {}, ranges: { 'heel-stack': { min: 36 } } },
      { categorical: {}, ranges: { 'heel-stack': { min: 36 }, score: { max: 90 } } },
      { categorical: {}, ranges: { 'heel-stack': { min: 999 } }, plate: ['carbon'] },
      { categorical: {}, ranges: {}, search: 'x', discontinued: 'hide' },
    ];
    for (const f of states) {
      const r = applyFilters(FLEET, f, idx);
      expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
    }
  });
  it('considered is the population left by the non-range filters alone', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': { min: 999 } }, plate: ['carbon'] }, idx);
    expect(r.considered).toEqual(FLEET.filter((s) => s.plate === 'carbon'));
    expect(r.visible).toEqual([]);
  });
  it('counts a shoe once even when it fails several bounds', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': { min: 999 }, score: { min: 999 } } }, idx);
    // a shoe with no reading at all exits at the missing gate and is never outsideBounds
    expect(r.outsideBounds).toBe(r.considered.length - r.hiddenMissing);
  });
});

describe('applyFilters showMissing', () => {
  it('admits shoes with no reading instead of hiding them', () => {
    const bounded = { categorical: {}, ranges: { 'heel-stack': { min: 30 } } };
    const strict = applyFilters(FLEET, bounded, idx);
    const relaxed = applyFilters(FLEET, { ...bounded, showMissing: true }, idx);
    expect(strict.hiddenMissing).toBeGreaterThan(0);
    expect(relaxed.visible.length).toBe(strict.visible.length + strict.hiddenMissing);
    expect(relaxed.hiddenMissing).toBe(0);
  });
  it('still excludes shoes that have a reading and fail the bound', () => {
    const r = applyFilters(FLEET, { categorical: {}, ranges: { 'heel-stack': { min: 999 } }, showMissing: true }, idx);
    expect(r.visible.every((s) => typeof s.values['6'] !== 'number')).toBe(true);
  });
});

/**
 * The empty state names what is on screen to act on. Ordered as the sidebar orders its controls
 * (docs/app.md §Filters), so the sentence reads down the column the reader is being sent to.
 */
describe('narrowingNames', () => {
  it('names nothing when nothing is set', () => {
    expect(narrowingNames(EMPTY_FILTERS)).toEqual([]);
  });
  it.each([
    [{ search: 'x' }, 'the search'],
    [{ releasedAfter: '2099-01-01' }, 'the release-date bound'],
    [{ plate: ['carbon'] }, 'the plate selection'],
    [{ brands: ['Nonesuch'] }, 'the brand selection'],
    [{ discontinued: 'only' }, 'the discontinued filter'],
    [{ categorical: { 'heel-tab': ['pull-tab'] } }, 'the feature selection'],
    [{ categorical: {}, ranges: { weight: { min: 9000 } } }, 'the bounds'],
  ] as [Partial<FilterState>, string][])('names %j', (part, named) => {
    expect(narrowingNames({ ...EMPTY_FILTERS, ...part })).toEqual([named]);
  });
  it('ignores a range key that holds no bound, and showMissing, which widens', () => {
    expect(narrowingNames({ categorical: {}, ranges: { weight: {} }, showMissing: true })).toEqual([]);
  });
  it('ignores a facet key that holds no value', () => {
    expect(narrowingNames({ ranges: {}, categorical: { 'heel-tab': [] } })).toEqual([]);
  });
  it('names every class that is set, in sidebar order', () => {
    expect(narrowingNames({ categorical: {}, ranges: { weight: { max: 1 } }, brands: ['Nike'], search: 'x' }))
      .toEqual(['the search', 'the brand selection', 'the bounds']);
  });
  it('names the feature selection between the discontinued filter and the bounds', () => {
    expect(narrowingNames({ ranges: { weight: { max: 1 } }, discontinued: 'hide', categorical: { 'heel-tab': ['pull-tab'] } }))
      .toEqual(['the discontinued filter', 'the feature selection', 'the bounds']);
  });
});
