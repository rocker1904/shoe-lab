# Entry Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the page on the question a runner actually arrives with — what am I running? — without taking free-form filtering away from anyone, and resume where they left off next time.

**Architecture:** The three stories become real presets, bounded by market percentiles where the story is relative and by absolute values where it is not. An entry band renders them as cards with live counts and collapses once the view stops being the default. View state persists as the serialised query string and restores through the existing parser.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright.

**Design spec:** docs/superpowers/specs/2026-07-27-entry-flow-design.md
**Domain reasoning:** docs/shoe-stories.md — read before touching a threshold. It owns *why*; this plan implements.

## Scope note

The spec lists preset thresholds as a non-goal, deferring them to BACKLOG.md item 1. That
cannot hold literally: the band offers cards for Easy, Tempo and Race, and the code has
`easy-day-cruiser`, `tempo-plated` and `wide-toebox`. **This plan replaces the preset
set**, using the thresholds docs/shoe-stories.md settles. Tuning them after real use
stays BACKLOG.md item 1.

## Expected results

These were computed against `data/shoes.json` (450 shoes) through the real
`numericValue` resolution. Treat them as an oracle: if your implementation returns
something materially different, it is wrong.

| preset | resolved bounds | visible | dropped for no reading |
|---|---|---|---|
| Easy | heel-stack ≥ 36, not-carbon, price ≤ £180 | **150** | 0 |
| Tempo | ER-heel ≥ 65, weight ≤ 247 g, price ≤ £180 | **19** | 72 |
| Race | weight ≤ 230, ER-heel ≥ 70 | **39** | 72 |

Tempo is deliberately narrow, and Tempo and Race both drop 72 shoes that have no
energy-return reading. The receipt will say so loudly, which is the point of having it.

## Global Constraints

- **`npm run verify` must pass before every commit** (check:docs + typecheck + lint + test:coverage).
- Coverage thresholds: lines ≥ 90, branches ≥ 85, scoped to `app/src/lib/**`. `persist.ts` is in scope; components are not, but still need tests.
- **TDD**: write the failing test, run it, watch it fail, then implement.
- `tsconfig.base.json` sets `noUncheckedIndexedAccess` — indexing yields `T | undefined`; house style is a trailing `!`. Do not use `!` where the index can genuinely be out of range; guard instead.
- **Docs ride the change**: each task updates its owning doc in its own commit. There is no documentation task at the end.
- **Comments ride the change too.** A comment that describes behaviour you are removing is a defect. Task 3 has a checklist of the ones this plan invalidates.
- **The Page owns view state and only writes the URL** (docs/app.md §View and URL ownership). `popstate` stays unhandled.
- **Thresholds are market-relative where the story is relative** — "affordable", "light for the fleet" — and absolute where the story is absolute. A 36 mm stack is a property of a shoe; £180 is a property of the market this week. Both are legitimate; do not convert one into the other (docs/shoe-stories.md).
- A preset must never bound a metric whose coverage would trip the app's own sparse warning (docs/app.md §Coverage).
- Comments are WHY-only and point at owning docs. Never reference a plan or anything under `docs/superpowers/` from source.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- Locate code by symbol name, not line number.

## Existing tests and files this plan will break

Verified by applying the changes, not by guessing. Fix each in the task that breaks it.

| Thing | Breaks because | Task |
|---|---|---|
| `app/src/Page.svelte` — `applyPreset(id, data.shoes, idx, new Date())` | the `now` parameter goes; svelte-check errors "Expected 3 arguments, but got 4" | **3** |
| `app/src/Page.test.ts` — `getByRole('button', { name: 'Easy-day cruiser' })` | that label ceases to exist | **3** |
| `app/src/lib/presets.test.ts` — every case | ids, thresholds and the recency default all change | 3 |
| `app/e2e/smoke.spec.ts` — `'Easy-day cruiser'`, `1 of 5 shoes`, `/plate=none/` | same, plus the plate token changes | 3 |
| `app/scripts/prepare-e2e.mjs` — the `cushy.releasedAt` mutation and its comment | both exist only to satisfy a preset recency window that is being deleted | 3 |
| `app/src/lib/dataset.ts` — the `isoYearsAgo` comment | says presets and chips must agree; no preset will use it. The function stays for the chips | 3 |
| `app/src/components/FilterSidebar.test.ts` — test named "…the same UTC cut-off the presets use" | passes while asserting a relationship that no longer exists | 3 |
| `docs/app.md` — the "median of the live fleet" paragraph | that threshold is gone | 3 |
| `app/src/lib/stats.ts` — `median` and its tests | `presets.ts` was its only production caller | 3 |
| `app/e2e/smoke.spec.ts` — the preset-chip click Task 3 writes | Task 6 replaces the chip row with the band on a default view, so an exact-name `getByRole` stops resolving | **6** |
| `app/src/Page.test.ts` — "applying a preset filters the table and updates the URL" | same cause: on a default view the band renders and `PresetChips` does not | **6** |

**Task 2 breaks nothing.** The whole change was applied and the suite stayed green at
242 tests: `getByRole('button', { name: 'Carbon' })` is an exact match so a "No carbon"
button does not collide, and no test enumerates `PLATES`.

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/stats.ts` | modify — add `quantile`, delete `median` |
| `app/src/lib/filters.ts` | modify — the `not-carbon` plate token |
| `app/src/lib/urlstate.ts` | modify — accept the token; add `isDefaultView` |
| `app/src/components/PlateFilter.svelte` | modify — a fifth option |
| `app/src/lib/presets.ts` | rewrite — Easy, Tempo, Race |
| `app/src/lib/persist.ts` | **create** — store and restore the serialised view |
| `app/src/components/EntryBand.svelte` | **create** — the three cards and the escape hatch |
| `app/src/Page.svelte` | modify — band vs chips, restore, persist |

---

### Task 1: A fleet percentile

**Files:** `app/src/lib/stats.ts`, `app/src/lib/stats.test.ts`

**Produces:** `quantile(values: number[], p: number): number | null`

- [ ] **Step 1: Write the failing test**

```ts
describe('quantile', () => {
  it('takes the value at the floor of the fractional rank', () => {
    const v = [10, 20, 30, 40, 50];
    expect(quantile(v, 0)).toBe(10);
    expect(quantile(v, 0.5)).toBe(30);
    expect(quantile(v, 1)).toBe(50);
  });
  it('does not care about input order and does not mutate', () => {
    const v = [50, 10, 30, 20, 40];
    expect(quantile(v, 0.5)).toBe(30);
    expect(v).toEqual([50, 10, 30, 20, 40]);
  });
  it('is null-safe on empty input', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
  it('handles a single value at any fraction', () => {
    expect(quantile([7], 0)).toBe(7);
    expect(quantile([7], 1)).toBe(7);
  });
  it('clamps a fraction outside 0..1 rather than reading off the end', () => {
    // a caller passing a percentage by mistake must not get undefined typed as number
    expect(quantile([10, 20, 30], 2)).toBe(30);
    expect(quantile([10, 20, 30], -1)).toBe(10);
    expect(quantile([10, 20, 30], Number.NaN)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

Sort a copy ascending; return `null` for empty input or a non-finite `p`; otherwise clamp `p` to `0..1` and index `Math.floor(p * (len - 1))`. Floor-of-rank, not interpolated — a threshold landing on a real shoe's value is easier to reason about.

**Leave `median` alone in this task.** It becomes dead only once Task 3 stops importing it; deleting it here would break typecheck and would also strand the docs/app.md paragraph that still describes it. Task 3 removes both together.

- [ ] **Step 3: Verify and commit**

```bash
npm run verify
git add app/src/lib/stats.ts app/src/lib/stats.test.ts
git commit -F - <<'EOF'
Add a fleet percentile helper

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 2: The `not-carbon` plate token

**Files:** `app/src/lib/filters.ts`, `app/src/lib/filters.test.ts`, `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `app/src/components/PlateFilter.svelte`, `docs/app.md`

**Produces:** `FilterState['plate']` gains `'not-carbon'`; URL value `plate=not-carbon`.

**Why it exists:** Easy excludes carbon but must keep nylon- and plastic-plated daily trainers. On the real fleet, Easy with `not-carbon` returns 150 shoes against 134 for `none` — sixteen genuine daily trainers, including the Cloudmonster 2, both Wave Inspires and the Endorphin Speeds. `none` drops them and `plated` is the wrong direction, so the vocabulary cannot express the rule without this.

- [ ] **Step 1: Write the failing test**

`test-fixtures.ts` already has a `plated-other` shoe (`trainer`), so no fixture change is needed for this task.

```ts
describe('plate not-carbon', () => {
  it('keeps unplated and non-carbon plated shoes, drops carbon', () => {
    const r = applyFilters(FLEET, { ranges: {}, plate: 'not-carbon' }, idx);
    expect(r.visible.length).toBeGreaterThan(0);          // an empty result would make every() vacuous
    expect(r.visible.map((s) => s.plate)).not.toContain('carbon');
    expect(r.visible.some((s) => s.plate === 'none')).toBe(true);
    expect(r.visible.some((s) => s.plate === 'plated-other')).toBe(true);
  });
  it('is a strictly larger set than none', () => {
    const notCarbon = applyFilters(FLEET, { ranges: {}, plate: 'not-carbon' }, idx).visible;
    const none = applyFilters(FLEET, { ranges: {}, plate: 'none' }, idx).visible;
    expect(notCarbon.length).toBeGreaterThan(none.length);
    expect(none.every((s) => notCarbon.includes(s))).toBe(true);
  });
  it('still accounts for every shoe when combined with a range', () => {
    const r = applyFilters(FLEET, { ranges: { 'heel-stack': { min: 36 } }, plate: 'not-carbon' }, idx);
    expect(r.visible.length + r.outsideBounds + r.hiddenMissing).toBe(r.considered.length);
  });
});
```

In `urlstate.test.ts`, add a `plate=not-carbon` round-trip and keep a case asserting an unknown plate value is still dropped.

- [ ] **Step 2: Run it and watch it fail, then implement**

`applyFilters`: `plated` keeps anything but `none`; `not-carbon` keeps anything but `carbon`; any other token is exact. `urlstate.ts`: add to `PLATES`. `PlateFilter.svelte`: a fifth button labelled **No carbon**, widening both prop unions.

- [ ] **Step 3: Update docs/app.md**

The plate paragraph in §Columns and sorting describes the token set. `not-carbon` is a second inexact token, and it exists because excluding carbon is not the same as excluding plates.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/lib/filters.ts app/src/lib/filters.test.ts app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts app/src/components/PlateFilter.svelte docs/app.md
git commit -F - <<'EOF'
Let a filter exclude carbon without excluding every plate

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 3: The three stories

**Files:** `app/src/lib/presets.ts`, `app/src/lib/presets.test.ts`, `app/src/lib/stats.ts`, `app/src/lib/stats.test.ts`, `app/src/Page.svelte`, `app/src/Page.test.ts`, `app/src/lib/dataset.ts`, `app/src/lib/test-fixtures.ts`, `app/src/components/FilterSidebar.test.ts`, `app/scripts/prepare-e2e.mjs`, `app/e2e/smoke.spec.ts`, `docs/app.md`, `docs/shoe-stories.md`, `BACKLOG.md`

**Produces:** `PRESETS` of `easy` / `tempo` / `race`; `applyPreset(id, shoes, idx)` — the `now: Date` parameter goes.

| preset | filters | sort | columns |
|---|---|---|---|
| `easy` | `heel-stack` ≥ 36; `plate: 'not-carbon'`; price ≤ `quantile(prices, 0.8)` | `score` desc | releasedAt, score, msrpGbp, heel-stack, toebox-width-widest-part, weight, plate |
| `tempo` | `energy-return-heel` ≥ 65; `weight` ≤ `quantile(weights, 0.3)`; price ≤ `quantile(prices, 0.8)` | `energy-return-heel` desc | releasedAt, score, msrpGbp, energy-return-heel, weight, plate |
| `race` | `weight` ≤ 230; `energy-return-heel` ≥ 70 | `energy-return-heel` desc | releasedAt, score, msrpGbp, energy-return-heel, weight, plate |

- **No preset sets `releasedAfter`.** Recency is a strategy, not a story.
- **No preset populates `generations`** — none of `heel-stack` (6), `weight` (24) or `energy-return-heel` (65) is half of a superseded pair. Assert it; this is spec §4, not criterion 9.
- **Easy keeps a toebox column.** Dropping `wide-toebox` as a *preset* is not a decision to drop toebox width as a *column* — spec §4 uses exactly this as its worked example.
- **Easy sorts by score, not energy return.** The story makes explosiveness a bonus, so sorting by it would contradict the filter set. Deliberate change from today.
- Prices come through `numericValue(s, 'msrpGbp', idx)`, which resolves the fresher of two sources (docs/app.md §Resolved price) — never `shoe.msrpGbp` directly.
- `wide-toebox` is deleted; toebox width stays a filter anyone can set.

- [ ] **Step 1: Give the fixture weight readings**

`app/src/lib/test-fixtures.ts` `FLEET` carries no test `24`, so any assertion about a weight bound is meaningless. Add weight readings across the fixture shoes, spread widely enough that a `quantile(weights, 0.3)` bound admits some and excludes others.

- [ ] **Step 2: Rewrite `presets.test.ts`**

Cover: each preset returns a complete `ViewState`; the three ids and labels; **no preset sets `releasedAfter`**; **no preset populates `generations`**; each sets its own columns rather than the defaults; an unknown id throws; a preset over an empty fleet does not throw and omits bounds it cannot compute.

The price cap must track the fleet: build two fleets whose price distributions differ and assert the resulting bound differs. A test that only checks "some number" passes against a hard-coded constant.

**Keep two tests from the existing suite** — `survives a URL round trip` and `returns an equal but independent view on every call`. The round trip matters more after this change, not less: it is the only place asserting that `plate: 'not-carbon'` survives `parseView`'s allowlist and that each preset's new `cols` survives the column allowlist. `TESTS` already contains id 55 `toebox-width-widest-part`, so the `id: 900` shim in the current version of that test is stale and can go.

Acceptance criterion 9 as an executable guard. `applyPreset` returns a `ViewState`, which has no population on it, so the shape is:

```ts
const view = applyPreset(id, FLEET, idx);
const { considered } = applyFilters(FLEET, view.filters, idx);
for (const key of Object.keys(view.filters.ranges)) {
  expect(isSparse(coverageOf(considered, key, idx))).toBe(false);
}
```

Use `isSparse` from `./coverage` rather than open-coding `fraction >= SPARSE_BELOW` — the threshold has one owner, and the two disagree on an empty population.

**Extract that into a named helper in the test file** — something like `sparseBoundKeys(view, fleet, idx): string[]`, returning the offending keys — and drive it in both directions. An inline `for` loop cannot be pointed at a counter-example.

**Then add a negative control, and make it borderline.** A control built on a 0%-covered metric proves only that `isSparse` works at zero. The regression this guard exists to catch is a softness ceiling on Easy, and `midsole-softness-22` sits at 0.503 over Easy's `considered` — just *above* the threshold, so it would not be caught. Build a small fleet where the bounded metric lands around 40% and assert `sparseBoundKeys` names it. A guard never shown to fail is not a guard.

Do **not** reach for this by editing `FLEET`'s softness readings: `filters.test.ts` pins `hiddenMissing` and an exact visible-slug list on exactly those values.

- [ ] **Step 3: Run, watch fail, implement, and fix every caller**

`Page.svelte` drops the `new Date()` argument. `Page.test.ts`, `smoke.spec.ts` and `FilterSidebar.test.ts` all reference labels or relationships that no longer exist — see the breakage table. `prepare-e2e.mjs` loses the `cushy.releasedAt` mutation and the comment justifying it. `dataset.ts`'s `isoYearsAgo` comment must stop claiming presets use it; the function stays, because the sidebar chips do.

**Delete `median` here**, now that its last production caller is gone. In `stats.test.ts` one case is mixed — it asserts histogram behaviour *and* median in the same test — so edit that one rather than deleting it wholesale.

- [ ] **Step 4: Update the docs**

`docs/app.md §Presets`: thresholds are a mix — fleet percentiles resolved at click time where the story is relative, absolute values where it is not. **Delete the "median of the live fleet" paragraph.** A preset now sets columns as well as filters and sort.

`docs/shoe-stories.md`: Tempo's open question is answered — the weight bound is the 30th percentile of fleet weight, provisional pending real use.

`BACKLOG.md` item 1 claims the app lacks a not-carbon token, a percentile helper and a Tempo weight bound. All three exist after this task; rewrite the item so it covers only threshold tuning.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify && npm -w app run e2e
git add app/src/lib/presets.ts app/src/lib/presets.test.ts app/src/Page.svelte app/src/Page.test.ts app/src/lib/dataset.ts app/src/lib/test-fixtures.ts app/src/components/FilterSidebar.test.ts app/scripts/prepare-e2e.mjs app/e2e/smoke.spec.ts docs/app.md docs/shoe-stories.md BACKLOG.md
git commit -F - <<'EOF'
Replace the presets with the three running stories

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 4: Knowing when the view is the default

**Files:** `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `docs/app.md`

**Produces:** `isDefaultView(v: ViewState): boolean`

**Why this is its own task:** the obvious shortcut is `serializeView(v) === ''`, and it is **wrong**. `serializeView` omits empty ranges, and `FilterSidebar`'s `choose()` writes `v.filters.ranges[key] ??= {}` — so adding a filter from the Add-filter menu produces a non-default view that serialises to the empty string. An existing test pins exactly this: `urlstate.test.ts` "omits ranges that are empty or not finite". The band would stay expanded after the user had touched a filter, contradicting spec §3.1.

- [ ] **Step 1: Write the failing test**

```ts
describe('isDefaultView', () => {
  it('is true for a freshly built default', () => {
    expect(isDefaultView(defaultView())).toBe(true);
  });
  it('is false once an empty range has been added, though it serialises to nothing', () => {
    const v = defaultView();
    v.filters.ranges['weight'] = {};
    expect(serializeView(v)).toBe('');     // the trap
    expect(isDefaultView(v)).toBe(false);
  });
  it('is false for a changed sort, changed columns, or a generation choice', () => {
    const sort = defaultView(); sort.sort = { key: 'weight', dir: 'asc' };
    const cols = defaultView(); cols.columns = ['score'];
    const gen = defaultView(); gen.generations['midsole-softness-22'] = 'midsole-softness';
    for (const v of [sort, cols, gen]) expect(isDefaultView(v)).toBe(false);
  });
  // Keyed by field name, not an array: a new FilterState field then fails typecheck —
  // which runs in verify — instead of silently going untested.
  const setters: Record<keyof FilterState, (f: FilterState) => void> = {
    ranges: (f) => { f.ranges['weight'] = {}; },
    plate: (f) => { f.plate = 'carbon'; },
    search: (f) => { f.search = 'nike'; },
    brands: (f) => { f.brands = ['ASICS']; },
    releasedAfter: (f) => { f.releasedAfter = '2024-01-01'; },
    hideDiscontinued: (f) => { f.hideDiscontinued = true; },
    showMissing: (f) => { f.showMissing = true; },
  };

  it('is false for every filter field, not just the ones someone remembered', () => {
    for (const mutate of Object.values(setters)) {
      const v = defaultView();
      mutate(v.filters);
      expect(isDefaultView(v)).toBe(false);
    }
  });

  it('is true again once a field is cleared, even though the key remains', () => {
    // `patch` structuredClones the snapshot, and structured clone keeps own properties
    // whose value is undefined — every sidebar clear path leaves the key behind. A
    // key-count comparison would never let the band re-expand.
    for (const [field, mutate] of Object.entries(setters)) {
      if (field === 'ranges') continue;              // ranges clear by deletion, not by undefined
      const v = defaultView();
      mutate(v.filters);
      (v.filters as Record<string, unknown>)[field] = undefined;
      expect(Object.keys(v.filters)).toContain(field);   // the key really is still there
      expect(isDefaultView(v)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run, watch fail, implement**

Compare `v.filters` **wholesale** against `defaultView().filters` rather than picking fields off it by hand — `FilterState` gains fields over time, and the failure mode of a hand-enumerated check is silent.

**Compare by value, never by key presence.** A cleared field keeps its key with an `undefined` value, so `Object.keys(filters).length` is not a usable signal for anything except `ranges` (which clears by deletion). Sort compares by both members; columns element-wise; `generations` by key count. Do not stringify — key order would make it fragile.

- [ ] **Step 3: Document it** in docs/app.md §View and URL ownership: an empty range is view state that does not serialise, so "serialises to nothing" and "is the default" are different questions.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts docs/app.md
git commit -F - <<'EOF'
Tell a default view apart from one that serialises to nothing

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 5: Persist the view between visits

**Files:** `app/src/lib/persist.ts`, `app/src/lib/persist.test.ts`, `docs/app.md`

**Produces:** `readStoredView(): string | null`, `writeStoredView(qs: string): void`

The stored value is the output of `serializeView` and nothing else, so restoring runs it back through `parseView` and inherits hostile-input handling that already exists and is already adversarially tested. The storage key carries the schema version; on a bump the old key is never read again. **No migrations, ever.**

- [ ] **Step 1: Write the failing test**

Cover: a written value reads back; a value stored under a different key version is not read; a blocked `localStorage` makes both a no-op rather than throwing (assign a throwing stub, as `theme.test.ts` does, in both directions); reading nothing returns `null`; an empty query string round-trips as `''` rather than `null`, keeping the two states distinguishable at this layer even though Task 6 happens to treat them alike.

- [ ] **Step 2: Run, watch fail, implement**

Wrap both directions in `try`/`catch` exactly as `theme.ts` does: storage throws rather than returning null where it is blocked, and losing a saved view must never cost the page (docs/app.md §Theming).

- [ ] **Step 3: Document it** in docs/app.md §View and URL ownership: why the stored shape is a query string rather than JSON, and that the version is hand-maintained, deliberately not derived from the build because `main` deploys continuously, with no migrations ever.

Do **not** document the precedence order here — nothing reads storage until Task 6, and a committed doc describing behaviour that does not exist yet is exactly what docs/README.md rule 6 forbids. Task 6 adds it.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/lib/persist.ts app/src/lib/persist.test.ts docs/app.md
git commit -F - <<'EOF'
Persist the view as its serialised query string

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 6: The entry band

**Files:** `app/src/components/EntryBand.svelte`, `app/src/components/EntryBand.test.ts`, `app/src/Page.svelte`, `app/src/Page.test.ts`, `app/e2e/smoke.spec.ts`, `docs/app.md`

**Props:** `{ counts: Map<string, number>, total: number, onapply: (id: string) => void }`. The component imports `PRESETS` itself; the counts come in because only the Page has the dataset.

- [ ] **Step 1: Write the failing tests**

`EntryBand.test.ts`: renders all three stories with name, description and count; clicking a card calls `onapply` with that id; **Browse all N shoes** is present and reachable; a story returning zero shoes still renders its card showing zero rather than hiding.

**jsdom has no `scrollIntoView`** — `typeof el.scrollIntoView === 'undefined'` in this repo's environment, so any test that clicks Browse all throws unless you plant a stub, the way `Page.test.ts` already plants `URL.createObjectURL`. Stub it in the test rather than guarding the call site.

`Page.test.ts`: the band shows on a default view and the chip row does not; applying a preset replaces the band with the chip row; **adding an empty range from the Add-filter menu also collapses the band** — the case Task 4 exists for, so it is the test that matters; a URL carrying filters renders chips, not the band.

Also the precedence rule, which nothing else covers: seed `localStorage` with one serialised view, render with a **different** `location.search`, and assert the URL wins. Spec §5 makes that rule 1, and acceptance criterion 5 depends on it.

And the other half, which is criterion 6 and currently has no test anywhere: seed `localStorage`, render with an **empty** `location.search`, and assert both that the view was restored *and* that `location.search` now carries it. The whole argument for writing a restored view to the URL is that copying the link must share what is on screen — untested, that is just a paragraph.

**Browse all deserves an assertion, not just a comment.** The plan predicts a later reader will "fix" the inert button; a comment is the weakest possible guard. Assert that clicking it calls no `onapply` and leaves `location.search` and the row count unchanged. Note also that `.focus()` on a `<table>` is a silent no-op without `tabindex="-1"` — if you assert focus moved, give the target a tabindex.

- [ ] **Step 2: Implement**

The band renders **above the table**, not inside the `.toolbar` div where `PresetChips` lives. It is shown when `isDefaultView(view)` and replaced by `PresetChips` otherwise.

**Browse all changes no state, and that is not an oversight.** The default view already shows every shoe, so there is nothing to apply; the control moves focus to the table and scrolls it into view. It cannot collapse the band either, because spec §3.1 makes the collapse purely derived from view state — collapsing on Browse-all would need a stored dismissal flag, which §3.1 forbids. Leave a comment saying so at the call site, or a later reader will "fix" a button that looks inert. It must not be styled as a lesser option (spec §3).

Counts come from applying each preset and running `applyFilters`, derived in `Page.svelte`. Three preset applications over 450 shoes at load is cheap; do not memoise prematurely.

Wire persistence: on init, use `location.search` when non-empty, else `readStoredView()`, else defaults — all inside the existing single `untrack` call. Call `writeStoredView(serializeView(v))` inside `setView`.

**A view restored from storage must reach the URL once**, or a returning visitor sees a filtered table behind a bare URL and copying the link shares the default view — which quietly breaks the shareable-filter-URL promise. Pick one mechanism and name it in the code: the least surprising is a single `setView(restored)` immediately after init, because it reuses the one write path that already exists rather than adding a second. Whatever you choose, `docs/app.md §View and URL ownership` currently says *every* change goes through `setView`; if you add a second write site, that sentence changes in this commit.

- [ ] **Step 3: Update the docs**

Record the band's collapse rule and where the counts come from, in docs/app.md §Presets. If you added a second URL write site, update docs/app.md §View and URL ownership in the same commit.

- [ ] **Step 4: Verify and commit**

The band replaces the chip row, so the smoke spec Task 3 wrote no longer resolves its button. Fix it here — and run e2e, which `verify` does not.

```bash
npm run verify && npm -w app run e2e
git add app/src/components/EntryBand.svelte app/src/components/EntryBand.test.ts app/src/Page.svelte app/src/Page.test.ts app/e2e/smoke.spec.ts docs/app.md
git commit -F - <<'EOF'
Open on the three stories, with a way past them

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 7: End-to-end

**Files:** `app/e2e/smoke.spec.ts`, `app/e2e/fixtures/shoes.json`

- [ ] **Step 1: Grow the fixture**

It declares test `24` (weight) in its `tests` array but **no shoe carries a weight reading**, so Race returns nothing and Tempo's weight bound silently vanishes. Add weight readings to every shoe except `mystery`, which exists to be missing. Check the shoes straddle the heel-stack, price and energy-return bounds, and keep at least one `carbon` shoe so `not-carbon` has something to exclude.

Add `toebox-width-widest-part` to the fixture's `tests` too. From Task 3 the Easy preset sets it as a column, and without the test in the catalogue `ShoeTable.headerFor` falls back to the raw slug — a column headed `toebox-width-widest-part` full of em-dashes. Not a failure, just ugly in the one place a human looks at the rendered page.

- [ ] **Step 2: Write the failing test**

A first visit shows the band; clicking **Easy** narrows the table and replaces the band with chips; **reloading with no query string restores that narrowed view rather than the band** — the only end-to-end proof persistence works, since it spans a real page load.

- [ ] **Step 3: Implement, verify, commit**

```bash
npm run verify && npm -w app run e2e
git add app/e2e
git commit -F - <<'EOF'
Cover the entry flow end to end

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Verification checklist

- [ ] `npm run verify` and `npm -w app run e2e` both pass.
- [ ] The three presets return roughly 150 / 19 / 39 shoes against `data/shoes.json`.
- [ ] No preset sets `releasedAfter`; none populates `generations`.
- [ ] No preset bounds a metric `isSparse` flags over its own `considered` population, and the guard proving it has been shown able to fail.
- [ ] The price cap moves when the fleet's price distribution moves.
- [ ] Adding an empty range from the Add-filter menu collapses the band.
- [ ] A shared link with filters opens collapsed and matches the link, ignoring stored state.
- [ ] A restored view appears in the URL, so copying the link shares what is on screen.
- [ ] A bumped storage version silently discards stored state; blocked `localStorage` breaks nothing.
- [ ] `plate=not-carbon` keeps `plated-other` shoes and drops `carbon` ones.
- [ ] No comment or fixture still refers to a preset recency window.
