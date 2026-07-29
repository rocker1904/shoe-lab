import type { Shoe } from '../../../shared/types.js';
import type { TestIndex } from './dataset';
import { applyFilters, type FilterState } from './filters';

/**
 * Leave-one-out, so it is order-independent and conditioned on the rest of the filter set: with a
 * £60 ceiling already set, each other bound's number answers "of the shoes under £60, how many did
 * this cost me". Run under the live `showMissing`, because a bound also excludes shoes with no
 * reading for that metric — with the flag off those come back when it is cleared, and with it on
 * they were never hidden.
 *
 * The counts overlap: a shoe failing two bounds is counted by both, so they must never be totalled
 * and this is deliberately not the receipt's "outside your bounds" (docs/app.md §Filters).
 */
export function excludedBy(shoes: Shoe[], f: FilterState, key: string, idx: TestIndex): number {
  const ranges = { ...f.ranges };
  delete ranges[key];
  return applyFilters(shoes, { ...f, ranges }, idx).visible.length
       - applyFilters(shoes, f, idx).visible.length;
}
