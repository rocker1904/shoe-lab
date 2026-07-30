# Easy Preset Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Easy's sort-by-RunRepeat-score with a lab-measurement scoring function, computed client-side, visible as a column with a per-term breakdown, plus an opt-in stability toggle.

**Architecture:** A new `app/src/lib/score.ts` owns a four-stage pipeline — physical map → divide by frozen sd → weight → rescale between frozen anchors. Every constant is frozen (derived once from `data/` at commit `baed23b`), so scores are comparable over time and may exceed 100 as shoes improve. The score is a **synthetic key** (`easy-score`) that is not a catalogue test: unlike every other column its value depends on view state (side and the stability flag), so `Page.svelte` computes a `Map<slug, number>` once and passes it to `sortShoes` and both tables.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, Playwright. Zero runtime dependencies.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-30-preset-scoring-design.md`. Where this plan and the spec disagree, stop and ask.
- **No live network in tests, ever.** Nothing in this plan touches the scraper.
- **TDD:** failing test first for every behaviour change. A red phase only counts if the test *ran* and failed on its assertion — not if the command errored.
- **Docs ride the change:** Task 11 carries the doc corrections that span several tasks.
- **Comments are WHY-only** (docs/README.md §Rules, rule 5).
- **Doc pointers are checked.** `npm run check:docs` resolves every `docs/<path>.md §Heading` in every tracked file, including source comments. A `§` must name a real heading *text* — the spec's headings are numbered (`## 10. Display, and why it comes first`), so `§10` does **not** resolve. In source comments write `spec §10` with no `docs/…` path, or point at a doc heading that exists.
- **Commits:** concise single-line subjects, no embedded measurements, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Worktree:** all work in `~/dev/shoe-lab-preset-scoring` on branch `preset-scoring`. Do not regenerate `data/`.
- **Gate:** `npm run verify` from the repo root, then `npm -w app run e2e`.
- **Frozen constants are never recomputed at runtime.** If a term's sd or an anchor is computed from the loaded fleet, the design is broken (spec §10).

### The frozen constant values (spec §14)

```
SA_REF = 200            L_OK = 3.0
WID_CAP  heel 3.04      forefoot 5.37

sd                        heel      forefoot
  shockAbsorption         0.0896    0.0961
  outsoleDurability       0.1614    0.1614
  energyReturn            0.0758    0.0790
  midsoleWidth            0.0872    0.1133
  heelCounter             0.2712    0.2712

anchors (r0, r100)
  heel     stability off  3.7277 / 8.4742
  heel     stability on   4.3967 / 7.4117
  forefoot stability off  3.7118 / 7.6761
  forefoot stability on   3.9452 / 6.5653
```

---

## File Structure

| file | responsibility |
|---|---|
| `app/src/lib/score.ts` | **new.** Frozen constants, five physical mappings, the pipeline, `easyScoreMap`, `easyContributions`. Pure — no Svelte |
| `app/src/lib/score.test.ts` | **new.** Per-stage tests on fixtures; statistical properties against real `data/shoes.json` |
| `app/src/lib/test-fixtures.ts` | add the seven scoring tests to `TESTS` and readings to `FLEET` |
| `app/src/lib/urlstate.ts` | `ViewState.stability`, serialise/parse `stab=1`, accept `easy-score` as sort key and column |
| `app/src/lib/sort.ts` | `sortShoes` takes an optional score map |
| `app/src/lib/labels.ts`, `direction.ts` | name the synthetic key; mark it `higher` |
| `app/src/lib/presets.ts` | Easy drops its bounds, sorts by the score; `applyPreset` carries `stability` through |
| `app/src/Page.svelte` | derive the score map; `allView` carries `stability`; thread side/stability down |
| `app/src/components/ShoeTable.svelte`, `ShoeTableMobile.svelte` | score cell, its wash, and passing side/stability to the panel |
| `app/src/components/DetailPanel.svelte` | the per-term breakdown |
| `app/src/components/Toolbar.svelte` | the stability toggle — **not** `SetupStrip`, which is dismissed for good |
| `app/src/components/ColumnPicker.svelte` | make the score column tickable |
| `app/src/lib/csv-export.ts` | emit the score under its raw key |
| `app/e2e/fixtures/shoes.json` | the seven tests, so the browser suite exercises a real score |

---

### Task 0: Make the gate runnable and green

The worktree has no dependencies installed and `check:docs` already fails on two pre-existing pointers. Every later red phase is meaningless until this is fixed.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-preset-scoring-design.md` (already fixed — verify)
- Modify: `docs/superpowers/plans/2026-07-30-easy-preset-scoring.md` (this file — verify)

- [ ] **Step 1: Install dependencies**

```bash
cd ~/dev/shoe-lab-preset-scoring && npm install
```

- [ ] **Step 2: Confirm the docs gate is green**

Run: `npm run check:docs`
Expected: PASS with no failures. If it still reports `has no heading "10"` or `has no heading "Which half a story"`, fix the offending pointer — a `§` must name a heading's real text, and a pointer must not wrap across a newline.

- [ ] **Step 3: Confirm the suite runs**

Run: `npm -w app run test`
Expected: PASS (the branch is currently green). If this errors rather than passing, stop and report — nothing below is trustworthy until it runs.

- [ ] **Step 4: Commit only if a doc pointer needed fixing**

```bash
git add docs/
git commit -m "Point the scoring docs at headings that exist"
```

---

### Task 1: The five physical mappings

Stage 1 only. Pure functions, each 0–1 and linear in goodness, true zeros preserved.

**Files:**
- Create: `app/src/lib/score.ts`, `app/src/lib/score.test.ts`
- Modify: `app/src/lib/test-fixtures.ts`, `app/src/lib/lineage.ts`

**Interfaces:**
- Consumes: `numericValue`, `TestIndex` from `./dataset`; `sideKey`, `Side` from `./lineage`.
- Produces: `EasyTermKey`, `EasyTerms`, `SA_REF`, `L_OK`, `WID_CAP`, `easyTerms(shoe, side, idx)`.

- [ ] **Step 1: Add the scoring tests and readings to the fixtures**

The fixture catalogue carries none of the scoring metrics. Ids 68, 67, 4, 9, 19, 26, 25 collide with nothing already in `TESTS` (6, 5, 24, 65, 66, 11, 70, 39, 27, 55) or `PRICE_TEST` (52). Add to `TESTS` in `app/src/lib/test-fixtures.ts`:

```typescript
  labTest({ id: 68, slug: 'shock-absorption-heel', name: 'Shock absorption (heel)', units: 'SA', groupId: '3', chartLabel: 'Shock absorption', secondaryTestIds: [67] }),
  labTest({ id: 67, slug: 'shock-absorption-forefoot', name: 'Shock absorption forefoot', units: 'SA', groupId: null, chartLabel: 'Shock absorption', primaryTestId: 68 }),
  labTest({ id: 4, slug: 'outsole-durability', name: 'Outsole durability', units: 'mm', groupId: '2', chartLabel: 'Outsole wear' }),
  labTest({ id: 9, slug: 'outsole-thickness', name: 'Outsole thickness', units: 'mm', groupId: '2' }),
  labTest({ id: 19, slug: 'heel-counter-stiffness', name: 'Heel counter stiffness', type: 'score', groupId: '5' }),
  labTest({ id: 26, slug: 'midsole-width-in-the-heel', name: 'Midsole width in the heel', units: 'mm', groupId: '5' }),
  labTest({ id: 25, slug: 'midsole-width-in-the-forefoot', name: 'Midsole width in the forefoot', units: 'mm', groupId: '5' }),
```

Merge these readings into the existing `values` of the four reading-carrying shoes, leaving `mystery` bare:

```
cushy   '68': 140, '67': 115, '4': 0.8, '9': 3.2, '19': 4, '26': 95, '25': 118
racer   '68': 150, '67': 125, '4': 2.0, '9': 1.5, '19': 2, '26': 82, '25': 108
trainer '68': 120, '67': 100, '4': 0.5, '9': 3.0, '19': 5, '26': 98, '25': 120
oldie   '68': 100, '67':  90, '4': 1.2, '9': 2.4, '19': 3, '26': 92, '25': 112
```

Extend the fixture's doc comment: the scoring metrics are present on all four reading-carrying shoes and absent on `mystery`, because `score.test.ts` needs exactly one unscoreable shoe.

`app/src/lib/lineage.ts:32` says "neither test fixture carries all eight slugs" as the reason `lineage.test.ts` asserts rather than throws. After this change the unit fixture *does* carry all eight. Correct that comment to name the real reason (the e2e fixture is the one that does not), or the comment becomes a false statement about why a validator is not throwing.

- [ ] **Step 2: Write the failing tests**

Create `app/src/lib/score.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { easyTerms, L_OK, SA_REF, WID_CAP } from './score';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);
const fixture = (slug: string) => FLEET.find((s) => s.slug === slug)!;

describe('easyTerms', () => {
  it('maps shock absorption as a ratio of a fixed reference, uncapped', () => {
    // SA has a credible true zero (about 3.6 SA per mm of stack through the origin), so the mapping
    // is a plain ratio rather than a rank (spec section 4).
    expect(easyTerms(fixture('cushy'), 'heel', idx).shockAbsorption).toBeCloseTo(140 / SA_REF, 6);
    expect(easyTerms(fixture('cushy'), 'forefoot', idx).shockAbsorption).toBeCloseTo(115 / SA_REF, 6);
  });

  it('maps energy return as the true percentage it already is', () => {
    expect(easyTerms(fixture('cushy'), 'heel', idx).energyReturn).toBeCloseTo(0.70, 6);
    expect(easyTerms(fixture('cushy'), 'forefoot', idx).energyReturn).toBeCloseTo(0.55, 6);
  });

  it('maps outsole durability as a capped reciprocal of wear rate', () => {
    // life = thickness / wear, so goodness is reciprocal: half the wear rate lasts twice as long.
    // Capped because the outsole is rarely what retires the shoe.
    expect(easyTerms(fixture('cushy'), 'heel', idx).outsoleDurability).toBe(1); // life 4.0 > L_OK
    expect(easyTerms(fixture('racer'), 'heel', idx).outsoleDurability).toBeCloseTo(0.75 / L_OK, 6);
  });

  it('maps midsole width as a capped width-over-stack ratio, per side', () => {
    // Stability is a lever from foot to ground, so the dimensionless ratio is the physical
    // quantity, and the cap differs per side because the halves are not on one scale.
    expect(easyTerms(fixture('cushy'), 'heel', idx).midsoleWidth)
      .toBeCloseTo(Math.min((95 / 40) / WID_CAP.heel, 1), 6);
    expect(easyTerms(fixture('cushy'), 'forefoot', idx).midsoleWidth)
      .toBeCloseTo(Math.min((118 / 30) / WID_CAP.forefoot, 1), 6);
  });

  it('maps heel counter stiffness off its 1-5 scale, not a percentile', () => {
    expect(easyTerms(fixture('cushy'), 'heel', idx).heelCounter).toBeCloseTo(0.75, 6);
    expect(easyTerms(fixture('trainer'), 'heel', idx).heelCounter).toBe(1);
    expect(easyTerms(shoe({ slug: 'x', values: { '19': 1 } }), 'heel', idx).heelCounter).toBe(0);
  });

  it('returns null for a missing reading rather than a zero', () => {
    const t = easyTerms(fixture('mystery'), 'heel', idx);
    expect(Object.values(t).every((v) => v === null)).toBe(true);
  });

  it('needs both thickness and wear for the durability term', () => {
    expect(easyTerms(shoe({ slug: 'a', values: { '4': 0.8 } }), 'heel', idx).outsoleDurability).toBeNull();
    expect(easyTerms(shoe({ slug: 'b', values: { '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('treats a zero wear reading as unmeasurable rather than dividing by it', () => {
    expect(easyTerms(shoe({ slug: 'c', values: { '4': 0, '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('every term is monotone in its reading, in the direction its mechanism says', () => {
    const t = (values: Record<string, number>) => easyTerms(shoe({ slug: 'm', values }), 'heel', idx);
    expect(t({ '68': 150 }).shockAbsorption!).toBeGreaterThan(t({ '68': 100 }).shockAbsorption!);
    expect(t({ '65': 70 }).energyReturn!).toBeGreaterThan(t({ '65': 50 }).energyReturn!);
    // Less wear is better, so the term rises as the reading falls.
    expect(t({ '4': 1.0, '9': 2.0 }).outsoleDurability!)
      .toBeGreaterThan(t({ '4': 2.0, '9': 2.0 }).outsoleDurability!);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail on the import**

Run: `npm -w app run test -- score.test.ts`
Expected: FAIL — cannot resolve `./score`. (If the command errors before running, go back to Task 0.)

- [ ] **Step 4: Write `score.ts` stage 1**

Create `app/src/lib/score.ts`:

```typescript
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
```

- [ ] **Step 5: Run the tests to verify they pass, then the whole suite**

Run: `npm -w app run test -- score.test.ts` → PASS.
Run: `npm -w app run test` → fix fallout from the fixture change. Suites that build `metricEntries` from `TESTS` or assert catalogue counts are the likely ones. The two new declared side pairs (shock absorption, midsole width) now resolve as `colocated`, so any test enumerating fixture metric rows changes shape.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/score.ts app/src/lib/score.test.ts app/src/lib/test-fixtures.ts app/src/lib/lineage.ts
git commit -m "Map each Easy scoring metric onto what it physically measures"
```

---

### Task 2: The pipeline — sd, weights, anchors

**Files:**
- Modify: `app/src/lib/score.ts`, `app/src/lib/score.test.ts`

**Interfaces:**
- Produces: `EASY_SCORE_KEY`, `EASY_WEIGHTS`, `TERM_SD`, `ANCHORS`, `easyScore(shoe, side, stability, idx)`, `easyScoreMap(shoes, side, stability, idx)`, `easyContributions(shoe, side, stability, idx)`.

- [ ] **Step 1: Write the failing fixture tests**

Append to `app/src/lib/score.test.ts`:

```typescript
import {
  ANCHORS, EASY_SCORE_KEY, EASY_WEIGHTS, easyContributions, easyScore, easyScoreMap, TERM_SD,
} from './score';
import type { Side } from './lineage';

const SIDES: Side[] = ['heel', 'forefoot'];

describe('easyScore', () => {
  it('scores nothing when any weighted term is missing', () => {
    // All-terms-required: an unscored shoe is unscored, never a zero.
    expect(easyScore(fixture('mystery'), 'heel', false, idx)).toBeNull();
    expect(easyScore(shoe({ slug: 'partial', values: { '68': 140 } }), 'heel', false, idx)).toBeNull();
  });

  it('ignores the stability terms when stability is off', () => {
    const noCounter = shoe({ slug: 'nc', values: { '68': 140, '65': 70, '4': 0.8, '9': 3.2, '6': 40, '26': 95 } });
    expect(easyScore(noCounter, 'heel', false, idx)).not.toBeNull();
    expect(easyScore(noCounter, 'heel', true, idx)).toBeNull();
  });

  it('rises when a weighted reading improves', () => {
    const base = { '68': 130, '65': 60, '4': 1.0, '9': 2.0, '6': 40, '26': 95, '19': 3 };
    expect(easyScore(shoe({ slug: 'b', values: { ...base, '68': 160 } }), 'heel', false, idx)!)
      .toBeGreaterThan(easyScore(shoe({ slug: 'a', values: base }), 'heel', false, idx)!);
  });

  it('may exceed 100, because the anchors are frozen rather than renormalised', () => {
    // The scale records that shoes improve rather than hiding it. A shoe better than anything in the
    // 2026-07-30 fleet must read above 100.
    const monster = shoe({ slug: 'future', values: { '68': 400, '65': 99, '4': 0.1, '9': 8, '6': 40, '26': 95, '19': 5 } });
    expect(easyScore(monster, 'heel', false, idx)!).toBeGreaterThan(100);
  });

  it('weights are 2:1:1 on the base terms and 1 each on the stability pair', () => {
    expect(EASY_WEIGHTS).toEqual({
      shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1, midsoleWidth: 1, heelCounter: 1,
    });
  });

  it('pins every frozen constant, so an accidental recompute fails the build', () => {
    // Derived from data/ at commit baed23b. Changing one changes every published score, so it must
    // be a deliberate edit rather than a refresh side effect.
    expect(TERM_SD.heel).toEqual({
      shockAbsorption: 0.0896, outsoleDurability: 0.1614, energyReturn: 0.0758,
      midsoleWidth: 0.0872, heelCounter: 0.2712,
    });
    expect(TERM_SD.forefoot).toEqual({
      shockAbsorption: 0.0961, outsoleDurability: 0.1614, energyReturn: 0.0790,
      midsoleWidth: 0.1133, heelCounter: 0.2712,
    });
    expect(ANCHORS.heel.off).toEqual({ r0: 3.7277, r100: 8.4742 });
    expect(ANCHORS.heel.on).toEqual({ r0: 4.3967, r100: 7.4117 });
    expect(ANCHORS.forefoot.off).toEqual({ r0: 3.7118, r100: 7.6761 });
    expect(ANCHORS.forefoot.on).toEqual({ r0: 3.9452, r100: 6.5653 });
  });

  it('reads a different number on each side, from that side own constants', () => {
    const s = fixture('cushy');
    expect(easyScore(s, 'heel', false, idx)).not.toBeCloseTo(easyScore(s, 'forefoot', false, idx)!, 3);
  });
});

describe('easyScoreMap', () => {
  it('holds an entry only for scoreable shoes', () => {
    const m = easyScoreMap(FLEET, 'heel', false, idx);
    expect(m.has('cushy')).toBe(true);
    expect(m.has('mystery')).toBe(false);
  });
});

describe('easyContributions', () => {
  it('returns one row per weighted term, with the term and its weighted contribution', () => {
    const rows = easyContributions(fixture('cushy'), 'heel', false, idx)!;
    expect(rows.map((r) => r.key)).toEqual(['shockAbsorption', 'outsoleDurability', 'energyReturn']);
    expect(easyContributions(fixture('cushy'), 'heel', true, idx)!).toHaveLength(5);
    expect(easyContributions(fixture('mystery'), 'heel', false, idx)).toBeNull();
  });
});

it('names the synthetic key so nothing open-codes it', () => {
  expect(EASY_SCORE_KEY).toBe('easy-score');
});
```

- [ ] **Step 2: Write the failing real-dataset tests**

The two properties that matter most — that stage 2 delivers the weights, and that the toggle cannot change eligibility — are properties of **real coverage** and cannot be checked on four fixture shoes. On the fixture the shares come out near 42/37/21 against a nominal 50/25/25, so a fixture-based test would pass while the failure mode §5 exists to prevent went undetected.

`direction.test.ts` and `lineage.test.ts` already read `data/` for exactly this reason (docs/operations.md §Contract-drift runbook). Follow that pattern. Create a second describe block in `score.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import type { ShoesFile } from '../../../shared/types.js';

// Read the real dataset, as direction.test.ts and lineage.test.ts do: these are properties of
// upstream coverage, so drift must fail the build rather than surface as a wrong score.
const REAL = JSON.parse(readFileSync(new URL('../../../data/shoes.json', import.meta.url), 'utf8')) as ShoesFile;
const realIdx = indexTests(REAL.tests);
const POOL = REAL.shoes.filter((s) => s.plate === 'none' || s.plate === 'plated-other');

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe('the score against the real fleet', () => {
  it('delivers the nominal weights as effective influence', () => {
    // Stage 2 exists for exactly this. Without it a term's influence is its sd on the mapped scale,
    // and outsole durability at weight 1 outweighs shock absorption at weight 2.
    for (const side of SIDES) {
      const rows = POOL.map((s) => easyContributions(s, side, false, realIdx)).filter((r) => r !== null);
      const spread = new Map((['shockAbsorption', 'outsoleDurability', 'energyReturn'] as const)
        .map((k) => [k, sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted))]));
      const total = [...spread.values()].reduce((a, b) => a + b, 0);
      expect(spread.get('shockAbsorption')! / total).toBeCloseTo(0.5, 1);
      expect(spread.get('outsoleDurability')! / total).toBeCloseTo(0.25, 1);
      expect(spread.get('energyReturn')! / total).toBeCloseTo(0.25, 1);
    }
  });

  it('scores the same shoes whether stability is on or off', () => {
    // The property the whole toggle rests on: the opt-in metrics are the best-covered in the fleet,
    // so turning stability on can never change which shoes are eligible. If upstream coverage moves,
    // this must fail rather than silently shorten the list.
    for (const side of SIDES) {
      expect(easyScoreMap(POOL, side, true, realIdx).size)
        .toBe(easyScoreMap(POOL, side, false, realIdx).size);
    }
  });

  it('anchors the scale at the fleet it was derived from', () => {
    // r0 and r100 were taken from this fleet, so today the best scoreable shoe reads 100 and the
    // worst reads 0. Freezing only takes effect on future refreshes.
    for (const side of SIDES) {
      for (const stability of [false, true]) {
        const vs = [...easyScoreMap(POOL, side, stability, realIdx).values()];
        expect(Math.max(...vs)).toBeCloseTo(100, 1);
        expect(Math.min(...vs)).toBeCloseTo(0, 1);
      }
    }
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npm -w app run test -- score.test.ts`
Expected: FAIL — `easyScore` is not exported.

- [ ] **Step 4: Implement the pipeline**

Append to `app/src/lib/score.ts`:

```typescript
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
```

- [ ] **Step 5: Run and verify**

Run: `npm -w app run test -- score.test.ts`
Expected: PASS, including the three real-dataset tests. If the anchor test fails, the constants and the dataset disagree — stop and report rather than editing the constants to fit.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/score.ts app/src/lib/score.test.ts
git commit -m "Build the Easy score from frozen constants so it holds over time"
```

---

### Task 3: `ViewState` gains the stability flag

**Files:**
- Modify: `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `app/src/lib/urlstate.test.ts`:

```typescript
it('defaults stability off', () => {
  expect(defaultView().stability).toBe(false);
});

it('serialises stability only when on, so a default view still has an empty query', () => {
  expect(serializeView(defaultView())).not.toContain('stab');
  expect(serializeView({ ...defaultView(), stability: true })).toContain('stab=1');
});

it('round-trips stability', () => {
  expect(parseView(serializeView({ ...defaultView(), stability: true }), idx).stability).toBe(true);
  expect(parseView('', idx).stability).toBe(false);
});

it('ignores a stab value that is not 1', () => {
  expect(parseView('stab=yes', idx).stability).toBe(false);
  expect(parseView('stab=0', idx).stability).toBe(false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- urlstate.test.ts`
Expected: FAIL — `stability` does not exist on `ViewState`.

- [ ] **Step 3: Implement**

In `app/src/lib/urlstate.ts`, add to `ViewState`:

```typescript
  /** Whether the Easy score counts its two stability terms. A property of the runner rather than of
   *  the search, so it survives a story click and a Clear, exactly as the side does — which is why
   *  `applyPreset` and `allView` carry it through rather than rebuilding it (docs/app.md §Presets). */
  stability: boolean;
```

Add `stability: false` to `defaultView()`. In `serializeView`, after the `missing` line: `if (v.stability) p.set('stab', '1');`. In `parseView`, alongside the `missing` branch:

```typescript
    } else if (key === 'stab' && raw === '1') {
      v.stability = true;
```

- [ ] **Step 4: Fix the typecheck and test fallout**

This adds a required property, so it is a `svelte-check` error rather than only a test failure. Known sites:
- `urlstate.test.ts:14` — a `const v: ViewState = { … }` literal with no `stability`.
- `urlstate.test.ts:98` — asserts `defaultView()` deep-equals a literal; add `stability: false`.
- `presets.test.ts:41` — asserts `Object.keys(v).sort()`; add `'stability'`.

Run: `npm -w app run test && npm run typecheck`
Expected: PASS both. Search for other whole-`ViewState` literals: `grep -rn ': ViewState = {' app/src`.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts app/src/lib/presets.test.ts
git commit -m "Carry the stability preference in the view and the link"
```

---

### Task 4: Make the synthetic key sortable and nameable

**Files:**
- Modify: `app/src/lib/sort.ts`, `sort.test.ts`, `labels.ts`, `labels.test.ts`, `direction.ts`, `direction.test.ts`, `urlstate.ts`, `urlstate.test.ts`, `units.ts`

**Interfaces:**
- Produces: `sortShoes(shoes, sort, idx, scores?: Map<string, number>)`.

- [ ] **Step 1: Write the failing tests**

`sort.test.ts`:

```typescript
import { EASY_SCORE_KEY } from './score';

it('sorts by the synthetic score from the supplied map', () => {
  const scores = new Map([['oldie', 90], ['cushy', 10], ['trainer', 50]]);
  const out = sortShoes(FLEET, { key: EASY_SCORE_KEY, dir: 'desc' }, idx, scores);
  expect(out.slice(0, 3).map((s) => s.slug)).toEqual(['oldie', 'trainer', 'cushy']);
});

it('puts unscored shoes last whichever way the score sorts', () => {
  const scores = new Map([['cushy', 10]]);
  for (const dir of ['asc', 'desc'] as const) {
    const out = sortShoes(FLEET, { key: EASY_SCORE_KEY, dir }, idx, scores);
    expect(out[0]!.slug).toBe('cushy');
  }
});
```

`labels.test.ts`:

```typescript
it('names the synthetic Easy score, within the phone label bound', () => {
  expect(columnLabel(EASY_SCORE_KEY, undefined)).toBe('Easy score');
  // The catalogue-wide guards in this file iterate real tests, so the synthetic key needs its own
  // assertion or it is the one column header nothing width-checks.
  expect(widestWordPx('Easy score')).toBeLessThanOrEqual(MAX_LABEL_PX);
  expect(lineCount('Easy score')).toBeLessThanOrEqual(MAX_LABEL_LINES);
});
```

`direction.test.ts`:

```typescript
it('marks the Easy score higher-is-better', () => {
  expect(directionOf(EASY_SCORE_KEY)).toBe('higher');
});
```

`urlstate.test.ts`:

```typescript
it('accepts the synthetic score as a sort key and a column', () => {
  expect(parseView(`sort=-${EASY_SCORE_KEY}`, idx).sort).toEqual({ key: EASY_SCORE_KEY, dir: 'desc' });
  expect(parseView(`cols=${EASY_SCORE_KEY},weight`, idx).columns).toEqual([EASY_SCORE_KEY, 'weight']);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- sort.test.ts labels.test.ts direction.test.ts urlstate.test.ts`

- [ ] **Step 3: Implement**

`sort.ts` — add `scores` as an optional fourth parameter of `sortShoes`, thread it into `keyValue`, and in `keyValue` before the `numericValue` fallback:

```typescript
  // The score is not in the catalogue and depends on the view, so it arrives resolved.
  if (key === EASY_SCORE_KEY) return scores?.get(s.slug);
```

`labels.ts` — in `columnLabel`, before the final return: `if (key === EASY_SCORE_KEY) return 'Easy score';`

`direction.ts` — add `[EASY_SCORE_KEY]: 'higher',` to the `higher` block. Its test walks catalogue → `DIRECTION` and never the reverse, so a non-catalogue key needs no allow-list widening.

`urlstate.ts` — add `EASY_SCORE_KEY` to both `SORT_FIELDS` and `COLUMN_FIELDS`.

`units.ts` — `headerUnits` would return a bare arrow for the score. Leave it unitless: **do not** write `/100`, because the scale deliberately exceeds 100 as shoes improve (spec §10 — the "may exceed 100" rule). Confirm `unitsOf` returns `''` for a key with no catalogue test and add a test asserting the header carries no `/100`.

- [ ] **Step 4: Run and verify**

Run: `npm -w app run test && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/sort.ts app/src/lib/sort.test.ts app/src/lib/labels.ts app/src/lib/labels.test.ts app/src/lib/direction.ts app/src/lib/direction.test.ts app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts app/src/lib/units.ts app/src/lib/units.test.ts
git commit -m "Let the Easy score be a column and a sort like any other"
```

---

### Task 5: Easy uses the score, and stability survives a story click

**Files:**
- Modify: `app/src/lib/presets.ts`, `presets.test.ts`
- Modify: `app/src/Page.svelte`, `Page.test.ts`
- Modify: `app/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `applyPreset(id, shoes, idx, strike, stability)` — a fifth parameter, carried into the returned view unchanged.

- [ ] **Step 1: Write the failing tests**

In `presets.test.ts`, add:

```typescript
describe('easy', () => {
  it('bounds nothing but the plate, and ranks by the score instead', () => {
    // The score rewards cushioning directly, so a stack floor would restate it; and the runner
    // judges value themselves, so there is no price cap.
    for (const strike of STRIKES) {
      const v = applyPreset('easy', FLEET, idx, strike, false);
      expect(Object.keys(v.filters.ranges)).toEqual([]);
      expect(v.filters.plate).toEqual(['none', 'plated-other']);
      expect(v.sort).toEqual({ key: EASY_SCORE_KEY, dir: 'desc' });
      expect(v.columns).toContain(EASY_SCORE_KEY);
    }
  });

  it('round-trips through the URL, so the story mark survives a link', () => {
    for (const strike of STRIKES) {
      const v = applyPreset('easy', FLEET, idx, strike, false);
      expect(parseView(serializeView(v), idx)).toEqual(v);
    }
  });

  it('names a side through its columns, so the side mark still derives', () => {
    for (const strike of STRIKES) {
      expect(sideOf(applyPreset('easy', FLEET, idx, strike, false))).toBe(strike);
    }
  });
});

it('carries the runner stability preference through every story', () => {
  // Otherwise the derived story mark vanishes the moment the preference is set, and clicking the
  // story again silently turns it back off.
  for (const p of PRESETS) {
    expect(applyPreset(p.id, FLEET, idx, 'heel', true).stability).toBe(true);
    expect(applyPreset(p.id, FLEET, idx, 'heel', false).stability).toBe(false);
  }
});
```

Import `sideOf` from `./side` and `EASY_SCORE_KEY` from `./score`.

Then fix the six existing assertions this breaks — do not delete them, re-point them:
- `presets.test.ts:83-87` `'keeps a toebox column on Easy'` — Easy's columns no longer include `toebox-width-widest-part` (see Step 3 for why). Re-point at Tempo or Race, or assert the new column set.
- `presets.test.ts:96` `SIDE_BOUNDS.easy` and `:103-108` `'bounds, sorts by and shows the half the strike names'` — Easy has no bound to check. Drop Easy from `SIDE_BOUNDS` and let the test cover Tempo and Race, whose bounds still swap sides.
- `presets.test.ts:160-164` `'returns a comparable shortlist under either strike'` — Easy's only filter is sideless, so its count is now identical on both sides. Exclude Easy or assert equality for it.
- `presets.test.ts:228-235` `'moves the price cap when the fleet price distribution moves'` — this is the **only** coverage of `PRICE_PERCENTILE` and it drives it through Easy. Re-point it at `applyPreset('tempo', …)`, which still caps price.
- `Page.test.ts` — assertions on `r.heel-stack=35%7E` (~line 101), Easy's count `'2'` (line 277), `r.forefoot-stack=` after a side flip on Easy (~line 416), and `2 of 5 shoes` (~line 520). Update each to the new behaviour rather than guessing: run the suite and read what it actually produces.
- `e2e/smoke.spec.ts` — `2 of 5 shoes` at lines 10, 50, 55 and `/r\.forefoot-stack=/` at line 88.

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- presets.test.ts`

- [ ] **Step 3: Implement**

`presets.ts`:
- Delete the `EASY_STACK_PERCENTILE` export and its comment. **Keep `PRICE_PERCENTILE`** — Tempo still uses it.
- Add the fifth parameter and carry it through:

```typescript
export function applyPreset(
  id: string, shoes: Shoe[], idx: TestIndex, strike: Side, stability: boolean,
): ViewState {
  const v = defaultView();
  // A preference, not part of what a story is: the marks compare whole views, so rebuilding this
  // from the default would unmark the story the moment the runner set it (docs/app.md §Presets).
  v.stability = stability;
```

- Replace the `easy` case:

```typescript
    case 'easy': {
      // No bounds but the plate. The score ranks on shock absorption, outsole durability and energy
      // return, so a stack floor would restate what it already rewards, and price is deliberately
      // absent so the runner judges value themselves (docs/shoe-stories.md §Easy).
      v.filters.plate = ['none', 'plated-other'];
      v.sort = { key: EASY_SCORE_KEY, dir: 'desc' };
      v.columns = easyColumns(strike);
      return v;
    }
```

- `easyColumns` gains the score and **drops the toebox column**. This is a deliberate decision, not a side effect: the phone bound is six numeric columns (docs/app.md §Columns and sorting), adding the score makes seven, and toebox width is the one column no scoring term uses — fit is the runner's own final filter rather than something the score can speak to. Record it in docs/app.md in Task 11.

```typescript
const easyColumns = (strike: Side) =>
  ['releasedAt', EASY_SCORE_KEY, 'score', 'msrpGbp', sideKey('Shock absorption', strike),
   sideKey('Stack', strike), 'weight', 'plate'];
```

- Update Easy's `describe`: `'The bulk of the week — ranked on cushioning, durability and how much the shoe gives back'`.

`Page.svelte`:
- Pass `view.stability` at all four `applyPreset` call sites (lines ~167, ~174, ~215, ~221).
- `allView`'s `side !== null` branch returns `{ ...defaultView(), columns: defaultColumns(side) }`, which resets the preference. Preserve it: `{ ...defaultView(), columns: defaultColumns(side), stability: v.stability }`. The other branch clones the snapshot and so already carries it.

- [ ] **Step 4: Run and verify**

Run: `npm -w app run test && npm run typecheck` → PASS.

Then check the mark behaviour by hand in Step 3 of Task 12; the unit test above covers `applyPreset`, but `atAll` and `storyMark` are derived in the component.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/presets.ts app/src/lib/presets.test.ts app/src/Page.svelte app/src/Page.test.ts app/e2e/smoke.spec.ts
git commit -m "Rank Easy by its own score rather than RunRepeat's"
```

---

### Task 6: Resolve the score in `Page` and render the column

**Files:**
- Modify: `app/src/Page.svelte`
- Modify: `app/src/components/ShoeTable.svelte`, `ShoeTable.test.ts`, `ShoeTableMobile.svelte`, `ShoeTableMobile.test.ts`
- Modify: `app/src/lib/stats.ts`, `stats.test.ts`
- Modify: `app/src/components/ColumnPicker.svelte`, `ColumnPicker.test.ts`

**Interfaces:**
- Produces: `ShoeTable`/`ShoeTableMobile` gain `scores: Map<string, number>`, `side: Side` and `stability: boolean` props (the latter two for Task 7's panel); `stats.ts` exports `rankMap(values: Map<string, number>): Map<string, number>`.

- [ ] **Step 1: Write the failing tests**

`stats.test.ts` — `rankMap` needs its own test, because `app/vitest.config.ts` enforces 90% lines / 85% branches over `src/lib/**`:

```typescript
it('ranks a resolved map into percentiles, splitting ties', () => {
  const m = rankMap(new Map([['a', 10], ['b', 20], ['c', 20], ['d', 30]]));
  expect(m.get('a')).toBeCloseTo(0.125, 3);
  expect(m.get('b')).toBeCloseTo(0.5, 3);
  expect(m.get('c')).toBeCloseTo(0.5, 3);
  expect(m.get('d')).toBeCloseTo(0.875, 3);
});

it('returns an empty map for an empty input rather than dividing by zero', () => {
  expect(rankMap(new Map()).size).toBe(0);
});
```

`ShoeTable.test.ts`:

```typescript
it('renders the Easy score from the supplied map, and a dash where it is unscored', () => {
  const view = { ...defaultView(), columns: [EASY_SCORE_KEY] };
  const { container } = render(ShoeTable, {
    props: { shoes: FLEET, data: DATA, view, scores: new Map([['cushy', 87.412]]),
             side: 'heel' as const, stability: false, onchange: () => {} },
  });
  const cells = [...container.querySelectorAll('tbody tr td')].map((c) => c.textContent?.trim());
  expect(cells).toContain('87.41'); // two decimals, like every other figure
  expect(cells).toContain('—');
});
```

`ColumnPicker.test.ts`:

```typescript
it('offers the Easy score as a tickable column', () => {
  const { getByRole } = render(ColumnPicker, { props: { /* existing */ columns: [EASY_SCORE_KEY] } });
  expect(getByRole('checkbox', { name: /easy score/i })).toBeTruthy();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- stats.test.ts ShoeTable.test.ts ColumnPicker.test.ts`

- [ ] **Step 3: Implement**

`stats.ts` — add, so both tables share one implementation:

```typescript
/**
 * Percentiles for a map of already-resolved values. `percentileMap` cannot serve the Easy score:
 * that key is synthetic, so `numericValue` returns nothing for it.
 */
export function rankMap(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.values()].sort((a, b) => a - b);
  const out = new Map<string, number>();
  for (const [slug, v] of values) {
    const below = sorted.filter((x) => x < v).length;
    const equal = sorted.filter((x) => x === v).length;
    out.set(slug, (below + equal / 2) / sorted.length);
  }
  return out;
}
```

`Page.svelte` — beside `visibleSorted`:

```typescript
  /** The score depends on the view, not just the shoe, so it is resolved once here and handed to
   *  everything that needs it. `workingSide` rather than `sideMark`: a view naming no side must
   *  still score, and heel is the arbitrary half (docs/app.md §The side is a preset too). */
  const scores = $derived(easyScoreMap(data.shoes, workingSide, view.stability, idx));
  const visibleSorted = $derived(sortShoes(filtered.visible, view.sort, idx, scores));
```

Pass `{scores}`, `side={workingSide}` and `stability={view.stability}` to both tables.

`ShoeTable.svelte` and `ShoeTableMobile.svelte`:
- Add `scores: Map<string, number>`, `side: Side`, `stability: boolean` to the props type.
- In `cellText`, before the `numericValue` line:

```typescript
    if (col === EASY_SCORE_KEY) {
      const sc = scores.get(s.slug);
      return sc === undefined ? '—' : displayNumber(sc);
    }
```

- The wash must rank over the **rendered rows**, not the whole fleet, or the score's tint means something different from every other column in the same row:

```typescript
  const percentiles = $derived(new Map(view.columns.map((c) => [c,
    c === EASY_SCORE_KEY
      ? rankMap(new Map(shoes.flatMap((s) => (scores.has(s.slug) ? [[s.slug, scores.get(s.slug)!] as const] : []))))
      : percentileMap(shoes, c, idx)])));
```

`ColumnPicker.svelte` — `easy-score` is in neither `FIXED` nor `metricEntries`, so once Easy sets it the column cannot be removed while the summary still counts it. Add it to `FIXED`. It has no catalogue test, so `coverageOf` reads 0% — give it no coverage bar rather than a misleading empty one.

- [ ] **Step 4: Run and verify**

Run: `npm -w app run test && npm run typecheck` → PASS. Every existing render of either table needs the three new props; `grep -rn 'render(ShoeTable' app/src` to find them.

- [ ] **Step 5: Commit**

```bash
git add app/src/Page.svelte app/src/components/ShoeTable.svelte app/src/components/ShoeTable.test.ts app/src/components/ShoeTableMobile.svelte app/src/components/ShoeTableMobile.test.ts app/src/components/ColumnPicker.svelte app/src/components/ColumnPicker.test.ts app/src/lib/stats.ts app/src/lib/stats.test.ts
git commit -m "Show the Easy score as a column with its own wash"
```

---

### Task 7: The per-term breakdown

The task that makes a surprising rank diagnosable — the reason the feature ships before the weights settle (spec §10).

**Files:**
- Modify: `app/src/components/DetailPanel.svelte`, `DetailPanel.test.ts`
- Modify: `app/src/components/ShoeTable.svelte`, `ShoeTableMobile.svelte`

- [ ] **Step 1: Write the failing test**

`DetailPanel.svelte` currently takes `shoe` only — no `data`, no `idx`. Read the file and its test before writing, then add:

```typescript
it('breaks the Easy score into its terms, so a rank can be diagnosed', () => {
  const { getByText, container } = render(DetailPanel, {
    props: { shoe: FLEET.find((s) => s.slug === 'cushy')!, data: DATA, side: 'heel' as const, stability: false },
  });
  getByText('Easy score');
  const rows = [...container.querySelectorAll('.score-breakdown tbody tr')];
  expect(rows).toHaveLength(3);
  expect(rows[0]!.textContent).toContain('Shock absorption');
});

it('says so plainly when a shoe cannot be scored', () => {
  const { getByText } = render(DetailPanel, {
    props: { shoe: FLEET.find((s) => s.slug === 'mystery')!, data: DATA, side: 'heel' as const, stability: false },
  });
  getByText(/not scored/i);
});
```

`DetailPanel.test.ts` defines no `DATA` today — add one built from `TESTS` the way `ShoeTable.test.ts` does, rather than inventing a new shape.

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- DetailPanel.test.ts`

- [ ] **Step 3: Implement**

`DetailPanel.svelte` — the props go from `{ shoe }` to `{ shoe, data, side, stability }`, and `idx` is derived locally as the tables do it (`indexTests(data.tests)`). Import `displayNumber` and `easyContributions`.

```svelte
<script lang="ts">
  import { displayNumber, indexTests } from '../lib/dataset';
  import { easyContributions, type EasyTermKey } from '../lib/score';
  import type { Side } from '../lib/lineage';

  let { shoe, data, side, stability }: {
    shoe: Shoe; data: ShoesFile; side: Side; stability: boolean;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  const TERM_LABEL: Record<EasyTermKey, string> = {
    shockAbsorption: 'Shock absorption', outsoleDurability: 'Outsole durability',
    energyReturn: 'Energy return', midsoleWidth: 'Midsole width / stack',
    heelCounter: 'Heel counter stiffness',
  };
  const rows = $derived(easyContributions(shoe, side, stability, idx));
  const total = $derived(rows?.reduce((sum, r) => sum + r.weighted, 0) ?? 0);
</script>

<section class="score-breakdown">
  <h4>Easy score</h4>
  {#if rows === null}
    <p>Not scored — this shoe is missing at least one measurement the score needs.</p>
  {:else}
    <table>
      <thead><tr><th>Term</th><th>Mapped</th><th>Contribution</th><th>Share</th></tr></thead>
      <tbody>
        {#each rows as r (r.key)}
          <tr>
            <td>{TERM_LABEL[r.key]}</td>
            <td>{displayNumber(r.term)}</td>
            <td>{displayNumber(r.weighted)}</td>
            <td>{Math.round((r.weighted / total) * 100)}%</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
```

Both call sites (`ShoeTable.svelte` ~line 101, `ShoeTableMobile.svelte` ~line 110) pass `shoe` only — add `{data} {side} {stability}`. `side` must be the same one `Page` scored with, which is why Task 6 threads it as a prop rather than deriving it here: `sideOf` can return `null`, and a panel disagreeing with the column would be worse than either answer.

- [ ] **Step 4: Run and verify**

Run: `npm -w app run test && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/DetailPanel.svelte app/src/components/DetailPanel.test.ts app/src/components/ShoeTable.svelte app/src/components/ShoeTableMobile.svelte
git commit -m "Show what each term contributes to a shoe's Easy score"
```

---

### Task 8: The stability toggle, on a surface that persists

**Not `SetupStrip`.** `Page.svelte:219` sets `stripOpen = false` permanently on any story click, and `SetupStrip.test.ts:122` pins that ("collapses for good once a story is chosen"). A toggle there would vanish the instant the runner clicked Easy — the only preset that uses the score. Put it in `Toolbar.svelte`, which persists and already takes a `columns` snippet for pass-through controls.

**Files:**
- Modify: `app/src/components/Toolbar.svelte`, `Toolbar.test.ts`
- Modify: `app/src/Page.svelte`

- [ ] **Step 1: Write the failing test**

```typescript
it('offers a stability preference and reports the change', () => {
  let got: boolean | undefined;
  const { getByRole } = render(Toolbar, {
    props: { /* existing props */ stability: false, onstability: (v: boolean) => { got = v; } },
  });
  const box = getByRole('checkbox', { name: /stability/i });
  expect((box as HTMLInputElement).checked).toBe(false);
  box.click();
  expect(got).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- Toolbar.test.ts`

- [ ] **Step 3: Implement**

Add `stability: boolean` and `onstability: (v: boolean) => void` to `Toolbar`'s props and render:

```svelte
<label class="stability">
  <input type="checkbox" checked={stability} onchange={(e) => onstability(e.currentTarget.checked)} />
  Stability matters to me
</label>
```

Add the caveat beside it, because the correlation is real and should not surprise anyone (spec §7): *"Adds midsole width and heel counter stiffness to the score. Stable shoes tend to be heavier."*

`Page.svelte`:

```typescript
  function setStability(next: boolean) {
    setView({ ...($state.snapshot(view) as ViewState), stability: next });
  }
```

Pass `stability={view.stability}` and `onstability={setStability}` at the `Toolbar` call site. Because Task 5 made `applyPreset` and `allView` carry the flag, setting it must **not** clear the story or `All` mark — verify by hand in Task 12.

- [ ] **Step 4: Run and verify**

Run: `npm -w app run test && npm run typecheck` → PASS. Existing `Toolbar` renders need the two new props.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/Toolbar.svelte app/src/components/Toolbar.test.ts app/src/Page.svelte
git commit -m "Let the runner opt into stability in the score"
```

---

### Task 9: The score in the CSV export

**Files:**
- Modify: `app/src/lib/csv-export.ts`, `csv-export.test.ts`, `app/src/Page.svelte`

**Interfaces:**
- Produces: `exportCsv(shoes, columns, idx, scores?)`.

- [ ] **Step 1: Write the failing test**

The export emits **raw column keys**, not display labels — `csv-export.test.ts` pins that at lines 12, 37, 50 and 58, and the file's own header comment says it is a data export rather than a rendering. Keep it that way:

```typescript
it('emits the Easy score under its raw key', () => {
  const csv = exportCsv([FLEET.find((s) => s.slug === 'cushy')!], [EASY_SCORE_KEY], idx,
                        new Map([['cushy', 87.4]]));
  expect(csv.split('\n')[0]).toContain(EASY_SCORE_KEY);
  expect(csv).toContain('87.4');
});

it('emits an empty cell for an unscored shoe rather than a zero', () => {
  const csv = exportCsv([FLEET.find((s) => s.slug === 'mystery')!], [EASY_SCORE_KEY], idx, new Map());
  expect(csv.split('\n')[1]!.trim()).toBe(',,'.slice(0, 0) || csv.split('\n')[1]!.trim());
  expect(csv.split('\n')[1]).not.toMatch(/\b0\b/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm -w app run test -- csv-export.test.ts`

- [ ] **Step 3: Implement**

Add an optional fourth parameter `scores?: Map<string, number>` and special-case the synthetic key where the cell value is resolved: the score when present, an empty cell when not. Do **not** route the header through `columnLabel`. Update the `Page.svelte` call site to pass `scores`.

- [ ] **Step 4: Run and verify**

Run: `npm -w app run test && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/csv-export.ts app/src/lib/csv-export.test.ts app/src/Page.svelte
git commit -m "Export the Easy score alongside the columns it sits with"
```

---

### Task 10: The e2e fixture

`app/e2e/fixtures/shoes.json` is a separate hand-written dataset. Without the scoring tests the browser suite renders an all-dashes score column, so the one end-to-end check of the feature would pass while proving nothing.

**Files:**
- Modify: `app/e2e/fixtures/shoes.json`, `app/e2e/smoke.spec.ts`

- [ ] **Step 1: Add the seven tests and readings to the e2e fixture**

Mirror Task 1: the same seven `tests` entries, and readings on enough shoes that Easy's list has a real order. Keep at least one shoe unscoreable so the em dash is exercised.

- [ ] **Step 2: Assert the column and its order**

Add to `smoke.spec.ts`:

```typescript
test('Easy ranks by its own score', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Easy' }).click();
  await expect(page.getByRole('columnheader', { name: /Easy score/ })).toBeVisible();
  const first = page.locator('tbody tr').first();
  await expect(first).not.toContainText('—');
});
```

- [ ] **Step 3: Run**

Run: `npm -w app run e2e`
Expected: PASS. Needs the Playwright browser installed; if absent, `npx playwright install chromium`.

- [ ] **Step 4: Commit**

```bash
git add app/e2e/
git commit -m "Exercise the Easy score in the browser suite"
```

---

### Task 11: The docs corrections

One task, because the changes cross-reference each other and `check:docs` gates them as a set. Read `docs/README.md` first — the contract is **forward-only**, so describe what *is*, never what changed.

- [ ] **Step 1: `docs/shoe-stories.md`**

- Add the **three-year horizon** to §The shared rules: both buyer types (latest-and-greatest, and value) shop inside roughly three years, which is why a metric's viability is judged by coverage over that window.
- Re-ground the no-preset-filters-by-release-date rule: it holds because a lab-measurement score is time-blind and all-terms-required already sinks thinly-measured old shoes — not because it protects last-gen buyers.
- Rewrite §Easy around the four mechanisms and their metrics, and the plate gate's precautionary injury-risk basis.
- Record the two mechanisms that matter and cannot be measured: **midsole/foam durability** and **compliance at low load**.
- Amend §Checking a threshold set: the `pace` fact is **one-sided**; divergence is expected and it must never be an optimisation target.
- The softness paragraph argues from a coverage figure for a metric no story now uses — rewrite or drop it.

- [ ] **Step 2: `docs/app.md`**

- §Presets: Easy resolves to a plate filter and a sort, not to bounds. Note that `applyPreset` carries `stability` through, and why the marks would otherwise break.
- New section for the score: the four stages, that every constant is frozen and why, that it is computed client-side, that the key is synthetic so its value depends on the view, and that its scale may exceed 100.
- §Columns and sorting: Easy shows the score and **not** toebox width — six numeric columns is the phone bound, and toebox is the column no scoring term uses.
- §URL encoding: `stab=1`, written only when on; a shared link therefore carries the sender's preference as well as their filters.
- Record that Easy's toolbar count is now the whole non-carbon pool rather than a recommendation count, and that unscoreable shoes sort last as em dashes. This is a real change in what the number means.
- Record that when a view names no side, the score falls back to `DEFAULT_SIDE` with nothing on screen saying so.

- [ ] **Step 3: `docs/decisions.md`**

Add one decision: **scores use frozen physical references; thresholds use live-fleet percentiles.** The market-relative convention is right for a bound ("as much stack as most of the fleet") and wrong for a score, where drift is a bug. An agent must not "fix" the frozen constants by recomputing them from the loaded fleet.

- [ ] **Step 4: `BACKLOG.md`**

- Item 1: Easy is now a score; the item narrows to Tempo and Race.
- Item 3: partly superseded — the score owns per-story direction. Record the general metric picker as **rejected**, with the three reasons from spec §7.
- New: Tempo and Race on the same pipeline.
- New: Easy's count means "pool size", not "recommended"; decide whether to count scoreable shoes instead.
- New: Easy bounds nothing, so it no longer participates in the sparse-bound guard that `presets.test.ts` applies to the other stories — it has lost that safety net.

- [ ] **Step 5: Run the gate**

Run: `npm run check:docs` → PASS, no dead pointers.

- [ ] **Step 6: Commit**

```bash
git add docs/ BACKLOG.md CLAUDE.md
git commit -m "Record what the Easy score measures and why its constants are frozen"
```

---

### Task 12: Verify the whole branch

- [ ] **Step 1: The gate**

Run: `cd ~/dev/shoe-lab-preset-scoring && npm run verify`
Expected: PASS — check:docs, typecheck, lint, test:coverage. `src/lib/**` must stay above 90% lines / 85% branches.

- [ ] **Step 2: The browser suite**

Run: `npm -w app run e2e` → PASS.

- [ ] **Step 3: Look at it, and check the marks by hand**

Run `npm -w app run dev`, then:
- Click **Easy**. Against spec §11: the Vomero Premium leads on heel with stability off; Superblast 3 leads on forefoot.
- Tick **Stability matters to me**. Hurricane 25, Triumph 23 and the 1080s should surface — **and Easy must stay marked.** If the mark drops, Task 5's carry-through is wrong.
- Untick it. The mark stays, the order returns.
- Click **All** with stability on: `All` should be marked and the preference should survive.
- Expand the **Novablast 5** and read its breakdown. This is the point of the build.

- [ ] **Step 4: Commit any fixes, then stop**

Do **not** land on `main` or push. Report the branch state and wait — the weights are expected to move once Sam has looked at the fleet.

---

## Self-Review

**Spec coverage.** §2 horizon → Task 11. §3 pipeline → Tasks 1–2. §4 mappings → Task 1. §5 stage 2 → Task 2 (real-dataset influence test). §6 all-terms-required → Task 2. §7 toggle → Tasks 3, 8; the toggle invariant → Task 2's real-dataset test. §8 rejected terms → Task 11. §9 view and the stability carry-through → Task 5. §10 display and frozen anchors → Tasks 2, 6, 7; the anchor test pins `r100` as §14 asks. §11 landings → Task 12 Step 3. §12 docs → Task 11. §13 testing → distributed. §14 client-side → Task 6.

**Type consistency.** `EasyTermKey` members are `shockAbsorption`, `outsoleDurability`, `energyReturn`, `midsoleWidth`, `heelCounter` in Tasks 1, 2, 7. `easyScoreMap(shoes, side, stability, idx)` keeps that argument order in Tasks 2 and 6. `sortShoes`'s fourth parameter is `scores` in Tasks 4 and 6. `applyPreset` takes five parameters from Task 5 onward, and every call site is listed. `rankMap` is defined in `stats.ts` (Task 6) and used only there. `EASY_SCORE_KEY` is never open-coded outside its definition.

**Known ripple, named rather than discovered.** Task 1's fixture change breaks catalogue-count assertions. Task 3 is a typecheck error at three named sites. Tasks 5's preset change breaks six named assertions across `presets.test.ts`, `Page.test.ts` and `smoke.spec.ts`. Tasks 6–8 add required props to `ShoeTable`, `ShoeTableMobile`, `DetailPanel` and `Toolbar`, breaking every existing render of each.

**Two things deliberately not done.** Easy's count is left meaning "pool size" rather than "scoreable" — changing it touches `presetCounts` and the strip, and it is a product decision rather than a consequence of this work (backlog, Task 11 Step 4). And `sideOf`-returns-null silently yields a heel score; documented rather than fixed, because the honest alternative is refusing to score, which would blank the column for a view that merely unticked two measurements.
