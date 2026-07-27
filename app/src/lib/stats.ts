import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';

export function percentileMap(shoes: Shoe[], key: string, idx: TestIndex): Map<string, number> {
  const entries = shoes
    .map((s) => ({ slug: s.slug, v: numericValue(s, key, idx) }))
    .filter((e): e is { slug: string; v: number } => e.v !== undefined);
  const values = entries.map((e) => e.v).sort((a, b) => a - b);
  const out = new Map<string, number>();
  for (const { slug, v } of entries) {
    let below = 0;
    let equal = 0;
    for (const x of values) {
      if (x < v) below++;
      else if (x === v) equal++;
      else break;
    }
    out.set(slug, (below + equal / 2) / values.length);
  }
  return out;
}

export interface Histogram { min: number; max: number; counts: number[] }

export function histogram(values: number[], bins = 24): Histogram | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return null;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
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

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
