import { EMPTY_FILTERS, type FilterState } from './filters';
import type { SortState } from './sort';
import { zoneKey, type Zone } from './lineage';

export interface ViewState {
  filters: FilterState; sort: SortState; columns: string[];
  /** Chosen generation of each superseded pair, keyed by the **current** generation's slug. A
   *  choice equal to its key is the default and never serialises (docs/app.md §URL encoding). */
  generations: Record<string, string>;
  /** Non-curated range rows the runner asked to see, independently of whether they hold a bound.
   *  Deriving this from the bound keys is what would make clearing and removing the same action
   *  however they were labelled (docs/app.md §Filters). */
  rows: string[];
  /** Whether the Easy score counts its two stability terms. A property of the runner rather than of
   *  the search, so it survives a story click and a Clear, exactly as the zone does — which is why
   *  `applyPreset` and `allView` carry it through rather than rebuilding it (docs/app.md §Presets). */
  stability: boolean;
}

export const DEFAULT_SORT: SortState = { key: 'score', dir: 'desc' };
/** The arbitrary half, named here and nowhere else. It is not a silent assumption: the toolbar
 *  renders Heel as marked on this view, because the mark is derived from it
 *  (docs/app.md §The zone is a preset too). */
export const DEFAULT_ZONE: Zone = 'heel';
/** The zone is required rather than defaulted: a default would put a second answer to "which half"
 *  beside `DEFAULT_ZONE`, at whichever call site forgot to pass one.
 *
 *  Six numeric columns, because `releasedAt` and `plate` render as metadata rather than values on
 *  a phone and six is the widest set that fits one (docs/app.md §Columns and sorting). Softness
 *  is the one dropped: it is the sparsest of the seven and the only default column no story uses,
 *  because docs/shoe-stories.md argues it should not drive a shortlist. */
export function defaultColumns(zone: Zone): string[] {
  return ['releasedAt', 'score', 'msrpGbp', zoneKey('Stack', zone),
    'plate', zoneKey('Energy return', zone), 'toebox-width-widest-part', 'weight'];
}

export function defaultView(): ViewState {
  return { filters: { ...EMPTY_FILTERS, ranges: {}, categorical: {} }, sort: { ...DEFAULT_SORT }, columns: defaultColumns(DEFAULT_ZONE), generations: {}, rows: [], stability: false };
}
