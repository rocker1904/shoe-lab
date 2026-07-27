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
  it('plate filter: none/carbon exact, plated = any plate', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, plate: 'carbon' }, idx))).toEqual(['racer']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, plate: 'plated' }, idx))).toEqual(['racer', 'trainer']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, plate: 'none' }, idx))).toEqual(['cushy', 'oldie', 'mystery']);
  });
  it('releasedAfter excludes older and unknown dates', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, releasedAfter: '2025-01-01' }, idx))).toEqual(['cushy', 'racer']);
  });
  it('brand, search, discontinued filters', () => {
    expect(slugs(applyFilters(FLEET, { ranges: {}, brands: ['Other'] }, idx))).toEqual(['oldie']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, search: 'RAC' }, idx))).toEqual(['racer']);
    expect(slugs(applyFilters(FLEET, { ranges: {}, hideDiscontinued: true }, idx))).not.toContain('oldie');
  });
  it('filters combine with AND semantics', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 35 } }, plate: 'none', releasedAfter: '2025-01-01' }, idx);
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

describe('applyFilters accounting', () => {
  it('reconciles across every filter state we exercise', () => {
    const states: FilterState[] = [
      { ranges: {} },
      { ranges: { 'heel-stack': { min: 36 } } },
      { ranges: { 'heel-stack': { min: 36 }, score: { max: 90 } } },
      { ranges: { 'heel-stack': { min: 999 } }, plate: 'carbon' },
      { ranges: {}, search: 'x', hideDiscontinued: true },
    ];
    for (const f of states) {
      const r = applyFilters(FLEET, f, idx);
      expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
    }
  });
  it('considered is the population left by the non-range filters alone', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 } }, plate: 'carbon' }, idx);
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
