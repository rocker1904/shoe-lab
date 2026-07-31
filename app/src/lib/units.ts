import type { LabTest } from '../../../shared/types.js';
import { isCategorical } from './categorical';

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
  if (isCategorical(test)) return '';
  if (test.type === 'percent') return '%';
  if (test.type === 'score' || test.type === 'rating') return '/5';
  return test.type === 'float' ? test.units : '';
}

/**
 * The second header line: units alone. The direction arrow used to live here and now sits in the
 * column picker and the add-filter dialog instead — two arrows in one header (sort and direction)
 * collided, and the wash already says which end of a column is good, because `percentileMap`
 * inverts for a `lower` metric (docs/app.md §Table presentation).
 */
export function headerUnits(key: string, test: LabTest | undefined): string {
  // A categorical column has no units to state.
  if (isCategorical(test)) return '';
  return unitsOf(key, test);
}

/**
 * The columns that hold words and dates rather than figures. It decides more than alignment:
 * the phone rendering has no grid cell any of them would fit, so they move onto the shoe's name
 * line and the value row stays uniformly numeric (docs/app.md §Columns and sorting). Shared, so
 * the two renderings cannot disagree about which columns are figures.
 *
 * The test is required rather than optional: whether a column holds words is now partly the
 * catalogue's answer, and a caller that omitted it would silently get the old one.
 */
export function isFigure(key: string, test: LabTest | undefined): boolean {
  return key !== 'plate' && key !== 'releasedAt' && !isCategorical(test);
}
