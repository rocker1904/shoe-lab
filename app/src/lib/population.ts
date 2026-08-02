import type { Shoe } from '../../../shared/types.js';
import { facetValues, isCategorical } from './categorical';
import type { TestIndex } from './dataset';
import { applyFilters, type FilterState } from './filters';

/**
 * Everything a `FilterState` carries except its ranges, as a value. Ranges are left out because
 * they cannot move `considered` — that is the whole basis of the coverage denominator
 * (docs/app.md §Coverage) — and they are the one field a dragged grip rewrites per frame.
 *
 * Built from the object's own entries rather than a written-out list, so a field added to
 * `FilterState` joins the key instead of being silently ignored, and sorted because two views
 * carrying the same filters need not have built them in the same order. Undefined is dropped so an
 * explicitly-cleared field keys the same as an absent one.
 */
export function populationKey(f: FilterState): string {
  const entries = Object.entries(f).filter(([k, v]) => k !== 'ranges' && v !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify(entries);
}

/**
 * Reads `considered` — the population the sidebar's coverage headings and the brand facet count
 * over — and keeps the answer's IDENTITY for as long as its membership cannot have changed. A
 * `$derived` propagates on `!==`, so a fresh array per frame restarts every fleet-wide pass hanging
 * off it although a drag moves only the ranges (docs/app.md §What a drag may recompute).
 *
 * One entry, and one reader per call site: the sidebar's population and the brand facet's differ by
 * a filter, so a shared cache would evict on every call and hold nothing.
 */
export function stableConsidered(): (shoes: Shoe[], f: FilterState, idx: TestIndex) => Shoe[] {
  let last: { shoes: Shoe[]; key: string; considered: Shoe[] } | undefined;
  return (shoes, f, idx) => {
    const key = populationKey(f);
    if (last && last.shoes === shoes && last.key === key) return last.considered;
    const { considered } = applyFilters(shoes, f, idx);
    last = { shoes, key, considered };
    return considered;
  };
}

/**
 * The brand facet's counts, held to the same identity rule as the population they are taken over.
 * A range cannot move them either, and there is one figure per brand — sixty-odd passes a frame if
 * they are rebuilt (docs/app.md §What a drag may recompute).
 *
 * Three separate decisions, each argued in docs/app.md §Filters and none of them safe to simplify:
 * the count is over the population with the brand filter itself REMOVED (a facet must not filter
 * itself), the key set is seeded from the whole FLEET (so a brand matching nothing still shows its
 * zero), and from the SELECTION too (so a link naming a brand the catalogue has since dropped still
 * has a control to untick). Seeding the map at zero is what stops the last two colliding, and what
 * makes this one walk of the pool rather than one per brand.
 */
export function stableBrandCounts(): (shoes: Shoe[], f: FilterState, idx: TestIndex) => Map<string, number> {
  const poolOf = stableConsidered();
  let last: { pool: Shoe[]; selected: string; counts: Map<string, number> } | undefined;
  return (shoes, f, idx) => {
    const pool = poolOf(shoes, { ...f, brands: undefined }, idx);
    // The pool key drops `brands`, so the selection is keyed here — and as a value rather than a
    // join, or one brand with a space in its name keys the same as two brands.
    const selected = JSON.stringify(f.brands ?? []);
    if (last && last.pool === pool && last.selected === selected) return last.counts;
    const counts = new Map<string, number>();
    for (const b of shoes) if (b.brand) counts.set(b.brand, 0);
    for (const b of f.brands ?? []) if (!counts.has(b)) counts.set(b, 0);
    // The pool is a subset of the fleet every brand was just seeded from, so the entry is there.
    for (const s of pool) if (s.brand) counts.set(s.brand, counts.get(s.brand)! + 1);
    last = { pool, selected, counts };
    return counts;
  };
}

/**
 * One facet's counts, holding the brand facet's three decisions over a categorical test: the pool is
 * the population with THIS ONE facet removed and every other filter — other facets included — still
 * narrowing it (a facet must not filter itself), the key set is seeded from the catalogue's declared
 * options (so a value no shoe carries shows its zero rather than vanishing), and from the SELECTION
 * too (so a link carrying a value the catalogue has since dropped still has a row to untick).
 * Seeding at zero is what stops those two colliding, and what makes this one walk of the pool.
 *
 * A reading the catalogue no longer declares still gets a row, as it still gets a cell: a value that
 * exists must be countable, or the figures under a checklist would not add up to the table.
 *
 * One closure per facet, for the reason there is one per call site: two facets count over pools that
 * differ by a filter, so a shared cache would evict on every call and hold nothing. The identity
 * rule is the population's — a moving range cannot change any of these numbers
 * (docs/app.md §What a drag may recompute).
 */
export function stableFacetCounts(slug: string): (shoes: Shoe[], f: FilterState, idx: TestIndex) => Map<string, number> {
  const poolOf = stableConsidered();
  let last: { pool: Shoe[]; selected: string; counts: Map<string, number> } | undefined;
  return (shoes, f, idx) => {
    const { [slug]: mine, ...others } = f.categorical;
    const pool = poolOf(shoes, { ...f, categorical: others }, idx);
    // The pool key drops this facet, so its selection is keyed here — as a value rather than a join,
    // or one value carrying the separator keys the same as two values.
    const selected = JSON.stringify(mine ?? []);
    if (last && last.pool === pool && last.selected === selected) return last.counts;
    const test = idx.bySlug.get(slug);
    const counts = new Map<string, number>();
    if (test) for (const { value } of facetValues(test)) counts.set(value, 0);
    for (const v of mine ?? []) if (!counts.has(v)) counts.set(v, 0);
    if (test && isCategorical(test)) {
      const id = String(test.id);
      for (const s of pool) {
        const raw = s.values[id];
        if (raw === undefined) continue;
        const key = String(raw);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    last = { pool, selected, counts };
    return counts;
  };
}
