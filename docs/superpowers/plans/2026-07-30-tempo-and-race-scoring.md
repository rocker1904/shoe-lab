# Tempo and Race Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give Tempo and Race their own lab-measurement scores on the pipeline Easy already uses, and drop every threshold the two stories still carry.

**Architecture:** `score.ts` currently hard-codes Easy. Task 1 turns it into a **story-agnostic engine plus a declarative `ScoreDef`**, with Easy re-expressed as one definition and every published score proved bit-identical. Tasks 2–3 add Tempo and Race. The extension point is one definition plus one `DERIVED_SIDE_PAIRS` entry: a registry (`SCORE_DEFS`, `defForKey`, `defForPreset`) means no consumer enumerates the stories.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, Playwright. Zero runtime dependencies.

## Global Constraints

- **Specs:** `docs/superpowers/specs/2026-07-30-tempo-scoring-design.md` and `…-race-scoring-design.md`. Where this plan and a spec disagree, stop and ask.
- **TDD:** failing test first. **Exception, stated once:** where a task introduces a brand-new export, the red phase legitimately fails on module resolution rather than an assertion — that counts. Everywhere else the test must run and fail on its assertion.
- **Filtered test command:** `npm -w app run test -- src/lib/score.test.ts`. Use the workspace `test` script, **not** root `test:coverage` — a filtered run trips the 90/85 thresholds.
- **Docs ride the change.**
- **`npm run check:docs` resolves `§` pointers inside source comments.** A `§` must name a real heading and must not wrap across a newline.
- **The docs heading is already `docs/app.md §The story scores`** — renamed ahead of this plan along with all 33 pointers, because doing it inside a task would leave the gate red for that task's duration. Write `§The story scores` in every comment and doc you touch. The section still describes only Easy; Task 10 generalises it.
- **`npm run verify` is `check:docs && typecheck && lint && test:coverage`.** Lint runs before tests, and `@typescript-eslint/no-unused-vars` is an **error** — deleting a test usually strands an import or helper, so each deletion task lists its lint casualties.
- **Commits:** single-line subjects, no embedded measurements, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Worktree:** `~/dev/shoe-lab-tempo-scoring`, branch `tempo-scoring`. Do not regenerate `data/`. Do not push or merge.
- **Never recompute a frozen constant from the loaded fleet** (docs/decisions.md §Frozen scores and live thresholds).

### The frozen constants, in full

Divisors belong to a **pool**, never to a story. Easy and Tempo rank the plate-filtered pool and **share one object by reference**; Race ranks the whole fleet, where carbon widens every spread. `PLATED_POOL_SD` carries all six terms; `weights` decides which are read, so Easy simply ignores `weight`. That is what lets the two share one object.

```
mapping constants (stage 1, engine-owned, global)
  SA_REF = 200      W_REF = 450      L_OK = 3.0      WID_CAP  heel 3.04  forefoot 5.37

PLATED_POOL_SD — 378 shoes, plate ≠ carbon       heel      forefoot
  energyReturn                                   0.0758    0.0790
  weight                                         0.0776    0.0776
  outsoleDurability                              0.1614    0.1614
  shockAbsorption                                0.0896    0.0961
  midsoleWidth                                   0.0872    0.1133
  heelCounter                                    0.2712    0.2712

WHOLE_FLEET_SD — 450 shoes                       heel      forefoot
  energyReturn                                   0.0902    0.0900
  weight                                         0.0904    0.0904
  shockAbsorption                                0.0902    0.0930

anchors, as { r0, r100 }
  easy   base   heel { 3.7275, 8.4740 }   forefoot { 3.7119, 7.6771 }
         stable heel { 4.3963, 7.4104 }   forefoot { 3.9456, 6.5670 }
  tempo  base   heel { 4.7625, 7.9385 }   forefoot { 4.5415, 7.6499 }
         stable heel { 5.0514, 7.3590 }   forefoot { 4.7002, 6.8820 }
  race   base   heel { 3.7787, 8.5477 }   forefoot { 3.9800, 8.6001 }   (no stable variant)

weights                    ER   WT   DUR   SA   | stable.add (each)
  easy                      1    —     1    2   |   1
  tempo                     3    2     2    1   |   1
  race                      3    2     —    1   |   none
```

### One thing that is easy to misread

The **pool defines where a definition's constants came from; it does not gate computation.** `Page` scores every loaded shoe against every definition, so a carbon shoe gets an Easy score — it is filtered out of Easy's *view* by the plate filter. Already true today. A shoe outside a definition's pool can therefore read above 100 or below 0, which is correct and **must not be clamped**. There is deliberately **no `pool` predicate on `ScoreDef`** — a callable would invite exactly that mistake. The pool lives in the *name* of the divisor constant instead.

---

## File Structure

| file | responsibility |
|---|---|
| `app/src/lib/score.ts` | **the engine.** `TermKey`, `TERM_ORDER`, mapping constants, `readings`, `terms`, `ScoreDef`, `contributions`, `scoreOf`, `scoreMap`, `ScoreColumns`. No story numbers; imports nothing from `score-defs.ts` |
| `app/src/lib/score-defs.ts` | **new.** `PLATED_POOL_SD`, `WHOLE_FLEET_SD`, the three defs, `SCORE_DEFS`, `defForKey`, `defForPreset` |
| `app/src/lib/lineage.ts` | two more `DERIVED_SIDE_PAIRS` entries (Tasks 2, 3); gains `sideOfKey` |
| `app/src/lib/labels.ts`, `direction.ts`, `urlstate.ts` | **derive** from `DERIVED_SIDE_PAIRS` |
| `app/src/Page.svelte` | resolve score maps by iterating `SCORE_DEFS` |
| `app/src/lib/presets.ts` | Tempo gains a plate gate, both lose their bounds, all three `describe` strings rewritten |
| `app/src/components/SetupStrip.svelte` | the three card `desc` strings, which still promise price caps |
| `app/src/components/ColumnPicker.svelte` | score columns derived, labelled through `columnLabel` |
| `app/src/components/Toolbar.svelte` | label, caption and popover stop being Easy-specific |
| `app/src/components/DetailPanel.svelte` | one breakdown per score column present, keyed by column key |

---

### Task 0: Baseline and a regression fixture

Task 1 transcribes ~30 frozen numbers into a new file, so transcription error is the real risk and endpoint checks would not catch a wrong middle.

- [x] **Step 1:** `cd ~/dev/shoe-lab-tempo-scoring && npm install`
- [x] **Step 2:** `npm run verify` → PASS; `npm -w app run e2e` → PASS. If either fails, stop and report.
- [x] **Step 3: Capture Easy's exact current output.** `tsx` is not a dependency and node cannot import `score.ts`, so the only working route is a vitest scratch test. Create `app/src/lib/baseline.scratch.test.ts` (matches the `src/**/*.test.ts` include):

```typescript
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
// Read data/shoes.json exactly as score.test.ts does — fileURLToPath, not a bare URL, because
// jsdom replaces the global URL.
import { easyScoreMap } from './score';

it('writes the baseline', () => {
  const out: Record<string, Record<string, number>> = {};
  const POOL = REAL.shoes.filter((s) => s.plate !== 'carbon');
  for (const side of ['heel', 'forefoot'] as const) {
    for (const stability of [false, true]) {
      out[`${side}:${stability ? 'on' : 'off'}`] =
        Object.fromEntries(easyScoreMap(POOL, side, stability, realIdx));
    }
  }
  mkdirSync(fileURLToPath(new URL('./__fixtures__/', import.meta.url)), { recursive: true });
  writeFileSync(fileURLToPath(new URL('./__fixtures__/easy-scores-baseline.json', import.meta.url)),
                JSON.stringify(out));
});
```

Copy `REAL`/`realIdx` from the top of `score.test.ts`. Run `npm -w app run test -- src/lib/baseline.scratch.test.ts`, then **delete the scratch file** — leaving it would break Task 1's gate, since it imports the retired `easyScoreMap`.

```bash
rm app/src/lib/baseline.scratch.test.ts
git add app/src/lib/__fixtures__/easy-scores-baseline.json
git commit -m "Capture the Easy scores the refactor must reproduce"
```

The fixture is deleted at the end of Task 1. (`moduleResolution: bundler` implies `resolveJsonModule`, so importing it type-checks; v8 coverage excludes `.json` and eslint never sees it.)

---

### Task 1: Generalise the engine, with Easy's output proved unchanged

**Interfaces produced:** `TermKey`, `TERM_ORDER`, `Reading`, `readings`, **`terms`**, `Anchor`, `ScoreVariant`, `ScoreDef`, `Contribution`, `contributions`, `scoreOf`, `scoreMap`, `ScoreColumns`; `sideOfKey` from `lineage.ts`; `EASY`, `SCORE_DEFS`, `defForKey`, `defForPreset` from `score-defs.ts`.

**Retired:** `EasyTermKey`, `EasyTerms`, `EasyReading`, `easyReadings`, `easyTerms`, `EASY_WEIGHTS`, `TERM_SD`, `ANCHORS`, `easyContributions`, `easyScore`, `easyScoreMap`, **`EASY_SCORE_KEYS`**. `terms` exists precisely because ten current tests call `easyTerms` and `contributions` cannot serve them — it returns `null` wholesale when any weighted term is missing and never surfaces unweighted terms.

- [x] **Step 1: The equivalence test**

```typescript
import BASELINE from './__fixtures__/easy-scores-baseline.json';

it('reproduces every published Easy score exactly', () => {
  // A refactor. TERM_ORDER is chosen so Easy's summation order is byte-for-byte what it is today,
  // which is why bit-equality is the right bar — endpoint checks would pass while a mistyped
  // divisor moved the whole middle of the fleet.
  const POOL = REAL.shoes.filter((s) => s.plate !== 'carbon');
  for (const side of SIDES) {
    for (const stability of [false, true]) {
      const got = scoreMap(EASY, POOL, side, stability, realIdx);
      const want = BASELINE[`${side}:${stability ? 'on' : 'off'}`] as Record<string, number>;
      expect(got.size).toBe(Object.keys(want).length);
      for (const [slug, v] of Object.entries(want)) expect(got.get(slug)).toBe(v);
    }
  }
});
```

- [x] **Step 2:** Run → FAIL on module resolution (`scoreMap`/`EASY` not exported). Permitted red phase, per the Global Constraints.

- [x] **Step 3: `score.ts` becomes the engine**

All four mapping constants **stay here**, beside the `terms` that uses them: they are stage 1 of the pipeline, not story data — the Tempo spec is explicit that a per-story `L_OK` is the one thing that would let two scores over one pool disagree about one measurement — and moving them would create a cycle, since `score-defs.ts` must import types from here.

```typescript
export const SA_REF = 200;
export const W_REF = 450;
export const L_OK = 3.0;
export const WID_CAP: Record<Side, number> = { heel: 3.04, forefoot: 5.37 };

export type TermKey =
  | 'energyReturn' | 'weight' | 'outsoleDurability' | 'shockAbsorption'
  | 'midsoleWidth' | 'heelCounter';

/**
 * The order every breakdown reads in, whatever order a definition declares its weights — two score
 * columns on screen would otherwise list their shared terms differently. **It opens on Easy's
 * existing order**, so the refactor changes neither what a runner sees nor the floating-point
 * summation order, and the equivalence test can demand bit-equality.
 */
export const TERM_ORDER: TermKey[] = [
  'shockAbsorption', 'outsoleDurability', 'energyReturn', 'weight', 'midsoleWidth', 'heelCounter',
];

export interface Reading { value: number; over?: [number, number] }

const reading = (v: number | undefined): Reading | null => (v === undefined ? null : { value: v });
/** A zero denominator is an unmeasurable ratio, not an infinite one. */
const ratio = (a: number | undefined, b: number | undefined): Reading | null =>
  a === undefined || b === undefined || b === 0 ? null : { value: a / b, over: [a, b] };

/** Every term any story can read. A definition picks the ones it weights; the rest are ignored,
 *  which is what lets three stories share one reader. */
export function readings(shoe: Shoe, side: Side, idx: TestIndex): Record<TermKey, Reading | null> {
  const v = (key: string) => numericValue(shoe, key, idx);
  return {
    energyReturn: reading(v(sideKey('Energy return', side))),
    // Sideless, unlike every other term: a shoe has one weight, not a heel and a forefoot one.
    weight: reading(v('weight')),
    outsoleDurability: ratio(v('outsole-thickness'), v('outsole-durability')),
    shockAbsorption: reading(v(sideKey('Shock absorption', side))),
    midsoleWidth: ratio(v(sideKey('Midsole width', side)), v(sideKey('Stack', side))),
    heelCounter: reading(v('heel-counter-stiffness')),
  };
}

/** Stage 1: each reading becomes 0–1 and linear in goodness, true zero preserved. Shared by every
 *  story — a metric means the same thing whichever score reads it, which is also why two stories
 *  over one pool share divisors (docs/app.md §The story scores). */
export function terms(shoe: Shoe, side: Side, idx: TestIndex): Record<TermKey, number | null> {
  const r = readings(shoe, side, idx);
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
    midsoleWidth: map('midsoleWidth', (x) => Math.min(x / WID_CAP[side], 1)),
    heelCounter: map('heelCounter', (x) => (x - 1) / 4),
  };
}

export interface Anchor { r0: number; r100: number }
export interface ScoreVariant { anchors: Record<Side, Anchor> }

/**
 * One story's score, as data. The engine reads nothing story-specific, so a fourth story is a
 * fourth definition rather than a fourth code path.
 */
export interface ScoreDef {
  /** The preset this score ranks, so `presets.ts` resolves a definition rather than re-listing. */
  id: 'easy' | 'tempo' | 'race';
  /** Synthetic column keys, from `DERIVED_SIDE_PAIRS` — the one home of a score key. */
  keys: Record<Side, string>;
  weights: Partial<Record<TermKey, number>>;
  /** Named for the pool it was derived over, never for the story: two stories over one pool share
   *  this object by reference (docs/app.md §The story scores). */
  sd: Record<Side, Partial<Record<TermKey, number>>>;
  base: ScoreVariant;
  /** Present exactly when the stability preference applies. Structural rather than a comment, so
   *  the extra weights and the scale they anchor on cannot come from different halves. */
  stable?: ScoreVariant & { add: Partial<Record<TermKey, number>> };
}

export interface Contribution { key: TermKey; raw: Reading; term: number; weighted: number }
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
  def: ScoreDef, shoe: Shoe, side: Side, stability: boolean, idx: TestIndex,
): Contribution[] | null {
  const raw = readings(shoe, side, idx);
  const mapped = terms(shoe, side, idx);
  const { weights } = variantOf(def, stability);
  const keys = TERM_ORDER.filter((k) => weights[k] !== undefined);
  if (keys.some((k) => mapped[k] === null)) return null; // all-terms-required
  return keys.map((key) => ({
    key, raw: raw[key]!, term: mapped[key]!,
    // Stage 2 then 3. Dividing without centring keeps the true zero; the differing means only add a
    // constant to every shoe, which cannot reorder anything.
    weighted: (weights[key]! * mapped[key]!) / def.sd[side][key]!,
  }));
}

export function scoreOf(
  def: ScoreDef, shoe: Shoe, side: Side, stability: boolean, idx: TestIndex,
): number | null {
  const rows = contributions(def, shoe, side, stability, idx);
  if (rows === null) return null;
  const { weights, anchors } = variantOf(def, stability);
  const total = rows.reduce((sum, r) => sum + weights[r.key]!, 0);
  const mean = rows.reduce((sum, r) => sum + r.weighted, 0) / total;
  const { r0, r100 } = anchors[side];
  return ((mean - r0) / (r100 - r0)) * 100;
}

export function scoreMap(
  def: ScoreDef, shoes: Shoe[], side: Side, stability: boolean, idx: TestIndex,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of shoes) {
    const v = scoreOf(def, s, side, stability, idx);
    if (v !== null) out.set(s.slug, v);
  }
  return out;
}
```

- [x] **Step 4: `score-defs.ts`, with every literal written out**

```typescript
import { derivedSideKey, type Side } from './lineage';
import type { ScoreDef, TermKey } from './score';

/** [keep the frozen-constants doc comment from score.ts here — it is about these numbers] */

/** Divisors over the plate-filtered pool — 378 shoes at `data/` commit baed23b. Shared by Easy and
 *  Tempo **by reference**: a divisor is a property of (metric, mapping, pool) and never of the
 *  story, so two copies would be two homes for one fact (docs/README.md §Rules). */
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
 *  table above: its energy-return divisor is 0.0902 against 0.0758. */
const WHOLE_FLEET_SD: Record<Side, Partial<Record<TermKey, number>>> = Object.freeze({
  heel: Object.freeze({ energyReturn: 0.0902, weight: 0.0904, shockAbsorption: 0.0902 }),
  forefoot: Object.freeze({ energyReturn: 0.0900, weight: 0.0904, shockAbsorption: 0.0930 }),
});

export const EASY: ScoreDef = {
  id: 'easy',
  keys: { heel: derivedSideKey('Easy score', 'heel'), forefoot: derivedSideKey('Easy score', 'forefoot') },
  weights: { shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1 },
  sd: PLATED_POOL_SD,
  base: { anchors: { heel: { r0: 3.7275, r100: 8.4740 }, forefoot: { r0: 3.7119, r100: 7.6771 } } },
  stable: {
    add: { midsoleWidth: 1, heelCounter: 1 },
    anchors: { heel: { r0: 4.3963, r100: 7.4104 }, forefoot: { r0: 3.9456, r100: 6.5670 } },
  },
};

export const SCORE_DEFS: readonly ScoreDef[] = [EASY]; // TEMPO and RACE join in Tasks 2 and 3
export const defForKey = (key: string): ScoreDef | undefined =>
  SCORE_DEFS.find((d) => d.keys.heel === key || d.keys.forefoot === key);
export const defForPreset = (id: string): ScoreDef | undefined => SCORE_DEFS.find((d) => d.id === id);
```

- [x] **Step 5: Two invariant tests**

`Partial` plus `def.sd[side][key]!` would make a missing divisor a silent `NaN` — stored by `scoreMap` because its guard is `!== null`, then sorted, washed and exported as a number-shaped nothing instead of an em dash. Race's table legitimately holds three of six terms, which is exactly where a mistyped weight key lands.

```typescript
it('every weighted term has a divisor on both sides, for every story', () => {
  for (const def of SCORE_DEFS) {
    const all = { ...def.weights, ...(def.stable?.add ?? {}) };
    for (const key of Object.keys(all) as TermKey[]) {
      for (const side of SIDES) expect(Number.isFinite(def.sd[side][key])).toBe(true);
    }
  }
});

it('a stability add never silently replaces a base weight', () => {
  // `variantOf` spreads `add` over `weights`, so a shared key overwrites rather than adds:
  // `{ shockAbsorption: 1 }` in Easy's add would drop its base weight from 2 to 1, silently.
  for (const def of SCORE_DEFS) {
    for (const k of Object.keys(def.stable?.add ?? {}) as TermKey[]) {
      expect(def.weights[k]).toBeUndefined();
    }
  }
});
```

- [x] **Step 6: `sideOfKey` goes in `lineage.ts`, not `side.ts`**

`side.ts` imports `urlstate.ts`, so putting it there would give a presentational component a transitive dependency on URL parsing for a lookup whose whole input is `ALL_SIDE_PAIRS` — which lives in `lineage.ts`, beside `swapSide`, which already does the same search. Move `SIDE_OF_KEY` there, export `sideOfKey(key): Side | null`, and have `side.ts` import it.

- [x] **Step 7: Re-point every caller — mechanical, no behaviour change**

The gate cannot pass until all of these move. Source: `Page.svelte`, `DetailPanel.svelte`, `presets.ts`, `labels.ts`, `direction.ts`, `urlstate.ts`, `ColumnPicker.svelte`. Tests: `score.test.ts`, `ColumnPicker.test.ts`, `DetailPanel.test.ts`, `ShoeTable.test.ts`, `csv-export.test.ts`, `sort.test.ts`, `units.test.ts`, `side.test.ts`, `urlstate.test.ts`, `direction.test.ts`, `labels.test.ts`, `presets.test.ts`.

The substitutions: `EASY_SCORE_KEYS` → `EASY.keys`; `easyScoreMap(shoes, …)` → `scoreMap(EASY, shoes, …)`; `easyContributions(shoe, …)` → `contributions(EASY, shoe, …)`; `easyTerms` → `terms`; `EasyTermKey` → `TermKey`; `EasyReading` → `Reading`. Constant-pinning tests move to `EASY.weights`, `EASY.sd`, `EASY.base.anchors` / `EASY.stable.anchors`.

**One number does change:** `EASY.sd.heel` now carries `weight: 0.0776`, because `PLATED_POOL_SD` holds all six terms so Tempo can share it. The pinning assertion grows that key. **No real-dataset numeric assertion may move.**

Tasks 4, 5 and 7 later replace these Easy-specific call sites with registry-driven ones; here they are just re-pointed.

- [x] **Step 8:** `npm run verify` → PASS, including the exact-reproduction test.
- [x] **Step 9:** Delete `app/src/lib/__fixtures__/easy-scores-baseline.json` **and the test that reads it** (deleting only the import leaves `BASELINE` undefined). Re-run `npm run verify`, then commit — `"Make the scoring engine read a story definition rather than Easy"`

---

### Task 2: The Tempo definition

Adds its own `DERIVED_SIDE_PAIRS` entry: `derivedSideKey`'s parameter is typed `DerivedSidePairLabel`, today the literal `'Easy score'` alone, so a definition cannot compile before its pair exists.

- [x] **Step 1: Failing tests**

```typescript
it('pairs the Tempo score columns by side', () => {
  expect(swapSide('tempo-score-heel', 'forefoot')).toBe('tempo-score-forefoot');
});

describe('the Tempo score against the real fleet', () => {
  it('scores the plate-filtered pool and anchors on it', () => {
    for (const side of SIDES) for (const stability of [false, true]) {
      const vs = [...scoreMap(TEMPO, POOL, side, stability, realIdx).values()];
      expect(vs.length).toBe(283);
      expect(Math.max(...vs)).toBeCloseTo(100, 1);
      expect(Math.min(...vs)).toBeCloseTo(0, 1);
    }
  });

  it('shares one divisor table with Easy, by reference', () => {
    // Object identity, not value equality: `toBe` on numbers passes against a copied literal too,
    // which is the thing this exists to catch.
    expect(TEMPO.sd).toBe(EASY.sd);
  });

  it('delivers every nominal weight as effective influence, on both sides', () => {
    // Covers `weight` in particular — the only term this branch introduces, with a new mapping and
    // a new divisor, and where `w/450` written instead of `1 − w/450` would land.
    for (const side of SIDES) {
      const rows = POOL.map((s) => contributions(TEMPO, s, side, false, realIdx)).filter((r) => r !== null);
      const spread = (k: TermKey) => sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted));
      const keys = ['energyReturn', 'weight', 'outsoleDurability', 'shockAbsorption'] as const;
      const total = keys.reduce((a, k) => a + spread(k), 0);
      const nominal = keys.reduce((a, k) => a + TEMPO.weights[k]!, 0);
      for (const k of keys) expect(spread(k) / total).toBeCloseTo(TEMPO.weights[k]! / nominal, 1);
    }
  });

  it('ranks the archetypal tempo shoes above the fragile flats they resemble', () => {
    const r = [...scoreMap(TEMPO, POOL, 'heel', false, realIdx).entries()]
      .sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
    expect(r[0]).toBe('asics-megablast');
    expect(r.indexOf('adidas-adizero-evo-sl')).toBeLessThan(5);
    expect(r.indexOf('adidas-adizero-takumi-sen-11')).toBeGreaterThan(30); // outsole life 1.0
  });
});
```

`sd` is a local helper in `score.test.ts`; `POOL` is already defined at module level there — **use it rather than redeclaring** a second spelling of one pool.

- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Add to `DERIVED_SIDE_PAIRS`:
  `{ label: 'Tempo score', forefoot: 'tempo-score-forefoot', heel: 'tempo-score-heel' }`
  then `TEMPO`: `weights: { energyReturn: 3, weight: 2, outsoleDurability: 2, shockAbsorption: 1 }`, `sd: PLATED_POOL_SD`, base and stable anchors from the table, `stable.add: { midsoleWidth: 1, heelCounter: 1 }`. Append to `SCORE_DEFS`.
- [x] **Step 4:** `npm run verify` → PASS. Commit — `"Score Tempo on energy return, weight and how long the outsole lasts"`

---

### Task 3: The Race definition

- [x] **Step 1: Failing tests**

```typescript
it('pairs the Race score columns by side', () => {
  expect(swapSide('race-score-forefoot', 'heel')).toBe('race-score-heel');
});

describe('the Race score against the real fleet', () => {
  it('scores the whole fleet and anchors on it', () => {
    for (const side of SIDES) {
      const vs = [...scoreMap(RACE, REAL.shoes, side, false, realIdx).values()];
      expect(vs.length).toBe(378);
      expect(Math.max(...vs)).toBeCloseTo(100, 1);
      expect(Math.min(...vs)).toBeCloseTo(0, 1);
    }
  });

  it('ignores the stability preference entirely', () => {
    // Race declares no stable variant, so the control is inert here — and the Toolbar says so.
    for (const side of SIDES) {
      const off = scoreMap(RACE, REAL.shoes, side, false, realIdx);
      const on = scoreMap(RACE, REAL.shoes, side, true, realIdx);
      expect(on.size).toBe(off.size);
      for (const [slug, v] of off) expect(on.get(slug)).toBe(v);
    }
  });

  it('needs its own divisors, because carbon widens every spread', () => {
    expect(RACE.sd).not.toBe(EASY.sd);
    expect(RACE.sd.heel.energyReturn!).toBeGreaterThan(EASY.sd.heel.energyReturn!);
  });

  it('has no durability term, and so scores shoes the other two cannot', () => {
    expect(RACE.weights.outsoleDurability).toBeUndefined();
    expect(scoreMap(RACE, REAL.shoes, 'heel', false, realIdx).size)
      .toBeGreaterThan(scoreMap(EASY, REAL.shoes, 'heel', false, realIdx).size);
  });

  it('puts the supershoes on top without requiring a plate', () => {
    const r = [...scoreMap(RACE, REAL.shoes, 'heel', false, realIdx).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([slug]) => slug);
    const plateOf = new Map(REAL.shoes.map((s) => [s.slug, s.plate]));
    expect(r.every((slug) => plateOf.get(slug) === 'carbon')).toBe(true);
    expect(r[0]).toBe('adidas-adizero-adios-pro-evo-3');
  });
});
```

- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Add `{ label: 'Race score', forefoot: 'race-score-forefoot', heel: 'race-score-heel' }`, then `RACE`: `weights: { energyReturn: 3, weight: 2, shockAbsorption: 1 }`, `sd: WHOLE_FLEET_SD`, base anchors only, **no `stable`**. Append to `SCORE_DEFS`.
- [x] **Step 4:** `npm run verify` → PASS. Commit — `"Score Race on speed alone, with no durability to answer for"`

---

### Task 4: Derive the plumbing instead of enumerating it

- [x] **Step 1: Failing tests.** Each of `labels.test.ts`, `direction.test.ts`, `urlstate.test.ts` needs `import { SCORE_DEFS } from './score-defs';` and `const SIDES: Side[] = ['heel', 'forefoot'];` — none defines `SIDES` today.

```typescript
// labels.test.ts — keep one exact pin, so the string surgery is anchored to what it must reproduce
it('names every score column, within the phone label bound', () => {
  expect(columnLabel(EASY.keys.heel, undefined)).toBe('Easy heel score');
  for (const def of SCORE_DEFS) for (const side of SIDES) {
    const key = def.keys[side];
    const label = columnLabel(key, undefined);
    expect(widestWordPx(shortLabel(key, label))).toBeLessThanOrEqual(MAX_LABEL_PX);
    expect(lineCount(shortLabel(key, label))).toBeLessThanOrEqual(MAX_LABEL_LINES);
  }
});
```

plus the `directionOf` and `parseView` loops over `SCORE_DEFS`.

- [x] **Step 2:** Run → FAIL.
- [x] **Step 3: The four derivations**
  - `labels.ts` — a `Map` from `DERIVED_SIDE_PAIRS` replacing the two `if`s; the composition is `` `${p.label.replace(/ score$/, '')} ${side} score` ``. Add a WHY comment: it depends on every derived pair's label ending in " score", which is why the exact pin above stays.
  - `direction.ts` — spread `Object.fromEntries(DERIVED_SIDE_PAIRS.flatMap((p) => [[p.heel, 'higher'], [p.forefoot, 'higher']]))` into `DIRECTION`. Add a WHY comment: this asserts every *derived* pair is a score and higher is better, which is a property of that list rather than an inference from a slug — `direction.ts` refuses inference everywhere else.
  - `urlstate.ts` — replace the `EASY_SCORE_KEYS` spread in `SORT_FIELDS` and `COLUMN_FIELDS`.
  - `ColumnPicker.svelte` — `FIXED` derives its score entries and labels them with `columnLabel(key, undefined)` rather than holding a third copy of the string. Keep the existing UI order and append the score columns.

**Widths are already measured and all six fit** — widest word 47.6 px ("forefoot") against 52 px. But `lineCount` is **exactly 3 against a `MAX_LABEL_LINES` of 3**, so that assertion is load-bearing rather than ceremonial. No `SHORT_LABELS` entry needed.

Also re-point `units.test.ts`, which iterates `EASY_SCORE_KEYS` for the `↑`/no-`/100` guard — otherwise it silently covers one story of three. `units.ts` itself needs no change.

- [x] **Step 4:** `npm run verify` → PASS. Commit — `"Derive the score columns from the pairs that declare them"`

---

### Task 5: Resolve every score

**Before Task 6, deliberately.** Task 6 makes the presets sort by keys this task resolves; the other order would ship one commit where clicking Tempo gives a column of em dashes, and nothing in the suite would catch it.

- [x] **Step 1: Failing test.** In `Page.test.ts`, render with a view showing `RACE.keys.heel`, read that column's cells, toggle `stability`, and assert the cells are unchanged.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:**

```typescript
  /** Every score column the table can show, resolved once. Iterates the registry, so a fourth story
   *  needs no edit here (docs/app.md §The story scores). */
  const scores = $derived(new Map(
    SCORE_DEFS.flatMap((def) => (['heel', 'forefoot'] as const).map((side) =>
      [def.keys[side], scoreMap(def, data.shoes, side, view.stability, idx)] as const))));
```

`RACE` having no `stable` makes the flag inert inside `scoreOf`; no branch belongs here.

- [x] **Step 4:** `npm run verify` → PASS. Commit — `"Resolve every story's score for the table"`

---

### Task 6: The presets lose their thresholds, and Tempo gains its plate gate

- [x] **Step 1: Failing tests**

```typescript
it('keeps carbon out of Tempo, or Tempo collapses into Race', () => {
  // The Tempo spec's central decision: a carbon-inclusive Tempo shares 11 of its top 20 with a pure
  // speed ranking against 2 without. `presets.test.ts` currently pins the *absence* of this filter.
  for (const strike of STRIKES) {
    expect(applyPreset('tempo', FLEET, idx, strike, false).filters.plate).toEqual(['none', 'plated-other']);
  }
});

it('race admits carbon and never requires it', () => {
  for (const strike of STRIKES) {
    expect(applyPreset('race', FLEET, idx, strike, false).filters.plate).toBeUndefined();
  }
});

it('no story carries a range bound any more', () => {
  for (const p of PRESETS) for (const strike of STRIKES) {
    expect(Object.keys(applyPreset(p.id, FLEET, idx, strike, false).filters.ranges)).toEqual([]);
  }
});

it('each story sorts by its own score and shows it', () => {
  for (const p of PRESETS) for (const strike of STRIKES) {
    const v = applyPreset(p.id, FLEET, idx, strike, false);
    const def = defForPreset(p.id)!;
    expect(v.sort).toEqual({ key: def.keys[strike], dir: 'desc' });
    expect(v.columns).toContain(def.keys[strike]);
  }
});

it('every story still round-trips and still names a side', () => {
  for (const p of PRESETS) for (const strike of STRIKES) {
    const v = applyPreset(p.id, FLEET, idx, strike, false);
    expect(parseView(serializeView(v), idx)).toEqual(v);
    expect(sideOf(v)).toBe(strike);
  }
});
```

- [x] **Step 2:** Run → FAIL.
- [x] **Step 3: Implement.** Delete `PRICE_PERCENTILE`, `TEMPO_ENERGY_RETURN_PERCENTILE`, `TEMPO_WEIGHT_PERCENTILE`, `RACE_MAX_WEIGHT`, `RACE_ENERGY_RETURN_PERCENTILE` and `fleetCap`.

**Tempo gains `v.filters.plate = ['none', 'plated-other']`** — it has none today, and this is the spec's central decision, not a detail. **Race sets no plate filter at all.** Column sets, six numeric each:

```typescript
const tempoColumns = (strike: Side) =>
  ['releasedAt', TEMPO.keys[strike], 'score', 'msrpGbp',
   sideKey('Energy return', strike), 'weight', 'outsole-durability', 'plate'];
const raceColumns = (strike: Side) =>
  ['releasedAt', RACE.keys[strike], 'score', 'msrpGbp',
   sideKey('Energy return', strike), 'weight', sideKey('Shock absorption', strike), 'plate'];
```

Rewrite all three `PRESETS[].describe` strings **and the three `desc` strings in `SetupStrip.svelte`** (`'Cushioned, no carbon, affordable'`, `'Light, fast, affordable'`, `'Lightest, fastest, price no object'`) — the cards are the first screen a runner sees and "affordable" is exactly the price-cap promise that no longer exists. Together these close BACKLOG item 13. `SetupStrip.test.ts` pins Easy's verbatim.

- [x] **Step 4: The full fallout.** `presets.test.ts`:
  - lines 5–9, the import of five deleted constants — **compile error**.
  - line 90 `NUMERIC_COLUMNS = { easy: 6, tempo: 4, race: 4 }` → **all three become 6**, and its trailing comment is rewritten.
  - lines 166–169 `SIDE_BOUNDS` → empty, which makes three tests **vacuous rather than failing** (204, 219, and the per-story loop at 320). Delete them; a green test that checks nothing is worse than a red one.
  - lines 173–186 "bounds, sorts by and shows the half the strike names" — rewrite around the score key.
  - line 256 "tempo asks for more than most of the fleet…" — rewrite; note `filters.plate` is no longer `undefined`.
  - lines 267, 287, 307 — delete (fleet-tracking bounds).
  - line 276 "race is speed alone…" — rewrite for the score.
  - line 297 the price-cap test — **delete, do not re-point**: no story caps price and the constant is gone.
  - lines 326–327 empty-fleet assertions on `RACE_MAX_WEIGHT` — rewrite.
  - line 354 "no preset bounds a metric its own coverage warning would flag" — now vacuous for every story. Leave it; Task 10 records the loss.
  - `describe('preset thresholds track the fleet')` at 294 retains only its empty-fleet test — rename it.

  **Lint casualties**, which fail `npm run lint` before the tests run: in `presets.test.ts`, `quantile` (l.13), `SidePairLabel` (l.4), `readingsOf` (l.20), `SIDE_SLUGS` (l.170), `priced` (l.295); in `presets.ts`, `quantile`, `numericValue`, `Shoe`, `TestIndex` once `fleetCap` goes.

  `Page.test.ts` needs **no** change: its `r.` params are hand-built URLs, not preset output.

- [x] **Step 5:** `npm run verify` → PASS. Commit — `"Rank every story by its own score rather than by bounds"`

---

### Task 7: The breakdown panel, for three stories

`DetailPanel.svelte` does **not** iterate columns today: it derives from `SIDES`, filters on `columns.includes(EASY.keys[s])`, and keys its `{#each}` by `(b.side)` (line 93). With three definitions on screen `heel` appears three times and Svelte throws **duplicate key**.

- [x] **Step 1: Failing test** — a view showing all six score columns renders six breakdowns, each titled by `columnLabel`; Race's has three rows and never a stability row even with `stability: true`.
- [x] **Step 2:** Run → FAIL (duplicate key, or three breakdowns not six).
- [x] **Step 3:**

```typescript
  const breakdowns = $derived(view.columns.flatMap((key) => {
    const def = defForKey(key); const side = sideOfKey(key);
    return def && side ? [{ key, def, side, rows: contributions(def, shoe, side, stability, idx) }] : [];
  }));
```

`{#each breakdowns as b (b.key)}`. Use `sideOfKey` from `lineage.ts` — **not** a `key.endsWith('-heel')` heuristic, which would be a second spelling of something `lineage.ts` owns and the slug-inference pattern it refuses everywhere. `TERM_LABEL` becomes `Record<TermKey, string>` and gains a `weight` entry.

- [x] **Step 4:** `npm run verify` → PASS. Commit — `"Break down whichever story's score is on screen"`

---

### Task 8: The Toolbar stops speaking only about Easy

Three Easy-specific strings live here, visible whichever story is selected: `SCORE_LABEL = 'the Easy score'`, `SCORE_HELP`, and the always-visible caption `<small>Adds midsole width and heel counter stiffness to the Easy score.</small>`. Ship as-is and a runner on Race reads a caption about a score that is not on screen, attached to a control that does nothing — the exact failure the Race spec forbids.

- [x] **Step 1: Failing test** — the caption and popover name the stories the preference reaches and say why Race is excluded.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Make all three story-neutral. **Derive the story list** — `SCORE_DEFS.filter((d) => d.stable)` mapped through `PRESETS` for labels — rather than writing "Easy and Tempo", so a fourth story needs no edit here. **Do not enumerate each story's terms in `SCORE_HELP`**: that would be a second home for `score-defs.ts`, which the file's own comment refuses. Say what the preference adds, which stories it reaches, and that race shoes have no stable variant to surface; leave per-story terms to the breakdown panel.

Four assertion sites in `Toolbar.test.ts` (around lines 131, 134, 154, 162) pin the current strings; the popover test also asserts `/not scored/i` and `/2026-07-30/`, both of which must survive.

- [x] **Step 4:** `npm run verify` → PASS. Commit — `"Say which stories the stability preference reaches"`

---

### Task 9: The browser suite

`app/e2e/fixtures/shoes.json` already carries weight (test 24), energy return, shock absorption and both outsole tests on all four reading-carrying shoes, so **Tempo and Race each score four shoes in a strict order and the fixture needs no extension.**

- [x] **Step 1:** Add specs: Tempo shows a Tempo score column and ranks by it; Race shows a Race score column, applies **no filter at all**, and ticking stability leaves the Race order unchanged.
- [x] **Step 2:** `npm -w app run e2e` → PASS. Commit — `"Exercise all three scores in the browser suite"`

---

### Task 10: Docs

Read `docs/README.md` first — forward-only.

- [x] **Step 1: `docs/shoe-stories.md`**, four sections, not two:
  - **§Tempo** and **§Race** — rewrite around their terms. Replace Tempo's "carbon is deliberately left open" with the precautionary line plus the collapse-into-Race finding. Record shock absorption as a floor in both. Record that Race admits carbon but never requires it and that its weight ceiling is gone. Strengthen Race's stability position with the measurement.
  - **§How a story becomes a threshold** — its table maps qualities to bounds; it now maps qualities to *terms*, and the "repeatability | price" row goes.
  - **§Which half a story uses** — keep the per-side-constants rule; drop "every bound that can swap sides is a percentile" and "Race's weight ceiling is the only one left".
  - **§Checking a threshold set** — keep the one-sided method, which both specs still point at; update "Tempo does not yet", since Tempo now reads 20–24/30 with `competition`-only at 0/30.
- [x] **Step 2: `docs/app.md`** — **§Presets** as well as §The story scores. §Presets currently states that every threshold lives in one constants block, that "a story need not bound anything" as an Easy-only fact, the whole "Thresholds are a mix" paragraph ending "Race's weight ceiling is the only one", and that the sparse-bound guard is asserted in both directions. All four are now false. §The story scores gains: the shared engine and `ScoreDef`; divisors named for their pool and shared by reference, and Race's differing; anchors per story and per variant; the preference reaching Easy and Tempo only, **and that one named preference is a deliberate decision rather than an unfinished generalisation** (BACKLOG item 3 rejects the general picker); the six score columns; that a shoe outside a definition's pool still scores and may exceed 100.
- [x] **Step 3: `BACKLOG.md`** — items 1, 11 and 13 close. **Item 14 widens** from Easy to all three stories. **Item 12** loses its premise that no view shows the three scores side by side — a runner can now tick all six columns — and gains the trap: the three cover **different shoe sets** (283, 283, 378, not nested), so it cannot average over whichever exist without reintroducing the renormalisation flaw rejected for Easy.
- [x] **Step 4:** `npm run check:docs` → PASS. Commit — `"Record what each story's score measures"`

---

### Task 11: Verify

- [x] **Step 1:** `npm run verify` → PASS, `src/lib/**` above 90% lines / 85% branches.
- [x] **Step 2:** `npm -w app run e2e` → PASS.
- [x] **Step 3: Look at it.** `npm -w app run dev`:
  - **Tempo** leads Megablast, EVO SL, ANTA Zone 2 90, and shows **no carbon shoe at all**.
  - **Race** leads Adios Pro Evo 3, Metaspeed Ray, Fast-R Nitro Elite 3; the top twelve are all carbon; **no filter chip is active**.
  - Ticking stability moves Easy and Tempo and leaves **Race's order and numbers identical**.
  - All three stories stay marked through the toggle.
  - Expand a row with several score columns: one breakdown each, and the shared terms appear **in the same order** in every table.

  Easy's list is covered by Task 1's equivalence test rather than by eye — the baseline fixture is gone by then, so there is nothing to compare against on screen.
- [x] **Step 4:** Commit any fixes. **Do not push or merge.** Report and stop.

---

## Self-Review

**Spec coverage.** Tempo §2 pool → Task 6 (gate **and** test). §3 → Task 2. §4 → Tasks 1–2. §5 → Task 2. §6 → Task 6. §7 → Tasks 2, 11. §8 → Task 10. Race §2 → Task 6. §3 → Task 3. §4 → Task 3. §5 → Tasks 3, 5, 8. §6 → Task 6. §7 → Tasks 3, 11. §8 → Task 10. §9 → Task 10.

**Type consistency.** `TermKey` members fixed throughout. `scoreOf`/`scoreMap`/`contributions` take `(def, …)` first, all fully annotated. `def.keys[side]`, `def.base.anchors`, `def.stable?.add` spelled identically in Tasks 1–7. `SCORE_DEFS`, `defForKey`, `defForPreset`, `sideOfKey` are the only lookups.

**Ordering constraints.** Tasks 2 and 3 each add their own `DERIVED_SIDE_PAIRS` entry, because `derivedSideKey`'s parameter type admits only labels already in that list — so Task 4 must follow both. Task 5 precedes Task 6 so no commit ships a preset sorting by an unresolved key.

**`TERM_ORDER` opens on Easy's existing order deliberately** — `['shockAbsorption', 'outsoleDurability', 'energyReturn', …]`. Any other order changes both the breakdown a runner reads and the floating-point summation order, which would break the bit-equality the equivalence test depends on (measured: 188 of 1132 scores move in their last bits under the alternative).

**One place the plan hard-codes a story trio, knowingly:** nowhere. Task 8's copy derives its story list from `SCORE_DEFS.filter((d) => d.stable)`. A fourth story needs: one `DERIVED_SIDE_PAIRS` entry, one `ScoreDef` with its constants, one `presets.ts` case with its columns, and one card `desc`.
