import type { LabTest } from '../../../shared/types.js';
import { directionOf } from './direction';

const ARROW = { higher: '↑', lower: '↓', neutral: '' } as const;

/**
 * Derived from the test type rather than authored, so a new upstream metric arrives with its own
 * units instead of a blank line: `float` carries them, `percent` is always `%`, and both `score`
 * and `rating` are five-point scales. `score` and `msrpGbp` are shoe fields with no catalogue test
 * behind them (docs/app.md §Resolved price), so they are named here.
 *
 * `size-rating` is the one exception. It is a runs-small / true / runs-large scale on which 3 is
 * correct, so `/5` would read as a mediocre score — the header says what the number means instead
 * (docs/app.md §Theming).
 */
function unitsOf(key: string, test: LabTest | undefined): string {
  if (key === 'size-rating') return '3 = true';
  if (key === 'msrpGbp') return '£';
  if (key === 'score') return '/100';
  if (!test) return '';
  if (test.type === 'percent') return '%';
  if (test.type === 'score' || test.type === 'rating') return '/5';
  return test.type === 'float' ? test.units : '';
}

/** The second header line: units, then the direction arrow a neutral metric does not get. */
export function headerUnits(key: string, test: LabTest | undefined): string {
  return [unitsOf(key, test), ARROW[directionOf(key)]].filter(Boolean).join(' ');
}
