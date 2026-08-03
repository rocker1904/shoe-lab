import { describe, expect, it } from 'vitest';
import { displayReleaseDate, monthLabel, startOfMonth } from './release-date';

describe('monthLabel', () => {
  it('names the month behind a bound, which is what the picker puts on its trigger', () => {
    expect(monthLabel('2024-07-01')).toBe('July 2024');
    expect(monthLabel('2024-01')).toBe('January 2024');
  });

  it('falls back to the year rather than throwing on a month out of range', () => {
    expect(monthLabel('2024-13-01')).toBe('2024');
  });
});

describe('displayReleaseDate', () => {
  it('shows month and year for a precise page date, never the day', () => {
    expect(displayReleaseDate('2024-06-01', 'page')).toBe('June 2024');
    expect(displayReleaseDate('2024-03-15', 'page')).toBe('March 2024');
  });

  it('shows month and year for a page date RunRepeat flagged imprecise', () => {
    // The shoes whose month was previously thrown away by slicing to the year.
    expect(displayReleaseDate('2021-12-09', 'page-estimated')).toBe('December 2021');
  });

  it('shows the bare year for a listing-derived date, because only the year was ever real', () => {
    expect(displayReleaseDate('2024-01-01', 'listing')).toBe('2024');
  });

  it('shows an em dash when there is no date at all', () => {
    expect(displayReleaseDate(null, null)).toBe('—');
    expect(displayReleaseDate(null, 'listing')).toBe('—');
  });

  it('falls back to the year rather than throwing on an out-of-range month', () => {
    // Hostile input: the app must not crash on a malformed dataset field.
    expect(displayReleaseDate('2024-13-01', 'page')).toBe('2024');
    expect(displayReleaseDate('2024-00-01', 'page')).toBe('2024');
  });
});

describe('startOfMonth', () => {
  it('normalises both bound shapes to the first of the month', () => {
    expect(startOfMonth('2024-03')).toBe('2024-03-01');
    expect(startOfMonth('2024-03-15')).toBe('2024-03-01');
    expect(startOfMonth('2024-03-01')).toBe('2024-03-01');
  });
});
