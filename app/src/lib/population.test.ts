import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { applyFilters, EMPTY_FILTERS, type FilterState } from './filters';
import { stableBrandCounts, stableConsidered } from './population';
import { FLEET, TESTS } from './test-fixtures';

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
