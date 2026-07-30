import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { sideKey, type Side } from './lineage';

/**
 * Every constant here is **frozen**: derived once from the fleet at `data/` commit baed23b and never
 * recomputed from the loaded catalogue. That is what makes a score comparable across refreshes, and
 * what lets a future shoe read above 100 rather than renormalising the improvement away. Recomputing
 * any of them from `shoes` reintroduces exactly the drift the design exists to remove — the reasoning
 * is owned by docs/decisions.md.
 */

/** Cosmetic: an uncapped linear factor cancels when the term is divided by its sd, so this sets the
 *  displayed term and never the ranking. Above the observed max so nothing clips. */
export const SA_REF = 200;
/** Outsole life (thickness/wear) past which the outsole is not the binding constraint — the midsole
 *  packing out is, and that is unmeasured. The one constant that changes an ordering. */
export const L_OK = 3.0;
/** p90 of each side's width/stack ratio. Per side because the halves are not on one scale: the
 *  minimalist tail caps out, a flat sandal genuinely being stable, while the real fleet stays spread. */
export const WID_CAP: Record<Side, number> = { heel: 3.04, forefoot: 5.37 };

export type EasyTermKey =
  | 'shockAbsorption' | 'outsoleDurability' | 'energyReturn' | 'midsoleWidth' | 'heelCounter';

export type EasyTerms = Record<EasyTermKey, number | null>;

/** A zero denominator is an unmeasurable ratio, not an infinite one. */
const ratio = (a: number | undefined, b: number | undefined): number | null =>
  a === undefined || b === undefined || b === 0 ? null : a / b;

/** Stage 1: each reading becomes 0–1 and linear in goodness, with its true zero preserved. */
export function easyTerms(shoe: Shoe, side: Side, idx: TestIndex): EasyTerms {
  const v = (key: string) => numericValue(shoe, key, idx);
  const sa = v(sideKey('Shock absorption', side));
  const er = v(sideKey('Energy return', side));
  const life = ratio(v('outsole-thickness'), v('outsole-durability'));
  const lever = ratio(v(sideKey('Midsole width', side)), v(sideKey('Stack', side)));
  const counter = v('heel-counter-stiffness');
  return {
    shockAbsorption: sa === undefined ? null : sa / SA_REF,
    energyReturn: er === undefined ? null : er / 100,
    outsoleDurability: life === null ? null : Math.min(life / L_OK, 1),
    midsoleWidth: lever === null ? null : Math.min(lever / WID_CAP[side], 1),
    heelCounter: counter === undefined ? null : (counter - 1) / 4,
  };
}

/**
 * The synthetic column and sort key. Not a catalogue test: unlike every other key its value depends
 * on the *view* — which side, and whether stability is on — which is why `Page` resolves it into a
 * map and hands it down rather than letting `numericValue` answer for it.
 */
export const EASY_SCORE_KEY = 'easy-score';

/** Editorial, and only meaningful because stage 2 makes weights control influence rather than
 *  each term's spread on its own mapped scale. */
export const EASY_WEIGHTS: Record<EasyTermKey, number> = {
  shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1, midsoleWidth: 1, heelCounter: 1,
};

const BASE_TERMS: EasyTermKey[] = ['shockAbsorption', 'outsoleDurability', 'energyReturn'];
const STABILITY_TERMS: EasyTermKey[] = ['midsoleWidth', 'heelCounter'];

export const TERM_SD: Record<Side, Record<EasyTermKey, number>> = {
  heel: {
    shockAbsorption: 0.0896, outsoleDurability: 0.1614, energyReturn: 0.0758,
    midsoleWidth: 0.0872, heelCounter: 0.2712,
  },
  forefoot: {
    shockAbsorption: 0.0961, outsoleDurability: 0.1614, energyReturn: 0.0790,
    midsoleWidth: 0.1133, heelCounter: 0.2712,
  },
};

/** Per side *and* per stability state: the toggle changes what the score means, so putting both
 *  states on one scale would invite a comparison that is not meaningful. */
export const ANCHORS: Record<Side, Record<'on' | 'off', { r0: number; r100: number }>> = {
  heel: { off: { r0: 3.7277, r100: 8.4742 }, on: { r0: 4.3967, r100: 7.4117 } },
  forefoot: { off: { r0: 3.7118, r100: 7.6761 }, on: { r0: 3.9452, r100: 6.5653 } },
};

const termsFor = (stability: boolean): EasyTermKey[] =>
  stability ? [...BASE_TERMS, ...STABILITY_TERMS] : BASE_TERMS;

export function easyContributions(
  shoe: Shoe, side: Side, stability: boolean, idx: TestIndex,
): { key: EasyTermKey; term: number; weighted: number }[] | null {
  const mapped = easyTerms(shoe, side, idx);
  const keys = termsFor(stability);
  if (keys.some((k) => mapped[k] === null)) return null; // all-terms-required
  return keys.map((key) => ({
    key,
    term: mapped[key]!,
    // Stage 2 then 3. Dividing without centring keeps the true zero; the differing means only add a
    // constant to every shoe, which cannot reorder anything.
    weighted: (EASY_WEIGHTS[key] * mapped[key]!) / TERM_SD[side][key],
  }));
}

export function easyScore(shoe: Shoe, side: Side, stability: boolean, idx: TestIndex): number | null {
  const rows = easyContributions(shoe, side, stability, idx);
  if (rows === null) return null;
  const totalWeight = rows.reduce((sum, r) => sum + EASY_WEIGHTS[r.key], 0);
  // A weighted mean rather than a sum, so adding the stability pair does not rescale the total.
  const mean = rows.reduce((sum, r) => sum + r.weighted, 0) / totalWeight;
  const { r0, r100 } = ANCHORS[side][stability ? 'on' : 'off'];
  return ((mean - r0) / (r100 - r0)) * 100;
}

export function easyScoreMap(
  shoes: Shoe[], side: Side, stability: boolean, idx: TestIndex,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of shoes) {
    const v = easyScore(s, side, stability, idx);
    if (v !== null) out.set(s.slug, v);
  }
  return out;
}
