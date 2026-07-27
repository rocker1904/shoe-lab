import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { histogram, median, percentileMap, quantile } from './stats';
import { FLEET, TESTS } from './test-fixtures';

const idx = indexTests(TESTS);

describe('stats', () => {
  it('percentileMap: (below + half of equal) / n, missing excluded', () => {
    const p = percentileMap(FLEET, 'heel-stack', idx); // values 40,39,35,30 (mystery missing)
    expect(p.get('cushy')).toBeCloseTo(3.5 / 4);
    expect(p.get('oldie')).toBeCloseTo(0.5 / 4);
    expect(p.has('mystery')).toBe(false);
  });
  it('percentileMap handles ties', () => {
    const tied = [FLEET[0]!, { ...FLEET[1]!, values: { '6': 40 } }];
    const p = percentileMap(tied, 'heel-stack', idx);
    expect(p.get('cushy')).toBeCloseTo(0.5);
    expect(p.get('racer')).toBeCloseTo(0.5);
  });
  it('percentileMap single-value fleet gives 0.5', () => {
    const p = percentileMap([FLEET[0]!], 'heel-stack', idx);
    expect(p.get('cushy')).toBeCloseTo(0.5);
  });
  it('histogram bins values into range', () => {
    const h = histogram([0, 1, 2, 3, 10], 5)!;
    expect(h.min).toBe(0);
    expect(h.max).toBe(10);
    expect(h.counts).toHaveLength(5);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(h.counts[0]).toBe(2); // 0,1 fall in [0,2)
    expect(h.counts[1]).toBe(2); // 2,3 fall in [2,4)
    expect(h.counts[4]).toBe(1); // max value lands in last bin
  });
  it('histogram null for degenerate input; median', () => {
    expect(histogram([5, 5, 5])).toBeNull();
    expect(histogram([])).toBeNull();
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });
});

describe('stats edge cases', () => {
  it('percentileMap is empty when nothing carries the metric', () => {
    expect(percentileMap([], 'heel-stack', idx).size).toBe(0);
    expect(percentileMap([FLEET[4]!], 'heel-stack', idx).size).toBe(0);
    expect(percentileMap(FLEET, 'tongue-gusset-type', idx).size).toBe(0);
  });
  it('percentileMap keeps every value strictly inside 0..1', () => {
    const p = percentileMap(FLEET, 'energy-return-heel', idx);
    expect([...p.values()].every((v) => v > 0 && v < 1)).toBe(true);
    expect(p.get('racer')).toBeCloseTo(3.5 / 4); // highest of four
  });
  it('histogram defaults to 24 bins', () => {
    expect(histogram([0, 1])!.counts).toHaveLength(24);
  });
  it('histogram is null for a single value', () => {
    expect(histogram([5])).toBeNull();
  });
  it('histogram puts a bin-boundary value in the upper bin', () => {
    const h = histogram([0, 2, 4, 6, 8, 10], 5)!; // width 2: [0,2) [2,4) [4,6) [6,8) [8,10]
    expect(h.counts).toEqual([1, 1, 1, 1, 2]);
  });
  it('histogram handles negative ranges', () => {
    const h = histogram([-10, -5, 0], 2)!;
    expect([h.min, h.max]).toEqual([-10, 0]);
    expect(h.counts).toEqual([1, 2]);
  });
  it('median does not mutate its input', () => {
    const values = [3, 1, 2];
    expect(median(values)).toBe(2);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('quantile', () => {
  it('takes the value at the floor of the fractional rank', () => {
    const v = [10, 20, 30, 40, 50];
    expect(quantile(v, 0)).toBe(10);
    expect(quantile(v, 0.5)).toBe(30);
    expect(quantile(v, 1)).toBe(50);
  });
  it('does not care about input order and does not mutate', () => {
    const v = [50, 10, 30, 20, 40];
    expect(quantile(v, 0.5)).toBe(30);
    expect(v).toEqual([50, 10, 30, 20, 40]);
  });
  it('is null-safe on empty input', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
  it('handles a single value at any fraction', () => {
    expect(quantile([7], 0)).toBe(7);
    expect(quantile([7], 1)).toBe(7);
  });
  it('clamps a fraction outside 0..1 rather than reading off the end', () => {
    // a caller passing a percentage by mistake must not get undefined typed as number
    expect(quantile([10, 20, 30], 2)).toBe(30);
    expect(quantile([10, 20, 30], -1)).toBe(10);
    expect(quantile([10, 20, 30], Number.NaN)).toBeNull();
  });
});
