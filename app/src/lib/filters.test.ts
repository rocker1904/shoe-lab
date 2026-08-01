import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { applyFilters, EMPTY_FILTERS, type FilterState } from './filters';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);
const slugs = (r: { visible: { slug: string }[] }) => r.visible.map((s) => s.slug);

describe('applyFilters', () => {
  it('empty filters pass everything', () => {
    expect(slugs(applyFilters(FLEET, EMPTY_FILTERS, idx))).toHaveLength(5);
  });
  it('range min/max inclusive at boundaries; missing values hidden and counted', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 35, max: 40 } } }, idx);
    expect(slugs(r)).toEqual(['cushy', 'racer', 'trainer']);
    expect(r.hiddenMissing).toBe(1); // mystery has no heel-stack
  });
  it('open-ended ranges work', () => {
    expect(slugs(applyFilters(FLEET, { ranges: { 'energy-return-heel': { min: 70 } } }, idx))).toEqual(['cushy', 'racer']);
    expect(slugs(applyFilters(FLEET, { ranges: { msrpGbp: { max: 150 } } }, idx))).toEqual(['cushy', 'trainer', 'oldie']);
  });
  it('plate filter matches the selected values exactly', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, plate: ['carbon'] }, idx))).toEqual(['racer']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, plate: ['carbon', 'plated-other'] }, idx))).toEqual(['racer', 'trainer']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, plate: ['none'] }, idx))).toEqual(['cushy', 'oldie', 'mystery']);
  });
  it('releasedAfter excludes older and unknown dates', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, releasedAfter: '2025-01-01' }, idx))).toEqual(['cushy', 'racer']);
  });
  it('counts an undated shoe a date bound hides, rather than dropping it silently', () => {
    // `mystery` has no release date at all, so no bound can show it to qualify — but the receipt
    // has to be able to say so (docs/app.md §Filters).
    const r = applyFilters(FLEET, { ranges: {}, releasedAfter: '2025-01-01' }, idx);
    expect(r.undatedHidden).toBe(1);
    expect(r.considered.map((s) => s.slug)).not.toContain('mystery');
  });
  it('counts no undated shoes when there is no date bound to hide them', () => {
    expect(applyFilters(FLEET, { ranges: {} }, idx).undatedHidden).toBe(0);
  });
  it('brand, search, discontinued filters', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, brands: ['Other'] }, idx))).toEqual(['oldie']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, search: 'RAC' }, idx))).toEqual(['racer']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, discontinued: 'hide' }, idx))).not.toContain('oldie');
  });
  it('filters combine with AND semantics', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 35 } }, plate: ['none'], releasedAfter: '2025-01-01' }, idx);
    expect(slugs(r)).toEqual(['cushy']);
  });
});

describe('applyFilters edge cases', () => {
  const ranges = { 'heel-stack': { min: 1 }, 'energy-return-heel': { min: 1 }, 'midsole-softness-22': { min: 1 } };

  it('counts a shoe missing several filtered metrics only once', () => {
    const r = applyFilters(FLEET, { ranges }, idx);
    expect(slugs(r)).toEqual(['cushy', 'racer', 'trainer']);
    expect(r.hiddenMissing).toBe(2); // oldie (no softness) and mystery (nothing), once each
  });
  it('counts missing values independently of range key order', () => {
    // oldie fails heel-stack on value AND has no midsole-softness reading: missing wins either way.
    const missFirst = applyFilters([FLEET[3]!], { ranges: { 'midsole-softness-22': { min: 1 }, 'heel-stack': { min: 35 } } }, idx);
    const failFirst = applyFilters([FLEET[3]!], { ranges: { 'heel-stack': { min: 35 }, 'midsole-softness-22': { min: 1 } } }, idx);
    expect(missFirst.visible).toEqual([]);
    expect(failFirst.visible).toEqual([]);
    expect(failFirst.hiddenMissing).toBe(missFirst.hiddenMissing);
    expect(missFirst.hiddenMissing).toBe(1);
  });
  it('empty range bounds are not a filter and hide nothing', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': {}, 'midsole-softness-22': {} } }, idx);
    expect(slugs(r)).toHaveLength(5);
    expect(r.hiddenMissing).toBe(0);
  });
  it('does not count shoes excluded by non-range filters as hiddenMissing', () => {
    const r = applyFilters(FLEET, { ranges, search: 'cushy' }, idx);
    expect(slugs(r)).toEqual(['cushy']);
    expect(r.hiddenMissing).toBe(0);
  });
  it('releasedAfter includes shoes released exactly on the boundary date', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, releasedAfter: '2026-01-01' }, idx))).toEqual(['racer']);
  });
  it('an empty brands list is not a filter', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, brands: [] }, idx))).toHaveLength(5);
  });
  it('brand filter excludes shoes with no brand', () => {
    const anon = shoe({ slug: 'anon', brand: null });
    expect(slugs(applyFilters([anon, FLEET[0]!], { ranges: {}, brands: ['Brand'] }, idx))).toEqual(['cushy']);
  });
  it('search matches a substring of the display name, not the slug', () => {
    const nike = shoe({ slug: 'nike-vaporfly-3', name: 'Nike Vaporfly 3' });
    expect(slugs(applyFilters([nike, FLEET[0]!], { ranges: {}, search: 'vapor' }, idx))).toEqual(['nike-vaporfly-3']);
    expect(slugs(applyFilters([nike], { ranges: {}, search: '' }, idx))).toEqual(['nike-vaporfly-3']); // blank search is inert
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
    expect(slugs(applyFilters([on, FLEET[0]!], { ranges: {}, search: 'On' }, idx))).toEqual(['cloud-x']);
    expect(slugs(applyFilters([on], { ranges: {}, search: 'topo' }, idx))).toEqual([]);
  });
  it('search survives a shoe carrying no brand at all', () => {
    const anon = shoe({ slug: 'anon', name: 'Anon Runner', brand: null });
    expect(slugs(applyFilters([anon], { ranges: {}, search: 'runner' }, idx))).toEqual(['anon']);
    expect(slugs(applyFilters([anon], { ranges: {}, search: 'nike' }, idx))).toEqual([]);
  });
  it('ranging a non-numeric test hides the whole fleet', () => {
    const r = applyFilters(FLEET, { ranges: { 'tongue-gusset-type': { min: 0 } } }, idx);
    expect(r.visible).toEqual([]);
    expect(r.hiddenMissing).toBe(5);
  });
  it('preserves input order and does not mutate the input', () => {
    const input = [...FLEET];
    const r = applyFilters(input, { ranges: { 'heel-stack': { min: 30 } } }, idx);
    expect(slugs(r)).toEqual(['cushy', 'racer', 'trainer', 'oldie']);
    expect(input.map((s) => s.slug)).toEqual(FLEET.map((s) => s.slug));
  });
});

describe('discontinued is three-valued', () => {
  it('hide excludes every discontinued shoe', () => {
    const r = applyFilters(FLEET, { ranges: {}, discontinued: 'hide' }, idx);
    expect(r.visible.length).toBe(FLEET.length - 1);
    expect(r.visible.every((s) => !s.discontinued)).toBe(true);
  });
  it('only returns exactly the discontinued shoes', () => {
    const r = applyFilters(FLEET, { ranges: {}, discontinued: 'only' }, idx);
    expect(slugs(r)).toEqual(['oldie']);                  // non-empty, so every() below is not vacuous
    expect(r.visible.every((s) => s.discontinued)).toBe(true);
  });
  it('absent returns both', () => {
    const r = applyFilters(FLEET, { ranges: {} }, idx);
    expect(r.visible.some((s) => s.discontinued)).toBe(true);
    expect(r.visible.some((s) => !s.discontinued)).toBe(true);
  });
});

describe('plate as a set', () => {
  it('keeps only the selected plate values', () => {
    const r = applyFilters(FLEET, { ranges: {}, plate: ['none', 'plated-other'] }, idx);
    expect(r.visible.length).toBeGreaterThan(0);          // an empty result would make every() vacuous
    expect(r.visible.map((s) => s.plate)).not.toContain('carbon');
    expect(r.visible.some((s) => s.plate === 'plated-other')).toBe(true);
  });
  it('a single selection is an exact match', () => {
    const r = applyFilters(FLEET, { ranges: {}, plate: ['carbon'] }, idx);
    expect(r.visible.length).toBeGreaterThan(0);
    expect(r.visible.every((s) => s.plate === 'carbon')).toBe(true);
  });
  it('an empty selection constrains nothing, exactly like no selection', () => {
    const none = applyFilters(FLEET, { ranges: {} }, idx).visible.length;
    expect(applyFilters(FLEET, { ranges: {}, plate: [] }, idx).visible.length).toBe(none);
  });
  it('is a strictly larger set than one of its members alone', () => {
    const notCarbon = applyFilters(FLEET, { ranges: {}, plate: ['none', 'plated-other'] }, idx).visible;
    const none = applyFilters(FLEET, { ranges: {}, plate: ['none'] }, idx).visible;
    expect(notCarbon.length).toBeGreaterThan(none.length);
    expect(none.every((s) => notCarbon.includes(s))).toBe(true);
  });
  it('still accounts for every shoe when combined with a range', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 36 } }, plate: ['none', 'plated-other'] }, idx);
    expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
  });
});

describe('applyFilters accounting', () => {
  it('reconciles across every filter state we exercise', () => {
    const states: FilterState[] = [
      { ranges: {} },
      { ranges: { 'heel-stack': { min: 36 } } },
      { ranges: { 'heel-stack': { min: 36 }, score: { max: 90 } } },
      { ranges: { 'heel-stack': { min: 999 } }, plate: ['carbon'] },
      { ranges: {}, search: 'x', discontinued: 'hide' },
    ];
    for (const f of states) {
      const r = applyFilters(FLEET, f, idx);
      expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
    }
  });
  it('considered is the population left by the non-range filters alone', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 } }, plate: ['carbon'] }, idx);
    expect(r.considered).toEqual(FLEET.filter((s) => s.plate === 'carbon'));
    expect(r.visible).toEqual([]);
  });
  it('counts a shoe once even when it fails several bounds', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 }, score: { min: 999 } } }, idx);
    // a shoe with no reading at all exits at the missing gate and is never outsideBounds
    expect(r.outsideBounds).toBe(r.considered.length - r.hiddenMissing);
  });
});

describe('applyFilters showMissing', () => {
  it('admits shoes with no reading instead of hiding them', () => {
    const bounded = { ranges: { 'heel-stack': { min: 30 } } };
    const strict = applyFilters(FLEET, bounded, idx);
    const relaxed = applyFilters(FLEET, { ...bounded, showMissing: true }, idx);
    expect(strict.hiddenMissing).toBeGreaterThan(0);
    expect(relaxed.visible.length).toBe(strict.visible.length + strict.hiddenMissing);
    expect(relaxed.hiddenMissing).toBe(0);
  });
  it('still excludes shoes that have a reading and fail the bound', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 } }, showMissing: true }, idx);
    expect(r.visible.every((s) => typeof s.values['6'] !== 'number')).toBe(true);
  });
});
