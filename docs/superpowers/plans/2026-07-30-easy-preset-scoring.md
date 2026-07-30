# Easy Preset Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Easy's sort-by-RunRepeat-score with a lab-measurement scoring function, computed client-side, visible as a column with a per-term breakdown, plus an opt-in stability toggle.

**Architecture:** A new `app/src/lib/score.ts` owns a four-stage pipeline — physical map → divide by frozen sd → weight → rescale between frozen anchors. Every constant is frozen (derived once from `data/` at commit `baed23b`), so scores are comparable over time and may exceed 100 as shoes improve. The score is a **synthetic key** (`easy-score`) that is not a catalogue test: unlike every other column its value depends on view state (side and the stability flag), so `Page.svelte` computes a `Map<slug, number>` once and passes it to `sortShoes` and `ShoeTable`.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, Playwright. Zero runtime dependencies.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-30-preset-scoring-design.md`. Where this plan and the spec disagree, stop and ask.
- **No live network in tests, ever.** Nothing in this plan touches the scraper.
- **TDD:** failing test first for every behaviour change.
- **Docs ride the change:** a behaviour-changing commit updates the owning doc in the same commit. Task 10 carries the doc corrections that span several tasks.
- **Comments are WHY-only** (docs/README.md §Rules, rule 5).
- **Commits:** concise single-line subjects, no embedded measurements, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Worktree:** all work in `~/dev/shoe-lab-preset-scoring` on branch `preset-scoring`. Do not regenerate `data/`.
- **Gate:** `npm run verify` from the repo root before the branch is considered done.
- **Frozen constants are never recomputed at runtime.** If a term's sd or an anchor is computed from the live fleet, the design is broken — see spec §10.

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
| `app/src/lib/score.ts` | **new.** Frozen constants, the five physical mappings, the pipeline, `easyScoreMap`, `easyContributions`. Pure — no Svelte, no view state types |
| `app/src/lib/score.test.ts` | **new.** Per-stage tests, effective-influence regression, all-terms-required, per-side constants |
| `app/src/lib/test-fixtures.ts` | add the five scoring tests to `TESTS` and readings to `FLEET` |
| `app/src/lib/urlstate.ts` | `ViewState.stability`, `defaultView`, serialise/parse `stab=1`, accept `easy-score` as a sort key and column |
| `app/src/lib/sort.ts` | `sortShoes` takes an optional score map, consulted for `EASY_SCORE_KEY` |
| `app/src/lib/labels.ts` | label for `easy-score` |
| `app/src/lib/direction.ts` | `easy-score` is `higher` |
| `app/src/lib/presets.ts` | Easy drops its stack floor and price cap, sorts by `EASY_SCORE_KEY`, shows the score column |
| `app/src/Page.svelte` | derive the score map from `(shoes, side, stability)`; pass to `sortShoes` and `ShoeTable` |
| `app/src/components/ShoeTable.svelte`, `ShoeTableMobile.svelte` | render the score cell and its wash |
| `app/src/components/DetailPanel.svelte` | the per-term breakdown table |
| `app/src/components/SetupStrip.svelte` | the stability toggle |
| `app/src/lib/csv-export.ts` | emit the score column |

---

### Task 1: The five physical mappings

Stage 1 only. Pure functions, each 0–1 and linear in goodness, true zeros preserved.

**Files:**
- Create: `app/src/lib/score.ts`
- Create: `app/src/lib/score.test.ts`
- Modify: `app/src/lib/test-fixtures.ts`

**Interfaces:**
- Consumes: `numericValue`, `TestIndex` from `./dataset`; `Side`, `sideKey` from `./lineage`.
- Produces:
  - `type EasyTermKey = 'shockAbsorption' | 'outsoleDurability' | 'energyReturn' | 'midsoleWidth' | 'heelCounter'`
  - `SA_REF: number`, `L_OK: number`, `WID_CAP: Record<Side, number>`
  - `easyTerms(shoe: Shoe, side: Side, idx: TestIndex): Record<EasyTermKey, number | null>`

- [ ] **Step 1: Add the scoring tests and readings to the fixtures**

The fixture catalogue carries none of the scoring metrics today. In `app/src/lib/test-fixtures.ts`, add to `TESTS`:

```typescript
  labTest({ id: 68, slug: 'shock-absorption-heel', name: 'Shock absorption (heel)', units: 'SA', groupId: '3', chartLabel: 'Shock absorption', secondaryTestIds: [67] }),
  labTest({ id: 67, slug: 'shock-absorption-forefoot', name: 'Shock absorption forefoot', units: 'SA', groupId: null, chartLabel: 'Shock absorption', primaryTestId: 68 }),
  labTest({ id: 4, slug: 'outsole-durability', name: 'Outsole durability', units: 'mm', groupId: '2', chartLabel: 'Outsole wear' }),
  labTest({ id: 9, slug: 'outsole-thickness', name: 'Outsole thickness', units: 'mm', groupId: '2' }),
  labTest({ id: 19, slug: 'heel-counter-stiffness', name: 'Heel counter stiffness', type: 'score', groupId: '5' }),
  labTest({ id: 26, slug: 'midsole-width-in-the-heel', name: 'Midsole width in the heel', units: 'mm', groupId: '5' }),
  labTest({ id: 25, slug: 'midsole-width-in-the-forefoot', name: 'Midsole width in the forefoot', units: 'mm', groupId: '5' }),
```

Then extend `FLEET`'s reading-carrying shoes so each has every scoring term, keeping `mystery` bare. Add to each shoe's `values`:

```typescript
  // cushy:   68/67 shock, 4 wear, 9 thickness, 19 counter, 26/25 midsole width
  cushy:   { '68': 140, '67': 115, '4': 0.8, '9': 3.2, '19': 4, '26': 95, '25': 118 }
  racer:   { '68': 150, '67': 125, '4': 2.0, '9': 1.5, '19': 2, '26': 82, '25': 108 }
  trainer: { '68': 120, '67': 100, '4': 0.5, '9': 3.0, '19': 5, '26': 98, '25': 120 }
  oldie:   { '68': 100, '67': 90,  '4': 1.2, '9': 2.4, '19': 3, '26': 92, '25': 112 }
```

Merge these into the existing `values` objects rather than replacing them. Update the fixture's doc comment to say the scoring metrics are present on the four reading-carrying shoes and absent on `mystery`, because `score.test.ts` needs exactly one unscoreable shoe.

- [ ] **Step 2: Write the failing tests for the mappings**

Create `app/src/lib/score.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { easyTerms, L_OK, SA_REF, WID_CAP } from './score';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);
const byId = (slug: string) => FLEET.find((s) => s.slug === slug)!;

describe('easyTerms', () => {
  it('maps shock absorption as a ratio of a fixed reference, uncapped', () => {
    // SA has a credible true zero (~3.6 SA per mm of stack through the origin), so the mapping is
    // a plain ratio rather than a rank (spec §4).
    expect(easyTerms(byId('cushy'), 'heel', idx).shockAbsorption).toBeCloseTo(140 / SA_REF, 6);
    expect(easyTerms(byId('cushy'), 'forefoot', idx).shockAbsorption).toBeCloseTo(115 / SA_REF, 6);
  });

  it('maps energy return as the true percentage it already is', () => {
    expect(easyTerms(byId('cushy'), 'heel', idx).energyReturn).toBeCloseTo(0.70, 6);
    expect(easyTerms(byId('cushy'), 'forefoot', idx).energyReturn).toBeCloseTo(0.55, 6);
  });

  it('maps outsole durability as a capped reciprocal of wear rate', () => {
    // life = thickness / wear, so goodness is reciprocal (half the wear rate lasts twice as long),
    // capped because the outsole is rarely what retires the shoe (spec §4).
    const cushy = easyTerms(byId('cushy'), 'heel', idx).outsoleDurability;
    expect(cushy).toBeCloseTo(Math.min((3.2 / 0.8) / L_OK, 1), 6);
    expect(cushy).toBe(1); // life 4.0 is above the cap
    // racer: life 0.75, well under the cap, so it grades
    expect(easyTerms(byId('racer'), 'heel', idx).outsoleDurability).toBeCloseTo(0.75 / L_OK, 6);
  });

  it('maps midsole width as a capped width-over-stack ratio, per side', () => {
    // Stability is a lever from foot to ground, so the dimensionless ratio is the physical
    // quantity — and the cap differs per side because the halves are not on one scale.
    expect(easyTerms(byId('cushy'), 'heel', idx).midsoleWidth)
      .toBeCloseTo(Math.min((95 / 40) / WID_CAP.heel, 1), 6);
    expect(easyTerms(byId('cushy'), 'forefoot', idx).midsoleWidth)
      .toBeCloseTo(Math.min((118 / 30) / WID_CAP.forefoot, 1), 6);
  });

  it('maps heel counter stiffness off its 1-5 scale, not a percentile', () => {
    expect(easyTerms(byId('cushy'), 'heel', idx).heelCounter).toBeCloseTo((4 - 1) / 4, 6);
    expect(easyTerms(byId('trainer'), 'heel', idx).heelCounter).toBe(1);
    expect(easyTerms(shoe({ slug: 'x', values: { '19': 1 } }), 'heel', idx).heelCounter).toBe(0);
  });

  it('returns null for a missing reading rather than a zero', () => {
    const t = easyTerms(byId('mystery'), 'heel', idx);
    expect(t.shockAbsorption).toBeNull();
    expect(t.outsoleDurability).toBeNull();
    expect(t.energyReturn).toBeNull();
    expect(t.midsoleWidth).toBeNull();
    expect(t.heelCounter).toBeNull();
  });

  it('needs both thickness and wear for the durability term', () => {
    expect(easyTerms(shoe({ slug: 'a', values: { '4': 0.8 } }), 'heel', idx).outsoleDurability).toBeNull();
    expect(easyTerms(shoe({ slug: 'b', values: { '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('treats a zero wear reading as unmeasurable rather than dividing by it', () => {
    expect(easyTerms(shoe({ slug: 'c', values: { '4': 0, '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('every term is monotone in its reading, in the direction its mechanism says', () => {
    const more = (values: Record<string, number>) => easyTerms(shoe({ slug: 'm', values }), 'heel', idx);
    expect(more({ '68': 150 }).shockAbsorption!).toBeGreaterThan(more({ '68': 100 }).shockAbsorption!);
    expect(more({ '65': 70 }).energyReturn!).toBeGreaterThan(more({ '65': 50 }).energyReturn!);
    // less wear is better, so the term rises as the reading falls
    expect(more({ '4': 1.0, '9': 2.0 }).outsoleDurability!)
      .toBeGreaterThan(more({ '4': 2.0, '9': 2.0 }).outsoleDurability!);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/dev/shoe-lab-preset-scoring && npm -w app run test -- score.test.ts`
Expected: FAIL — cannot resolve `./score`.

- [ ] **Step 4: Write `score.ts` stage 1**

Create `app/src/lib/score.ts`:

```typescript
import type { Shoe } from '../../../shared/types.js';
import { numericValue, type TestIndex } from './dataset';
import { sideKey, type Side } from './lineage';

/**
 * Every constant here is **frozen**: derived once from the fleet at `data/` commit baed23b and never
 * recomputed from the live catalogue. That is what makes a score comparable across refreshes, and
 * what lets a future shoe read above 100 rather than renormalising the improvement away
 * (docs/superpowers/specs/2026-07-30-preset-scoring-design.md §10). Recomputing any of them from
 * `shoes` reintroduces the drift the design exists to remove.
 */

/** Cosmetic: an uncapped linear factor cancels when the term is divided by its sd, so this sets the
 *  displayed term and never the ranking. Above the observed max so nothing clips. */
export const SA_REF = 200;
/** Outsole life (thickness/wear) past which the outsole is not the binding constraint — the midsole
 *  packing out is, and that is unmeasured. The one constant that changes an ordering. */
export const L_OK = 3.0;
/** p90 of each side's width/stack ratio. Per side because the halves are not on one scale: the
 *  minimalist tail caps out (a flat sandal genuinely is stable) while the real fleet stays spread. */
export const WID_CAP: Record<Side, number> = { heel: 3.04, forefoot: 5.37 };

export type EasyTermKey =
  | 'shockAbsorption' | 'outsoleDurability' | 'energyReturn' | 'midsoleWidth' | 'heelCounter';

export type EasyTerms = Record<EasyTermKey, number | null>;

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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm -w app run test -- score.test.ts`
Expected: PASS. Then `npm -w app run test` — the fixture change touches other suites, so fix any fallout (a suite asserting an exact `TESTS.length` or a metric-entry count is the likely one).

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/score.ts app/src/lib/score.test.ts app/src/lib/test-fixtures.ts
git commit -m "Map each Easy scoring metric onto what it physically measures"
```

---

### Task 2: The pipeline — sd, weights, anchors

**Files:**
- Modify: `app/src/lib/score.ts`
- Modify: `app/src/lib/score.test.ts`

**Interfaces:**
- Consumes: Task 1's `easyTerms`, `EasyTermKey`, `EasyTerms`.
- Produces:
  - `EASY_WEIGHTS: Record<EasyTermKey, number>`, `TERM_SD: Record<Side, Record<EasyTermKey, number>>`
  - `ANCHORS: Record<Side, Record<'on' | 'off', { r0: number; r100: number }>>`
  - `easyScore(shoe: Shoe, side: Side, stability: boolean, idx: TestIndex): number | null`
  - `easyScoreMap(shoes: Shoe[], side: Side, stability: boolean, idx: TestIndex): Map<string, number>`
  - `easyContributions(shoe, side, stability, idx): { key: EasyTermKey; term: number; weighted: number }[] | null`
  - `EASY_SCORE_KEY = 'easy-score'`

- [ ] **Step 1: Write the failing tests**

Append to `app/src/lib/score.test.ts`:

```typescript
import {
  ANCHORS, EASY_SCORE_KEY, EASY_WEIGHTS, easyContributions, easyScore, easyScoreMap, TERM_SD,
} from './score';
import type { Side } from './lineage';

const SIDES: Side[] = ['heel', 'forefoot'];

describe('easyScore', () => {
  it('scores nothing when any weighted term is missing', () => {
    // All-terms-required: an unscored shoe is unscored, never a zero (spec §6).
    expect(easyScore(byId('mystery'), 'heel', false, idx)).toBeNull();
    expect(easyScore(shoe({ slug: 'partial', values: { '68': 140 } }), 'heel', false, idx)).toBeNull();
  });

  it('ignores the stability terms when stability is off', () => {
    // A shoe with no heel counter reading still scores with the toggle off.
    const noCounter = shoe({ slug: 'nc', values: { '68': 140, '65': 70, '4': 0.8, '9': 3.2, '6': 40, '26': 95 } });
    expect(easyScore(noCounter, 'heel', false, idx)).not.toBeNull();
    expect(easyScore(noCounter, 'heel', true, idx)).toBeNull();
  });

  it('rises when a weighted reading improves', () => {
    const base = { '68': 130, '65': 60, '4': 1.0, '9': 2.0, '6': 40, '26': 95, '19': 3 };
    const better = { ...base, '68': 160 };
    expect(easyScore(shoe({ slug: 'b', values: better }), 'heel', false, idx)!)
      .toBeGreaterThan(easyScore(shoe({ slug: 'a', values: base }), 'heel', false, idx)!);
  });

  it('may exceed 100, because the anchors are frozen rather than renormalised', () => {
    // The scale records that shoes improve rather than hiding it (spec §10). A shoe better than
    // anything in the 2026-07-30 fleet must read above 100.
    const monster = shoe({ slug: 'future', values: { '68': 400, '65': 99, '4': 0.1, '9': 8, '6': 40, '26': 95, '19': 5 } });
    expect(easyScore(monster, 'heel', false, idx)!).toBeGreaterThan(100);
  });

  it('weights are 2:1:1 on the base terms and 1 each on the stability pair', () => {
    expect(EASY_WEIGHTS).toEqual({
      shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1, midsoleWidth: 1, heelCounter: 1,
    });
  });

  it('pins every frozen constant, so an accidental recompute fails the build', () => {
    // These are derived from data/ at commit baed23b. Changing one changes every published score,
    // so it must be a deliberate edit rather than a refresh side effect (spec §14).
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
    // No absolute figure transfers between halves (docs/shoe-stories.md §Which half a story uses).
    const s = byId('cushy');
    expect(easyScore(s, 'heel', false, idx)).not.toBeCloseTo(easyScore(s, 'forefoot', false, idx)!, 3);
  });

  it('delivers the nominal weights as effective influence', () => {
    // Stage 2 exists for exactly this: without it a term's influence is its sd on the mapped scale,
    // and outsole durability at weight 1 outweighs shock absorption at weight 2 (spec §5).
    for (const side of SIDES) {
      const rows = FLEET.map((s) => easyContributions(s, side, false, idx)).filter((r) => r !== null);
      const sd = (xs: number[]) => {
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
      };
      const spread = new Map(['shockAbsorption', 'outsoleDurability', 'energyReturn']
        .map((k) => [k, sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted))]));
      const total = [...spread.values()].reduce((a, b) => a + b, 0);
      // Weight 2 of 4 must carry about twice the influence of weight 1 of 4.
      expect(spread.get('shockAbsorption')! / total).toBeGreaterThan(spread.get('energyReturn')! / total);
    }
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
    const rows = easyContributions(byId('cushy'), 'heel', false, idx)!;
    expect(rows.map((r) => r.key)).toEqual(['shockAbsorption', 'outsoleDurability', 'energyReturn']);
    expect(rows).toHaveLength(3);
    expect(easyContributions(byId('cushy'), 'heel', true, idx)!).toHaveLength(5);
    expect(easyContributions(byId('mystery'), 'heel', false, idx)).toBeNull();
  });
});

it('names the synthetic key so nothing open-codes it', () => {
  expect(EASY_SCORE_KEY).toBe('easy-score');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm -w app run test -- score.test.ts`
Expected: FAIL — `easyScore` is not exported.

- [ ] **Step 3: Implement the pipeline**

Append to `app/src/lib/score.ts`:

```typescript
/**
 * The synthetic column and sort key. Not a catalogue test: unlike every other key its value depends
 * on the *view* (which side, and whether stability is on), which is why `Page` resolves it into a
 * map and passes it down rather than letting `numericValue` answer for it.
 */
export const EASY_SCORE_KEY = 'easy-score';

/** Editorial, and only meaningful because stage 2 makes weights control influence (spec §5). */
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
 *  states on one scale would invite a comparison that is not meaningful (spec §10). */
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
  if (keys.some((k) => mapped[k] === null)) return null; // all-terms-required (spec §6)
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm -w app run test -- score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/score.ts app/src/lib/score.test.ts
git commit -m "Build the Easy score from frozen constants so it holds over time"
```

---

### Task 3: `ViewState` gains the stability flag

**Files:**
- Modify: `app/src/lib/urlstate.ts`
- Modify: `app/src/lib/urlstate.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ViewState.stability: boolean`; URL token `stab=1`.

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
  const v = { ...defaultView(), stability: true };
  expect(parseView(serializeView(v), idx).stability).toBe(true);
  expect(parseView('', idx).stability).toBe(false);
});

it('ignores a stab value that is not 1', () => {
  expect(parseView('stab=yes', idx).stability).toBe(false);
  expect(parseView('stab=0', idx).stability).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- urlstate.test.ts`
Expected: FAIL — `stability` does not exist on `ViewState`.

- [ ] **Step 3: Implement**

In `app/src/lib/urlstate.ts`, add to the `ViewState` interface:

```typescript
  /** Whether the Easy score counts its two stability terms. A preference, not a filter — so it
   *  serialises, and a shared link carries the sender's preference alongside their filters
   *  (BACKLOG.md item 3 raises the same question for per-column direction). */
  stability: boolean;
```

In `defaultView()`, add `stability: false` to the returned object.

In `serializeView`, after the `missing` line:

```typescript
  if (v.stability) p.set('stab', '1');
```

In `parseView`, add a branch alongside `missing`:

```typescript
    } else if (key === 'stab' && raw === '1') {
      v.stability = true;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test -- urlstate.test.ts`
Expected: PASS. Then `npm -w app run test`. `presets.test.ts` asserts `Object.keys(v).sort()` equals a fixed list — add `'stability'` to that expectation. Any other suite comparing a whole `ViewState` needs the field too.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts app/src/lib/presets.test.ts
git commit -m "Carry the stability preference in the view and the link"
```

---

### Task 4: Make the synthetic key sortable and nameable

**Files:**
- Modify: `app/src/lib/sort.ts`, `app/src/lib/sort.test.ts`
- Modify: `app/src/lib/labels.ts`, `app/src/lib/labels.test.ts`
- Modify: `app/src/lib/direction.ts`, `app/src/lib/direction.test.ts`
- Modify: `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`

**Interfaces:**
- Consumes: `EASY_SCORE_KEY` from `./score`.
- Produces: `sortShoes(shoes, sort, idx, scores?: Map<string, number>)` — the fourth parameter is consulted only when `sort.key === EASY_SCORE_KEY`.

- [ ] **Step 1: Write the failing tests**

Add to `app/src/lib/sort.test.ts`:

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
    expect(out.slice(1).every((s) => !scores.has(s.slug))).toBe(true);
  }
});

it('treats the score key as unscored throughout when no map is given', () => {
  const out = sortShoes(FLEET, { key: EASY_SCORE_KEY, dir: 'desc' }, idx);
  // Every value is undefined, so the RunRepeat-score tiebreak decides — as it does for any
  // column where nothing has a reading.
  expect(out.map((s) => s.slug)).toEqual(sortShoes(FLEET, { key: 'nonexistent', dir: 'desc' }, idx).map((s) => s.slug));
});
```

Add to `app/src/lib/labels.test.ts`:

```typescript
it('names the synthetic Easy score', () => {
  expect(columnLabel(EASY_SCORE_KEY, undefined)).toBe('Easy score');
});
```

Add to `app/src/lib/direction.test.ts`:

```typescript
it('marks the Easy score higher-is-better', () => {
  expect(directionOf(EASY_SCORE_KEY)).toBe('higher');
});
```

Add to `app/src/lib/urlstate.test.ts`:

```typescript
it('accepts the synthetic score as a sort key and a column', () => {
  expect(parseView(`sort=-${EASY_SCORE_KEY}`, idx).sort).toEqual({ key: EASY_SCORE_KEY, dir: 'desc' });
  expect(parseView(`cols=${EASY_SCORE_KEY},weight`, idx).columns).toEqual([EASY_SCORE_KEY, 'weight']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- sort.test.ts labels.test.ts direction.test.ts urlstate.test.ts`
Expected: FAIL on all four.

- [ ] **Step 3: Implement**

`app/src/lib/sort.ts` — thread the map through:

```typescript
import { EASY_SCORE_KEY } from './score';

function keyValue(
  s: Shoe, key: string, idx: TestIndex, scores?: Map<string, number>,
): number | string | undefined {
  if (key === 'name') return s.name.toLowerCase();
  if (key === 'brand') return s.brand?.toLowerCase();
  if (key === 'plate') return PLATE_RANK[s.plate];
  if (key === 'releasedAt') return s.releasedAt ?? undefined;
  // The score is not in the catalogue and depends on the view, so it arrives resolved.
  if (key === EASY_SCORE_KEY) return scores?.get(s.slug);
  return numericValue(s, key, idx);
}

export function sortShoes(
  shoes: Shoe[], sort: SortState, idx: TestIndex, scores?: Map<string, number>,
): Shoe[] {
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...shoes].sort((a, b) => {
    const va = keyValue(a, sort.key, idx, scores);
    const vb = keyValue(b, sort.key, idx, scores);
    if (va === undefined && vb === undefined) return (b.score ?? -1) - (a.score ?? -1);
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return (b.score ?? -1) - (a.score ?? -1);
  });
}
```

`app/src/lib/labels.ts` — in `columnLabel`, before the final return:

```typescript
  if (key === EASY_SCORE_KEY) return 'Easy score';
```

`app/src/lib/direction.ts` — add to the `higher` block of `DIRECTION`:

```typescript
  [EASY_SCORE_KEY]: 'higher',
```

`direction.test.ts` has a guard that fails when an unmarked key appears; check it still passes given the synthetic key is not a catalogue test, and widen its allow-list if it enumerates catalogue slugs only.

`app/src/lib/urlstate.ts` — add the key to both sets:

```typescript
const SORT_FIELDS = new Set(['name', 'brand', 'releasedAt', 'score', 'msrpGbp', 'plate', EASY_SCORE_KEY]);
const COLUMN_FIELDS = new Set(['releasedAt', 'score', 'msrpGbp', 'plate', EASY_SCORE_KEY]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/sort.ts app/src/lib/sort.test.ts app/src/lib/labels.ts app/src/lib/labels.test.ts app/src/lib/direction.ts app/src/lib/direction.test.ts app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts
git commit -m "Let the Easy score be a column and a sort like any other"
```

---

### Task 5: Easy uses the score

**Files:**
- Modify: `app/src/lib/presets.ts`
- Modify: `app/src/lib/presets.test.ts`

**Interfaces:**
- Consumes: `EASY_SCORE_KEY`.
- Produces: Easy's `ViewState` — plate filter only, sorted by `EASY_SCORE_KEY`, score column present. `EASY_STACK_PERCENTILE` is deleted.

- [ ] **Step 1: Write the failing tests**

In `app/src/lib/presets.test.ts`, remove the `EASY_STACK_PERCENTILE` import and any assertion on Easy's stack floor or price cap, then add:

```typescript
describe('easy', () => {
  it('bounds nothing but the plate, and ranks by the score instead', () => {
    // The score rewards cushioning directly, so a stack floor is redundant machinery; and the
    // runner judges value themselves, so there is no price cap (spec §9).
    for (const strike of STRIKES) {
      const v = applyPreset('easy', FLEET, idx, strike);
      expect(Object.keys(v.filters.ranges)).toEqual([]);
      expect(v.filters.plate).toEqual(['none', 'plated-other']);
      expect(v.sort).toEqual({ key: EASY_SCORE_KEY, dir: 'desc' });
      expect(v.columns).toContain(EASY_SCORE_KEY);
    }
  });

  it('still round-trips through the URL, so the story mark survives a link', () => {
    for (const strike of STRIKES) {
      const v = applyPreset('easy', FLEET, idx, strike);
      expect(parseView(serializeView(v), idx)).toEqual(v);
    }
  });

  it('names a side through its columns, so the side mark still derives', () => {
    for (const strike of STRIKES) {
      expect(sideOf(applyPreset('easy', FLEET, idx, strike))).toBe(strike);
    }
  });
});
```

Import `sideOf` from `./side` and `EASY_SCORE_KEY` from `./score` at the top of the file.

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- presets.test.ts`
Expected: FAIL — Easy still sets ranges and sorts by `score`.

- [ ] **Step 3: Implement**

In `app/src/lib/presets.ts`: delete the `EASY_STACK_PERCENTILE` export and its comment, and replace the `easy` case:

```typescript
    case 'easy': {
      // No bounds but the plate. The score ranks on shock absorption, outsole durability and energy
      // return, so a stack floor would re-state what it already rewards; and price is deliberately
      // absent so the runner judges value themselves (docs/shoe-stories.md §Easy).
      v.filters.plate = ['none', 'plated-other'];
      v.sort = { key: EASY_SCORE_KEY, dir: 'desc' };
      v.columns = easyColumns(strike);
      return v;
    }
```

Change `easyColumns` so the score leads and stack goes — the score subsumes it, and the six-numeric-column bound on a phone is a real constraint (docs/app.md §Columns and sorting):

```typescript
const easyColumns = (strike: Side) =>
  ['releasedAt', EASY_SCORE_KEY, 'score', 'msrpGbp', sideKey('Shock absorption', strike),
   sideKey('Stack', strike), 'weight', 'plate'];
```

Import `EASY_SCORE_KEY` from `./score`. Update Easy's `describe` string to stop promising a price cap:

```typescript
  { id: 'easy', label: 'Easy', describe: 'The bulk of the week — ranked on cushioning, durability and how much the shoe gives back' },
```

Leave `PRICE_PERCENTILE` in place: Tempo still uses it.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test`
Expected: PASS. `Page.test.ts` may assert Easy's visible count — the count changes now the bounds are gone, so update it to whatever the fixture actually yields rather than guessing.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/presets.ts app/src/lib/presets.test.ts app/src/Page.test.ts
git commit -m "Rank Easy by its own score rather than RunRepeat's"
```

---

### Task 6: Resolve the score in `Page` and render the column

**Files:**
- Modify: `app/src/Page.svelte`
- Modify: `app/src/components/ShoeTable.svelte`, `app/src/components/ShoeTable.test.ts`
- Modify: `app/src/components/ShoeTableMobile.svelte`, `app/src/components/ShoeTableMobile.test.ts`

**Interfaces:**
- Consumes: `easyScoreMap`, `EASY_SCORE_KEY`.
- Produces: `ShoeTable` and `ShoeTableMobile` gain a `scores: Map<string, number>` prop.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/ShoeTable.test.ts`, following the render helper the file already uses:

```typescript
it('renders the Easy score from the supplied map, and a dash where it is unscored', () => {
  const view = { ...defaultView(), columns: [EASY_SCORE_KEY] };
  const { container } = render(ShoeTable, {
    props: {
      shoes: FLEET, data: DATA, view, scores: new Map([['cushy', 87.412]]),
      onchange: () => {},
    },
  });
  const cells = [...container.querySelectorAll('tbody tr td')].map((c) => c.textContent?.trim());
  expect(cells).toContain('87.41'); // two decimals, like every other figure
  expect(cells).toContain('—');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- ShoeTable.test.ts`
Expected: FAIL — the cell renders `—` for every row because `numericValue` cannot resolve the key.

- [ ] **Step 3: Implement**

`app/src/Page.svelte` — near `visibleSorted`:

```typescript
  /** The score depends on the view, not just the shoe, so it is resolved once here and handed to
   *  everything that needs it. `workingSide` rather than `sideMark`: a view that names no side must
   *  still score, and heel is the arbitrary half (docs/app.md §The side is a preset too). */
  const scores = $derived(easyScoreMap(data.shoes, workingSide, view.stability, idx));
  const visibleSorted = $derived(sortShoes(filtered.visible, view.sort, idx, scores));
```

Import `easyScoreMap` from `./lib/score`. Pass `{scores}` to `ShoeTable` and `ShoeTableMobile` at their call sites.

`app/src/components/ShoeTable.svelte` — add to the props destructure:

```typescript
  let { shoes, data, view, scores, onchange }: {
    shoes: Shoe[]; data: ShoesFile; view: ViewState; scores: Map<string, number>;
    onchange: (v: ViewState) => void;
  } = $props();
```

In `cellText`, before the `numericValue` line:

```typescript
    if (col === EASY_SCORE_KEY) {
      const sc = scores.get(s.slug);
      return sc === undefined ? '—' : displayNumber(sc);
    }
```

The wash reads `percentileMap`, which resolves through `numericValue` and so returns nothing for the synthetic key. Build its percentile from the map instead:

```typescript
  const percentiles = $derived(new Map(view.columns.map((c) =>
    [c, c === EASY_SCORE_KEY ? scorePercentiles(scores) : percentileMap(shoes, c, idx)])));
```

Add a small local helper beside it, and export it from `stats.ts` only if the mobile table needs it too:

```typescript
  /** The score is not in the catalogue, so its wash is ranked from the resolved map. */
  function scorePercentiles(m: Map<string, number>): Map<string, number> {
    const values = [...m.values()].sort((a, b) => a - b);
    const out = new Map<string, number>();
    for (const [slug, v] of m) {
      const below = values.filter((x) => x < v).length;
      const equal = values.filter((x) => x === v).length;
      out.set(slug, (below + equal / 2) / values.length);
    }
    return out;
  }
```

Apply the same three changes to `ShoeTableMobile.svelte`. To avoid two copies of `scorePercentiles`, put it in `app/src/lib/stats.ts` as an exported function and import it in both.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test`
Expected: PASS. Every existing `ShoeTable`/`ShoeTableMobile` render in the suite needs the new required prop — add `scores: new Map()` to each.

- [ ] **Step 5: Commit**

```bash
git add app/src/Page.svelte app/src/components/ShoeTable.svelte app/src/components/ShoeTable.test.ts app/src/components/ShoeTableMobile.svelte app/src/components/ShoeTableMobile.test.ts app/src/lib/stats.ts app/src/lib/stats.test.ts
git commit -m "Show the Easy score as a column with its own wash"
```

---

### Task 7: The per-term breakdown

This is the task that makes a surprising rank diagnosable — the reason the feature ships now rather than after the weights settle (spec §10).

**Files:**
- Modify: `app/src/components/DetailPanel.svelte`, `app/src/components/DetailPanel.test.ts`

**Interfaces:**
- Consumes: `easyContributions`, `EasyTermKey`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/DetailPanel.test.ts`:

```typescript
it('breaks the Easy score into its terms, so a rank can be diagnosed', () => {
  const { getByText, container } = render(DetailPanel, {
    props: { shoe: byId('cushy'), data: DATA, side: 'heel', stability: false },
  });
  getByText('Easy score');
  // One row per weighted term, each naming the reading, the mapped term and its contribution.
  const rows = [...container.querySelectorAll('.score-breakdown tbody tr')];
  expect(rows).toHaveLength(3);
  expect(rows[0]!.textContent).toContain('Shock absorption');
});

it('says so plainly when a shoe cannot be scored', () => {
  const { getByText } = render(DetailPanel, {
    props: { shoe: byId('mystery'), data: DATA, side: 'heel', stability: false },
  });
  getByText(/not scored/i);
});
```

Match the existing prop names in `DetailPanel.test.ts`; if the panel currently takes fewer props, add `side` and `stability` and thread them from `ShoeTable`/`ShoeTableMobile`, which already hold `view`.

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- DetailPanel.test.ts`
Expected: FAIL — no breakdown is rendered.

- [ ] **Step 3: Implement**

In `DetailPanel.svelte`, add `side: Side` and `stability: boolean` to the props, then:

```svelte
<script lang="ts">
  import { easyContributions, type EasyTermKey } from '../lib/score';

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

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/DetailPanel.svelte app/src/components/DetailPanel.test.ts app/src/components/ShoeTable.svelte app/src/components/ShoeTableMobile.svelte
git commit -m "Show what each term contributes to a shoe's Easy score"
```

---

### Task 8: The stability toggle

**Files:**
- Modify: `app/src/components/SetupStrip.svelte`, `app/src/components/SetupStrip.test.ts`
- Modify: `app/src/Page.svelte`

**Interfaces:**
- Consumes: `ViewState.stability`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/SetupStrip.test.ts`:

```typescript
it('offers a stability preference and reports the change', () => {
  let got: boolean | undefined;
  const { getByRole } = render(SetupStrip, {
    props: { /* existing props */ stability: false, onstability: (v: boolean) => { got = v; } },
  });
  const box = getByRole('checkbox', { name: /stability/i });
  expect((box as HTMLInputElement).checked).toBe(false);
  box.click();
  expect(got).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- SetupStrip.test.ts`
Expected: FAIL — no such control.

- [ ] **Step 3: Implement**

In `SetupStrip.svelte`, add `stability: boolean` and `onstability: (v: boolean) => void` to the props and render:

```svelte
<label class="stability">
  <input type="checkbox" checked={stability} onchange={(e) => onstability(e.currentTarget.checked)} />
  Stability matters to me
</label>
```

Add a hint near it, because the correlation is real and should not surprise anyone (spec §7): *"Adds midsole width and heel counter stiffness to the score. Stable shoes tend to be heavier."*

In `Page.svelte`, wire it:

```typescript
  function setStability(next: boolean) {
    setView({ ...($state.snapshot(view) as ViewState), stability: next });
  }
```

Pass `stability={view.stability}` and `onstability={setStability}` at the `SetupStrip` call site.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test`
Expected: PASS. Existing `SetupStrip` renders need the two new props.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/SetupStrip.svelte app/src/components/SetupStrip.test.ts app/src/Page.svelte
git commit -m "Let the runner opt into stability in the score"
```

---

### Task 9: The score in the CSV export

Without this the export silently emits a blank column for a column that is on screen.

**Files:**
- Modify: `app/src/lib/csv-export.ts`, `app/src/lib/csv-export.test.ts`
- Modify: `app/src/Page.svelte`

**Interfaces:**
- Consumes: `EASY_SCORE_KEY`.
- Produces: `exportCsv(shoes, columns, idx, scores?)`.

- [ ] **Step 1: Write the failing test**

Add to `app/src/lib/csv-export.test.ts`:

```typescript
it('emits the Easy score when it is a column', () => {
  const csv = exportCsv([byId('cushy')], [EASY_SCORE_KEY], idx, new Map([['cushy', 87.4]]));
  expect(csv).toContain('Easy score');
  expect(csv).toContain('87.4');
});

it('emits an empty cell for an unscored shoe rather than a zero', () => {
  const csv = exportCsv([byId('mystery')], [EASY_SCORE_KEY], idx, new Map());
  expect(csv.split('\n')[1]).not.toContain('0');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm -w app run test -- csv-export.test.ts`
Expected: FAIL — `exportCsv` takes three parameters.

- [ ] **Step 3: Implement**

Add an optional fourth parameter `scores?: Map<string, number>` to `exportCsv` and, wherever it resolves a cell value, special-case the synthetic key exactly as `cellText` does — the score when present, an empty cell when not. Use `columnLabel` for the header so the CSV and the table cannot disagree on the name. Update the `Page.svelte` call site to pass `scores`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w app run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/csv-export.ts app/src/lib/csv-export.test.ts app/src/Page.svelte
git commit -m "Export the Easy score alongside the columns it sits with"
```

---

### Task 10: The docs corrections

Five documents, from spec §12. This is one task because the changes cross-reference each other and `npm run check:docs` gates them as a set.

**Files:**
- Modify: `docs/shoe-stories.md`, `docs/app.md`, `docs/decisions.md`, `BACKLOG.md`, `CLAUDE.md` (only if a doc's ownership line changes)

- [ ] **Step 1: `docs/shoe-stories.md`**

Read docs/README.md first — the contract is forward-only, so describe what *is*, never what changed.

- Add the **three-year horizon** premise to §The shared rules: both buyer types (latest-and-greatest, and value) shop inside roughly three years, which is why a metric's viability is judged by its coverage over that window.
- Re-ground the no-preset-filters-by-release-date rule: it holds because a lab-measurement score is time-blind and an all-terms-required rule already sinks thinly-measured old shoes, **not** because it protects last-gen buyers.
- Rewrite §Easy around the four mechanisms and their metrics, and the plate gate's precautionary injury-risk basis.
- Record the two mechanisms that matter and cannot be measured: **midsole/foam durability** and **compliance at low load**.
- Amend §Checking a threshold set: the `pace` fact is **one-sided**. Divergence is expected and it must never be an optimisation target — only complete disagreement signals a problem.
- Remove the softness paragraph's premise if it now reads as advice about a metric no story uses.

- [ ] **Step 2: `docs/app.md`**

- §Presets: Easy resolves to a plate filter and a sort, not to bounds.
- New section for the score: the four stages, that every constant is frozen and why, that it is computed client-side, and that the key is synthetic so its value depends on the view.
- §URL encoding: `stab=1`, written only when on.
- Note that `ViewState.stability` is a preference that serialises, so a shared link carries it.

- [ ] **Step 3: `docs/decisions.md`**

Add one decision: **scores use frozen physical references; thresholds use live-fleet percentiles.** The market-relative convention is right for a bound ("as much stack as most of the fleet") and wrong for a score, where drift is a bug. An agent must not "fix" the frozen constants by recomputing them from the loaded fleet.

- [ ] **Step 4: `BACKLOG.md`**

- Item 1 (tune the preset thresholds): Easy is now a score; the item narrows to Tempo and Race.
- Item 3 (per-column user-declared direction): partly superseded — the score owns per-story direction. Record the general metric picker as **rejected**, with the three reasons from spec §7.
- Add an item for Tempo and Race on the same pipeline.

- [ ] **Step 5: Run the gate**

Run: `npm run check:docs`
Expected: PASS — no dead `§` pointers, and CLAUDE.md's index matches the files present.

- [ ] **Step 6: Commit**

```bash
git add docs/ BACKLOG.md CLAUDE.md
git commit -m "Record what the Easy score measures and why its constants are frozen"
```

---

### Task 11: Verify the whole branch

- [ ] **Step 1: Run the gate**

Run: `cd ~/dev/shoe-lab-preset-scoring && npm run verify`
Expected: PASS — check:docs, typecheck, lint, test:coverage.

- [ ] **Step 2: Run the browser suite**

Run: `npm -w app run e2e`
Expected: PASS. If a spec asserts Easy's row count or its default sort, update it to the new behaviour.

- [ ] **Step 3: Look at it**

Run: `npm -w app run dev`, click Easy, and check against spec §11: the Vomero Premium leads on heel with stability off, Superblast 3 leads on forefoot, and turning stability on surfaces Hurricane 25, Triumph 23 and the 1080s. Expand the Novablast 5 and read its breakdown — the point of this build is that its rank is now diagnosable rather than arguable.

- [ ] **Step 4: Commit any fixes, then stop**

Do **not** land on `main` or push. Report the branch state and wait — the weights are expected to move once Sam has looked at the fleet.

---

## Self-Review

**Spec coverage.** §3 pipeline → Tasks 1–2. §4 terms and mappings → Task 1. §5 stage 2 → Task 2 (effective-influence test). §6 all-terms-required → Task 2. §7 stability toggle → Tasks 3, 8; the toggle-invariant property is covered by Task 2's "ignores the stability terms when off" plus the real-fleet check in Task 11 Step 3. §8 rejected terms → Task 10 (BACKLOG). §9 view → Task 5. §10 display and frozen anchors → Tasks 2, 6, 7. §11 expected landings → Task 11 Step 3. §12 docs → Task 10. §13 testing → distributed. §14 client-side and constants → Tasks 2, 6.

**One gap accepted:** the spec's toggle-invariant test ("scoreable count identical with stability on and off") cannot run on the fixture fleet, because the fixture is four shoes and the invariant is a property of real upstream coverage. Task 11 Step 3 checks it by eye. If it should fail the build, it needs a fixture that mirrors real coverage ratios — worth a backlog item rather than a fabricated fixture.

**Type consistency.** `EasyTermKey` members are spelled `shockAbsorption`, `outsoleDurability`, `energyReturn`, `midsoleWidth`, `heelCounter` in Tasks 1, 2 and 7. `easyScoreMap(shoes, side, stability, idx)` is called with that argument order in Tasks 2 and 6. `sortShoes`'s fourth parameter is `scores` in Tasks 4 and 6. `EASY_SCORE_KEY` is imported from `./score` everywhere, never open-coded as `'easy-score'` outside its definition.

**Known ripple, called out rather than discovered:** Task 1's fixture change and Tasks 3, 6's new required props break unrelated suites. Each task's Step 4 says so and names the likely file.
