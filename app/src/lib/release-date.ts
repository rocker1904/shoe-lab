import type { ReleaseDateSource } from '../../../shared/types.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Month precision for every source but `listing`, which only ever knew a year
 * (docs/scraping.md §Release-date provenance). The day is deliberately never shown: only 24 of
 * 450 shoes could supply one, and a column that is day-precise for 5% of rows implies a
 * resolution the dataset does not have. `releasedAt` keeps the day, so sorting stays exact and
 * the CSV still exports it (docs/app.md §Number display).
 */
export function displayReleaseDate(releasedAt: string | null, source: ReleaseDateSource | null): string {
  if (!releasedAt) return '—';
  if (source === 'listing') return releasedAt.slice(0, 4);
  const month = MONTHS[Number(releasedAt.slice(5, 7)) - 1];
  return month === undefined ? releasedAt.slice(0, 4) : `${month} ${releasedAt.slice(0, 4)}`;
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
