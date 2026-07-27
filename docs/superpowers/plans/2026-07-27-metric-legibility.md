# Metric Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the metric surface honest — no metric appears twice, every metric shows how much of your current fleet it describes, and every shoe you are not shown is accounted for.

**Architecture:** Two new pure modules in `app/src/lib` (lineage, coverage) do all the reasoning and carry the tests. Components render what those return. No dataset or scraper change; nothing new is fetched.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright for e2e.

**Design spec:** docs/superpowers/specs/2026-07-27-metric-legibility-design.md — read §2 first; it records fleet measurements that are expensive to re-derive and that have been verified to reproduce exactly against `data/shoes.json`.

## Global Constraints

- **`npm run verify` must pass before every commit** (check:docs + typecheck + lint + test:coverage). `.svelte` files are linted by eslint-plugin-svelte as well as svelte-check.
- Coverage thresholds: lines ≥ 90, branches ≥ 85, scoped to `app/src/lib/**`. New components are outside that scope but still need tests.
- **TDD**: write the failing test, run it, watch it fail, then implement.
- **`tsconfig.base.json` sets `noUncheckedIndexedAccess`.** Indexing an array yields `T | undefined`. Use the house style — `FLEET[3]!`, `entries[0]!` — or typecheck fails.
- **Docs ride the change.** Each task below updates the owning doc section **in its own commit**. There is no documentation task at the end; a commit that changes behaviour and leaves docs/app.md stale violates CLAUDE.md §Conventions.
- **The Page owns view state and only writes the URL** (docs/app.md §View and URL ownership).
- `{@html}` stays confined to its two sanctioned sinks (docs/app.md §Sanitised-HTML boundary). Nothing here adds one.
- **Never coalesce, average, or fall back between test generations** (docs/scraping.md §Test lineage).
- Comments are WHY-only and point at owning docs rather than restating them. **Never** reference a plan, a task number, or anything under `docs/superpowers/` from source — those are frozen artifacts, not reference.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- Locate code by **symbol name**, not line number.

## Existing tests this plan will break

Fix these in the task that breaks them — not later. They are the reason `verify` would otherwise go red mid-sequence.

| Test | Breaks because | Task |
|---|---|---|
| `urlstate.test.ts` `const v: ViewState = { filters, sort, columns }` | `generations` added to `ViewState` | 4 |
| `urlstate.test.ts` `expect(defaultView()).toEqual({…})` | `toEqual` rejects the new own property | 4 |
| `filters.test.ts` any `toEqual` on the whole `FilterResult` | `considered` / `outsideBounds` added | 3 |
| `FilterSidebar.test.ts` — all 14 renders | new population prop | 7 |
| `ColumnPicker.test.ts` — all 3 renders | new population prop | 7 |
| `Page.test.ts` `getByRole('group', { name: /Stiffness/ })` | a second `role=group` with that name appears; strict mode fails | 5 or 7 |
| `FilterSidebar.test.ts` missing-data note assertions | the note moves to the receipt | 6 |

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/lineage.ts` | **create** — resolve the catalogue into display entries |
| `app/src/lib/coverage.ts` | **create** — coverage and time depth against a population |
| `app/src/lib/filters.ts` | modify — report exclusions, honour show-missing |
| `app/src/lib/urlstate.ts` | modify — generation choice, show-missing, mutual exclusion |
| `app/src/components/MetricRow.svelte` | **create** — one metric: coverage, generation switch, warning |
| `app/src/components/Receipt.svelte` | **create** — the always-present accounting line |
| `app/src/components/FilterSidebar.svelte` | modify — render entries, keep field rows |
| `app/src/components/ColumnPicker.svelte` | modify — same entries, grouped |
| `app/src/Page.svelte` | modify — wire receipt, pass population down |
| `app/e2e/fixtures/shoes.json` | modify — grow a pair and a colocated pair |

---

### Task 1: Resolve the catalogue into display entries

**Files:**
- Create: `app/src/lib/lineage.ts`, `app/src/lib/lineage.test.ts`
- Modify: `app/src/lib/test-fixtures.ts`

**Interfaces:**
- Produces:

```ts
export type ResolvedMetric =
  | { kind: 'single'; key: string; label: string; units: string; groupId: string | null }
  | { kind: 'pair'; label: string; groupId: string | null;
      current: { key: string; units: string; generation: string };
      retired: { key: string; units: string; generation: string } }
  | { kind: 'colocated'; label: string; groupId: string | null;
      parts: { key: string; label: string; units: string }[] };

export function metricEntries(tests: LabTest[]): ResolvedMetric[];
export function generationLabel(slug: string, fallback: 'current' | 'previous'): string;
```

The type is `ResolvedMetric`, **not** `MetricEntry` — `FilterSidebar.svelte` must import both this type and the `MetricRow.svelte` component, and a name shared with a component is a duplicate-identifier error.

- [ ] **Step 1: Extend the shared fixture**

`app/src/lib/test-fixtures.ts` has `midsole-softness-22` (id 70) with `previousId: 11`, but **no id 11**, so no pair can form. Add its partner before it in `TESTS`:

```ts
labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', groupId: '3', updateId: 70 }),
```

Also add a suffix-less pair, which is the case Step 3 exists for:

```ts
labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', groupId: '3', updateId: 55 }),
labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', groupId: '3', previousId: 27 }),
```

- [ ] **Step 2: Write the failing test**

Create `app/src/lib/lineage.test.ts`. Use the existing `labTest` factory from `./test-fixtures` — do not hand-roll another one.

```ts
import { describe, expect, it } from 'vitest';
import { generationLabel, metricEntries } from './lineage';
import { labTest } from './test-fixtures';

describe('generationLabel', () => {
  it('reads a method year off the slug suffix', () => {
    expect(generationLabel('midsole-softness-22', 'current')).toBe('2022 method');
    expect(generationLabel('breathability-25', 'current')).toBe('2025 method');
  });
  it('falls back to a relative label when no year can be derived', () => {
    // three real pairs carry no year on either side and share both name and units
    expect(generationLabel('toebox-width-widest-part', 'current')).toBe('current method');
    expect(generationLabel('toebox-width-at-the-widest-part', 'previous')).toBe('previous method');
  });
  it('does not read a trailing number that is not a plausible method year', () => {
    expect(generationLabel('shoe-test-5', 'current')).toBe('current method');
    expect(generationLabel('some-test-99', 'current')).toBe('current method');
  });
});

describe('metricEntries', () => {
  it('pairs a superseded test with its replacement, current first', () => {
    const e = metricEntries([
      labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', updateId: 70 }),
      labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', previousId: 11 }),
    ])[0]!;
    expect(e).toMatchObject({
      kind: 'pair', label: 'Midsole softness',
      current: { key: 'midsole-softness-22', units: 'AC', generation: '2022 method' },
      retired: { key: 'midsole-softness', units: 'HA', generation: 'original' },
    });
  });
  it('distinguishes a pair whose slugs carry no year and whose units match', () => {
    const e = metricEntries([
      labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', updateId: 55 }),
      labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', previousId: 27 }),
    ])[0]! as Extract<ReturnType<typeof metricEntries>[number], { kind: 'pair' }>;
    expect(e.current.generation).not.toBe(e.retired.generation);
  });
  it('produces one entry per pair, not two', () => {
    expect(metricEntries([
      labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 70 }),
      labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', previousId: 11 }),
    ])).toHaveLength(1);
  });
  it('colocates a primary with its secondaries and takes the primary group', () => {
    const e = metricEntries([
      labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', groupId: '3', chartLabel: 'Energy return', secondaryTestIds: [66] }),
      labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', groupId: null, primaryTestId: 65 }),
    ])[0]!;
    expect(e).toMatchObject({ kind: 'colocated', label: 'Energy return', groupId: '3' });
    expect((e as Extract<typeof e, { kind: 'colocated' }>).parts.map((p) => p.key))
      .toEqual(['energy-return-heel', 'energy-return-forefoot']);
  });
  it('ignores a secondary that is not in the published catalogue', () => {
    // real case: forefoot-traction names #61, which was dropped for having no readings
    const e = metricEntries([labTest({ id: 60, slug: 'forefoot-traction', name: 'Forefoot traction', secondaryTestIds: [61] })])[0]!;
    expect(e.kind).toBe('single');
  });
  it('keeps the present secondaries when only some are missing', () => {
    const e = metricEntries([
      labTest({ id: 65, slug: 'er-heel', name: 'ER heel', chartLabel: 'ER', secondaryTestIds: [66, 999] }),
      labTest({ id: 66, slug: 'er-fore', name: 'ER fore', primaryTestId: 65 }),
    ])[0]!;
    expect((e as Extract<typeof e, { kind: 'colocated' }>).parts).toHaveLength(2);
  });
  it('degrades a dangling updateId to a single rather than throwing', () => {
    expect(metricEntries([labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 999 })])[0]!.kind)
      .toBe('single');
  });
  it('ignores non-numeric tests entirely', () => {
    expect(metricEntries([labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option' })])).toEqual([]);
  });
  it('never lists a test twice across all entries', () => {
    const keys = metricEntries([
      labTest({ id: 11, slug: 'a', updateId: 70 }), labTest({ id: 70, slug: 'a-22', previousId: 11 }),
      labTest({ id: 65, slug: 'b-heel', chartLabel: 'B', secondaryTestIds: [66] }), labTest({ id: 66, slug: 'b-fore', primaryTestId: 65 }),
      labTest({ id: 6, slug: 'c' }),
    ]).flatMap((e) => e.kind === 'single' ? [e.key] : e.kind === 'pair' ? [e.current.key, e.retired.key] : e.parts.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(5);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm -w app run test -- lineage`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `app/src/lib/lineage.ts`:

- Consider only tests whose `type` is in `NUMERIC_TEST_TYPES` (import from `./dataset`).
- Build an id→test map. A pair forms from the test carrying `updateId` pointing at a **present** test: the target is `current`, the holder is `retired`. A dangling `updateId` degrades to `single`.
- **`isNew` is unreliable and must not decide which generation is current** — only `previousId` / `updateId` (docs/scraping.md §Test lineage).
- A colocated entry forms from a test with at least one **present** `secondaryTestIds` target. `label` is `chartLabel ?? primary.name`; `groupId` is the **primary's**; `parts` is primary first then present secondaries in listed order. Absent targets are skipped, not fatal.
- Every test appears in exactly one entry; emit in input order of the entry's primary.
- `generationLabel(slug, fallback)` returns `"20NN method"` for a trailing `-NN` where NN is 20–29; otherwise `"original"` when the slug is bare and the caller is the retired side, and `"current method"` / `"previous method"` when no year is derivable. The fallback parameter exists because three real pairs share name **and** units on both sides, so the label is the only thing distinguishing them.

- [ ] **Step 5: Run, watch pass, verify, commit**

```bash
npm -w app run test -- lineage && npm run verify
git add app/src/lib/lineage.ts app/src/lib/lineage.test.ts app/src/lib/test-fixtures.ts
git commit -F - <<'EOF'
Resolve the test catalogue into display entries

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Coverage and time depth

**Files:**
- Create: `app/src/lib/coverage.ts`, `app/src/lib/coverage.test.ts`
- Modify: `docs/app.md`

**Interfaces:**

```ts
export interface Coverage { n: number; total: number; fraction: number }
export const SPARSE_BELOW = 0.5;
export function coverageOf(shoes: Shoe[], key: string, idx: TestIndex): Coverage;
export function isSparse(c: Coverage): boolean;
export function oldestReading(shoes: Shoe[], key: string, idx: TestIndex): string | null;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse, oldestReading, SPARSE_BELOW } from './coverage';
import { indexTests } from './dataset';
import { FLEET, TESTS } from './test-fixtures';

const idx = indexTests(TESTS);

describe('coverageOf', () => {
  it('counts shoes carrying a reading', () => {
    const c = coverageOf(FLEET, 'heel-stack', idx);
    expect(c.total).toBe(FLEET.length);
    expect(c.n).toBe(FLEET.filter((s) => typeof s.values['6'] === 'number').length);
    expect(c.fraction).toBeCloseTo(c.n / c.total);
  });
  it('reports nothing for a non-numeric test, which cannot be ranged', () => {
    // reading shoe.values directly instead of via numericValue would wrongly count these
    expect(coverageOf(FLEET, 'tongue-gusset-type', idx).n).toBe(0);
  });
  it('reports nothing for an unknown key', () => {
    expect(coverageOf(FLEET, 'no-such-test', idx).n).toBe(0);
  });
  it('is zero-safe on an empty population', () => {
    expect(coverageOf([], 'heel-stack', idx)).toEqual({ n: 0, total: 0, fraction: 0 });
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

describe('oldestReading', () => {
  it('returns the earliest release date among shoes carrying a reading', () => {
    expect(oldestReading(FLEET, 'heel-stack', idx)).toBe(
      FLEET.filter((s) => typeof s.values['6'] === 'number' && s.releasedAt)
        .map((s) => s.releasedAt!).sort()[0]);
  });
  it('is null when nothing carries a reading or nothing is dated', () => {
    expect(oldestReading([], 'heel-stack', idx)).toBeNull();
    expect(oldestReading(FLEET, 'no-such-test', idx)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

`coverageOf` counts via `numericValue` — never by reading `shoe.values` directly, which is what the non-numeric test above pins. `fraction` is 0 when `total` is 0. `isSparse` is `false` when `total === 0`, else `fraction < SPARSE_BELOW`. `oldestReading` ignores undated shoes and returns `null` rather than a sentinel date.

Comment the threshold with its reason, pointing at the doc section you add in Step 3:

```ts
// Below this, a metric hides more shoes than it shows. Measured against the current
// population, not the fleet — see the Coverage section of docs/app.md.
export const SPARSE_BELOW = 0.5;
```

- [ ] **Step 3: Add the owning doc section**

Add `## Coverage` to `docs/app.md`, before `## Decisions`. It owns: the denominator definition and why it is the non-range population; the sparse threshold and why it is relative rather than a fixed time depth; that time depth explains sparseness but does not measure it. Point at docs/scraping.md §Test lineage for why generations exist rather than restating it. Keep it short — that doc set is measured on per-task read cost.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/lib/coverage.ts app/src/lib/coverage.test.ts docs/app.md
git commit -F - <<'EOF'
Measure metric coverage against a shoe population

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 3: Account for exclusions, and honour show-missing

**Files:**
- Modify: `app/src/lib/filters.ts`, `app/src/lib/filters.test.ts`, `docs/app.md`

**Interfaces:**
- `FilterState` gains `showMissing?: boolean`. It lives here, **not** on `ViewState`, because `applyFilters` receives a `FilterState` and nothing else — putting it elsewhere forces a signature change and three engineers would pick three different ones.
- `FilterResult` gains `considered: Shoe[]` and `outsideBounds: number`. `hiddenMissing` keeps its exact existing meaning.

- [ ] **Step 1: Write the failing test**

```ts
describe('applyFilters accounting', () => {
  it('reconciles across every filter state we exercise', () => {
    const states: FilterState[] = [
      { ranges: {} },
      { ranges: { 'heel-stack': { min: 36 } } },
      { ranges: { 'heel-stack': { min: 36 }, score: { max: 90 } } },
      { ranges: { 'heel-stack': { min: 999 } }, plate: 'carbon' },
      { ranges: {}, search: 'x', hideDiscontinued: true },
    ];
    for (const f of states) {
      const r = applyFilters(FLEET, f, idx);
      expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
    }
  });
  it('considered is the population left by the non-range filters alone', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 } }, plate: 'carbon' }, idx);
    expect(r.considered).toEqual(FLEET.filter((s) => s.plate === 'carbon'));
    expect(r.visible).toEqual([]);
  });
  it('counts a shoe once even when it fails several bounds', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 }, score: { min: 999 } } }, idx);
    // a shoe with no reading at all exits at the missing gate and is never outsideBounds
    expect(r.outsideBounds).toBe(r.considered.length - r.hiddenMissing);
  });
});

describe('applyFilters showMissing', () => {
  it('admits shoes with no reading instead of hiding them', () => {
    const bounded = { ranges: { 'heel-stack': { min: 30 } } };
    const strict = applyFilters(FLEET, bounded, idx);
    const relaxed = applyFilters(FLEET, { ...bounded, showMissing: true }, idx);
    expect(strict.hiddenMissing).toBeGreaterThan(0);
    expect(relaxed.visible.length).toBe(strict.visible.length + strict.hiddenMissing);
    expect(relaxed.hiddenMissing).toBe(0);
  });
  it('still excludes shoes that have a reading and fail the bound', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 999 } }, showMissing: true }, idx);
    expect(r.visible.every((s) => typeof s.values['6'] !== 'number')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

Push each shoe surviving every non-range check into `considered` **before** the range loop. Increment `outsideBounds` on the existing `outOfRange` branch. When `showMissing` is set, a missing reading does not exclude the shoe and does not count as `hiddenMissing`.

**Do not change the order in which missing-ness is settled across active ranges** — that invariant is load-bearing and already carries a comment.

- [ ] **Step 3: Update the Filters section**

Bring docs/app.md §Filters into line with the new accounting and the show-missing
escape, then verify and commit.

```bash
npm run verify
git add app/src/lib/filters.ts app/src/lib/filters.test.ts docs/app.md
git commit -F - <<'EOF'
Account for every shoe a filter set excludes

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 4: Generation choice in the view state

**Files:**
- Modify: `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `docs/app.md`

**Interfaces:**
- `ViewState` gains `generations: Record<string, string>` — keyed by the **current generation's slug**, valued with the chosen slug. A choice equal to its key is the default and is not serialised. URL keys: `gen.<currentSlug>=<chosenSlug>`, and `missing=1` for `filters.showMissing`.

- [ ] **Step 1: Write the failing test**

Note `urlstate.test.ts` uses `idx`, built from `TESTS`. There is no `full` in this file. Task 1 added id 11 to `TESTS`, so both generations now resolve.

```ts
describe('generation choice', () => {
  it('round-trips a non-default generation', () => {
    const v = defaultView();
    v.generations['midsole-softness-22'] = 'midsole-softness';
    expect(parseView(serializeView(v), idx).generations).toEqual({ 'midsole-softness-22': 'midsole-softness' });
  });
  it('omits a choice that equals its key', () => {
    const v = defaultView();
    v.generations['midsole-softness-22'] = 'midsole-softness-22';
    expect(serializeView(v)).toBe('');
  });
  it('drops a choice naming a test that does not exist', () => {
    expect(parseView('gen.midsole-softness-22=made-up', idx).generations).toEqual({});
  });
  it('drops a choice keyed on a test that does not exist', () => {
    expect(parseView('gen.made-up=midsole-softness', idx).generations).toEqual({});
  });
  it('round-trips show-missing and omits it when unset', () => {
    const v = defaultView();
    v.filters.showMissing = true;
    expect(serializeView(v)).toContain('missing=1');
    expect(parseView(serializeView(v), idx).filters.showMissing).toBe(true);
    expect(serializeView(defaultView())).not.toContain('missing');
  });
  it('never admits both generations of a pair as ranges at once', () => {
    const v = parseView('r.midsole-softness=1~&r.midsole-softness-22=1~', idx);
    expect(Object.keys(v.filters.ranges)).toHaveLength(1);
  });
  it('never admits both generations of a pair as columns at once', () => {
    const v = parseView('cols=midsole-softness,midsole-softness-22', idx);
    expect(v.columns).toEqual(['midsole-softness-22']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

Mutual exclusion is enforced **here**, in the hostile-input layer, because a URL is the one place both generations can arrive together (docs/app.md §URL encoding). When both appear, keep the current generation and drop the other. `parseView` already has the `TestIndex` needed to know which is which — use `metricEntries` from Task 1 rather than re-deriving lineage.

Follow the existing discipline exactly: unknown input is dropped, never thrown on, and a value equal to the default is never written.

- [ ] **Step 3: Fix the tests this breaks**

- The `const v: ViewState = { filters, sort, columns }` literal needs `generations: {}`.
- `expect(defaultView()).toEqual({…})` needs `generations: {}` in the expectation — `toEqual` fails on an extra own property.

- [ ] **Step 4: Update the URL encoding section**

Bring docs/app.md §URL encoding into line, then verify and commit.

```bash
npm run verify
git add app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts docs/app.md
git commit -F - <<'EOF'
Carry the chosen test generation in the view state

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 5: The metric row component

**Files:**
- Create: `app/src/components/MetricRow.svelte`, `app/src/components/MetricRow.test.ts`

**Props:** `{ metric: ResolvedMetric, coverage: (key: string) => Coverage, oldest: (key: string) => string | null, chosen: string, onchoose: (key: string) => void }`.

- [ ] **Step 1: Write the failing test**

Cover, at minimum:

- a `single` renders label, units and coverage percentage;
- a `pair` renders **one** heading and two generation controls, current selected by default;
- choosing the retired generation calls `onchoose` with the retired key;
- the two generation controls have **different accessible names** even when name and units match — render the suffix-less `Width / Fit` pair and assert both names are distinct and non-empty. This is the assertion that pins B2's fallback;
- coverage below `SPARSE_BELOW` renders a warning; at or above it does not;
- the warning text differs when the metric is young (an `oldest` within about two years) versus long-standing, since the cause differs;
- a `colocated` renders one heading and each part as its own control.

**Do not** claim any test here proves the two generations cannot both be active — this component only reports a choice. That invariant lives in Tasks 4 and 7.

- [ ] **Step 2: Implement**

- The generation control is a `radiogroup`. Each option's accessible name combines metric label and generation, so a screen reader hears "Midsole softness, 2022 method". Range inputs already announce poorly (BACKLOG.md item 5); do not add to that.
- The warning is text, not colour alone.
- No `{@html}`.
- If this introduces a second `role=group` named `/Stiffness/`, fix `Page.test.ts`'s now-ambiguous query in this task.

- [ ] **Step 3: Verify and commit**

```bash
npm run verify
git add app/src/components/MetricRow.svelte app/src/components/MetricRow.test.ts app/src/Page.test.ts
git commit -F - <<'EOF'
Render a metric as one row with its coverage

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 6: The receipt

**Files:**
- Create: `app/src/components/Receipt.svelte`, `app/src/components/Receipt.test.ts`
- Modify: `app/src/Page.svelte`, `app/src/components/FilterSidebar.svelte`, `app/src/components/FilterSidebar.test.ts`

**Props:** `{ shown: number; total: number; outsideBounds: number; hiddenMissing: number; showingMissing: boolean; onshowmissing: () => void }`.

- [ ] **Step 1: Write the failing test**

Cover: all four numbers render; the line renders **even when nothing is hidden**, so its absence never needs interpreting; the "show them anyway" control appears only when `hiddenMissing > 0` and calls `onshowmissing`; singular/plural copy is correct at exactly 1; when `showingMissing` is true the copy reflects that missing-data shoes are included.

The missing-data copy must keep matching what `hiddenMissing` means — it over-counts against "would otherwise be visible", so the wording stays "N shoes have no data for the active filters", never "N would otherwise match" (docs/app.md §Filters).

- [ ] **Step 2: Implement and wire in**

`Page.svelte` already derives `filtered` from `applyFilters`; pass the new fields straight through. Toggling show-missing goes through `setView` — never mutate `view` (docs/app.md §View and URL ownership).

**Remove the existing missing-data note from `FilterSidebar.svelte`** and its assertions in `FilterSidebar.test.ts`. The spec wants one always-present line, not the same count stated twice in two places.

- [ ] **Step 3: Verify and commit**

```bash
npm run verify
git add app/src/components/Receipt.svelte app/src/components/Receipt.test.ts app/src/Page.svelte app/src/components/FilterSidebar.svelte app/src/components/FilterSidebar.test.ts
git commit -F - <<'EOF'
Account for hidden shoes in a persistent receipt

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 7: Sidebar and column picker render entries

**Files:**
- Modify: `app/src/components/FilterSidebar.svelte`, `app/src/components/ColumnPicker.svelte`, `app/src/Page.svelte`, both `.test.ts` files, `app/e2e/fixtures/shoes.json`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

`FilterSidebar.test.ts`: no two controls share an accessible name; a superseded pair renders once; **the price and score rows still render** (see Step 2); choosing a generation clears any range and column held by its sibling. `ColumnPicker.test.ts`: a pair offers the current generation by default; the **Other** group still renders and now holds 5 entries, with the two forefoot halves under Cushioning.

- [ ] **Step 2: Implement, preserving the field rows**

Both components render `metricEntries(...)` **plus** the shoe-field rows they render today. `metricEntries` takes `LabTest[]` and therefore cannot emit `score` or `msrpGbp`, which are shoe fields in `FIELD_RANGE_KEYS` and appear in `CURATED_RANGE_KEYS`. Construct those two as `single` metrics explicitly. **Losing the price filter is the most likely way to get this task wrong.**

Preserve `extraKeys` — the non-curated-but-active rows that keep an active filter clearable — and `labelFor`'s field special-cases.

Coverage is computed against `filtered.considered`, not the whole fleet; that requires a new prop from `Page.svelte`, which must be listed and staged.

In the add-filter `select`, coverage appears as a percentage in the option text. A bar cannot render inside an `option`.

When a generation is chosen, drop the sibling's entry from `filters.ranges` and from `columns` in the same `setView` call. This is where the exclusivity invariant is actually enforced for user actions; Task 4 covers it for URLs.

- [ ] **Step 3: Grow the e2e fixture**

`app/e2e/fixtures/shoes.json` has 5 tests, no `secondaryTestIds`, and `midsole-softness-22` with `previousId: null` — so it contains **zero pairs and zero colocated metrics**, and the e2e run cannot exercise any of this work. Add a superseded pair and a heel/forefoot pair, and extend `app/e2e/smoke.spec.ts` to assert a pair renders once and both halves are independently sortable.

- [ ] **Step 4: Update the Columns and sorting section**

Bring docs/app.md §Columns and sorting into line, then verify, run e2e, and commit.

```bash
npm run verify && npm -w app run e2e
git add app/src/components app/src/Page.svelte app/e2e docs/app.md
git commit -F - <<'EOF'
Render filters and columns from resolved metric entries

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Verification checklist

- [ ] `npm run verify` passes; `npm -w app run e2e` passes.
- [ ] No metric name appears twice in the sidebar or the column picker — including the three pairs whose slugs carry no year.
- [ ] No view state can hold both generations of a pair, whether arrived at by URL or by clicking.
- [ ] Coverage changes when a non-range filter changes, and does **not** change when a range bound is dragged.
- [ ] `shown + outsideBounds + hiddenMissing === considered.length` across every filter state in the test suite.
- [ ] The price and score filters still work.
- [ ] `metricEntries` emits nothing for a fact — assert against its output, not by grepping source: `width` and `pace` are facts rendered only in the expanded panel, and `toebox-width-*` are real tests whose names would defeat a text search.
