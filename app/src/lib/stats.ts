import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { directionOf } from './direction';

/**
 * A percentile for **every** numeric key, neutral ones included: the grey ramp is linear in this
 * same number, so it needs it. Only `lower` inverts, so the wash never marks the heaviest and the
 * most expensive shoes as their column's leaders. Which ramp a column gets is `washOf`'s call, not
 * this function's (docs/app.md §Theming).
 */
export function percentileMap(shoes: Shoe[], key: string, idx: TestIndex): Map<string, number> {
  const values = new Map(shoes.flatMap((s) => {
    const v = numericValue(s, key, idx);
    return v === undefined ? [] : [[s.slug, v] as const];
  }));
  const lower = directionOf(key) === 'lower';
  const out = new Map<string, number>();
  // Ranked by `rankMap` rather than by a scan of its own: one convention for ties and ends, and one
  // walk of the sorted run instead of one per shoe (docs/app.md §What a drag may recompute).
  for (const [slug, pct] of rankMap(values)) out.set(slug, lower ? 1 - pct : pct);
  return out;
}

/**
 * Percentiles for a map of already-resolved values. `percentileMap` cannot serve the Easy score:
 * that key is synthetic, so `numericValue` returns nothing for it.
 */
export function rankMap(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.values()].sort((a, b) => a - b);
  // One walk of the sorted run per distinct value rather than two `filter` passes per entry: the
  // start of a run is how many values fall below it and its length is how many tie with it, which
  // is the same `(below + equal / 2) / n` convention resolved once instead of per shoe.
  const pct = new Map<number, number>();
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j] === sorted[i]) j++;
    pct.set(sorted[i]!, (i + (j - i) / 2) / sorted.length);
    i = j;
  }
  const out = new Map<string, number>();
  for (const [slug, v] of values) out.set(slug, pct.get(v)!);
  return out;
}

export interface Histogram { min: number; max: number; counts: number[] }

/**
 * `range` is the drawn axis when there is one: the sidebar's plot is trimmed to p2–p98, and bins
 * derived from the surviving values would quietly un-trim it at whichever end the outliers were
 * (docs/app.md §Filters). Readings outside the range are left to the overflow bins.
 */
export function histogram(values: number[], bins = 24, range?: { min: number; max: number }): Histogram | null {
  if (values.length < 2) return null;
  const min = range?.min ?? Math.min(...values);
  const max = range?.max ?? Math.max(...values);
  if (min >= max) return null;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    if (v < min || v > max) continue;
    const i = Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return { min, max, counts };
}

/**
 * Floor-of-rank rather than interpolated: the result is always a value some shoe actually has,
 * which is easier to reason about as a threshold. `p` is clamped so a caller passing a percentage
 * cannot index off the end and get `undefined` typed as `number`.
 */
export function quantile(values: number[], p: number): number | null {
  if (values.length === 0 || !Number.isFinite(p)) return null;
  const s = [...values].sort((a, b) => a - b);
  const clamped = Math.min(1, Math.max(0, p));
  return s[Math.floor(clamped * (s.length - 1))]!;
}
