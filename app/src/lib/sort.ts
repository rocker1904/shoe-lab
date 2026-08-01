import type { Plate, Shoe } from '../../../shared/types.js';
import { categoricalValue } from './categorical';
import { numericValue, type TestIndex } from './dataset';
import type { ScoreColumns } from './score';

export interface SortState { key: string; dir: 'asc' | 'desc' }

/** Ordinal so plate sorts like every other column (docs/app.md §Columns and sorting). */
const PLATE_RANK: Record<Plate, number> = { none: 0, 'plated-other': 1, carbon: 2 };

/**
 * Which way a header's FIRST press sorts. Descending everywhere, because on a figure the
 * interesting end is the big number — except the two identity keys the table renders itself, where
 * "sort by shoe" plainly means A to Z and a first press landing on `Xero Shoes Speed Force II` is
 * a control answering a question nobody asked. Declared as that pair rather than inferred from the
 * value's type: a categorical column also sorts alphabetically, but it sits in the value grid where
 * every neighbour opens descending, so it keeps the grid's rule
 * (docs/app.md §Columns and sorting).
 */
const ASCENDING_FIRST = new Set(['name', 'brand']);
/**
 * What a press on `key` produces, given the sort the table is already showing. Both renderings call
 * this rather than spelling the flip twice, so a press cannot come to mean two things.
 */
export function nextSort(current: SortState, key: string): SortState {
  const first: SortState['dir'] = ASCENDING_FIRST.has(key) ? 'asc' : 'desc';
  const flipped = first === 'desc' ? 'asc' : 'desc';
  return { key, dir: current.key === key && current.dir === first ? flipped : first };
}

function keyValue(
  s: Shoe, key: string, idx: TestIndex, scores?: ScoreColumns,
): number | string | undefined {
  if (key === 'name') return s.name.toLowerCase();
  if (key === 'brand') return s.brand?.toLowerCase();
  if (key === 'plate') return PLATE_RANK[s.plate];
  if (key === 'releasedAt') return s.releasedAt ?? undefined;
  // A score is not in the catalogue and depends on the view, so it arrives resolved — looked up by
  // the column it fills, which is what makes a further score an entry rather than a branch.
  const resolved = scores?.get(key);
  if (resolved) return resolved.get(s.slug);
  // Alphabetical by the label rather than the stored slug, so the order matches the column.
  return numericValue(s, key, idx) ?? categoricalValue(s, key, idx)?.toLowerCase();
}

export function sortShoes(
  shoes: Shoe[], sort: SortState, idx: TestIndex, scores?: ScoreColumns,
): Shoe[] {
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...shoes].sort((a, b) => {
    const va = keyValue(a, sort.key, idx, scores);
    const vb = keyValue(b, sort.key, idx, scores);
    if (va === undefined && vb === undefined) return (b.score ?? -1) - (a.score ?? -1);
    if (va === undefined) return 1;   // missing always last
    if (vb === undefined) return -1;
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return (b.score ?? -1) - (a.score ?? -1);
  });
}
