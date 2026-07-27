import type { Plate } from '../../shared/types.js';

export interface PlateOverride { plate: Plate; note: string }

// Corrections to RunRepeat's own tagging, hand-maintained — docs/scraping.md §Decisions.
export const PLATE_OVERRIDES: Record<string, PlateOverride> = {
  'salomon-s-lab-spectur': {
    plate: 'carbon',
    note: 'Review: "the plate is made of carbon fibre ... called the energyBLADE Carbon", but the plate fact is unset.',
  },
  'skechers-aero-tempo': {
    plate: 'carbon',
    note: 'Review: "a carbon-infused, H-shaped plate", but the plate fact is unset.',
  },
  'anta-zone-2-90': {
    plate: 'none',
    note: 'Has a Plate section that describes an absence — "ANTA skipped the carbon plate". Confirmed unplated; the only known section-present-but-unplated shoe.',
  },
};
