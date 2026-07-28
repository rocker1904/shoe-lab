import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { quantile } from './stats';
import { defaultView, type ViewState } from './urlstate';

// Every threshold lives here (docs/app.md §Presets). Percentiles where the story is relative to
// the market, absolute values where it is a property of a shoe — docs/shoe-stories.md owns which
// is which, and why. Read it before changing a number.
const EASY_MIN_HEEL_STACK = 36;
const PRICE_PERCENTILE = 0.8;
// Tempo is the broad middle of the week, so both its bounds read "more than most of this fleet"
// rather than naming a number. An absolute energy-return floor is what made it narrow: 65 happens
// to sit at the 74th percentile, so it kept only the liveliest quarter of the catalogue.
const TEMPO_ENERGY_RETURN_PERCENTILE = 0.5;
const TEMPO_WEIGHT_PERCENTILE = 0.4;
const RACE_MAX_WEIGHT = 230;
const RACE_MIN_ENERGY_RETURN = 70;

const EASY_COLUMNS = ['releasedAt', 'score', 'msrpGbp', 'heel-stack', 'toebox-width-widest-part', 'weight', 'plate'];
const FAST_COLUMNS = ['releasedAt', 'score', 'msrpGbp', 'energy-return-heel', 'weight', 'plate'];

export interface Preset { id: string; label: string; describe: string }

export const PRESETS: Preset[] = [
  { id: 'easy', label: 'Easy', describe: 'The bulk of the week — cushioned, no carbon, and cheap enough to put the miles through' },
  { id: 'tempo', label: 'Tempo', describe: 'Fast twice a week — light and lively, at a price you can repeat' },
  { id: 'race', label: 'Race', describe: 'One day, one goal — the lightest, liveliest shoes in the fleet' },
];

/** A bound the market decides rather than the story: resolved against the loaded fleet at click time. */
function fleetCap(shoes: Shoe[], key: string, idx: TestIndex, p: number): number | null {
  return quantile(shoes.map((s) => numericValue(s, key, idx)).filter((x): x is number => x !== undefined), p);
}

export function applyPreset(id: string, shoes: Shoe[], idx: TestIndex): ViewState {
  const v = defaultView();
  // Prices resolve through numericValue, which prefers the weekly test over the field
  // (docs/app.md §Resolved price) — reading shoe.msrpGbp here would disagree with the column.
  const price = fleetCap(shoes, 'msrpGbp', idx, PRICE_PERCENTILE);
  switch (id) {
    case 'easy': {
      v.filters.ranges['heel-stack'] = { min: EASY_MIN_HEEL_STACK };
      v.filters.plate = 'not-carbon';
      if (price !== null) v.filters.ranges['msrpGbp'] = { max: price };
      v.sort = { key: 'score', dir: 'desc' };
      v.columns = [...EASY_COLUMNS];
      return v;
    }
    case 'tempo': {
      const energy = fleetCap(shoes, 'energy-return-heel', idx, TEMPO_ENERGY_RETURN_PERCENTILE);
      if (energy !== null) v.filters.ranges['energy-return-heel'] = { min: energy };
      const weight = fleetCap(shoes, 'weight', idx, TEMPO_WEIGHT_PERCENTILE);
      if (weight !== null) v.filters.ranges['weight'] = { max: weight };
      if (price !== null) v.filters.ranges['msrpGbp'] = { max: price };
      v.sort = { key: 'energy-return-heel', dir: 'desc' };
      v.columns = [...FAST_COLUMNS];
      return v;
    }
    case 'race': {
      v.filters.ranges['weight'] = { max: RACE_MAX_WEIGHT };
      v.filters.ranges['energy-return-heel'] = { min: RACE_MIN_ENERGY_RETURN };
      v.sort = { key: 'energy-return-heel', dir: 'desc' };
      v.columns = [...FAST_COLUMNS];
      return v;
    }
    default:
      throw new Error(`unknown preset: ${id}`);
  }
}
