import { derivedSideKey, type Side } from './lineage';
import type { ScoreDef, TermKey } from './score';

/**
 * Every constant here is **frozen**: derived once from the fleet at `data/` commit baed23b and never
 * recomputed from the loaded catalogue. That is what makes a score comparable across refreshes, and
 * what lets a future shoe read above 100 rather than renormalising the improvement away. Recomputing
 * any of them from `shoes` reintroduces exactly the drift the design exists to remove — the reasoning
 * is owned by docs/decisions.md §Frozen scores and live thresholds, and the pipeline the constants
 * belong to by docs/app.md §The story scores.
 */

/** Divisors over the plate-filtered pool — 378 shoes at `data/` commit baed23b. Shared by Easy and
 *  Tempo **by reference**: a divisor is a property of (metric, mapping, pool) and never of the
 *  story, so two copies would be two homes for one fact (docs/README.md §Rules). It carries all six
 *  terms because a definition's `weights` decides which are read, so Easy simply ignores `weight`. */
const PLATED_POOL_SD: Record<Side, Partial<Record<TermKey, number>>> = Object.freeze({
  heel: Object.freeze({
    energyReturn: 0.0758, weight: 0.0776, outsoleDurability: 0.1614,
    shockAbsorption: 0.0896, midsoleWidth: 0.0872, heelCounter: 0.2712,
  }),
  forefoot: Object.freeze({
    energyReturn: 0.0790, weight: 0.0776, outsoleDurability: 0.1614,
    shockAbsorption: 0.0961, midsoleWidth: 0.1133, heelCounter: 0.2712,
  }),
});

/** Divisors over the whole fleet — 450 shoes. Carbon widens every spread, so Race cannot use the
 *  table above: its energy-return divisor is 0.0902 against 0.0758. Keyed by pool, not globally by
 *  term — do not collapse the two (docs/app.md §The story scores). */
const WHOLE_FLEET_SD: Record<Side, Partial<Record<TermKey, number>>> = Object.freeze({
  heel: Object.freeze({ energyReturn: 0.0902, weight: 0.0904, shockAbsorption: 0.0902 }),
  forefoot: Object.freeze({ energyReturn: 0.0900, weight: 0.0904, shockAbsorption: 0.0930 }),
});

export const EASY: ScoreDef = {
  id: 'easy',
  keys: { heel: derivedSideKey('Easy score', 'heel'), forefoot: derivedSideKey('Easy score', 'forefoot') },
  weights: { shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1 },
  sd: PLATED_POOL_SD,
  /** Per side *and* per stability state: the preference changes what the score means, so putting
   *  both states on one scale would invite a comparison that is not meaningful. Derived by dividing
   *  by the sds **as published above** rather than by the unrounded ones, or the endpoints miss 100
   *  and 0 by enough to see (they read 100.03 and −0.01 when the two disagree). */
  base: { anchors: { heel: { r0: 3.7275, r100: 8.474 }, forefoot: { r0: 3.7119, r100: 7.6771 } } },
  stable: {
    add: { midsoleWidth: 1, heelCounter: 1 },
    anchors: { heel: { r0: 4.3963, r100: 7.4104 }, forefoot: { r0: 3.9456, r100: 6.567 } },
  },
};

export const TEMPO: ScoreDef = {
  id: 'tempo',
  keys: { heel: derivedSideKey('Tempo score', 'heel'), forefoot: derivedSideKey('Tempo score', 'forefoot') },
  /** Energy return leads because it is the direct measure of a fast shoe; shock absorption is small
   *  **because** it is a floor, and it must exist **because** weight is large — dropping it lets
   *  lightness run away and ranks barefoot shoes as tempo picks (docs/shoe-stories.md §Tempo). */
  weights: { energyReturn: 3, weight: 2, outsoleDurability: 2, shockAbsorption: 1 },
  sd: PLATED_POOL_SD,
  base: { anchors: { heel: { r0: 4.7625, r100: 7.9385 }, forefoot: { r0: 4.5415, r100: 7.6499 } } },
  /** Weight 1 each, not 2: Tempo has eight terms with the pair in, so 1 each is 20% of it. At 2
   *  each stability swamps speed and budget trainers climb (docs/shoe-stories.md §Tempo). */
  stable: {
    add: { midsoleWidth: 1, heelCounter: 1 },
    anchors: { heel: { r0: 5.0514, r100: 7.3590 }, forefoot: { r0: 4.7002, r100: 6.8820 } },
  },
};

/** No `stable` variant, and that is the decision rather than an omission: race shoes are uniformly
 *  tall and narrow, so the category has no stable member to surface — at every usable weight the
 *  preference moves one shoe in fifteen at the top and promotes daily trainers below
 *  (docs/shoe-stories.md §Race). The Toolbar says so rather than leaving a dead control. */
export const RACE: ScoreDef = {
  id: 'race',
  keys: { heel: derivedSideKey('Race score', 'heel'), forefoot: derivedSideKey('Race score', 'forefoot') },
  /** No durability term at all: a race shoe is used a handful of times, so cost per mile is
   *  irrelevant — which is what makes the three stories three. */
  weights: { energyReturn: 3, weight: 2, shockAbsorption: 1 },
  sd: WHOLE_FLEET_SD,
  base: { anchors: { heel: { r0: 3.7787, r100: 8.5477 }, forefoot: { r0: 3.9800, r100: 8.6001 } } },
};

export const SCORE_DEFS: readonly ScoreDef[] = [EASY, TEMPO, RACE];

export const defForKey = (key: string): ScoreDef | undefined =>
  SCORE_DEFS.find((d) => d.keys.heel === key || d.keys.forefoot === key);
export const defForPreset = (id: string): ScoreDef | undefined => SCORE_DEFS.find((d) => d.id === id);
