import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';

export interface Coverage { n: number; total: number; fraction: number }

// Below this, a metric hides more shoes than it shows, so a preset must never bound one — this is
// a preset-safety threshold, not a warning threshold; nothing on screen reads it
// (docs/app.md §Coverage). Measured against the current population, never the whole fleet.
export const SPARSE_BELOW = 0.5;

/** Counts through `numericValue`, so an `option`-typed test reads as no coverage rather than full coverage. */
export function coverageOf(shoes: Shoe[], key: string, idx: TestIndex): Coverage {
  const n = shoes.filter((s) => numericValue(s, key, idx) !== undefined).length;
  return { n, total: shoes.length, fraction: shoes.length ? n / shoes.length : 0 };
}

export function isSparse(c: Coverage): boolean {
  return c.total > 0 && c.fraction < SPARSE_BELOW;
}
