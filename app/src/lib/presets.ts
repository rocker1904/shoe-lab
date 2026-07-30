import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { sideKey, type Side } from './lineage';
import { EASY } from './score-defs';
import { quantile } from './stats';
import { defaultView, type ViewState } from './urlstate';

// Every threshold lives here (docs/app.md §Presets). Percentiles where the story is relative to
// the market or the bound can swap sides, absolute values only where it is a property of a shoe
// with no sides — docs/shoe-stories.md owns which is which, and why. Read it before changing a
// number. Exported because a percentile that is not named cannot be asserted against.
export const PRICE_PERCENTILE = 0.8;
// Tempo is the broad middle of the week, so both its bounds read "more than most of this fleet"
// rather than naming a number. An absolute energy-return floor is what made it narrow: 65 happens
// to sit at the 74th percentile, so it kept only the liveliest quarter of the catalogue.
export const TEMPO_ENERGY_RETURN_PERCENTILE = 0.5;
export const TEMPO_WEIGHT_PERCENTILE = 0.4;
/** Weight has no sides, so this is the one bound left free to be a property of a shoe. */
export const RACE_MAX_WEIGHT = 230;
/** Race's old floor of 70 sat at the 85th percentile on heel and the 80th on forefoot — one
 *  number meaning two different things, which is exactly what a side-swappable bound must not do. */
export const RACE_ENERGY_RETURN_PERCENTILE = 0.85;

/** Six numeric columns is the phone bound (docs/app.md §Columns and sorting), and Easy spends them
 *  on the score and the terms behind it. Toebox width and stack are the two the story gives up:
 *  neither is a term, and fit is the runner's own final filter rather than something a score speaks
 *  to. Outsole durability is the term left out, for want of a seventh slot. */
const easyColumns = (strike: Side) =>
  ['releasedAt', EASY.keys[strike], 'score', 'msrpGbp', sideKey('Shock absorption', strike),
    sideKey('Energy return', strike), 'weight', 'plate'];
const fastColumns = (strike: Side) =>
  ['releasedAt', 'score', 'msrpGbp', sideKey('Energy return', strike), 'weight', 'plate'];

export interface Preset { id: string; label: string; describe: string }

export const PRESETS: Preset[] = [
  { id: 'easy', label: 'Easy', describe: 'The bulk of the week — ranked on cushioning, durability and how much the shoe gives back' },
  { id: 'tempo', label: 'Tempo', describe: 'Fast twice a week — light and lively, at a price you can repeat' },
  { id: 'race', label: 'Race', describe: 'One day, one goal — the lightest, liveliest shoes in the fleet' },
];

/** A bound the market decides rather than the story: resolved against the loaded fleet at click time. */
function fleetCap(shoes: Shoe[], key: string, idx: TestIndex, p: number): number | null {
  return quantile(shoes.map((s) => numericValue(s, key, idx)).filter((x): x is number => x !== undefined), p);
}

/** The mapping spec §4.0 describes: `(story, strike) -> view`, with nothing special-cased. */
export function applyPreset(
  id: string, shoes: Shoe[], idx: TestIndex, strike: Side, stability: boolean,
): ViewState {
  const v = defaultView();
  // A preference, not part of what a story is: the marks compare whole views, so rebuilding this
  // from the default would unmark the story the moment the runner set it (docs/app.md §Presets).
  v.stability = stability;
  // Prices resolve through numericValue, which prefers the weekly test over the field
  // (docs/app.md §Resolved price) — reading shoe.msrpGbp here would disagree with the column.
  const price = fleetCap(shoes, 'msrpGbp', idx, PRICE_PERCENTILE);
  const energyKey = sideKey('Energy return', strike);
  switch (id) {
    case 'easy': {
      // No bounds but the plate. The score ranks on shock absorption, outsole durability and energy
      // return, so a stack floor would restate what it already rewards, and price is deliberately
      // absent so the runner judges value themselves (docs/shoe-stories.md §Easy).
      v.filters.plate = ['none', 'plated-other'];
      v.sort = { key: EASY.keys[strike], dir: 'desc' };
      v.columns = easyColumns(strike);
      return v;
    }
    case 'tempo': {
      const energy = fleetCap(shoes, energyKey, idx, TEMPO_ENERGY_RETURN_PERCENTILE);
      if (energy !== null) v.filters.ranges[energyKey] = { min: energy };
      const weight = fleetCap(shoes, 'weight', idx, TEMPO_WEIGHT_PERCENTILE);
      if (weight !== null) v.filters.ranges['weight'] = { max: weight };
      if (price !== null) v.filters.ranges['msrpGbp'] = { max: price };
      v.sort = { key: energyKey, dir: 'desc' };
      v.columns = fastColumns(strike);
      return v;
    }
    case 'race': {
      v.filters.ranges['weight'] = { max: RACE_MAX_WEIGHT };
      const energy = fleetCap(shoes, energyKey, idx, RACE_ENERGY_RETURN_PERCENTILE);
      if (energy !== null) v.filters.ranges[energyKey] = { min: energy };
      v.sort = { key: energyKey, dir: 'desc' };
      v.columns = fastColumns(strike);
      return v;
    }
    default:
      throw new Error(`unknown preset: ${id}`);
  }
}
