import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { applyFilters, EMPTY_FILTERS, type FilterState } from './filters';
import { stableBrandCounts, stableConsidered, stableFacetCounts } from './population';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);

describe('stableConsidered', () => {
  it('is the same population applyFilters reports as considered', () => {
    const read = stableConsidered();
    const f: FilterState = { categorical: {}, ranges: { weight: { max: 250 } }, plate: ['carbon'] };
    expect(read(FLEET, f, idx)).toEqual(applyFilters(FLEET, f, idx).considered);
  });

  it('keeps its identity across a range-bound change', () => {
    const read = stableConsidered();
    const first = read(FLEET, { ...EMPTY_FILTERS, ranges: { weight: { max: 260 } } }, idx);
    // What a dragged grip does, sixty times a second: a new bound in a rebuilt filter object.
    const second = read(FLEET, { ...EMPTY_FILTERS, ranges: { weight: { max: 250 } } }, idx);
    const third = read(FLEET, { ...EMPTY_FILTERS, ranges: { weight: { max: 250 }, drop: { min: 4 } } }, idx);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('keeps its identity when the filters are rebuilt with the same values', () => {
    const read = stableConsidered();
    const first = read(FLEET, { categorical: {}, ranges: {}, brands: ['Alpha'], plate: ['carbon'], search: 'cushy' }, idx);
    const second = read(FLEET, { categorical: {}, ranges: {}, brands: ['Alpha'], plate: ['carbon'], search: 'cushy' }, idx);
    expect(second).toBe(first);
  });

  it('rebuilds when a non-range filter moves, in either direction', () => {
    const read = stableConsidered();
    const all = read(FLEET, EMPTY_FILTERS, idx);
    const carbon = read(FLEET, { categorical: {}, ranges: {}, plate: ['carbon'] }, idx);
    expect(carbon).not.toBe(all);
    expect(carbon).toEqual(FLEET.filter((s) => s.plate === 'carbon'));
    const back = read(FLEET, EMPTY_FILTERS, idx);
    expect(back).toEqual(all);
  });

  it('rebuilds for a different fleet, so a reloaded dataset is never answered from the old one', () => {
    const read = stableConsidered();
    const first = read(FLEET, EMPTY_FILTERS, idx);
    const half = FLEET.slice(0, 2);
    expect(read(half, EMPTY_FILTERS, idx)).toEqual(half);
    expect(read(FLEET, EMPTY_FILTERS, idx)).not.toBe(first);
  });

  it('gives each reader its own answer, so two populations do not evict each other', () => {
    const mine = stableConsidered();
    const yours = stableConsidered();
    const a = mine(FLEET, { categorical: {}, ranges: {}, plate: ['carbon'] }, idx);
    const b = yours(FLEET, EMPTY_FILTERS, idx);
    expect(mine(FLEET, { categorical: {}, ranges: { weight: { max: 250 } }, plate: ['carbon'] }, idx)).toBe(a);
    expect(yours(FLEET, { categorical: {}, ranges: { weight: { max: 250 } } }, idx)).toBe(b);
  });
});

/**
 * The brand facet's three seeded-map decisions, taken over a facet instead: the pool drops this one
 * facet and nothing else, the declared options seed the keys, and so does the selection.
 */
describe('stableFacetCounts', () => {
  const GUSSET = 'tongue-gusset-type';
  // Readings on 39 and 40, so one facet can be shown to filter the other's pool.
  const a = shoe({ slug: 'a', values: { '39': 'both-sides-semi', '40': 'pull-tab' } });
  const b = shoe({ slug: 'b', values: { '39': 'none', '40': 'pull-tab' } });
  const c = shoe({ slug: 'c', brand: 'Other', values: { '39': 'both-sides-semi', '40': 'none' } });
  const unread = shoe({ slug: 'unread', values: {} });
  const FEATURED = [a, b, c, unread];

  it('counts the population with that one facet removed', () => {
    const counts = stableFacetCounts(GUSSET)(FEATURED, { ranges: {}, categorical: { [GUSSET]: ['both-sides-semi'] } }, idx);
    // A facet that filtered itself would report every unticked value at zero.
    expect(counts.get('both-sides-semi')).toBe(2);
    expect(counts.get('none')).toBe(1);
  });

  it('lets another facet filter the pool it counts over', () => {
    const counts = stableFacetCounts(GUSSET)(FEATURED, { ranges: {}, categorical: { 'heel-tab': ['pull-tab'] } }, idx);
    expect(counts.get('both-sides-semi')).toBe(1);   // a only: c is not a pull tab
    expect(counts.get('none')).toBe(1);
  });

  it('lets every other filter narrow it too, brand included', () => {
    const counts = stableFacetCounts(GUSSET)(FEATURED, { ranges: {}, categorical: {}, brands: ['Other'] }, idx);
    expect(counts.get('both-sides-semi')).toBe(1);
    expect(counts.get('none')).toBe(0);
  });

  it('seeds every declared option, so a value matching nothing shows its zero', () => {
    const counts = stableFacetCounts('heel-tab')([a, b], { ranges: {}, categorical: {} }, idx);
    expect(counts.get('pull-tab')).toBe(2);
    expect(counts.get('none')).toBe(0);              // declared, carried by no shoe here
  });

  it('seeds the selection too, so a value the catalogue has dropped keeps its row', () => {
    const counts = stableFacetCounts(GUSSET)(FEATURED, { ranges: {}, categorical: { [GUSSET]: ['bootie'] } }, idx);
    expect(counts.has('bootie')).toBe(true);
    expect(counts.get('bootie')).toBe(0);
  });

  // An upstream addition reads as itself rather than going missing, as it does in a cell
  // (docs/app.md §Categorical columns).
  it('gives a reading the catalogue does not declare a row of its own', () => {
    const odd = shoe({ slug: 'odd', values: { '39': 'sock-like' } });
    const counts = stableFacetCounts(GUSSET)([...FEATURED, odd], { ranges: {}, categorical: {} }, idx);
    expect(counts.get('sock-like')).toBe(1);
  });

  // Seeded from the whole fleet, like brand's: a row that appeared and vanished as the pool moved
  // would reflow the checklist under the reader's hand.
  it('holds an undeclared reading at a stable zero when another filter empties it from the pool', () => {
    const odd = shoe({ slug: 'odd', values: { '39': 'sock-like' } });
    const counts = stableFacetCounts(GUSSET)([...FEATURED, odd], { ranges: {}, categorical: {}, brands: ['Other'] }, idx);
    expect(counts.has('sock-like')).toBe(true);
    expect(counts.get('sock-like')).toBe(0);
  });

  it('mints no key in the pool walk: the rows are the declared, the fleet\'s and the selection', () => {
    const odd = shoe({ slug: 'odd', values: { '39': 'sock-like' } });
    const counts = stableFacetCounts(GUSSET)([...FEATURED, odd],
      { ranges: {}, categorical: { [GUSSET]: ['bootie'] }, brands: ['Other'] }, idx);
    expect([...counts.keys()].sort()).toEqual(['bootie', 'both-sides-semi', 'none', 'sock-like']);
  });

  // The same door `applyFilters` and `facetValues` use: a slug the `plate` field owns, or a numeric
  // test, is not a facet, so it has no rows and reads no shoe.
  it('has nothing to count for a slug that is not a categorical test', () => {
    for (const slug of ['plate', 'heel-stack', 'nonesuch']) {
      const counts = stableFacetCounts(slug)(FEATURED, { ranges: {}, categorical: {} }, idx);
      expect([...counts.keys()], slug).toEqual([]);
    }
  });

  it('counts no shoe that has no reading at all', () => {
    const counts = stableFacetCounts(GUSSET)(FEATURED, { ranges: {}, categorical: {} }, idx);
    expect([...counts.values()].reduce((x, y) => x + y, 0)).toBe(FEATURED.length - 1);
  });

  it('keeps its identity across a range-bound change', () => {
    const read = stableFacetCounts(GUSSET);
    const first = read(FEATURED, { ranges: { weight: { max: 260 } }, categorical: { [GUSSET]: ['none'] } }, idx);
    expect(read(FEATURED, { ranges: { weight: { max: 250 } }, categorical: { [GUSSET]: ['none'] } }, idx)).toBe(first);
  });

  it('rebuilds when its own selection moves, or another filter does', () => {
    const read = stableFacetCounts(GUSSET);
    const first = read(FEATURED, { ranges: {}, categorical: {} }, idx);
    expect(read(FEATURED, { ranges: {}, categorical: { [GUSSET]: ['none'] } }, idx)).not.toBe(first);
    expect(read(FEATURED, { ranges: {}, categorical: { 'heel-tab': ['pull-tab'] } }, idx)).not.toBe(first);
    expect(read(FEATURED, { ranges: {}, categorical: {}, brands: ['Other'] }, idx)).not.toBe(first);
  });

  it('gives each facet its own reader, so two facets do not evict each other', () => {
    const gusset = stableFacetCounts(GUSSET);
    const tab = stableFacetCounts('heel-tab');
    const g = gusset(FEATURED, { ranges: {}, categorical: {} }, idx);
    const t = tab(FEATURED, { ranges: {}, categorical: {} }, idx);
    expect(gusset(FEATURED, { ranges: { weight: { max: 250 } }, categorical: {} }, idx)).toBe(g);
    expect(tab(FEATURED, { ranges: { weight: { max: 250 } }, categorical: {} }, idx)).toBe(t);
  });
});

describe('stableBrandCounts', () => {
  it('counts the population with the brand filter itself removed', () => {
    const counts = stableBrandCounts()(FLEET, { categorical: {}, ranges: {}, brands: ['Other'] }, idx);
    // A facet that filtered itself would report every unselected brand at zero.
    expect(counts.get('Brand')).toBe(FLEET.filter((s) => s.brand === 'Brand').length);
    expect(counts.get('Other')).toBe(1);
  });

  it('offers a brand the catalogue no longer carries, so a link can untick it', () => {
    const counts = stableBrandCounts()(FLEET, { categorical: {}, ranges: {}, brands: ['Gone'] }, idx);
    expect(counts.get('Gone')).toBe(0);
  });

  it('keeps its identity across a range-bound change', () => {
    const read = stableBrandCounts();
    const first = read(FLEET, { categorical: {}, ranges: { weight: { max: 260 } } }, idx);
    expect(read(FLEET, { categorical: {}, ranges: { weight: { max: 250 } } }, idx)).toBe(first);
  });

  it('rebuilds when the selection or another filter moves', () => {
    const read = stableBrandCounts();
    const first = read(FLEET, { categorical: {}, ranges: {} }, idx);
    expect(read(FLEET, { categorical: {}, ranges: {}, brands: ['Other'] }, idx)).not.toBe(first);
    expect(read(FLEET, { categorical: {}, ranges: {}, brands: ['Other'], plate: ['carbon'] }, idx)).not.toBe(first);
  });
});
