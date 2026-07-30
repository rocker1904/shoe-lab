import type { Plate, Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { EASY_SCORE_KEY } from './score';

export interface SortState { key: string; dir: 'asc' | 'desc' }

/** Ordinal so plate sorts like every other column (docs/app.md §Columns and sorting). */
const PLATE_RANK: Record<Plate, number> = { none: 0, 'plated-other': 1, carbon: 2 };

function keyValue(
  s: Shoe, key: string, idx: TestIndex, scores?: Map<string, number>,
): number | string | undefined {
  if (key === 'name') return s.name.toLowerCase();
  if (key === 'brand') return s.brand?.toLowerCase();
  if (key === 'plate') return PLATE_RANK[s.plate];
  if (key === 'releasedAt') return s.releasedAt ?? undefined;
  // The score is not in the catalogue and depends on the view, so it arrives resolved.
  if (key === EASY_SCORE_KEY) return scores?.get(s.slug);
  return numericValue(s, key, idx);
}

export function sortShoes(
  shoes: Shoe[], sort: SortState, idx: TestIndex, scores?: Map<string, number>,
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
