import { quantile } from './stats';

/** The drawn range, plus the readings that fell outside it — which the plot owes the runner as
 *  hatched overflow bins rather than silently dropping (docs/app.md §Filters). */
export interface Axis { lo: number; hi: number; under: number; over: number }

/** Symmetric, needs no per-metric tuning, and deliberately conservative: a wider trim buys more
 *  travel but starts discarding real spread (docs/app.md §Filters). */
const TRIM = 0.02;

/**
 * A linear axis over the full range is unusable for dragging, and price says why: 79% of it is
 * empty pixels, the densest single pixel holds 64 shoes, and the middle half of the fleet gets 23px
 * of a 222px control. Clipping to p2–p98 roughly doubles that travel. `quantile` is floor-of-rank,
 * so both ends are readings some shoe actually has.
 *
 * `null` where there is nothing to draw. A metric whose middle 96% is a single repeated value falls
 * back to the untrimmed range instead, because trimming it would leave an axis of zero width.
 */
export function trimmedAxis(values: number[]): Axis | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return null;
  let lo = quantile(values, TRIM)!;
  let hi = quantile(values, 1 - TRIM)!;
  if (lo === hi) { lo = min; hi = max; }
  return {
    lo, hi,
    under: values.filter((v) => v < lo).length,
    over: values.filter((v) => v > hi).length,
  };
}

/**
 * Stops are the readings themselves, never round numbers: £5 and 1g are arbitrary, a boundary
 * between two shoes is not, and the rule self-adjusts from 43 stops on price to 324 on energy
 * return with no constants (docs/app.md §Filters).
 */
export function snapToValue(v: number, stops: number[]): number {
  let best = v;
  let bestGap = Infinity;
  for (const s of stops) {
    const gap = Math.abs(s - v);
    if (gap < bestGap) { best = s; bestGap = gap; }
  }
  return best;
}

/** Position only. A typed bound outside the axis keeps its value and draws at the edge — clamping
 *  the value would rewrite what the runner typed (docs/app.md §Filters). */
export function clampPct(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
}
