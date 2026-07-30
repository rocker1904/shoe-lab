# Tempo and Race Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Tempo and Race their own lab-measurement scores on the pipeline Easy already uses, and drop every threshold the two stories still carry.

**Architecture:** `score.ts` currently hard-codes Easy. Task 1 turns it into a **story-agnostic engine plus a declarative `ScoreDef`**, with Easy re-expressed as one definition and every published score proved bit-identical. Tasks 2–3 add Tempo and Race. The extension point is genuinely one definition plus one `DERIVED_SIDE_PAIRS` entry: a registry (`SCORE_DEFS`, `defForKey`, `defForPreset`) means no consumer enumerates the stories.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, Playwright. Zero runtime dependencies.

## Global Constraints

- **Specs:** `docs/superpowers/specs/2026-07-30-tempo-scoring-design.md` and `…-race-scoring-design.md`. Where this plan and a spec disagree, stop and ask.
- **TDD:** failing test first; a red phase only counts if the test *ran* and failed on its assertion.
- **Docs ride the change.**
- **`npm run check:docs` resolves `§` pointers inside source comments too.** A `§` must name a real heading and must not wrap across a newline.
- **The docs heading is already `docs/app.md §The story scores`.** It was `§The Easy score` and was renamed ahead of this plan, along with all 29 pointers across `docs/app.md`, `docs/shoe-stories.md`, `docs/decisions.md`, `BACKLOG.md`, nine source and test files and the frozen specs — doing it inside Task 1 would have left the gate red for the whole task. **Write `§The story scores` in every comment and doc you touch.** The section still describes only Easy; Task 10 generalises its content.
- **Commits:** single-line subjects, no embedded measurements, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Worktree:** `~/dev/shoe-lab-tempo-scoring`, branch `tempo-scoring`. Do not regenerate `data/`. Do not push or merge.
- **Never recompute a frozen constant from the loaded fleet** (docs/decisions.md §Frozen scores and live thresholds).
- **Gate:** `npm run verify` then `npm -w app run e2e`.

### The frozen constants

Divisors belong to a **pool**, never to a story. Easy and Tempo rank the plate-filtered pool and therefore **share one object by reference**; Race ranks the whole fleet, where carbon widens every spread.

```
mapping constants (stage 1, engine-owned, global)
  SA_REF = 200    W_REF = 450 (new)    L_OK = 3.0    WID_CAP  heel 3.04  forefoot 5.37

PLATED_POOL_SD — 378 shoes, plate ≠ carbon        heel      forefoot
  energyReturn                                    0.0758    0.0790
  weight                                          0.0776    0.0776
  outsoleDurability                               0.1614    0.1614
  shockAbsorption                                 0.0896    0.0961
  midsoleWidth                                    0.0872    0.1133
  heelCounter                                     0.2712    0.2712

WHOLE_FLEET_SD — 450 shoes                        heel      forefoot
  energyReturn                                    0.0902    0.0900
  weight                                          0.0904    0.0904
  shockAbsorption                                 0.0902    0.0930

anchors
  easy   base heel 3.7275 / 8.4740   fore 3.7119 / 7.6771
         stable heel 4.3963 / 7.4104   fore 3.9456 / 6.5670
  tempo  base heel 4.7625 / 7.9385   fore 4.5415 / 7.6499
         stable heel 5.0514 / 7.3590   fore 4.7002 / 6.8820
  race   base heel 3.7787 / 8.5477   fore 3.9800 / 8.6001      (no stable variant)

weights                   ER   WT   DUR   SA   | stability adds (each)
  easy                     1    —     1    2   |   1
  tempo                    3    2     2    1   |   1
  race                     3    2     —    1   |   none
```

`PLATED_POOL_SD` carries all six terms; `weights` decides which are read, so Easy simply ignores `weight`. That is what lets Easy and Tempo share one object.

### One thing that is easy to misread

The **pool defines where a definition's constants came from; it does not gate computation.** `Page` scores every loaded shoe against every definition, so a carbon shoe does get an Easy score — it is filtered out of Easy's *view* by the plate filter. Already true today. A shoe outside a definition's pool can therefore score above 100 or below 0, which is correct and **must not be clamped**. There is deliberately **no `pool` predicate on `ScoreDef`** — a callable would invite exactly that mistake. The pool lives in the *name* of the divisor constant instead.

---

## File Structure

| file | responsibility |
|---|---|
| `app/src/lib/score.ts` | **the engine.** `TermKey`, mapping constants, `readings`, `terms`, `ScoreDef`, `contributions`, `scoreOf`, `scoreMap`, `ScoreColumns`, `TERM_ORDER`. No story-specific numbers, and it imports nothing from `score-defs.ts` |
| `app/src/lib/score-defs.ts` | **new.** `PLATED_POOL_SD`, `WHOLE_FLEET_SD`, the three defs, `SCORE_DEFS`, `defForKey`, `defForPreset`. Data plus lookups |
| `app/src/lib/side.ts` | exports `sideOfKey` so nothing re-derives a side from a slug suffix |
| `app/src/lib/lineage.ts` | two more `DERIVED_SIDE_PAIRS` entries (added in Tasks 2 and 3, with their definitions) |
| `app/src/lib/labels.ts`, `direction.ts`, `urlstate.ts` | **derive** from `DERIVED_SIDE_PAIRS` rather than enumerating stories |
| `app/src/lib/presets.ts` | Tempo and Race resolve to score sorts, bounds dropped; all three `describe` strings rewritten |
| `app/src/Page.svelte` | resolve score maps by iterating `SCORE_DEFS` |
| `app/src/components/ColumnPicker.svelte` | score columns derived, labelled through `columnLabel` |
| `app/src/components/Toolbar.svelte` | the label, the caption **and** the popover stop being Easy-specific |
| `app/src/components/DetailPanel.svelte` | one breakdown per score column present, keyed by column key |

---

### Task 0: Baseline and a regression fixture

- [ ] **Step 1:** `cd ~/dev/shoe-lab-tempo-scoring && npm install`
- [ ] **Step 2:** `npm run verify` → PASS. `npm -w app run e2e` → PASS. If either fails, stop and report.
- [ ] **Step 3: Capture Easy's exact current output.** Task 1 transcribes ~20 frozen constants into a new file, so transcription error is the real risk and endpoint checks will not catch a wrong middle. Write a throwaway script that imports the *current* `easyScoreMap` and dumps all four (side, stability) combinations over the plate-filtered pool to `app/src/lib/__fixtures__/easy-scores-baseline.json` — `{ "heel:off": { slug: number, … }, … }`, 283 entries each.

```bash
# run it however is convenient (vitest scratch test, tsx, whatever), then:
git add app/src/lib/__fixtures__/easy-scores-baseline.json
git commit -m "Capture the Easy scores the refactor must reproduce"
```

This fixture is deleted at the end of Task 1. It exists to make Task 1's headline claim a check rather than a claim.

---

### Task 1: Generalise the engine, with Easy's output proved unchanged

**Files:** `app/src/lib/score.ts`, new `app/src/lib/score-defs.ts`, `app/src/lib/side.ts`, `score.test.ts`, `side.test.ts`, `docs/app.md` (+ every `§The story scores` pointer), and every importer.

**Interfaces produced:**
- `type TermKey = 'energyReturn' | 'weight' | 'outsoleDurability' | 'shockAbsorption' | 'midsoleWidth' | 'heelCounter'`
- `interface Reading { value: number; over?: [number, number] }`
- `readings(shoe, side, idx): Record<TermKey, Reading | null>`
- **`terms(shoe, side, idx): Record<TermKey, number | null>`** — the mapped terms, story-agnostic. **This replaces `easyTerms` and the ten existing unit tests re-point at it**; without it those tests have no entry point, because `contributions` returns `null` wholesale whenever a weighted term is missing and never surfaces unweighted terms.
- `ScoreDef`, `ScoreVariant`, `Anchor`, `Contribution`, `contributions`, `scoreOf`, `scoreMap`, `ScoreColumns`, `TERM_ORDER`
- `sideOfKey(key): Side | null` from `side.ts`
- `EASY`, `SCORE_DEFS`, `defForKey`, `defForPreset` from `score-defs.ts`
- **Retired:** `EasyTermKey`, `EasyTerms`, `EasyReading`, `easyReadings`, `easyTerms`, `EASY_WEIGHTS`, `TERM_SD`, `ANCHORS`, `easyContributions`, `easyScore`, `easyScoreMap`, **and `EASY_SCORE_KEYS`** — keeping the last as an alias would give one story's keys a special name the other two lack, which is how `TEMPO_SCORE_KEYS` gets written next. Consumers read `EASY.keys`.

- [ ] **Step 1: Write the equivalence test**

```typescript
import BASELINE from './__fixtures__/easy-scores-baseline.json';

it('reproduces every published Easy score exactly', () => {
  // Task 1 is a refactor. The arithmetic and its summation order are unchanged, so bit-equality is
  // the right bar — endpoint checks would pass while a mistyped divisor moved the whole middle.
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

- [ ] **Step 2:** Run → FAIL (`scoreMap`/`EASY` not exported).

- [ ] **Step 3: Rewrite `score.ts` as the engine**

**All four mapping constants stay here**, beside `mapReadings` that uses them — they are stage 1 of the pipeline, not story data, and the Tempo spec is explicit that a per-story `L_OK` is the one thing that would let two scores over one pool disagree about one measurement. Moving them to `score-defs.ts` would also create an import cycle, since `score-defs.ts` must import the types from here.

```typescript
export const SA_REF = 200;
export const W_REF = 450;
export const L_OK = 3.0;
export const WID_CAP: Record<Side, number> = { heel: 3.04, forefoot: 5.37 };

export type TermKey =
  | 'energyReturn' | 'weight' | 'outsoleDurability' | 'shockAbsorption'
  | 'midsoleWidth' | 'heelCounter';

/** The order every breakdown reads in, whatever order a definition happens to declare its weights.
 *  Two score columns on screen at once would otherwise list their shared terms differently. */
export const TERM_ORDER: TermKey[] = [
  'shockAbsorption', 'energyReturn', 'weight', 'outsoleDurability', 'midsoleWidth', 'heelCounter',
];

export function readings(shoe: Shoe, side: Side, idx: TestIndex): Record<TermKey, Reading | null> { … }

/** Stage 1: each reading becomes 0–1 and linear in goodness, true zero preserved. Shared by every
 *  story — a metric means the same thing whichever score reads it, which is also why two stories
 *  over one pool share divisors (docs/app.md §The story scores). */
export function terms(shoe: Shoe, side: Side, idx: TestIndex): Record<TermKey, number | null> { … }
```

The definition shape groups what must co-exist, so the illegal state is unrepresentable:

```typescript
export interface Anchor { r0: number; r100: number }
export interface ScoreVariant { anchors: Record<Side, Anchor> }

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
  /** Present exactly when the stability preference applies. Structural rather than a comment: the
   *  extra weights and the scale they are anchored on cannot come from different halves. */
  stable?: ScoreVariant & { add: Partial<Record<TermKey, number>> };
}

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

export function scoreOf(def, shoe, side, stability, idx): number | null {
  const rows = contributions(def, shoe, side, stability, idx);
  if (rows === null) return null;
  const { weights, anchors } = variantOf(def, stability);
  const total = rows.reduce((sum, r) => sum + weights[r.key]!, 0);
  const mean = rows.reduce((sum, r) => sum + r.weighted, 0) / total;
  const { r0, r100 } = anchors[side];
  return ((mean - r0) / (r100 - r0)) * 100;
}
```

**`keys` comes from `TERM_ORDER`, not `Object.keys(weights)`** — that fixes the display-order problem and removes the dependence on literal declaration order in one move.

- [ ] **Step 4: Create `score-defs.ts`**

Name the divisor tables for their pools and share by reference:

```typescript
/** Divisors over the plate-filtered pool — 378 shoes at `data/` commit baed23b. Shared by Easy and
 *  Tempo *by reference*, because a divisor is a property of (metric, mapping, pool) and never of the
 *  story: two copies would be two homes for one fact (docs/README.md §Rules). */
const PLATED_POOL_SD: Record<Side, Partial<Record<TermKey, number>>> = Object.freeze({ … });
/** Divisors over the whole fleet — 450 shoes. Carbon widens every spread, so Race cannot use the
 *  table above; its energy-return divisor is 0.0902 against 0.0758. */
const WHOLE_FLEET_SD: Record<Side, Partial<Record<TermKey, number>>> = Object.freeze({ … });

export const EASY: ScoreDef = { id: 'easy', keys: {…}, weights: {…}, sd: PLATED_POOL_SD, base: {…}, stable: {…} };
export const SCORE_DEFS: readonly ScoreDef[] = [EASY];  // TEMPO and RACE join in Tasks 2 and 3
export const defForKey = (key: string) => SCORE_DEFS.find((d) => d.keys.heel === key || d.keys.forefoot === key);
export const defForPreset = (id: string) => SCORE_DEFS.find((d) => d.id === id);
```

The frozen-constants doc comment moves here with the constants it is about.

- [ ] **Step 5: Add the divisor-completeness invariant**

`Partial` plus `def.sd[side][key]!` makes a missing divisor a silent `NaN` — `weight * mapped / undefined`, stored by `scoreMap` because its guard is `!== null`, then sorted, washed and exported as a number-shaped nothing rather than the em dash an unscored shoe gets. Race's table legitimately holds only three of six terms, which is exactly where a mistyped weight key would land. Guard it the way `lineage.test.ts` guards catalogue agreement:

```typescript
it('every weighted term has a divisor on both sides, for every story', () => {
  for (const def of SCORE_DEFS) {
    const all = { ...def.weights, ...(def.stable?.add ?? {}) };
    for (const key of Object.keys(all) as TermKey[]) {
      for (const side of SIDES) expect(Number.isFinite(def.sd[side][key])).toBe(true);
    }
  }
});

it('a stable variant and its anchors arrive together', () => {
  for (const def of SCORE_DEFS) {
    if (def.stable) expect(Object.keys(def.stable.add).length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 6: Export `sideOfKey` from `side.ts`**

`SIDE_OF_KEY` already maps every side-paired key to its half, built from `ALL_SIDE_PAIRS`. Export a reader for it. Nothing may re-derive a side from a slug suffix — `lineage.ts` refuses that pattern everywhere else, and Task 7 needs exactly this.

- [ ] **Step 7: Re-point the existing tests, then run**

Constant-pinning and API tests move to `EASY.weights`, `EASY.sd`, `EASY.base.anchors` — **the numbers do not change, only where they are read from**. `easyTerms` tests become `terms` tests. **No real-dataset numeric assertion may move.** Keep the pinning test: retiring the named exports must not retire the frozen-constant guard.

Run: `npm run verify` → PASS, including the exact-reproduction test.

- [ ] **Step 8:** Delete `app/src/lib/__fixtures__/easy-scores-baseline.json` and its import, re-run `npm run verify`, then commit.

```bash
git commit -m "Make the scoring engine read a story definition rather than Easy"
```

---

### Task 2: The Tempo definition

Adds its own `DERIVED_SIDE_PAIRS` entry — `derivedSideKey`'s parameter is typed `DerivedSidePairLabel`, today the literal `'Easy score'` alone, so a definition cannot compile before its pair exists.

**Files:** `lineage.ts`, `lineage.test.ts`, `score-defs.ts`, `score.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
it('pairs the Tempo score columns by side', () => {
  expect(swapSide('tempo-score-heel', 'forefoot')).toBe('tempo-score-forefoot');
});

describe('the Tempo score against the real fleet', () => {
  const POOL = REAL.shoes.filter((s) => s.plate !== 'carbon');

  it('scores the plate-filtered pool and anchors on it', () => {
    for (const side of SIDES) for (const stability of [false, true]) {
      const vs = [...scoreMap(TEMPO, POOL, side, stability, realIdx).values()];
      expect(vs.length).toBe(283);
      expect(Math.max(...vs)).toBeCloseTo(100, 1);
      expect(Math.min(...vs)).toBeCloseTo(0, 1);
    }
  });

  it('shares one divisor table with Easy, by reference', () => {
    // Object identity, not value equality: `toBe` on numbers would pass against a copied literal,
    // which is the thing this asserts against.
    expect(TEMPO.sd).toBe(EASY.sd);
  });

  it('delivers its nominal weights as effective influence', () => {
    const rows = POOL.map((s) => contributions(TEMPO, s, 'heel', false, realIdx)).filter((r) => r !== null);
    const spread = (k: TermKey) => sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted));
    const total = (['energyReturn', 'weight', 'outsoleDurability', 'shockAbsorption'] as const)
      .reduce((a, k) => a + spread(k), 0);
    expect(spread('energyReturn') / total).toBeCloseTo(0.375, 1);
    expect(spread('shockAbsorption') / total).toBeCloseTo(0.125, 1);
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

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add the `DERIVED_SIDE_PAIRS` entry, then `TEMPO` with weights `energyReturn 3, weight 2, outsoleDurability 2, shockAbsorption 1`, `sd: PLATED_POOL_SD`, `stable: { add: { midsoleWidth: 1, heelCounter: 1 }, anchors: … }`. Append to `SCORE_DEFS`.
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Score Tempo on energy return, weight and how long the outsole lasts"`

---

### Task 3: The Race definition

**Files:** `lineage.ts`, `lineage.test.ts`, `score-defs.ts`, `score.test.ts`

- [ ] **Step 1: Failing tests**

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

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add the pair, then `RACE` — weights `energyReturn 3, weight 2, shockAbsorption 1`, `sd: WHOLE_FLEET_SD`, **no `stable`**, base anchors only. Append to `SCORE_DEFS`.
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Score Race on speed alone, with no durability to answer for"`

---

### Task 4: Derive the plumbing instead of enumerating it

Four files currently name Easy's keys explicitly. Make each derive from `DERIVED_SIDE_PAIRS`, so a fourth story needs no edit here.

**Files:** `labels.ts`, `labels.test.ts`, `direction.ts`, `direction.test.ts`, `urlstate.ts`, `urlstate.test.ts`, `ColumnPicker.svelte` + test

- [ ] **Step 1: Failing tests**

```typescript
// labels.test.ts — derived from the registry, not six hard-coded strings
it('names every score column within the phone label bound', () => {
  for (const def of SCORE_DEFS) for (const side of SIDES) {
    const key = def.keys[side];
    const label = columnLabel(key, undefined);
    expect(label).toMatch(/score/i);
    expect(widestWordPx(shortLabel(key, label))).toBeLessThanOrEqual(MAX_LABEL_PX);
    expect(lineCount(shortLabel(key, label))).toBeLessThanOrEqual(MAX_LABEL_LINES);
  }
});

// direction.test.ts
it('marks every score higher-is-better', () => {
  for (const def of SCORE_DEFS) for (const side of SIDES) expect(directionOf(def.keys[side])).toBe('higher');
});

// urlstate.test.ts
it('accepts every score key as a sort and a column', () => {
  for (const def of SCORE_DEFS) for (const side of SIDES) {
    expect(parseView(`sort=-${def.keys[side]}`, idx).sort.key).toBe(def.keys[side]);
    expect(parseView(`cols=${def.keys[side]}`, idx).columns).toEqual([def.keys[side]]);
  }
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In each file, build from `DERIVED_SIDE_PAIRS`: every derived key is `higher`, every one is a valid sort and column key, and `columnLabel` composes `"<pair label minus ' score'> <side> score"`. `ColumnPicker`'s `FIXED` must call `columnLabel(key, undefined)` rather than hold a third copy of `'Easy heel score'`.

**Widths are already measured and all six fit** — widest word 47.6 px ("forefoot") against a 52 px bound. But `lineCount` is **exactly 3 against a `MAX_LABEL_LINES` of 3**, i.e. zero headroom, so the assertion above is load-bearing rather than ceremonial. No `SHORT_LABELS` entry is needed.

- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Derive the score columns from the pairs that declare them"`

---

### Task 5: The presets lose their thresholds

**Files:** `presets.ts`, `presets.test.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Failing tests**

```typescript
it('no story bounds anything any more', () => {
  // Every threshold is gone: the scores read those qualities directly (BACKLOG.md item 1 closes).
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

it('race admits carbon and never requires it', () => {
  for (const strike of STRIKES) {
    expect(applyPreset('race', FLEET, idx, strike, false).filters.plate).toBeUndefined();
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

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Delete `PRICE_PERCENTILE`, `TEMPO_ENERGY_RETURN_PERCENTILE`, `TEMPO_WEIGHT_PERCENTILE`, `RACE_MAX_WEIGHT`, `RACE_ENERGY_RETURN_PERCENTILE` and the now-unused `fleetCap`. Column sets, six numeric each:

```typescript
const tempoColumns = (strike: Side) =>
  ['releasedAt', TEMPO.keys[strike], 'score', 'msrpGbp',
   sideKey('Energy return', strike), 'weight', 'outsole-durability', 'plate'];
const raceColumns = (strike: Side) =>
  ['releasedAt', RACE.keys[strike], 'score', 'msrpGbp',
   sideKey('Energy return', strike), 'weight', sideKey('Shock absorption', strike), 'plate'];
```

Rewrite all three `describe` strings — BACKLOG.md item 13. They promise bounds that no longer exist ("cheap enough to put the miles through", "at a price you can repeat", "the lightest, liveliest shoes in the fleet").

- [ ] **Step 4: The full fallout, enumerated so none is discovered late.** In `presets.test.ts`:
  - lines 5–9 — the import of all five deleted constants: **compile error**.
  - line 90 `NUMERIC_COLUMNS = { easy: 6, tempo: 4, race: 4 }` → **all three become 6**, and its trailing comment ("Tempo and Race genuinely carry four") is rewritten. The plan previously claimed this assertion was unaffected; it is not.
  - lines 166–169 `SIDE_BOUNDS` → empty, which silently makes three tests **vacuous rather than failing**: "resolves every side-swappable bound to a percentile of that side's own readings" (204), "leaves the two sides on visibly different bounds" (219), and the per-story loop in "omits a bound it cannot compute" (320). Delete them rather than leaving green tests that check nothing.
  - lines 174–186 "bounds, sorts by and shows the half the strike names" — its `['tempo','race']` block asserts a range bound; rewrite around the score key.
  - line 256 "tempo asks for more than most of the fleet…" — fails; note `filters.plate` becomes `['none','plated-other']`.
  - lines 267, 287, 307 — delete (fleet-tracking bounds).
  - line 276 "race is speed alone: no price cap and no plate requirement" — rewrite for the score.
  - line 297 the price-cap test — **delete, do not re-point**: no story caps price and the constant is gone.
  - lines 326–327 empty-fleet assertions on `RACE_MAX_WEIGHT` — rewrite.
  - line 354 `describe('no preset bounds a metric its own coverage warning would flag')` — now vacuous for every story. Leave it and record the loss in BACKLOG (Task 10).

  `Page.test.ts` needs **no** change: its `r.` params are hand-built URLs, not preset output, and its story assertions are Easy's or the generic mark regex. Do not go hunting there.

- [ ] **Step 5:** `npm run verify` → PASS. Commit — `"Rank every story by its own score rather than by bounds"`

---

### Task 6: Resolve every score, by iterating the registry

**Files:** `Page.svelte`, `Page.test.ts`

- [ ] **Step 1: Failing test** — with `stability: true`, the Race column's values equal its `stability: false` values, driven through the page.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:**

```typescript
  /** Every score column the table can show, resolved once. Iterates the registry, so a fourth story
   *  needs no edit here (docs/app.md §The story scores). */
  const scores = $derived(new Map(
    SCORE_DEFS.flatMap((def) => (['heel', 'forefoot'] as const).map((side) =>
      [def.keys[side], scoreMap(def, data.shoes, side, view.stability, idx)] as const))));
```

`RACE` having no `stable` variant makes the flag inert inside `scoreOf`; no branch belongs here.

- [ ] **Step 4:** `npm run verify` → PASS. Commit — `"Resolve every story's score for the table"`

---

### Task 7: The breakdown panel, for three stories

**The plan's earlier description of this file was wrong and the correction matters.** `DetailPanel.svelte` does **not** iterate columns today: it derives from `SIDES`, filters on `columns.includes(EASY.keys[s])`, and keys its `{#each}` by `(b.side)`. With three definitions on screen `heel` appears three times and Svelte throws **duplicate key** at runtime.

**Files:** `DetailPanel.svelte`, `DetailPanel.test.ts`

- [ ] **Step 1: Failing test** — a view showing all six score columns renders six breakdowns, each titled by `columnLabel`; Race's has three rows and never a stability row even with `stability: true`.
- [ ] **Step 2:** Run → FAIL (duplicate key, or three breakdowns not six).
- [ ] **Step 3:** Derive from the columns and key by the column key:

```typescript
  const breakdowns = $derived(view.columns
    .flatMap((key) => {
      const def = defForKey(key); const side = sideOfKey(key);
      return def && side ? [{ key, def, side, rows: contributions(def, shoe, side, stability, idx) }] : [];
    }));
```

`{#each breakdowns as b (b.key)}`. Use `sideOfKey` from `side.ts` — **not** a `key.endsWith('-heel')` heuristic, which would be a second spelling of something `side.ts` owns and the slug-inference pattern `lineage.ts` refuses everywhere. `TERM_LABEL` becomes `Record<TermKey, string>` and gains a `weight` entry. The file imports `EasyReading`/`EasyTermKey`, both retired in Task 1.

- [ ] **Step 4:** `npm run verify` → PASS. Commit — `"Break down whichever story's score is on screen"`

---

### Task 8: The Toolbar stops speaking only about Easy

Three Easy-specific strings live here, visible regardless of the selected story: `SCORE_LABEL = 'the Easy score'` (the popover's accessible name), `SCORE_HELP` (Easy's terms spelled out), and the always-visible caption `<small>Adds midsole width and heel counter stiffness to the Easy score.</small>`. Ship as planned and a runner on Race reads a caption about a score that is not on screen, attached to a control that does nothing — the exact failure the Race spec forbids.

**Files:** `Toolbar.svelte`, `Toolbar.test.ts`

- [ ] **Step 1: Failing test** — the caption and popover name Easy and Tempo as the stories the preference reaches, and say why Race is excluded.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Make label, caption and popover story-neutral. **Do not enumerate each story's terms and weights in `SCORE_HELP`** — that would be a second home for `score-defs.ts`, which the file's own comment already refuses. Say what the preference adds, which stories it reaches, and that race shoes have no stable variant to surface; leave per-story terms to the breakdown panel. Four existing tests assert the current strings (`Toolbar.test.ts` around lines 131, 134, 154, 158) — update them.
- [ ] **Step 4:** `npm run verify` → PASS. Commit — `"Say which stories the stability preference reaches"`

---

### Task 9: The browser suite

**Files:** `e2e/fixtures/shoes.json`, `e2e/smoke.spec.ts`

- [ ] **Step 1:** The fixture carries the seven scoring tests Easy needed; check its shoes give Tempo and Race a real order and extend if not.
- [ ] **Step 2:** Add specs: Tempo shows a Tempo score column and ranks by it; Race shows a Race score column, applies **no filter at all**, and ticking stability leaves the Race order unchanged.
- [ ] **Step 3:** `npm -w app run e2e` → PASS. Commit — `"Exercise all three scores in the browser suite"`

---

### Task 10: Docs

Read `docs/README.md` first — forward-only.

- [ ] **Step 1: `docs/shoe-stories.md`** — rewrite §Tempo and §Race around their terms. **Replace Tempo's "carbon is deliberately left open"** with the precautionary line plus the finding that carbon makes Tempo collapse into Race. Record shock absorption as a floor in both. Record that Race admits carbon but never requires it, and that its weight ceiling is gone. Strengthen Race's stability position with the measurement. Delete every surviving price-cap reference.
- [ ] **Step 2: `docs/app.md` §The story scores** (renamed in Task 1) — the shared engine and `ScoreDef`; that **divisors are named for their pool and shared by reference**, and Race's differ; that anchors are per story and per variant; that the stability preference reaches Easy and Tempo only, **and that one named preference is a deliberate decision rather than an unfinished generalisation** (BACKLOG.md item 3 rejects the general picker); the six score columns; that a shoe outside a definition's pool still scores and may exceed 100.
- [ ] **Step 3: `BACKLOG.md`** — items 1, 11 and 13 close. **Item 14 widens**: the sparse-bound guard is now vacuous for all three stories, not just Easy. **Item 12 (versatility)**: its premise that no view shows the three scores side by side is no longer true — a runner can tick all six columns — and it gains the trap from the Race spec, that the three cover **different shoe sets** (283, 283, 378, not nested), so it cannot average over whichever exist without reintroducing the renormalisation flaw rejected for Easy.
- [ ] **Step 4:** `npm run check:docs` → PASS. Commit — `"Record what each story's score measures"`

---

### Task 11: Verify

- [ ] **Step 1:** `npm run verify` → PASS, `src/lib/**` above 90% lines / 85% branches.
- [ ] **Step 2:** `npm -w app run e2e` → PASS.
- [ ] **Step 3: Look at it.** `npm -w app run dev`: Easy's list unchanged from before this branch; Tempo leads Megablast, EVO SL, ANTA Zone 2 90 with no carbon; Race leads Adios Pro Evo 3, Metaspeed Ray, Fast-R Nitro Elite 3, all carbon, with no filter applied; ticking stability moves Easy and Tempo and leaves Race untouched; all three stories stay marked through the toggle; expanding a row with several score columns shows one breakdown each, in the same term order.
- [ ] **Step 4:** Commit any fixes. **Do not push or merge.** Report and stop.

---

## Self-Review

**Spec coverage.** Tempo §2 → Task 5. §3 → Task 2. §4 constants and shared divisors → Tasks 1–2 (asserted by object identity). §5 → Task 2. §6 → Task 5. §7 → Tasks 2, 11. §8 → Task 10. Race §2 → Task 5. §3 → Task 3. §4 own divisors → Task 3. §5 no stability → Tasks 3, 6, 8. §6 → Task 5. §7 → Tasks 3, 11. §8 → Task 10. §9 versatility trap → Task 10.

**Type consistency.** `TermKey` members fixed across all tasks. `scoreOf`/`scoreMap`/`contributions` take `(def, …)` first. `def.keys[side]`, `def.base.anchors`, `def.stable?.add` spelled identically in Tasks 1–7. `SCORE_DEFS`, `defForKey`, `defForPreset`, `sideOfKey` are the only lookups; no task hard-codes a story trio.

**Ordering constraint.** Tasks 2 and 3 each add their own `DERIVED_SIDE_PAIRS` entry, because `derivedSideKey`'s parameter type admits only labels already in that list — a definition cannot compile before its pair exists. Task 4 must therefore come after both.

**Known ripple, named rather than discovered.** Task 1 retires every exported Easy symbol including `EASY_SCORE_KEYS`, and renames a docs heading 26 pointers depend on. Task 5 deletes five constants and breaks eleven named assertions in `presets.test.ts`, three of which would otherwise go silently vacuous. Task 7's file does not work the way an earlier draft of this plan described. Task 8 touches three visible strings, breaking four Toolbar tests.
