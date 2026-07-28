import type { Plate, Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';

export interface RangeBound { min?: number; max?: number }
export interface FilterState {
  ranges: Record<string, RangeBound>;
  /** The real values a shoe can carry. Empty or absent constrains nothing (docs/app.md §Filters). */
  plate?: Plate[];
  releasedAfter?: string;
  brands?: string[];
  search?: string;
  hideDiscontinued?: boolean;
  /** Admit shoes with no reading for an active range rather than hiding them. Lives here because
   *  `applyFilters` receives a FilterState and nothing else (docs/app.md §Filters). */
  showMissing?: boolean;
}
export const EMPTY_FILTERS: FilterState = { ranges: {} };
/** `considered` is the denominator every other count reconciles against, and what coverage measures over. */
export interface FilterResult { visible: Shoe[]; considered: Shoe[]; outsideBounds: number; hiddenMissing: number }

export function applyFilters(shoes: Shoe[], f: FilterState, idx: TestIndex): FilterResult {
  const visible: Shoe[] = [];
  const considered: Shoe[] = [];
  let outsideBounds = 0;
  let hiddenMissing = 0;
  const search = f.search?.toLowerCase();
  const active = Object.entries(f.ranges).filter(([, b]) => b.min !== undefined || b.max !== undefined);
  outer: for (const s of shoes) {
    if (f.hideDiscontinued && s.discontinued) continue;
    if (search && !s.name.toLowerCase().includes(search)) continue;
    if (f.brands?.length && !f.brands.includes(s.brand ?? '')) continue;
    if (f.plate?.length && !f.plate.includes(s.plate)) continue;
    if (f.releasedAfter && (!s.releasedAt || s.releasedAt < f.releasedAfter)) continue;
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
  return { visible, considered, outsideBounds, hiddenMissing };
}
