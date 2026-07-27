import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';

export interface Coverage { n: number; total: number; fraction: number }

// Below this, a metric hides more shoes than it shows. Measured against the current
// population rather than the whole fleet (docs/app.md §Coverage).
export const SPARSE_BELOW = 0.5;

/** Counts through `numericValue`, so an `option`-typed test reads as no coverage rather than full coverage. */
export function coverageOf(shoes: Shoe[], key: string, idx: TestIndex): Coverage {
  const n = shoes.filter((s) => numericValue(s, key, idx) !== undefined).length;
  return { n, total: shoes.length, fraction: shoes.length ? n / shoes.length : 0 };
}

export function isSparse(c: Coverage): boolean {
  return c.total > 0 && c.fraction < SPARSE_BELOW;
}

/** Earliest release date carrying a reading — the depth that explains sparseness without measuring it. */
export function oldestReading(shoes: Shoe[], key: string, idx: TestIndex): string | null {
  const dates = shoes
    .filter((s) => s.releasedAt !== null && numericValue(s, key, idx) !== undefined)
    .map((s) => s.releasedAt!);
  return dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null;
}
