# Metric Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the metric surface honest — no metric appears twice, every metric shows how much of your current fleet it describes, and every shoe you are not shown is accounted for.

**Architecture:** Two new pure modules in `app/src/lib` (lineage, coverage) do all the reasoning and carry the tests. The components render what those return. No dataset or scraper change; nothing new is fetched.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright for e2e.

**Design spec:** docs/superpowers/specs/2026-07-27-metric-legibility-design.md — read §2 first; it records fleet measurements that are expensive to re-derive.

## Global Constraints

- **`npm run verify` must pass before every commit** (check:docs + typecheck + lint + test:coverage). `.svelte` files are now linted by eslint-plugin-svelte as well as svelte-check.
- Coverage thresholds: lines ≥ 90, branches ≥ 85 on `app/src/lib`.
- **TDD**: write the failing test, run it, watch it fail, then implement.
- **The Page owns view state and only writes the URL** — never re-derive view from the URL (docs/app.md §View and URL ownership).
- `{@html}` stays confined to its two sanctioned sinks (docs/app.md §Sanitised-HTML boundary). Nothing in this plan adds one.
- Display transforms live in `app/src/lib`, never in the dataset. Numbers render via `displayNumber` (docs/app.md §Number display).
- **Never coalesce, average, or fall back between test generations** (docs/scraping.md §Test lineage).
- Comments are WHY-only; a rule spanning files points at its owning doc.
- Commits: concise single-line subjects, no embedded measurements, body ending `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- Locate code by **symbol name**, not line number — this file moves often.

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/lineage.ts` | **create** — resolves the test catalogue into display entries: pairs, colocated halves, singles |
| `app/src/lib/coverage.ts` | **create** — coverage of a metric against a given shoe population |
| `app/src/lib/filters.ts` | modify — report why each shoe was excluded |
| `app/src/lib/urlstate.ts` | modify — serialise generation choice and the show-missing flag |
| `app/src/components/MetricEntry.svelte` | **create** — one metric row: coverage bar, generation switch, warning |
| `app/src/components/Receipt.svelte` | **create** — the always-present accounting line |
| `app/src/components/FilterSidebar.svelte` | modify — render entries from lineage, not raw tests |
| `app/src/components/ColumnPicker.svelte` | modify — same entries, grouped |
| `app/src/Page.svelte` | modify — wire the receipt and pass the population down |

---

### Task 1: Resolve the catalogue into display entries

**Files:**
- Create: `app/src/lib/lineage.ts`
- Test: `app/src/lib/lineage.test.ts`

**Interfaces:**
- Consumes: `LabTest[]` from the dataset.
- Produces:

```ts
export type MetricEntry =
  | { kind: 'single'; key: string; label: string; units: string; groupId: string | null }
  | { kind: 'pair'; label: string; groupId: string | null;
      current: { key: string; units: string; generation: string };
      retired: { key: string; units: string; generation: string } }
  | { kind: 'colocated'; label: string; groupId: string | null;
      parts: { key: string; label: string; units: string }[] };

export function metricEntries(tests: LabTest[]): MetricEntry[];
export function generationLabel(slug: string): string;
```

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/lineage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generationLabel, metricEntries } from './lineage';
import type { LabTest } from '../../../shared/types.js';

const t = (over: Partial<LabTest> & Pick<LabTest, 'id' | 'slug'>): LabTest => ({
  name: over.slug, type: 'float', units: '', groupId: null,
  chartLabel: null, isNew: false, previousId: null, updateId: null,
  primaryTestId: null, secondaryTestIds: [], ...over,
});

describe('generationLabel', () => {
  it('reads the method year off the slug suffix, else calls it original', () => {
    expect(generationLabel('midsole-softness-22')).toBe('2022 method');
    expect(generationLabel('breathability-25')).toBe('2025 method');
    expect(generationLabel('torsional-rigidity-23')).toBe('2023 method');
    expect(generationLabel('midsole-softness')).toBe('original');
    // a trailing number that is not a year suffix must not be read as one
    expect(generationLabel('shoe-test-5')).toBe('original');
  });
});

describe('metricEntries', () => {
  it('pairs a superseded test with its replacement, current first', () => {
    const tests = [
      t({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', updateId: 70 }),
      t({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', previousId: 11 }),
    ];
    const [e] = metricEntries(tests);
    expect(e).toMatchObject({
      kind: 'pair', label: 'Midsole softness',
      current: { key: 'midsole-softness-22', units: 'AC', generation: '2022 method' },
      retired: { key: 'midsole-softness', units: 'HA', generation: 'original' },
    });
  });
  it('produces one entry per pair, not two', () => {
    const tests = [
      t({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 70 }),
      t({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', previousId: 11 }),
    ];
    expect(metricEntries(tests)).toHaveLength(1);
  });
  it('colocates a primary with its secondaries under the chart label', () => {
    const tests = [
      t({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', chartLabel: 'Energy return', secondaryTestIds: [66] }),
      t({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', primaryTestId: 65 }),
    ];
    const [e] = metricEntries(tests);
    expect(e).toMatchObject({ kind: 'colocated', label: 'Energy return' });
    expect((e as any).parts.map((p: any) => p.key)).toEqual(['energy-return-heel', 'energy-return-forefoot']);
  });
  it('falls back to the primary name when there is no chart label', () => {
    const tests = [
      t({ id: 60, slug: 'forefoot-traction', name: 'Forefoot traction', secondaryTestIds: [61] }),
      t({ id: 61, slug: 'forefoot-traction-stop', name: 'Stop', primaryTestId: 60 }),
    ];
    expect(metricEntries(tests)[0]).toMatchObject({ kind: 'colocated', label: 'Forefoot traction' });
  });
  it('leaves an unrelated test as a single', () => {
    expect(metricEntries([t({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm' })])[0])
      .toMatchObject({ kind: 'single', key: 'heel-stack', label: 'Heel stack', units: 'mm' });
  });
  it('ignores a dangling reference rather than throwing', () => {
    // a test whose partner was dropped as empty (docs/scraping.md §Empty tests)
    const [e] = metricEntries([t({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 999 })]);
    expect(e.kind).toBe('single');
  });
  it('never lists a test twice across all entries', () => {
    const tests = [
      t({ id: 11, slug: 'a', updateId: 70 }), t({ id: 70, slug: 'a-22', previousId: 11 }),
      t({ id: 65, slug: 'b-heel', chartLabel: 'B', secondaryTestIds: [66] }), t({ id: 66, slug: 'b-fore', primaryTestId: 65 }),
      t({ id: 6, slug: 'c' }),
    ];
    const keys = metricEntries(tests).flatMap((e) =>
      e.kind === 'single' ? [e.key] : e.kind === 'pair' ? [e.current.key, e.retired.key] : e.parts.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm -w app run test -- lineage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/src/lib/lineage.ts`. Requirements the tests pin:

- Only tests whose `type` is in `NUMERIC_TEST_TYPES` are considered; import that set from `./dataset`.
- Build an id→test map first. A pair is formed from the test carrying `updateId` pointing at a **present** test; the target is `current`, the holder is `retired`. A dangling `updateId` degrades to `single`.
- `isNew` is unreliable and must not be used to decide which generation is current — only `previousId` / `updateId` (docs/scraping.md §Test lineage).
- A colocated entry is formed from a test with a non-empty `secondaryTestIds` whose targets are present; `label` is `chartLabel ?? primary.name`; `parts` is primary first, then secondaries in listed order.
- Every test appears in exactly one entry. Emit entries in the order their primary test appears in the input.
- `generationLabel` matches a trailing `-<two digits>` only where those digits read as a plausible method year (20–29 → `20xx method`); anything else is `original`.

- [ ] **Step 4: Run and watch it pass**

Run: `npm -w app run test -- lineage`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/lineage.ts app/src/lib/lineage.test.ts
git commit -m "Resolve the test catalogue into display entries"
```

---

### Task 2: Coverage against a population

**Files:**
- Create: `app/src/lib/coverage.ts`
- Test: `app/src/lib/coverage.test.ts`

**Interfaces:**
- Consumes: `numericValue`, `TestIndex` from `./dataset`.
- Produces:

```ts
export interface Coverage { n: number; total: number; fraction: number }
export function coverageOf(shoes: Shoe[], key: string, idx: TestIndex): Coverage;
export const SPARSE_BELOW = 0.5;
export function isSparse(c: Coverage): boolean;
```

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse, SPARSE_BELOW } from './coverage';
import { indexTests } from './dataset';
import { FLEET, TESTS } from './test-fixtures';

const idx = indexTests(TESTS);

describe('coverageOf', () => {
  it('counts shoes carrying a reading', () => {
    const c = coverageOf(FLEET, 'heel-stack', idx);
    expect(c.total).toBe(FLEET.length);
    expect(c.n).toBe(FLEET.filter((s) => s.values['6'] !== undefined).length);
    expect(c.fraction).toBeCloseTo(c.n / c.total);
  });
  it('is zero-safe on an empty population', () => {
    expect(coverageOf([], 'heel-stack', idx)).toEqual({ n: 0, total: 0, fraction: 0 });
  });
  it('reports nothing for an unknown key', () => {
    expect(coverageOf(FLEET, 'no-such-test', idx).n).toBe(0);
  });
});

describe('isSparse', () => {
  it('is true strictly below the threshold', () => {
    expect(isSparse({ n: 49, total: 100, fraction: 0.49 })).toBe(true);
    expect(isSparse({ n: 50, total: 100, fraction: SPARSE_BELOW })).toBe(false);
  });
  it('is never true for an empty population, which says nothing', () => {
    expect(isSparse({ n: 0, total: 0, fraction: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm -w app run test -- coverage`

- [ ] **Step 3: Implement**

`coverageOf` counts shoes where `numericValue(shoe, key, idx) !== undefined`. `fraction` is `0` when `total` is `0`. `isSparse` returns `false` when `total === 0` and otherwise `fraction < SPARSE_BELOW`.

Put the WHY for the threshold at `SPARSE_BELOW` with a pointer, not a restatement:

```ts
// Below this, using the metric hides more shoes than it shows. Relative to the current
// population on purpose — see the Coverage section of docs/app.md, added in Task 8.
export const SPARSE_BELOW = 0.5;
```

Once Task 8 lands, tighten that comment to a `§Coverage` pointer so check:docs pins it.
Do not point source code at a file under `docs/superpowers/` — those are frozen
build-time artifacts, not reference (CLAUDE.md §Doc index).

- [ ] **Step 4: Run and watch it pass, then commit**

```bash
git add app/src/lib/coverage.ts app/src/lib/coverage.test.ts
git commit -m "Measure metric coverage against a shoe population"
```

---

### Task 3: Report why shoes were excluded

**Files:**
- Modify: `app/src/lib/filters.ts` (`FilterResult`, `applyFilters`)
- Test: `app/src/lib/filters.test.ts`

**Interfaces:**
- Produces: `FilterResult` gains `considered: Shoe[]` (passed every non-range filter) and `outsideBounds: number`. `hiddenMissing` keeps its existing meaning exactly.

- [ ] **Step 1: Write the failing test**

Append to `app/src/lib/filters.test.ts`:

```ts
describe('applyFilters accounting', () => {
  it('reconciles: visible + outsideBounds + hiddenMissing === considered', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 36 } }, search: '' }, idx);
    expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
  });
  it('considered is the population left by the non-range filters alone', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 } }, plate: 'carbon' }, idx);
    expect(r.considered).toEqual(FLEET.filter((s) => s.plate === 'carbon'));
    expect(r.visible).toEqual([]);
  });
  it('counts a shoe once even when it fails several bounds', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 }, score: { min: 999 } } }, idx);
    expect(r.outsideBounds).toBe(r.considered.length);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm -w app run test -- filters`

- [ ] **Step 3: Implement**

In `applyFilters`, push each shoe that survives every non-range check into a `considered` array **before** the range loop. Increment `outsideBounds` on the existing `outOfRange` branch. Return both alongside the existing fields. Do not change the order in which missing-ness is settled — that invariant is load-bearing and already commented.

- [ ] **Step 4: Run the full app suite, then commit**

```bash
npm run verify
git add app/src/lib/filters.ts app/src/lib/filters.test.ts
git commit -m "Account for every shoe a filter set excludes"
```

---

### Task 4: Carry generation choice and show-missing in the URL

**Files:**
- Modify: `app/src/lib/urlstate.ts` (`ViewState`, `serializeView`, `parseView`, `defaultView`)
- Test: `app/src/lib/urlstate.test.ts`

**Interfaces:**
- Produces: `ViewState` gains `generations: Record<string, string>` (pair label → chosen key) and `showMissing?: boolean`. URL keys: `gen.<currentKey>=<chosenKey>` and `missing=1`.

- [ ] **Step 1: Write the failing test**

Append to `app/src/lib/urlstate.test.ts`:

```ts
describe('generation choice', () => {
  it('round-trips a non-default generation', () => {
    const v = defaultView();
    v.generations['midsole-softness-22'] = 'midsole-softness';
    expect(parseView(serializeView(v), full).generations).toEqual({ 'midsole-softness-22': 'midsole-softness' });
  });
  it('omits a choice that equals the default', () => {
    const v = defaultView();
    v.generations['midsole-softness-22'] = 'midsole-softness-22';
    expect(serializeView(v)).toBe('');
  });
  it('drops a generation naming a test that does not exist', () => {
    expect(parseView('gen.midsole-softness-22=made-up', full).generations).toEqual({});
  });
  it('round-trips show-missing and omits it when false', () => {
    const v = defaultView();
    v.showMissing = true;
    expect(serializeView(v)).toContain('missing=1');
    expect(parseView(serializeView(v), full).showMissing).toBe(true);
    expect(serializeView(defaultView())).not.toContain('missing');
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

Run: `npm -w app run test -- urlstate`

Follow the existing hostile-input discipline exactly (docs/app.md §URL encoding): an unknown or non-numeric target is dropped, never thrown on, and a value equal to the default is not written.

- [ ] **Step 3: Verify and commit**

```bash
npm run verify
git add app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts
git commit -m "Carry the chosen test generation in the view state"
```

---

### Task 5: The metric entry component

**Files:**
- Create: `app/src/components/MetricEntry.svelte`, `app/src/components/MetricEntry.test.ts`

**Interfaces:**
- Consumes: `MetricEntry` (Task 1), `Coverage`/`isSparse` (Task 2).
- Props: `{ entry, coverage: (key: string) => Coverage, chosen: string, onchoose: (key: string) => void }`.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/MetricEntry.test.ts` covering:

- a `single` renders its label, units and coverage percentage;
- a `pair` renders **one** heading and two generation options, with the current one selected by default;
- choosing the retired generation calls `onchoose` with the retired key and **only** that key — assert the callback argument, which is what proves the two can never both be active;
- a coverage below `SPARSE_BELOW` renders a warning; at or above it does not;
- a `colocated` entry renders one heading and each part as its own selectable control.

- [ ] **Step 2: Run it and watch it fail, then implement**

Render a labelled group per entry kind. Requirements:

- The generation control must be a `radiogroup` with accessible names — this is the a11y-sensitive part and range inputs already announce poorly (BACKLOG.md item 5). Give each generation an accessible name combining the metric label and the generation, so a screen reader hears "Midsole softness, 2022 method", not "2022 method".
- The warning is text, not colour alone.
- No `{@html}`.

- [ ] **Step 3: Verify and commit**

```bash
npm run verify
git add app/src/components/MetricEntry.svelte app/src/components/MetricEntry.test.ts
git commit -m "Render a metric as one entry with its coverage"
```

---

### Task 6: The receipt

**Files:**
- Create: `app/src/components/Receipt.svelte`, `app/src/components/Receipt.test.ts`
- Modify: `app/src/Page.svelte`

**Interfaces:**
- Props: `{ shown: number; total: number; outsideBounds: number; hiddenMissing: number; onshowmissing: () => void }`.

- [ ] **Step 1: Write the failing test**

Cover: the line renders with all four numbers; it renders even when nothing is hidden (its absence must never need interpreting); the "show them anyway" control appears only when `hiddenMissing > 0` and calls `onshowmissing`; singular/plural copy is correct at 1.

The missing-data copy must keep matching what `hiddenMissing` actually means — it over-counts against "would otherwise be visible", so the wording is "N shoes have no data for the active filters", never "N would otherwise match" (docs/app.md §Filters).

- [ ] **Step 2: Implement and wire into `Page.svelte`**

`Page.svelte` already derives `filtered` from `applyFilters`; pass the new fields straight through. Toggling show-missing goes through `setView` like every other change — never mutate `view` directly (docs/app.md §View and URL ownership).

When `showMissing` is set, `applyFilters` must admit shoes with no reading for an active range instead of counting them as hidden. Add that branch in Task 3's function guarded by the flag, with its own test.

- [ ] **Step 3: Verify and commit**

```bash
npm run verify
git add app/src/components/Receipt.svelte app/src/components/Receipt.test.ts app/src/Page.svelte app/src/lib/filters.ts app/src/lib/filters.test.ts
git commit -m "Account for hidden shoes in a persistent receipt"
```

---

### Task 7: Sidebar and column picker render entries

**Files:**
- Modify: `app/src/components/FilterSidebar.svelte`, `app/src/components/ColumnPicker.svelte`
- Test: their existing `.test.ts` files

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing tests**

In `FilterSidebar.test.ts`: no two controls share an accessible name; a superseded pair renders once; sparse metrics beyond the curated list collapse behind a disclosure. In `ColumnPicker.test.ts`: a pair offers the current generation as the column by default, and the **Other** group still renders.

- [ ] **Step 2: Implement**

Both components stop iterating `data.tests` directly and iterate `metricEntries(...)` instead, rendering `MetricEntry`. Coverage is computed against `filtered.considered`, not the whole fleet — that is the whole point of Task 3.

`width` and `pace` must not appear in either surface. They are facts, not tests, so they will not be in `metricEntries` — add an assertion so a future change cannot quietly introduce them.

- [ ] **Step 3: Verify, run e2e, commit**

```bash
npm run verify
npm -w app run e2e
git add app/src/components
git commit -m "Render filters and columns from resolved metric entries"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/app.md` (§Filters, §Columns and sorting, plus a new §Coverage)

- [ ] **Step 1: Write it**

Add a §Coverage section owning: the denominator definition and why it is the non-range population; the sparse threshold and why it is relative; the generation-pairing rule and why generations never merge (pointing at docs/scraping.md §Test lineage rather than restating it); and the receipt's reconciliation identity.

Extend §Filters and §Columns and sorting only where they now say something untrue.

- [ ] **Step 2: Verify and commit**

```bash
npm run verify
git add docs/app.md
git commit -m "Document the coverage model and generation pairing"
```

---

## Verification checklist

- [ ] `npm run verify` passes; `npm -w app run e2e` passes.
- [ ] No metric name appears twice in the sidebar or the column picker.
- [ ] No view state can hold both generations of a pair.
- [ ] Coverage changes when a non-range filter changes, and does **not** change when a range bound is dragged.
- [ ] `shown + outsideBounds + hiddenMissing === considered.length` holds for every filter state exercised in tests.
- [ ] `grep -rn "width\|pace" app/src/components/FilterSidebar.svelte app/src/components/ColumnPicker.svelte` shows no fact leaking into either surface.
