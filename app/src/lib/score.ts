import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { sideKey, type Side } from './lineage';

/**
 * Every constant here is **frozen**: derived once from the fleet at `data/` commit baed23b and never
 * recomputed from the loaded catalogue. That is what makes a score comparable across refreshes, and
 * what lets a future shoe read above 100 rather than renormalising the improvement away. Recomputing
 * any of them from `shoes` reintroduces exactly the drift the design exists to remove — the reasoning
 * is owned by docs/decisions.md §Frozen scores and live thresholds, and the pipeline the constants
 * belong to by docs/app.md §The Easy score.
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

/**
 * The quantity a term's mapping reads, before the mapping. Two of the five terms **cap**, so past
 * saturation the reading is not recoverable from the mapped value — and the breakdown exists to make
 * a surprising rank diagnosable, which it cannot do while the reading is hidden
 * (docs/app.md §The Easy score).
 */
export interface EasyReading {
  value: number;
  /** Numerator and denominator where `value` is derived from two readings: the ratio alone does not
   *  say which of them moved. */
  over?: [number, number];
}

const reading = (v: number | undefined): EasyReading | null => (v === undefined ? null : { value: v });
/** A zero denominator is an unmeasurable ratio, not an infinite one. */
const ratio = (a: number | undefined, b: number | undefined): EasyReading | null =>
  a === undefined || b === undefined || b === 0 ? null : { value: a / b, over: [a, b] };

export function easyReadings(shoe: Shoe, side: Side, idx: TestIndex): Record<EasyTermKey, EasyReading | null> {
  const v = (key: string) => numericValue(shoe, key, idx);
  return {
    shockAbsorption: reading(v(sideKey('Shock absorption', side))),
    energyReturn: reading(v(sideKey('Energy return', side))),
    outsoleDurability: ratio(v('outsole-thickness'), v('outsole-durability')),
    midsoleWidth: ratio(v(sideKey('Midsole width', side)), v(sideKey('Stack', side))),
    heelCounter: reading(v('heel-counter-stiffness')),
  };
}

/** Stage 1: each reading becomes 0–1 and linear in goodness, with its true zero preserved. */
function mapReadings(r: Record<EasyTermKey, EasyReading | null>, side: Side): EasyTerms {
  const map = (key: EasyTermKey, f: (x: number) => number): number | null => {
    const raw = r[key];
    return raw === null ? null : f(raw.value);
  };
  return {
    shockAbsorption: map('shockAbsorption', (x) => x / SA_REF),
    energyReturn: map('energyReturn', (x) => x / 100),
    outsoleDurability: map('outsoleDurability', (x) => Math.min(x / L_OK, 1)),
    midsoleWidth: map('midsoleWidth', (x) => Math.min(x / WID_CAP[side], 1)),
    heelCounter: map('heelCounter', (x) => (x - 1) / 4),
  };
}

export function easyTerms(shoe: Shoe, side: Side, idx: TestIndex): EasyTerms {
  return mapReadings(easyReadings(shoe, side, idx), side);
}

/**
 * The synthetic columns and sort keys, one per side. Not catalogue tests: their value depends on
 * the *view* — the stability preference decides how many terms there are — which is why `Page`
 * resolves them into maps and hands them down rather than letting `numericValue` answer for them.
 * Two self-describing keys rather than one resolved through the *derived* side: a column that names
 * its own side cannot disagree with the panel beside it, and a view naming no side needs no silent
 * fallback (docs/app.md §The Easy score).
 */
export const EASY_SCORE_KEYS: Record<Side, string> = {
  heel: 'easy-score-heel', forefoot: 'easy-score-forefoot',
};

/**
 * Every resolved score column: column key to slug to score. Keyed by column rather than passed as
 * one map per consumer, so Tempo's and Race's scores arrive as further **entries** and no signature
 * moves when they do (BACKLOG.md).
 */
export type ScoreColumns = Map<string, Map<string, number>>;

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
 *  states on one scale would invite a comparison that is not meaningful. Derived by dividing by
 *  `TERM_SD` **as published above** rather than by the unrounded sds, or the endpoints miss 100 and
 *  0 by enough to see (they read 100.03 and −0.01 when the two disagree). */
export const ANCHORS: Record<Side, Record<'on' | 'off', { r0: number; r100: number }>> = {
  heel: { off: { r0: 3.7275, r100: 8.474 }, on: { r0: 4.3963, r100: 7.4104 } },
  forefoot: { off: { r0: 3.7119, r100: 7.6771 }, on: { r0: 3.9456, r100: 6.567 } },
};

const termsFor = (stability: boolean): EasyTermKey[] =>
  stability ? [...BASE_TERMS, ...STABILITY_TERMS] : BASE_TERMS;

export function easyContributions(
  shoe: Shoe, side: Side, stability: boolean, idx: TestIndex,
): { key: EasyTermKey; raw: EasyReading; term: number; weighted: number }[] | null {
  const readings = easyReadings(shoe, side, idx);
  const mapped = mapReadings(readings, side);
  const keys = termsFor(stability);
  if (keys.some((k) => mapped[k] === null)) return null; // all-terms-required
  return keys.map((key) => ({
    key,
    raw: readings[key]!,
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
