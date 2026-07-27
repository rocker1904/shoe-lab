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
  const active = Object.entries(f.ranges).filter(([, b]) => b.min !== undefined || b.max !== undefined);
  outer: for (const s of shoes) {
    if (f.hideDiscontinued && s.discontinued) continue;
    if (search && !s.name.toLowerCase().includes(search)) continue;
    if (f.brands?.length && !f.brands.includes(s.brand ?? '')) continue;
    if (f.plate) {
      if (f.plate === 'plated' ? s.plate === 'none' : s.plate !== f.plate) continue;
    }
    if (f.releasedAfter && (!s.releasedAt || s.releasedAt < f.releasedAfter)) continue;
    // Missing-ness is settled across every active range before any bound is applied (docs/app.md §Filters).
    const readings: { bound: RangeBound; v: number }[] = [];
    for (const [key, bound] of active) {
      const v = numericValue(s, key, idx);
      if (v === undefined) { hiddenMissing++; continue outer; }
      readings.push({ bound, v });
    }
    const outOfRange = readings.some(({ bound, v }) =>
      (bound.min !== undefined && v < bound.min) || (bound.max !== undefined && v > bound.max));
    if (outOfRange) continue;
    visible.push(s);
  }
  return { visible, hiddenMissing };
}
