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
