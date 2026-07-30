import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { zoneKey, type Zone } from './lineage';

/**
 * The story-agnostic engine: four stages, no story numbers. A story arrives as a `ScoreDef` from
 * `score-defs.ts`, which owns every frozen constant that belongs to one — so this file imports
 * nothing from there, and a fourth story is a fourth definition rather than a fourth code path
 * (docs/app.md §The story scores).
 */

/** Cosmetic: an uncapped linear factor cancels when the term is divided by its sd, so this sets the
 *  displayed term and never the ranking. Above the observed max so nothing clips. */
export const SA_REF = 200;
/** As `SA_REF`, and for the same reason: above the heaviest shoe in the fleet, so `1 − w/W_REF` is
 *  linear in grams and never clips. */
export const W_REF = 450;
/** Outsole life (thickness/wear) past which the outsole is not the binding constraint — the midsole
 *  packing out is, and that is unmeasured. The one constant that changes an ordering.
 *  Deliberately one number for every story: a per-story cap is the only thing that would let two
 *  scores over one pool disagree about one measurement (docs/shoe-stories.md §Tempo). */
export const L_OK = 3.0;
/** p90 of each zone's width/stack ratio. Per zone because the halves are not on one scale: the
 *  minimalist tail caps out, a flat sandal genuinely being stable, while the real fleet stays spread. */
export const WID_CAP: Record<Zone, number> = { heel: 3.04, forefoot: 5.37 };

export type TermKey =
  | 'energyReturn' | 'weight' | 'outsoleDurability' | 'shockAbsorption'
  | 'midsoleWidth' | 'heelCounter';

/**
 * The order every breakdown reads in, whatever order a definition declares its weights — two score
 * columns on screen would otherwise list their shared terms differently. It opens on Easy's
 * existing order, so the engine changes neither what a runner sees nor the floating-point summation
 * order that produced every published Easy score.
 */
export const TERM_ORDER: TermKey[] = [
  'shockAbsorption', 'outsoleDurability', 'energyReturn', 'weight', 'midsoleWidth', 'heelCounter',
];

/**
 * The quantity a term's mapping reads, before the mapping. Three of the six terms **cap**, so past
 * saturation the reading is not recoverable from the mapped value — and the breakdown exists to make
 * a surprising rank diagnosable, which it cannot do while the reading is hidden
 * (docs/app.md §The story scores).
 */
export interface Reading {
  value: number;
  /** Numerator and denominator where `value` is derived from two readings: the ratio alone does not
   *  say which of them moved. */
  over?: [number, number];
}

const reading = (v: number | undefined): Reading | null => (v === undefined ? null : { value: v });
/** A zero denominator is an unmeasurable ratio, not an infinite one. */
const ratio = (a: number | undefined, b: number | undefined): Reading | null =>
  a === undefined || b === undefined || b === 0 ? null : { value: a / b, over: [a, b] };

/** Every term any story can read. A definition picks the ones it weights; the rest are ignored,
 *  which is what lets three stories share one reader. */
export function readings(shoe: Shoe, zone: Zone, idx: TestIndex): Record<TermKey, Reading | null> {
  const v = (key: string) => numericValue(shoe, key, idx);
  return {
    energyReturn: reading(v(zoneKey('Energy return', zone))),
    // Zoneless, unlike every other term: a shoe has one weight, not a heel and a forefoot one.
    weight: reading(v('weight')),
    outsoleDurability: ratio(v('outsole-thickness'), v('outsole-durability')),
    shockAbsorption: reading(v(zoneKey('Shock absorption', zone))),
    midsoleWidth: ratio(v(zoneKey('Midsole width', zone)), v(zoneKey('Stack', zone))),
    heelCounter: reading(v('heel-counter-stiffness')),
  };
}

/** Stage 1: each reading becomes 0–1 and linear in goodness, true zero preserved. Shared by every
 *  story — a metric means the same thing whichever score reads it, which is also why two stories
 *  over one pool share divisors (docs/app.md §The story scores). */
export function terms(shoe: Shoe, zone: Zone, idx: TestIndex): Record<TermKey, number | null> {
  const r = readings(shoe, zone, idx);
  const map = (key: TermKey, f: (x: number) => number): number | null => {
    const raw = r[key];
    return raw === null ? null : f(raw.value);
  };
  return {
    energyReturn: map('energyReturn', (x) => x / 100),
    // Linear in grams, W_REF above the heaviest shoe so it never clips. Like SA_REF an uncapped
    // linear factor, so stage 2 cancels it and it never moves a ranking.
    weight: map('weight', (x) => 1 - x / W_REF),
    outsoleDurability: map('outsoleDurability', (x) => Math.min(x / L_OK, 1)),
    shockAbsorption: map('shockAbsorption', (x) => x / SA_REF),
    midsoleWidth: map('midsoleWidth', (x) => Math.min(x / WID_CAP[zone], 1)),
    heelCounter: map('heelCounter', (x) => (x - 1) / 4),
  };
}

export interface Anchor { r0: number; r100: number }
export interface ScoreVariant { anchors: Record<Zone, Anchor> }

/**
 * One story's score, as data. The engine reads nothing story-specific, so a fourth story is a
 * fourth definition rather than a fourth code path.
 *
 * There is deliberately **no pool predicate here.** The pool a definition's constants were derived
 * over lives in the *name* of the divisor object; it does not gate computation. Every loaded shoe
 * is scored against every definition, so a shoe outside a definition's pool can read above 100 or
 * below 0 — which is correct and must not be clamped (docs/app.md §The story scores).
 */
export interface ScoreDef {
  /** The preset this score ranks, so `presets.ts` resolves a definition rather than re-listing.
   *  Deliberately `string`: the engine names no story, or a fourth one would be a change here. */
  id: string;
  /** Synthetic column keys, from `DERIVED_ZONE_PAIRS` — the one home of a score key. */
  keys: Record<Zone, string>;
  /** Editorial, and only meaningful because stage 2 makes weights control influence rather than
   *  each term's spread on its own mapped scale. */
  weights: Partial<Record<TermKey, number>>;
  /** Named for the pool it was derived over, never for the story: two stories over one pool share
   *  this object by reference (docs/app.md §The story scores). */
  sd: Record<Zone, Partial<Record<TermKey, number>>>;
  base: ScoreVariant;
  /** Present exactly when the stability preference applies. Structural rather than a comment, so
   *  the extra weights and the scale they anchor on cannot come from different halves. */
  stable?: ScoreVariant & { add: Partial<Record<TermKey, number>> };
}

export interface Contribution { key: TermKey; raw: Reading; term: number; weighted: number }

/**
 * The synthetic columns and sort keys, one per zone per story. Not catalogue tests: their value
 * depends on the *view* — the stability preference decides how many terms there are — which is why
 * `Page` resolves them into maps and hands them down rather than letting `numericValue` answer for
 * them. Two self-describing keys per story rather than one resolved through the *derived* zone: a
 * column that names its own zone cannot disagree with the panel beside it, and a view naming no
 * zone needs no silent fallback (docs/app.md §The story scores).
 *
 * Every resolved score column: column key to slug to score. Keyed by column rather than passed as
 * one map per consumer, so a further story arrives as further **entries** and no signature moves.
 */
export type ScoreColumns = Map<string, Map<string, number>>;

/** One predicate, so weights and anchors always come from the same variant. */
function variantOf(def: ScoreDef, stability: boolean) {
  const stable = stability ? def.stable : undefined;
  return {
    weights: stable ? { ...def.weights, ...stable.add } : def.weights,
    anchors: (stable ?? def.base).anchors,
  };
}

export function contributions(
  def: ScoreDef, shoe: Shoe, zone: Zone, stability: boolean, idx: TestIndex,
): Contribution[] | null {
  const raw = readings(shoe, zone, idx);
  const mapped = terms(shoe, zone, idx);
  const { weights } = variantOf(def, stability);
  const keys = TERM_ORDER.filter((k) => weights[k] !== undefined);
  if (keys.some((k) => mapped[k] === null)) return null; // all-terms-required
  return keys.map((key) => ({
    key,
    raw: raw[key]!,
    term: mapped[key]!,
    // Stage 2 then 3. Dividing without centring keeps the true zero; the differing means only add a
    // constant to every shoe, which cannot reorder anything.
    weighted: (weights[key]! * mapped[key]!) / def.sd[zone][key]!,
  }));
}

export function scoreOf(
  def: ScoreDef, shoe: Shoe, zone: Zone, stability: boolean, idx: TestIndex,
): number | null {
  const rows = contributions(def, shoe, zone, stability, idx);
  if (rows === null) return null;
  const { weights, anchors } = variantOf(def, stability);
  const total = rows.reduce((sum, r) => sum + weights[r.key]!, 0);
  // A weighted mean rather than a sum, so adding the stability pair does not rescale the total.
  const mean = rows.reduce((sum, r) => sum + r.weighted, 0) / total;
  const { r0, r100 } = anchors[zone];
  return ((mean - r0) / (r100 - r0)) * 100;
}

export function scoreMap(
  def: ScoreDef, shoes: Shoe[], zone: Zone, stability: boolean, idx: TestIndex,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of shoes) {
    const v = scoreOf(def, s, zone, stability, idx);
    if (v !== null) out.set(s.slug, v);
  }
  return out;
}
