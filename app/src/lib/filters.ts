import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';

export interface RangeBound { min?: number; max?: number }
export interface FilterState {
  ranges: Record<string, RangeBound>;
  plate?: 'none' | 'plated' | 'carbon';
  releasedAfter?: string;
  brands?: string[];
  search?: string;
  hideDiscontinued?: boolean;
}
export const EMPTY_FILTERS: FilterState = { ranges: {} };
export interface FilterResult { visible: Shoe[]; hiddenMissing: number }

export function applyFilters(shoes: Shoe[], f: FilterState, idx: TestIndex): FilterResult {
  const visible: Shoe[] = [];
  let hiddenMissing = 0;
  const search = f.search?.toLowerCase();
  outer: for (const s of shoes) {
    if (f.hideDiscontinued && s.discontinued) continue;
    if (search && !s.name.toLowerCase().includes(search)) continue;
    if (f.brands?.length && !f.brands.includes(s.brand ?? '')) continue;
    if (f.plate) {
      if (f.plate === 'plated' ? s.plate === 'none' : s.plate !== f.plate) continue;
    }
    if (f.releasedAfter && (!s.releasedAt || s.releasedAt < f.releasedAfter)) continue;
    for (const [key, bound] of Object.entries(f.ranges)) {
      if (bound.min === undefined && bound.max === undefined) continue;
      const v = numericValue(s, key, idx);
      if (v === undefined) { hiddenMissing++; continue outer; }
      if (bound.min !== undefined && v < bound.min) continue outer;
      if (bound.max !== undefined && v > bound.max) continue outer;
    }
    visible.push(s);
  }
  return { visible, hiddenMissing };
}
