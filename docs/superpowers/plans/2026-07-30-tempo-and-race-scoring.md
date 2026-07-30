# Tempo and Race Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Tempo and Race their own lab-measurement scores on the pipeline Easy already uses, and drop every threshold the two stories still carry.

**Architecture:** `score.ts` currently hard-codes Easy. Task 1 turns it into a **story-agnostic engine plus a declarative `ScoreDef`**, with Easy re-expressed as one definition and its output provably unchanged. Tasks 2–3 add Tempo and Race as further definitions. Everything downstream — the synthetic key plumbing, `ScoreColumns`, the side pairing, the breakdown panel — was built for this and takes entries rather than signature changes.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, Playwright. Zero runtime dependencies.

## Global Constraints

- **Specs:** `docs/superpowers/specs/2026-07-30-tempo-scoring-design.md` and `…-race-scoring-design.md`. Where this plan and a spec disagree, stop and ask.
- **TDD:** failing test first, and a red phase only counts if the test *ran* and failed on its assertion.
- **Docs ride the change** — Task 10 carries the doc corrections that span tasks.
- **Comments are WHY-only** (docs/README.md §Rules, rule 5).
- **`npm run check:docs` resolves `§` pointers inside source comments too.** A `§` must name a real heading and must not wrap across a newline.
- **Commits:** single-line subjects, no embedded measurements, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Worktree:** `~/dev/shoe-lab-tempo-scoring`, branch `tempo-scoring`. Do not regenerate `data/`. Do not push or merge.
- **Never recompute a frozen constant from the loaded fleet** (docs/decisions.md §Frozen scores and live thresholds).
- **Gate:** `npm run verify` then `npm -w app run e2e`.

### The frozen constants

Divisors are keyed by **pool**, not globally by term — Easy and Tempo share the plate-filtered pool so they share divisors; Race ranks the whole fleet and carbon widens every spread.

```
shared references     SA_REF = 200    W_REF = 450 (new)    L_OK = 3.0
                      WID_CAP  heel 3.04   forefoot 5.37

PLATED POOL sd (Easy + Tempo)        heel      forefoot
  energyReturn                       0.0758    0.0790
  weight                             0.0776    0.0776      (new — Tempo only user)
  outsoleDurability                  0.1614    0.1614
  shockAbsorption                    0.0896    0.0961
  midsoleWidth                       0.0872    0.1133
  heelCounter                        0.2712    0.2712

WHOLE FLEET sd (Race)                heel      forefoot
  energyReturn                       0.0902    0.0900
  weight                             0.0904    0.0904
  shockAbsorption                    0.0902    0.0930

anchors (r0, r100)
  easy   heel off 3.7275 / 8.4740      heel on 4.3963 / 7.4104
         fore off 3.7119 / 7.6771      fore on 3.9456 / 6.5670
  tempo  heel off 4.7625 / 7.9385      heel on 5.0514 / 7.3590
         fore off 4.5415 / 7.6499      fore on 4.7002 / 6.8820
  race   heel     3.7787 / 8.5477      fore    3.9800 / 8.6001      (no stability state)

weights                   ER   WT   DUR   SA   | stability (each)
  easy                     1    —     1    2   |   1
  tempo                    3    2     2    1   |   1
  race                     3    2     —    1   |   none
```

### One thing that is easy to misread

The **pool defines where a definition's constants came from; it does not gate computation.** `Page` scores every loaded shoe against every definition, so a carbon shoe does get an Easy score — it is simply filtered out of Easy's *view* by the plate filter. This is already true today. A consequence: a shoe outside a definition's pool can score above 100 or below 0, which is correct and must not be clamped.

---

## File Structure

| file | responsibility |
|---|---|
| `app/src/lib/score.ts` | **the engine.** Term keys, readings, mappings, `ScoreDef`, `contributions`, `scoreOf`, `scoreMap`, `ScoreColumns`. No story-specific numbers |
| `app/src/lib/score-defs.ts` | **new.** The three `ScoreDef`s and every frozen constant. Data, not logic |
| `app/src/lib/score.test.ts` | engine behaviour on fixtures; real-dataset properties per definition |
| `app/src/lib/lineage.ts` | two more `DERIVED_SIDE_PAIRS` entries |
| `app/src/lib/labels.ts`, `direction.ts`, `urlstate.ts` | name, direct and accept the four new keys |
| `app/src/lib/presets.ts` | Tempo and Race resolve to score sorts with their bounds dropped; all three `describe` strings rewritten |
| `app/src/Page.svelte` | resolve all six score maps; stability reaches Easy and Tempo only |
| `app/src/components/ColumnPicker.svelte` | four more fixed columns |
| `app/src/components/Toolbar.svelte` | help popover names which stories stability affects |
| `app/src/components/DetailPanel.svelte` | breakdown already renders per score column; must handle a definition with no stability terms |

---

### Task 0: Baseline

- [ ] **Step 1:** `cd ~/dev/shoe-lab-tempo-scoring && npm install`
- [ ] **Step 2:** `npm run verify` → PASS. `npm -w app run e2e` → PASS. If either fails, stop and report; nothing below is trustworthy.
- [ ] **Step 3:** Record Easy's current output as the regression baseline for Task 1:

```bash
npm -w app run test -- score.test.ts
```
Note the real-dataset assertions that exist today — Task 1 must leave every one of them passing **unchanged**.

---

### Task 1: Generalise the engine, with Easy's output provably unchanged

The riskiest task, so it changes no behaviour at all. Easy's scores must be identical before and after.

**Files:**
- Modify: `app/src/lib/score.ts`
- Create: `app/src/lib/score-defs.ts`
- Modify: `app/src/lib/score.test.ts`

**Interfaces:**
- Produces:
  - `type TermKey = 'energyReturn' | 'weight' | 'outsoleDurability' | 'shockAbsorption' | 'midsoleWidth' | 'heelCounter'`
  - `interface Reading { value: number; over?: [number, number] }`
  - `readings(shoe, side, idx): Record<TermKey, Reading | null>` — all six, story-agnostic
  - `interface ScoreDef { id: string; keys: Record<Side, string>; weights: Partial<Record<TermKey, number>>; stability: Partial<Record<TermKey, number>> | null; sd: Record<Side, Partial<Record<TermKey, number>>>; anchors: Record<Side, { off: Anchor; on?: Anchor }> }`
  - `contributions(def, shoe, side, stability, idx): Contribution[] | null`
  - `scoreOf(def, shoe, side, stability, idx): number | null`
  - `scoreMap(def, shoes, side, stability, idx): Map<string, number>`
  - `EASY: ScoreDef` in `score-defs.ts`
- Retired: `EasyTermKey`, `EasyTerms`, `EasyReading`, `easyReadings`, `easyTerms`, `EASY_WEIGHTS`, `TERM_SD`, `ANCHORS`, `easyContributions`, `easyScore`, `easyScoreMap`. `EASY_SCORE_KEYS` stays (it is `EASY.keys`).

- [ ] **Step 1: Write the equivalence test first**

Add to `score.test.ts`, against the real dataset, so it fails if the refactor moves a single score:

```typescript
it('the generalised engine reproduces Easy exactly', () => {
  // Task 1 is a refactor: every published Easy score must be unchanged to the last decimal, or
  // the frozen constants have stopped meaning what docs/decisions.md says they mean.
  const POOL = REAL.shoes.filter((s) => s.plate !== 'carbon');
  for (const side of SIDES) {
    for (const stability of [false, true]) {
      const m = scoreMap(EASY, POOL, side, stability, realIdx);
      expect(m.size).toBe(283);
      const vs = [...m.values()];
      expect(Math.max(...vs)).toBeCloseTo(100, 1);
      expect(Math.min(...vs)).toBeCloseTo(0, 1);
    }
  }
  // and the landing the spec pins
  const heel = scoreMap(EASY, POOL, 'heel', false, realIdx);
  const top = [...heel.entries()].sort((a, b) => b[1] - a[1]);
  expect(top[0]![0]).toBe('nike-vomero-premium');
  expect(top[0]![1]).toBeCloseTo(100, 1);
});
```

- [ ] **Step 2: Run it and confirm it fails on the import**

Run: `npm -w app run test -- score.test.ts` → FAIL, `scoreMap`/`EASY` not exported.

- [ ] **Step 3: Rewrite `score.ts` as the engine**

Keep `Reading`, `reading`, `ratio` as they are (renamed off `Easy`). Make `readings` return all six terms — `weight` is the new one:

```typescript
export type TermKey =
  | 'energyReturn' | 'weight' | 'outsoleDurability' | 'shockAbsorption'
  | 'midsoleWidth' | 'heelCounter';

/** Every term any story can read, computed story-agnostically. A definition picks the ones it
 *  weights; the rest are simply ignored, which is what lets three stories share one reader. */
export function readings(shoe: Shoe, side: Side, idx: TestIndex): Record<TermKey, Reading | null> {
  const v = (key: string) => numericValue(shoe, key, idx);
  return {
    energyReturn: reading(v(sideKey('Energy return', side))),
    weight: reading(v('weight')),
    outsoleDurability: ratio(v('outsole-thickness'), v('outsole-durability')),
    shockAbsorption: reading(v(sideKey('Shock absorption', side))),
    midsoleWidth: ratio(v(sideKey('Midsole width', side)), v(sideKey('Stack', side))),
    heelCounter: reading(v('heel-counter-stiffness')),
  };
}

/** Stage 1: each reading becomes 0–1 and linear in goodness, true zero preserved. Shared by every
 *  story — a metric means the same thing whichever score reads it, which is also why two stories
 *  over one pool share divisors (docs/app.md §The Easy score). */
function mapReadings(r: Record<TermKey, Reading | null>, side: Side): Record<TermKey, number | null> {
  const map = (key: TermKey, f: (x: number) => number) => {
    const raw = r[key];
    return raw === null ? null : f(raw.value);
  };
  return {
    energyReturn: map('energyReturn', (x) => x / 100),
    weight: map('weight', (x) => 1 - x / W_REF),
    outsoleDurability: map('outsoleDurability', (x) => Math.min(x / L_OK, 1)),
    shockAbsorption: map('shockAbsorption', (x) => x / SA_REF),
    midsoleWidth: map('midsoleWidth', (x) => Math.min(x / WID_CAP[side], 1)),
    heelCounter: map('heelCounter', (x) => (x - 1) / 4),
  };
}
```

Then the definition shape and the generic pipeline:

```typescript
export interface Anchor { r0: number; r100: number }

/**
 * One story's score, as data. The engine reads nothing story-specific, so a fourth story is a
 * fourth definition rather than a fourth code path. `sd` is keyed by pool rather than shared
 * globally: Easy and Tempo rank the plate-filtered pool and share divisors, Race ranks the whole
 * fleet where carbon widens every spread (docs/app.md §The Easy score).
 */
export interface ScoreDef {
  id: string;
  /** Synthetic column keys, one per side, from `DERIVED_SIDE_PAIRS`. */
  keys: Record<Side, string>;
  weights: Partial<Record<TermKey, number>>;
  /** Terms the stability preference adds, or null where the preference does not apply. */
  stability: Partial<Record<TermKey, number>> | null;
  sd: Record<Side, Partial<Record<TermKey, number>>>;
  /** `on` is absent exactly when `stability` is null. */
  anchors: Record<Side, { off: Anchor; on?: Anchor }>;
}

export interface Contribution { key: TermKey; raw: Reading; term: number; weighted: number }

/** The terms in play, which is where a definition without stability quietly ignores the preference. */
function activeWeights(def: ScoreDef, stability: boolean): Partial<Record<TermKey, number>> {
  return stability && def.stability ? { ...def.weights, ...def.stability } : def.weights;
}

export function contributions(
  def: ScoreDef, shoe: Shoe, side: Side, stability: boolean, idx: TestIndex,
): Contribution[] | null {
  const raw = readings(shoe, side, idx);
  const mapped = mapReadings(raw, side);
  const weights = activeWeights(def, stability);
  const keys = Object.keys(weights) as TermKey[];
  if (keys.some((k) => mapped[k] === null)) return null; // all-terms-required
  return keys.map((key) => ({
    key,
    raw: raw[key]!,
    term: mapped[key]!,
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
  const weights = activeWeights(def, stability);
  const total = rows.reduce((sum, r) => sum + weights[r.key]!, 0);
  const mean = rows.reduce((sum, r) => sum + r.weighted, 0) / total;
  const useOn = stability && def.stability !== null;
  const a = useOn ? def.anchors[side].on! : def.anchors[side].off;
  return ((mean - a.r0) / (a.r100 - a.r0)) * 100;
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

**Note the ordering trap:** `Object.keys(weights)` decides the order of `contributions`, which the detail panel renders. Declare each definition's `weights` in the order you want the breakdown to read, and assert that order in a test rather than relying on it silently.

- [ ] **Step 4: Create `score-defs.ts` with the frozen constants and `EASY`**

Move `SA_REF`, `L_OK`, `WID_CAP` here, add `W_REF = 450`, and express Easy exactly as it behaves today — weights `shockAbsorption 2, outsoleDurability 1, energyReturn 1`, stability `midsoleWidth 1, heelCounter 1`, the plated-pool sds and Easy's four anchors from the table above. Re-export `EASY_SCORE_KEYS` as `EASY.keys` so existing importers keep working.

Keep the frozen-constants doc comment from `score.ts` — it moves with the constants, since that is what it is about.

- [ ] **Step 5: Update every caller**

`Page.svelte`, `DetailPanel.svelte`, `sort.ts` and the tests import `easyScoreMap`/`easyContributions`. Point them at `scoreMap(EASY, …)` / `contributions(EASY, …)`.

- [ ] **Step 6: Run everything**

Run: `npm run verify` → PASS, **including every pre-existing real-dataset assertion unchanged**. If any Easy number moved, the refactor is wrong — do not adjust the test.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/score.ts app/src/lib/score-defs.ts app/src/lib/score.test.ts app/src/Page.svelte app/src/components/DetailPanel.svelte app/src/lib/sort.ts
git commit -m "Make the scoring engine read a story definition rather than Easy"
```

---

### Task 2: The Tempo definition

**Files:** `app/src/lib/score-defs.ts`, `app/src/lib/score.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('the Tempo score against the real fleet', () => {
  const POOL = REAL.shoes.filter((s) => s.plate !== 'carbon');

  it('scores the plate-filtered pool and anchors on it', () => {
    for (const side of SIDES) {
      for (const stability of [false, true]) {
        const vs = [...scoreMap(TEMPO, POOL, side, stability, realIdx).values()];
        expect(vs.length).toBe(283);
        expect(Math.max(...vs)).toBeCloseTo(100, 1);
        expect(Math.min(...vs)).toBeCloseTo(0, 1);
      }
    }
  });

  it('delivers its nominal weights as effective influence', () => {
    // Stage 2's whole purpose. 3/2/2/1 of 8 is 38/25/25/12.
    const rows = POOL.map((s) => contributions(TEMPO, s, 'heel', false, realIdx)).filter((r) => r !== null);
    const spread = (k: TermKey) => sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted));
    const total = (['energyReturn', 'weight', 'outsoleDurability', 'shockAbsorption'] as const)
      .reduce((a, k) => a + spread(k), 0);
    expect(spread('energyReturn') / total).toBeCloseTo(0.375, 1);
    expect(spread('shockAbsorption') / total).toBeCloseTo(0.125, 1);
  });

  it('shares every common divisor with Easy, because they share a pool', () => {
    // A divisor is a property of (metric, mapping, pool), never of the story. Two copies would be
    // two homes for one fact.
    for (const side of SIDES) {
      for (const k of ['energyReturn', 'outsoleDurability', 'shockAbsorption', 'midsoleWidth', 'heelCounter'] as const) {
        expect(TEMPO.sd[side][k]).toBe(EASY.sd[side][k]);
      }
    }
  });

  it('ranks the archetypal tempo shoes above the fragile flats they resemble', () => {
    const r = [...scoreMap(TEMPO, POOL, 'heel', false, realIdx).entries()]
      .sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
    const at = (slug: string) => r.indexOf(slug);
    expect(at('asics-megablast')).toBe(0);
    expect(at('adidas-adizero-evo-sl')).toBeLessThan(5);
    // outsole life 1.0 — the durability weight is what demotes it
    expect(at('adidas-adizero-takumi-sen-11')).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 2:** Run → FAIL (`TEMPO` not exported).
- [ ] **Step 3:** Add `TEMPO: ScoreDef` to `score-defs.ts` with weights `energyReturn 3, weight 2, outsoleDurability 2, shockAbsorption 1`, stability `1` each, the **same sd object Easy uses** (share the reference — do not copy the literal), and Tempo's four anchors.
- [ ] **Step 4:** Run `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Score Tempo on energy return, weight and how long the outsole lasts"`

---

### Task 3: The Race definition

**Files:** `app/src/lib/score-defs.ts`, `app/src/lib/score.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
    // Race declares no stability terms, so the toggle must not change a single score — the control
    // is inert here and the help popover says so.
    for (const side of SIDES) {
      const off = scoreMap(RACE, REAL.shoes, side, false, realIdx);
      const on = scoreMap(RACE, REAL.shoes, side, true, realIdx);
      expect(on.size).toBe(off.size);
      for (const [slug, v] of off) expect(on.get(slug)).toBe(v);
    }
  });

  it('needs its own divisors, because carbon widens every spread', () => {
    expect(RACE.sd.heel.energyReturn).not.toBe(EASY.sd.heel.energyReturn);
    expect(RACE.sd.heel.energyReturn).toBeGreaterThan(EASY.sd.heel.energyReturn!);
  });

  it('has no durability term at all', () => {
    expect(RACE.weights.outsoleDurability).toBeUndefined();
    // and therefore scores shoes Easy and Tempo cannot
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
- [ ] **Step 3:** Add `RACE: ScoreDef` — weights `energyReturn 3, weight 2, shockAbsorption 1`, `stability: null`, whole-fleet sds, two anchors with no `on`.
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Score Race on speed alone, with no durability to answer for"`

---

### Task 4: Four more synthetic keys

**Files:** `lineage.ts`, `lineage.test.ts`, `labels.ts`, `labels.test.ts`, `direction.ts`, `direction.test.ts`, `urlstate.ts`, `urlstate.test.ts`, `components/ColumnPicker.svelte` + test

- [ ] **Step 1: Failing tests**

```typescript
// lineage.test.ts
it('pairs the Tempo and Race score columns by side', () => {
  expect(swapSide('tempo-score-heel', 'forefoot')).toBe('tempo-score-forefoot');
  expect(swapSide('race-score-forefoot', 'heel')).toBe('race-score-heel');
});

// labels.test.ts — all four must fit the phone bound
it('names every score column within the phone label bound', () => {
  for (const key of ['tempo-score-heel', 'tempo-score-forefoot', 'race-score-heel', 'race-score-forefoot']) {
    const label = columnLabel(key, undefined);
    expect(label).toMatch(/score/i);
    expect(widestWordPx(shortLabel(key, label))).toBeLessThanOrEqual(MAX_LABEL_PX);
    expect(lineCount(shortLabel(key, label))).toBeLessThanOrEqual(MAX_LABEL_LINES);
  }
});

// direction.test.ts
it('marks every score higher-is-better', () => {
  for (const d of [EASY, TEMPO, RACE]) for (const side of SIDES) expect(directionOf(d.keys[side])).toBe('higher');
});

// urlstate.test.ts
it('accepts every score key as a sort and a column', () => {
  for (const d of [TEMPO, RACE]) for (const side of SIDES) {
    expect(parseView(`sort=-${d.keys[side]}`, idx).sort.key).toBe(d.keys[side]);
    expect(parseView(`cols=${d.keys[side]}`, idx).columns).toEqual([d.keys[side]]);
  }
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add `{ label: 'Tempo score', forefoot: 'tempo-score-forefoot', heel: 'tempo-score-heel' }` and the Race pair to `DERIVED_SIDE_PAIRS`. Add labels ("Tempo heel score" etc.), `direction.ts` entries, `SORT_FIELDS`/`COLUMN_FIELDS` entries, `ColumnPicker` fixed entries. **Check the label widths** — "Easy forefoot score" measured 47.6px against a 52px bound, so "Tempo forefoot score" and "Race forefoot score" need measuring and possibly a `SHORT_LABELS` entry.
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Give Tempo and Race score columns of their own"`

---

### Task 5: The presets lose their thresholds

**Files:** `presets.ts`, `presets.test.ts`, `Page.test.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Failing tests**

```typescript
it('tempo bounds nothing but the plate and ranks by its score', () => {
  for (const strike of STRIKES) {
    const v = applyPreset('tempo', FLEET, idx, strike, false);
    expect(Object.keys(v.filters.ranges)).toEqual([]);
    expect(v.filters.plate).toEqual(['none', 'plated-other']);
    expect(v.sort).toEqual({ key: TEMPO.keys[strike], dir: 'desc' });
  }
});

it('race bounds nothing at all and ranks by its score', () => {
  for (const strike of STRIKES) {
    const v = applyPreset('race', FLEET, idx, strike, false);
    expect(Object.keys(v.filters.ranges)).toEqual([]);
    expect(v.filters.plate).toBeUndefined(); // carbon belongs here, and is never required
    expect(v.sort).toEqual({ key: RACE.keys[strike], dir: 'desc' });
  }
});

it('every story still round-trips and still names a side', () => {
  for (const p of PRESETS) for (const strike of STRIKES) {
    const v = applyPreset(p.id, FLEET, idx, strike, false);
    expect(parseView(serializeView(v), idx)).toEqual(v);
    expect(sideOf(v)).toBe(strike);
  }
});

it('no story bounds anything any more', () => {
  // Every threshold is gone: the scores read those qualities directly (BACKLOG.md item 1 closes).
  for (const p of PRESETS) for (const strike of STRIKES) {
    expect(Object.keys(applyPreset(p.id, FLEET, idx, strike, false).filters.ranges)).toEqual([]);
  }
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Delete `PRICE_PERCENTILE`, `TEMPO_ENERGY_RETURN_PERCENTILE`, `TEMPO_WEIGHT_PERCENTILE`, `RACE_MAX_WEIGHT`, `RACE_ENERGY_RETURN_PERCENTILE` and the now-unused `fleetCap`. Both cases become a plate filter (Tempo) or nothing (Race) plus a sort and columns:

```typescript
const tempoColumns = (strike: Side) =>
  ['releasedAt', TEMPO.keys[strike], 'score', 'msrpGbp',
   sideKey('Energy return', strike), 'weight', 'outsole-durability', 'plate'];
const raceColumns = (strike: Side) =>
  ['releasedAt', RACE.keys[strike], 'score', 'msrpGbp',
   sideKey('Energy return', strike), 'weight', sideKey('Shock absorption', strike), 'plate'];
```

Both are six numeric columns — the existing per-preset count assertion must still pass.

Rewrite all three `describe` strings, which is BACKLOG.md item 13. They currently promise bounds that no longer exist ("cheap enough to put the miles through", "at a price you can repeat", "the lightest, liveliest shoes in the fleet"). Say what each score ranks on.

- [ ] **Step 4:** Run the suite and fix the fallout. Known: `presets.test.ts` asserts Tempo's and Race's bounds in several places (`SIDE_BOUNDS`, the strike-swap test, the shortlist-comparability test, and the price-cap test that was re-pointed at Tempo when Easy lost its cap — **that test now has no home and its constant is deleted, so remove it**). `Page.test.ts` and `e2e/smoke.spec.ts` assert story counts and `r.` params.
- [ ] **Step 5:** Commit — `"Rank every story by its own score rather than by bounds"`

---

### Task 6: Resolve six score maps, and keep stability off Race

**Files:** `Page.svelte`, `Page.test.ts`

- [ ] **Step 1: Failing test** — assert that with `stability: true` the Race column's values equal the `stability: false` ones, driven through the page.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Build the `ScoreColumns` map from all three definitions × both sides:

```typescript
  /** Every score column the table can show, resolved once. Six entries because each story has a
   *  key per side; a fourth story adds two more and nothing else changes. */
  const scores = $derived(new Map(
    [EASY, TEMPO, RACE].flatMap((def) =>
      (['heel', 'forefoot'] as const).map((side) =>
        [def.keys[side], scoreMap(def, data.shoes, side, view.stability, idx)] as const))));
```

`RACE.stability === null` makes the flag inert for Race inside `scoreOf`, so no branch is needed here.

- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Resolve every story's score for the table"`

---

### Task 7: The breakdown panel, for three stories

**Files:** `DetailPanel.svelte`, `DetailPanel.test.ts`

The panel already renders one section per score column present in `view.columns`. It must now find the right definition per key and handle Race having no stability terms.

- [ ] **Step 1: Failing test** — a view showing all six score columns renders six breakdowns, each titled by `columnLabel`; Race's has three rows and never a stability row even with `stability: true`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Look the definition up by key rather than hard-coding `EASY`:

```typescript
  const DEFS = [EASY, TEMPO, RACE];
  const defFor = (key: string) => DEFS.find((d) => d.keys.heel === key || d.keys.forefoot === key);
  const sideFor = (key: string) => (key.endsWith('-heel') ? 'heel' : 'forefoot') as Side;
```

Add a `TERM_LABEL` entry for `weight`.

- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Break down whichever story's score is on screen"`

---

### Task 8: Say that stability does not reach Race

An inert control with no explanation is worse than either applying it or removing it (race spec §5).

**Files:** `Toolbar.svelte`, `Toolbar.test.ts`

- [ ] **Step 1: Failing test** — the score help popover names Easy and Tempo as the stories the preference affects, and says race shoes have no stable variant to find.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Extend the popover body. Keep it short and true: the preference adds midsole width and heel counter stiffness to the Easy and Tempo scores; it does not affect Race, because race shoes are uniformly tall and narrow so there is no stable variant to surface.
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit — `"Say which stories the stability preference reaches"`

---

### Task 9: The browser suite

**Files:** `e2e/fixtures/shoes.json`, `e2e/smoke.spec.ts`

- [ ] **Step 1:** The e2e fixture already carries the seven scoring tests Easy needed; Tempo and Race need no new *tests*, but the fixture shoes need readings that give each story a real order. Check and extend.
- [ ] **Step 2:** Add specs: clicking Tempo shows a Tempo score column and ranks by it; clicking Race shows a Race score column, applies **no filter at all**, and ticking stability leaves the Race order unchanged.
- [ ] **Step 3:** `npm -w app run e2e` → PASS.
- [ ] **Step 4:** Commit — `"Exercise all three scores in the browser suite"`

---

### Task 10: Docs

Read `docs/README.md` first — forward-only, so describe what *is*.

- [ ] **Step 1: `docs/shoe-stories.md`** — rewrite §Tempo and §Race around their terms. **Replace Tempo's "carbon is deliberately left open"** with the precautionary line plus the finding that carbon makes Tempo collapse into Race. Record shock absorption as a floor in both. Record that Race admits carbon but never requires it, and that its weight ceiling is gone. Strengthen Race's existing stability position with the measurement. Delete any surviving reference to a price cap.
- [ ] **Step 2: `docs/app.md`** — §Presets: all three stories resolve to a sort, Race with no filter at all. Generalise §The Easy score into a section covering all three: the shared engine and `ScoreDef`, that **divisors are keyed by pool** and Race's differ, that anchors are per story, that the stability preference reaches Easy and Tempo only, and the six score columns. Note that a shoe outside a definition's pool still gets a score and may exceed 100.
- [ ] **Step 3: `BACKLOG.md`** — item 1 closes entirely (no preset has thresholds). Item 11 closes. Item 13 closes. Item 12 (versatility) gains the trap from race spec §9: the three scores cover **different shoe sets** — 283 for Easy and Tempo, 378 for Race, not nested — so it cannot average over whichever exist without reintroducing the renormalisation flaw.
- [ ] **Step 4:** `npm run check:docs` → PASS.
- [ ] **Step 5:** Commit — `"Record what each story's score measures"`

---

### Task 11: Verify

- [ ] **Step 1:** `npm run verify` → PASS, `src/lib/**` above 90% lines / 85% branches.
- [ ] **Step 2:** `npm -w app run e2e` → PASS.
- [ ] **Step 3: Look at it.** `npm -w app run dev`, then check against the specs: Easy's list is unchanged from before this branch; Tempo leads with Megablast, EVO SL, ANTA Zone 2 90 and shows no carbon; Race leads with Adios Pro Evo 3, Metaspeed Ray, Fast-R Nitro Elite 3 and is all carbon without a plate filter; ticking stability moves Easy and Tempo and leaves Race untouched; all three stories stay marked through the toggle.
- [ ] **Step 4:** Commit any fixes. **Do not push or merge.** Report and stop.

---

## Self-Review

**Spec coverage.** Tempo §2 pool → Task 5. §3 terms and weights → Task 2. §4 constants and the shared-divisor property → Tasks 1–2 (asserted). §5 stability at 1 → Task 2. §6 view and columns → Task 5. §7 landings → Tasks 2, 11. §8 docs → Task 10. Race §2 no gate → Task 5. §3 terms → Task 3. §4 own divisors → Task 3 (asserted). §5 no stability → Tasks 3, 6, 8. §6 view → Task 5. §7 landings → Tasks 3, 11. §8 docs → Task 10. §9 versatility trap → Task 10.

**Type consistency.** `TermKey` members are `energyReturn`, `weight`, `outsoleDurability`, `shockAbsorption`, `midsoleWidth`, `heelCounter` throughout. `scoreOf`/`scoreMap`/`contributions` all take `(def, …)` first. `ScoreDef.keys` is `Record<Side, string>`, read as `def.keys[side]` in Tasks 4, 5, 6, 7. `EASY`, `TEMPO`, `RACE` all live in `score-defs.ts`.

**Known ripple, named rather than discovered.** Task 1 renames every exported Easy symbol, so every importer moves. Task 5 deletes five exported constants and breaks the tests that assert them — including one test whose only purpose was covering `PRICE_PERCENTILE`, which must be removed rather than re-pointed, since no story caps price now. Task 4's four new keys need width-checking against the 52px phone bound before assuming they fit.

**One thing deliberately not done.** The versatility score is out of scope; Task 10 records the set-mismatch trap so whoever builds it starts from the right premise.
