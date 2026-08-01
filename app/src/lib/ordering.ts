import { isCategorical } from './categorical';
import type { TestIndex } from './dataset';
import { columnLabel } from './labels';
import type { SortState } from './sort';
import { isFigure } from './units';
import { DEFAULT_SORT, type ViewState } from './urlstate';

/**
 * How the app *words* an ordering — one home, because two surfaces state it: the line under the
 * receipt and the announcement a header press makes.
 * docs/app.md §The ordering is stated when no header can carry it
 */

/**
 * The noun the ordering reads with. Prose rather than a header label where the two differ:
 * "Sorted by Released" is the column heading talking and "Sorted by release date" is the app
 * talking. Everything not listed falls through to `columnLabel`, which is the one place a column's
 * name is decided, so a metric is called the same thing here as in its header.
 */
const SORT_NOUNS: Record<string, string> = {
  name: 'shoe name', brand: 'brand', releasedAt: 'release date', msrpGbp: 'price', plate: 'plate',
};

/** Which end leads, in the vocabulary of what is being ordered rather than of the comparator. */
function orderWords(key: string, dir: SortState['dir'], idx: TestIndex): string {
  if (key === 'releasedAt') return dir === 'desc' ? 'newest first' : 'oldest first';
  // Ordinal — none 0, plated-other 1, carbon 2 — so descending is "most plate first" like every
  // other column (docs/app.md §Two renderings, and only one of them mounted).
  if (key === 'plate') return dir === 'desc' ? 'most plate first' : 'least plate first';
  if (key === 'name' || key === 'brand' || isCategorical(idx.bySlug.get(key))) {
    return dir === 'desc' ? 'Z to A' : 'A to Z';
  }
  return dir === 'desc' ? 'highest first' : 'lowest first';
}

/** `release date, newest first` — the phrase both surfaces embed in a sentence of their own. */
export function sortPhrase(sort: SortState, idx: TestIndex): string {
  const noun = SORT_NOUNS[sort.key] ?? columnLabel(sort.key, idx.bySlug.get(sort.key));
  return `${noun}, ${orderWords(sort.key, sort.dir, idx)}`;
}

/**
 * The header keys the rendered table can hang a caret on. The desktop's `Shoe` header is a sort
 * control of its own, so `name` is one of them; the phone renders a header only for the figure
 * columns, which is what keeps every chip the same box
 * (docs/app.md §Two renderings, and only one of them mounted).
 */
function markableKeys(view: ViewState, phone: boolean, idx: TestIndex): string[] {
  if (phone) return view.columns.filter((c) => isFigure(c, idx.bySlug.get(c)));
  return ['name', ...view.columns];
}

/**
 * What the ordering line says, or `null` when a header already says it. Derived display and
 * nothing else: it reads the view and serialises nothing, so a shared link is unchanged by it.
 * Silent on the default sort even where the score column has been unticked — a link to the
 * default order carries no `sort` at all, so there is nothing a recipient could be surprised by.
 */
export function orderingNote(view: ViewState, phone: boolean, idx: TestIndex): string | null {
  if (view.sort.key === DEFAULT_SORT.key && view.sort.dir === DEFAULT_SORT.dir) return null;
  if (markableKeys(view, phone, idx).includes(view.sort.key)) return null;
  return sortPhrase(view.sort, idx);
}
