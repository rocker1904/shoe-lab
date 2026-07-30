import { describe, expect, it } from 'vitest';
import { displayReleaseDate } from './release-date';

describe('displayReleaseDate', () => {
  it('shows month and year for a precise page date, never the day', () => {
    expect(displayReleaseDate('2024-06-01', 'page')).toBe('June 2024');
    expect(displayReleaseDate('2024-03-15', 'page')).toBe('March 2024');
  });

  it('shows month and year for a page date RunRepeat flagged imprecise', () => {
    // The 94 shoes whose month was previously thrown away by slicing to the year.
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
