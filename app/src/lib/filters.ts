import type { Plate, Shoe } from '../../../shared/types.js';
import { isCategorical } from './categorical';
import { numericValue, type TestIndex } from './dataset';

export interface RangeBound { min?: number; max?: number }
export interface FilterState {
  ranges: Record<string, RangeBound>;
  /** Test slug to selected raw readings — option slugs, `'true'`/`'false'` for a bool. Required and
   *  `{}` when empty, like `ranges`, so the compiler finds every site that builds one; a selection
   *  that empties deletes its key, or `isDefaultView` never returns true again (docs/app.md §Filters). */
  categorical: Record<string, string[]>;
  /** The real values a shoe can carry. Empty or absent constrains nothing (docs/app.md §Filters). */
  plate?: Plate[];
  releasedAfter?: string;
  brands?: string[];
  search?: string;
  /** Absent means both, which a boolean could not express (docs/app.md §Filters). */
  discontinued?: 'hide' | 'only';
  /** Admit shoes with no reading for an active range rather than hiding them. Lives here because
   *  `applyFilters` receives a FilterState and nothing else (docs/app.md §Filters). */
  showMissing?: boolean;
}
export const EMPTY_FILTERS: FilterState = { ranges: {}, categorical: {} };
/** `considered` is the denominator every other count reconciles against, and what coverage measures over. */
export interface FilterResult {
  visible: Shoe[]; considered: Shoe[]; outsideBounds: number; hiddenMissing: number;
  /** Shoes an active date bound dropped for having no release date at all, rather than for being
   *  too old. Counted separately because absence is not a failed bound (docs/app.md §Filters). */
  undatedHidden: number;
}

/** A range key with neither side set is a row on screen, not a constraint (docs/app.md §Filters). */
export const hasBound = (f: FilterState): boolean =>
  Object.values(f.ranges).some((b) => b.min !== undefined || b.max !== undefined);

/**
 * The filter classes narrowing the fleet right now, named as the empty state names them and
 * ordered as the sidebar orders its controls, so the sentence reads down the column it is sending
 * the reader to (docs/app.md §Filters).
 *
 * Derived rather than assumed, because the empty state was one sentence written for a range bound
 * and rendered for every cause: a link emptied by a brand advised clearing a bound one line under
 * a receipt reporting none. `showMissing` is absent on purpose — it widens.
 */
export function narrowingNames(f: FilterState): string[] {
  const names: string[] = [];
  if (f.search) names.push('the search');
  if (f.releasedAfter) names.push('the release-date bound');
  if (f.plate?.length) names.push('the plate selection');
  if (f.brands?.length) names.push('the brand selection');
  if (f.discontinued) names.push('the discontinued filter');
  if (Object.values(f.categorical).some((values) => values.length)) names.push('the feature selection');
  if (hasBound(f)) names.push('the bounds');
  return names;
}

export function applyFilters(shoes: Shoe[], f: FilterState, idx: TestIndex): FilterResult {
  const visible: Shoe[] = [];
  const considered: Shoe[] = [];
  let outsideBounds = 0;
  let hiddenMissing = 0;
  let undatedHidden = 0;
  const search = f.search?.toLowerCase();
  const active = Object.entries(f.ranges).filter(([, b]) => b.min !== undefined || b.max !== undefined);
  // Resolved to test ids once, because that is how a reading is keyed. `isCategorical` is the door
  // every other reader of these readings goes through, so a numeric test cannot be ticked and the
  // lab test whose slug the `plate` field owns cannot answer here either
  // (docs/app.md §Categorical columns). A key it refuses is dropped rather than failing every shoe:
  // such a key has no control to untick, so it must not be what empties the table — `parseView` is
  // the strict door (docs/app.md §URL encoding).
  const facets: { id: string; values: string[] }[] = [];
  for (const [key, values] of Object.entries(f.categorical)) {
    const test = idx.bySlug.get(key);
    if (test && values.length && isCategorical(test)) facets.push({ id: String(test.id), values });
  }
  outer: for (const s of shoes) {
    if (f.discontinued && s.discontinued !== (f.discontinued === 'only')) continue;
    // Name OR brand. The brand half is not redundant with the name: 442 of 450 names already begin
    // with their brand, and it is the eight that shorten it — Topo, Hylo, On — where a box reading
    // `name` alone disagreed with the facet one control below it, by 4x on `On`
    // (docs/app.md §Filters).
    if (search && !s.name.toLowerCase().includes(search)
      && !(s.brand ?? '').toLowerCase().includes(search)) continue;
    if (f.brands?.length && !f.brands.includes(s.brand ?? '')) continue;
    if (f.plate?.length && !f.plate.includes(s.plate)) continue;
    // Membership, beside brand and plate rather than beside the bounds: a facet moves the coverage
    // denominator exactly as a brand tick does, and a shoe with no reading fails an active selection
    // as a brandless shoe fails a brand selection (docs/app.md §Filters, §Coverage).
    // Absence is tested before the string, or a link carrying the literal `undefined` would select
    // exactly the shoes that have no reading.
    if (facets.some(({ id, values }) => {
      const raw = s.values[id];
      return raw === undefined || !values.includes(String(raw));
    })) continue;
    if (f.releasedAfter) {
      // An undated shoe cannot be shown to qualify, so it stays hidden — but it is counted, or the
      // receipt would report it as excluded by a bound it was never measured against.
      if (!s.releasedAt) { undatedHidden++; continue; }
      if (s.releasedAt < f.releasedAfter) continue;
    }
    considered.push(s);
    // Missing-ness is settled across every active range before any bound is applied (docs/app.md §Filters).
    const readings: { bound: RangeBound; v: number }[] = [];
    for (const [key, bound] of active) {
      const v = numericValue(s, key, idx);
      if (v === undefined) {
        if (f.showMissing) continue;
        hiddenMissing++;
        continue outer;
      }
      readings.push({ bound, v });
    }
    const outOfRange = readings.some(({ bound, v }) =>
      (bound.min !== undefined && v < bound.min) || (bound.max !== undefined && v > bound.max));
    if (outOfRange) { outsideBounds++; continue; }
    visible.push(s);
  }
  return { visible, considered, outsideBounds, hiddenMissing, undatedHidden };
}
