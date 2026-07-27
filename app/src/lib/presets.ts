import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { median } from './stats';
import { defaultView, type ViewState } from './urlstate';

const EASY_DAY_MIN_HEEL_STACK = 36;
const TEMPO_MAX_WEIGHT = 250;
const WIDE_MIN_TOEBOX = 98;
const RECENT_YEARS = 2;

export interface Preset { id: string; label: string; describe: string }

export const PRESETS: Preset[] = [
  { id: 'easy-day-cruiser', label: 'Easy-day cruiser', describe: 'Max cushion, no plate, recent, sorted by energy return' },
  { id: 'tempo-plated', label: 'Tempo (plated)', describe: 'Plated, light, recent, sorted by energy return' },
  { id: 'wide-toebox', label: 'Wide toebox', describe: 'Roomiest toeboxes, sorted by score' },
];

function isoYearsAgo(now: Date, years: number): string {
  const d = new Date(now);
  // UTC accessors so the cut-off date does not shift with the viewer's timezone.
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function applyPreset(id: string, shoes: Shoe[], idx: TestIndex, now: Date): ViewState {
  const v = defaultView();
  switch (id) {
    case 'easy-day-cruiser': {
      const softness = shoes.map((s) => numericValue(s, 'midsole-softness-22', idx)).filter((x): x is number => x !== undefined);
      const m = median(softness);
      v.filters.ranges['heel-stack'] = { min: EASY_DAY_MIN_HEEL_STACK };
      if (m !== null) v.filters.ranges['midsole-softness-22'] = { max: Math.round(m * 10) / 10 };
      v.filters.plate = 'none';
      v.filters.releasedAfter = isoYearsAgo(now, RECENT_YEARS);
      v.sort = { key: 'energy-return-heel', dir: 'desc' };
      return v;
    }
    case 'tempo-plated': {
      v.filters.plate = 'plated';
      v.filters.ranges['weight'] = { max: TEMPO_MAX_WEIGHT };
      v.filters.releasedAfter = isoYearsAgo(now, RECENT_YEARS);
      v.sort = { key: 'energy-return-heel', dir: 'desc' };
      return v;
    }
    case 'wide-toebox': {
      v.filters.ranges['toebox-width-widest-part'] = { min: WIDE_MIN_TOEBOX };
      v.sort = { key: 'score', dir: 'desc' };
      return v;
    }
    default:
      throw new Error(`unknown preset: ${id}`);
  }
}
