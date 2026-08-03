import type { TestIndex } from './dataset';
import { columnLabel } from './labels';
import { sortPhrase } from './ordering';
import { sameValue } from './urlstate';
import type { ViewState } from './view';
import { zoneOf } from './zone';

/**
 * What a control says it did, in one sentence and one voice.
 * docs/app.md §What a control says it did
 *
 * Derived from the view the control produced rather than passed down from each call site: the
 * controls live in four components and half of them reach `setView` through an `onchange` that
 * carries no notion of what was pressed, so a per-site message would be four vocabularies and a
 * prop threaded through the table. One diff is also what makes the exemptions checkable — a rule
 * this module does not implement is a control that says nothing, and the test file is the list.
 */

/** The action announcements that are not a view change at all. */
export const EXPORTED = 'CSV exported';
export const COPIED = 'Copied';

const ZONE_WORD = { heel: 'the heel', forefoot: 'the forefoot' } as const;

/** Everything in `FilterState` except the ranges, which the row rules below compare key by key. */
const nonRangeFilters = (v: ViewState) => ({ ...v.filters, ranges: undefined });

/**
 * A row appearing or disappearing in the sidebar, which at 360px is two thousand pixels down a
 * closed drawer — the one view change with no visible consequence at all on the surface the
 * control is on.
 *
 * Exactly one row, and nothing else structural: a generation switch swaps one row key for another
 * and is a choice rather than an addition, and `Clear filters` can take several rows and every
 * bound with them, where the receipt is the honest report. The row's **own** bound is allowed to
 * go with it, because removing a filter that was filtering is the ordinary case.
 */
function rowNote(prev: ViewState, next: ViewState, idx: TestIndex): string | null {
  const gained = next.rows.filter((k) => !prev.rows.includes(k));
  const lost = prev.rows.filter((k) => !next.rows.includes(k));
  if (gained.length + lost.length !== 1) return null;
  const key = gained[0] ?? lost[0]!;
  const others = (v: ViewState) => Object.keys(v.filters.ranges).filter((k) => k !== key).sort();
  if (!sameValue(others(prev), others(next))) return null;
  if (!sameValue(nonRangeFilters(prev), nonRangeFilters(next))) return null;
  const label = columnLabel(key, idx.bySlug.get(key));
  return `${gained.length ? 'Filter added' : 'Filter removed'}: ${label}`;
}

/**
 * What the app says about the view it has just been handed, or `null` where it says nothing.
 *
 * The order is a precedence, not a sequence: one action produces one sentence, so the most
 * specific true thing wins and everything else is left to the receipt. A story or `All` rewrites
 * the sort **and** the columns together, which is why the sort rule requires the columns to have
 * held still — a story's own report is the row count, and the receipt already carries it.
 */
export function viewAnnouncement(prev: ViewState, next: ViewState, idx: TestIndex): string | null {
  const zone = zoneOf(next);
  // Only onto a zone, never off one: unticking both measurement columns leaves the view naming
  // neither half, which is a column change and is exempt like every other
  // (docs/app.md §What a control says it did).
  if (zone !== null && zone !== zoneOf(prev)) {
    return `Measured at ${ZONE_WORD[zone]}: columns and scores updated`;
  }
  if (prev.stability !== next.stability) {
    return `Stability ${next.stability ? 'on' : 'off'}: story scores updated`;
  }
  const row = rowNote(prev, next, idx);
  if (row) return row;
  if (!sameValue(prev.sort, next.sort) && sameValue(prev.columns, next.columns)) {
    return `Sorted by ${sortPhrase(next.sort, idx)}`;
  }
  return null;
}
