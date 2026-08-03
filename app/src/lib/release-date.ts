import type { ReleaseDateSource } from '../../../shared/types.js';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'] as const;

/**
 * Month precision for every source but `listing`, which only ever knew a year
 * (docs/scraping.md §Release-date provenance). The day is deliberately never shown: only the
 * `page` shoes could supply a trustworthy one, a twentieth of the fleet, and a column that is
 * day-precise for a twentieth of its rows implies a resolution the dataset does not have.
 * `releasedAt` keeps the day, so sorting stays exact and
 * the CSV still exports it (docs/app.md §Number display).
 */
export function displayReleaseDate(releasedAt: string | null, source: ReleaseDateSource | null): string {
  if (!releasedAt) return '—';
  if (source === 'listing') return releasedAt.slice(0, 4);
  return monthLabel(releasedAt);
}

/**
 * `March 2024` from either bound shape, degrading to the bare year on a month it cannot name.
 * Shared with the month picker, which labels its trigger with this and its grid from the exported
 * `MONTHS` beside it — one array, so the picker's months and the table's column can never disagree
 * about a name (docs/app.md §Released after is month-granular).
 */
export function monthLabel(iso: string): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  return month === undefined ? iso.slice(0, 4) : `${month} ${iso.slice(0, 4)}`;
}

/**
 * Normalises a `YYYY-MM` or `YYYY-MM-DD` bound to the first of its month. Bounds are compared
 * against full ISO dates, and a bare `YYYY-MM` sorts *before* every day in that month, so leaving
 * one unnormalised would silently shift the window by a month
 * (docs/app.md §Released after is month-granular).
 */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
