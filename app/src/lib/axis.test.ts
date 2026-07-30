import { describe, expect, it } from 'vitest';
import { clampPct, snapToValue, trimmedAxis } from './axis';

describe('trimmedAxis', () => {
  it('clips the axis to p2–p98 and counts what fell outside', () => {
    const values = [1, ...Array.from({ length: 98 }, (_, i) => 10 + i), 500];
    const a = trimmedAxis(values)!;
    expect(a.lo).toBeGreaterThan(1);
    expect(a.hi).toBeLessThan(500);
    expect(a.under + a.over).toBeGreaterThan(0);
  });

  it('ends on readings that exist, never on interpolated ones', () => {
    const values = [1, ...Array.from({ length: 98 }, (_, i) => 10 + i), 500];
    const a = trimmedAxis(values)!;
    expect(values).toContain(a.lo);
    expect(values).toContain(a.hi);
  });

  it('keeps the whole range when trimming would leave nothing to draw', () => {
    // The middle 96% is one repeated value, which is the shape a trim cannot improve on.
    const values = [1, ...Array.from({ length: 98 }, () => 5), 9];
    const a = trimmedAxis(values)!;
    expect(a).toEqual({ lo: 1, hi: 9, under: 0, over: 0 });
  });

  it('has no axis at all below two readings, or when every reading is the same', () => {
    expect(trimmedAxis([])).toBeNull();
    expect(trimmedAxis([42])).toBeNull();
    expect(trimmedAxis([7, 7, 7, 7])).toBeNull();
  });
});

describe('snapToValue', () => {
  it('snaps to a value that exists rather than a round number', () => {
    expect(snapToValue(163, [140, 150, 160, 180])).toBe(160);
  });

  it('takes the nearer stop from either zone, and either end', () => {
    expect(snapToValue(171, [140, 150, 160, 180])).toBe(180);
    expect(snapToValue(-5, [140, 150])).toBe(140);
    expect(snapToValue(1000, [140, 150])).toBe(150);
  });

  it('leaves the value alone when there is nothing to snap to', () => {
    expect(snapToValue(163, [])).toBe(163);
  });
});

describe('clampPct', () => {
  it('clamps a drawn position without touching the value', () => {
    expect(clampPct(400, 60, 290)).toBe(100);
    expect(clampPct(10, 60, 290)).toBe(0);
  });

  it('is linear in between', () => {
    expect(clampPct(175, 60, 290)).toBe(50);
  });

  it('puts a degenerate axis at its start rather than dividing by zero', () => {
    expect(clampPct(5, 5, 5)).toBe(0);
  });
});
