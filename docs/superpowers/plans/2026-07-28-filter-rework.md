# Filter Surface Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the filter surface so it reads as designed rather than accreted — plate as a real multi-select, discontinued three-valued, the runner's strike as a stated input rather than a silent default, every filter clearable and removable, and the metric catalogue in a dialog.

**Architecture:** Much of this is deletion. Two filter behaviours are workarounds for missing controls; adding the controls removes them. The view becomes a function of two inputs — `(story, strike)` — and the *baseline itself* takes the strike, so nothing needs special-casing.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright.

**Design spec:** docs/superpowers/specs/2026-07-28-filter-rework-design.md — eleven acceptance criteria in §10.
**Domain reasoning:** docs/shoe-stories.md.

## Global Constraints

- **`npm run verify` before every commit.** Any task touching components, presets or fixtures also needs `npm -w app run e2e`, which `verify` does not run.
- Coverage: lines ≥ 90, branches ≥ 85 on `app/src/lib/**`.
- **TDD**: failing test first, observed failing, then implement.
- `noUncheckedIndexedAccess` is on.
- **Docs ride the change**; comments are WHY-only and point at owning docs; never reference `docs/superpowers/` from source.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- **A deletion lands with its replacement in the same commit.** No shims, no aliases, no fallback branches.

## Deletions

| Deleted | Replaced by | Task |
|---|---|---|
| `plate` tokens `'plated'` and `'not-carbon'` | a multi-select over real `Plate` values | 1 |
| the `'plated'` **display label** in `ShoeTable` and its test and doc sentence | "Non-carbon plate" | 1 |
| `hideDiscontinued` and URL `nodisc=1` | `discontinued: 'hide' \| 'only'`, URL `disc=` | 2 |
| the heel-shaped `DEFAULT_COLUMNS` constant | `defaultColumns(strike)` | 4 |
| every absolute bound that can swap sides | a percentile of that side's own distribution | 4 |
| the clear-drops-key / clear-keeps-empty asymmetry, and `alwaysShown` | explicit clear and remove controls | 5 |
| the `<select>` add-filter menu and the §Coverage note that a bar cannot render in an `option` | a dialog | 7 |

## Fixtures this plan must grow first

Verified against the tree: `test-fixtures.ts` `TESTS` has ids 6, 24, 65, 11, 70, 39, 27, 55 — **no 66**. Without it, every strike test fails for the wrong reason: `parseView` drops `energy-return-forefoot` as an unknown key, and its coverage is 0 so the sparse guard trips.

`app/e2e/fixtures/shoes.json` already has a discontinued shoe, all three plate values, and test 66 with readings. It lacks `forefoot-stack`, `shock-absorption-*` and `midsole-width-*`.

## Existing tests and files this plan breaks

| Thing | Because | Task |
|---|---|---|
| `ShoeTable.svelte` `cellText`, `ShoeTable.test.ts` `toBe('plated')`, docs/app.md "renders `plated-other` as plated" | the label becomes "Non-carbon plate" | 1 |
| docs/app.md §URL encoding — `plate` listed as pattern-checked | it becomes a comma-joined allowlisted set | 1 |
| `MetricRow.test.ts` part-order assertion | declared pairs are forefoot-first | 3 |
| `ColumnPicker.test.ts` `/Energy return forefoot/` | only if `parts[].label` is repurposed — it must not be | 3 |
| `Page.svelte` `applyPreset(...)` call sites | the signature takes the strike | 4 |
| `presets.test.ts`, `urlstate.test.ts` default-columns assertions | `DEFAULT_COLUMNS` becomes a function | 4 |
| `persist.ts` `VIEW_STORAGE_KEY` | the URL encoding changes three times; bump to `v2` **once**, in Task 4 | 4 |
| `FilterSidebar.test.ts` "no two range groups share an accessible name" | side-only labels would collide | 5 |
| `Page.test.ts` band/chip assertions | the band gains a strike toggle and a Clear | 6 |

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/filters.ts` | plate set membership, three-valued discontinued |
| `app/src/lib/urlstate.ts` | new encodings, `strike`, strike-aware `defaultView` |
| `app/src/lib/lineage.ts` | declared side pairs, `side` on parts, `sideKey` |
| `app/src/lib/presets.ts` | `(story, strike)` mapping, per-side percentiles |
| `app/src/components/PlateFilter.svelte` | rewrite — checkboxes |
| `app/src/components/DiscontinuedFilter.svelte` | **create** |
| `app/src/components/StrikeToggle.svelte` | **create** |
| `app/src/components/RangeFilter.svelte` | clear control |
| `app/src/components/MetricRow.svelte` | side rows, in-use marker, remove control |
| `app/src/components/AddFilterDialog.svelte` | **create** |
| `app/src/components/FilterSidebar.svelte` | order, clear/remove, dialog trigger |
| `app/src/components/EntryBand.svelte` | no descriptions, selection, Clear, strike |
| `app/src/components/ShoeTable.svelte` | plate cell label |
| `app/src/Page.svelte` | wiring |

---

### Task 1: Plate becomes a multi-select

**Files:** `filters.ts`, `filters.test.ts`, `urlstate.ts`, `urlstate.test.ts`, `presets.ts`, `presets.test.ts`, `PlateFilter.svelte`, `FilterSidebar.svelte`, `ShoeTable.svelte`, `ShoeTable.test.ts`, `Page.test.ts`, `app/e2e/smoke.spec.ts`, `docs/app.md`

**Produces:** `FilterState['plate']?: Plate[]`, imported from `shared/types.js`. Empty or absent constrains nothing.

- [ ] **Step 1: Write the failing tests**

```ts
describe('plate as a set', () => {
  it('keeps only the selected plate values', () => {
    const r = applyFilters(FLEET, { ranges: {}, plate: ['none', 'plated-other'] }, idx);
    expect(r.visible.length).toBeGreaterThan(0);
    expect(r.visible.map((s) => s.plate)).not.toContain('carbon');
    expect(r.visible.some((s) => s.plate === 'plated-other')).toBe(true);
  });
  it('a single selection is an exact match', () => {
    const r = applyFilters(FLEET, { ranges: {}, plate: ['carbon'] }, idx);
    expect(r.visible.length).toBeGreaterThan(0);
    expect(r.visible.every((s) => s.plate === 'carbon')).toBe(true);
  });
  it('an empty selection constrains nothing, exactly like no selection', () => {
    const none = applyFilters(FLEET, { ranges: {} }, idx).visible.length;
    expect(applyFilters(FLEET, { ranges: {}, plate: [] }, idx).visible.length).toBe(none);
  });
});
```

`urlstate.test.ts`: `plate=none,plated-other` round-trips; an unknown member is dropped while valid ones survive; `plate=,,` leaves it absent, matching `brands`; and **`plate=plated` and `plate=not-carbon` are dropped as unknown** — the regression this task exists to prevent.

`ShoeTable.test.ts`: the plate cell for a `plated-other` shoe reads **Non-carbon plate**, not `plated`.

- [ ] **Step 2: Run, watch fail, implement**

`applyFilters`: `if (f.plate?.length && !f.plate.includes(s.plate)) continue;` — the whole branch.

`urlstate.ts`: `PLATES` becomes the three real values; parse comma-joined, dedupe, drop unknowns, `brands` rule for all-separator, serialise only when non-empty.

`presets.ts`: Easy's plate becomes `['none', 'plated-other']`.

`PlateFilter.svelte`: three checkboxes in a `role="group"` — **not** a radiogroup. `ShoeTable.svelte`: the plate cell says "Non-carbon plate".

- [ ] **Step 3: Update the docs**

docs/app.md §Columns and sorting: the filter takes a set of real values; the two inexact tokens and the asymmetry they justified are gone; the sort stays ordinal. Also fix the sentence saying the table renders `plated-other` as "plated". docs/app.md §URL encoding: `plate` is now an allowlisted comma-joined set, not a pattern check.

- [ ] **Step 4: Verify, e2e, commit.**

---

### Task 2: Discontinued becomes three-valued

**Files:** `filters.ts`, `filters.test.ts`, `urlstate.ts`, `urlstate.test.ts`, `DiscontinuedFilter.svelte`, `FilterSidebar.svelte`, `FilterSidebar.test.ts`, `Page.test.ts`, `docs/app.md`

**Produces:** `FilterState['discontinued']?: 'hide' | 'only'`; URL `disc=hide|only`.

- [ ] **Step 1: Write the failing tests**

`hide` excludes every discontinued shoe; `only` returns exactly the discontinued ones **and is non-empty on the fixture** (`oldie` is discontinued, so this is assertable); absent returns both; both round-trip; `nodisc=1` is now ignored; an unknown value is dropped.

- [ ] **Step 2: Implement**

`DiscontinuedFilter.svelte` is a three-option radiogroup — **Any**, **Hide discontinued**, **Only discontinued**. A radiogroup here and checkboxes for plate is deliberate: these three are genuinely exclusive.

- [ ] **Step 3: Update docs/app.md §Filters and §URL encoding, then verify, e2e, commit.**

---

### Task 3: Side pairs

**Files:** `lineage.ts`, `lineage.test.ts`, `MetricRow.test.ts`, `test-fixtures.ts`, `docs/app.md`

**Produces:** colocated parts gain `side: 'heel' | 'forefoot' | null`, ordered forefoot first; `SIDE_PAIRS`; `sideKey(label, strike)`.

```ts
/** Heel/forefoot pairs and the side of each half. The catalogue links only two of these four and
 *  carries no notion of side at all, so the grouping is declared: `heel-padding-durability` has no
 *  forefoot counterpart, `forefoot-traction`'s secondary is unpublished, and an upstream rename
 *  must not silently regroup the sidebar (docs/app.md §Columns and sorting). */
export const SIDE_PAIRS: { label: string; forefoot: string; heel: string }[] = [
  { label: 'Stack', forefoot: 'forefoot-stack', heel: 'heel-stack' },
  { label: 'Energy return', forefoot: 'energy-return-forefoot', heel: 'energy-return-heel' },
  { label: 'Shock absorption', forefoot: 'shock-absorption-forefoot', heel: 'shock-absorption-heel' },
  { label: 'Midsole width', forefoot: 'midsole-width-in-the-forefoot', heel: 'midsole-width-in-the-heel' },
];
```

**Two decisions this plan settles, which the spec left open:**

1. **The declaration is authoritative and must *agree* with the catalogue, not avoid it.** Two of the four are also catalogue-linked; that is not a conflict. Validation asserts agreement — where the catalogue links a declared pair, it must link the same two tests.
2. **Validation is a test, not a runtime throw.** A throwing validator takes down every component test and the running app, because neither fixture carries all eight slugs. A pair whose slugs are absent is skipped silently at runtime; a **test** asserts the declaration matches `data/shoes.json`. That is where a drift should fail — in CI, not in a user's browser.

**`parts[].label` keeps the full test name.** `side` is additive. `ColumnPicker` renders `label`; the sidebar renders `side`. Repurposing `label` would fill the column picker with four checkboxes called "Forefoot".

- [ ] **Step 1: Grow the fixture** — add `labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', units: '', groupId: '3', primaryTestId: 65 })` to `TESTS`, and readings on the fixture shoes. Without it every strike test in Task 4 fails for an unrelated reason.

- [ ] **Step 2: Write the failing tests**

Each declared pair emits one `colocated` entry with the declared label; parts ordered forefoot then heel with the right `side`; both slugs absent → no entry; one slug absent → a `single`; every test in exactly one entry; the catalogue-linked pairs are **not** emitted twice; `parts[].label` is still the full test name. Plus the drift test against `data/shoes.json`.

Fix `MetricRow.test.ts`'s part-order assertion here — it is this task that flips it.

- [ ] **Step 3: Implement, update docs/app.md §Columns and sorting, verify, e2e, commit.**

---

### Task 4: The runner layer

**Files:** `urlstate.ts`, `urlstate.test.ts`, `presets.ts`, `presets.test.ts`, `persist.ts`, `Page.svelte`, `Page.test.ts`, `docs/app.md`, `docs/shoe-stories.md`

**Produces:** `ViewState['strike']: 'heel' | 'forefoot'`; `defaultView(strike)`; `defaultColumns(strike)`; `applyPreset(id, shoes, idx, strike)`.

This is the task the spec's §4 is about. Read §4.0–4.2 before starting.

- [ ] **Step 1: Write the failing tests**

- `strike` round-trips; `heel` is the default and is not serialised; an unknown value falls back to `heel`.
- **`isDefaultView` compares against `defaultView(v.strike)`** — so a view whose only difference is strike **is** default. Assert both: `isDefaultView({...defaultView('forefoot')})` is true, and a forefoot view with a filter set is false.
- `defaultColumns('forefoot')` contains `energy-return-forefoot` and not `energy-return-heel`; `defaultColumns('heel')` the reverse.
- Every preset under both strikes: bounds, sorts by and columns the side-appropriate half.
- **No side-swappable bound is an absolute number.** Assert Easy's stack bound differs between strikes, and that each equals the median of *that side's* readings. A single hardcoded 36 would pass a naive "it has a bound" test while returning eleven shoes under forefoot.
- The existing "shows every column it sorts or filters by" guard holds under both strikes.

- [ ] **Step 2: Implement**

`defaultView` and `applyPreset` take the strike; `sideKey` from Task 3 resolves the half. Bounds that can swap sides become percentiles of that side's distribution — Easy's stack is the clearest case. Race's weight ceiling stays absolute; weight has no sides.

**Bump `VIEW_STORAGE_KEY` to `v2` here, once.** Tasks 1, 2 and 4 all change the encoding; one bump covers all three, and its own comment says it moves when the encoding does.

- [ ] **Step 3: Update docs/app.md §Presets and §View and URL ownership**, and add the runner layer to docs/shoe-stories.md — which half a story uses follows the runner's strike, because that is the half describing their landing.

- [ ] **Step 4: Verify, e2e, commit.**

---

### Task 5: The sidebar

**Files:** `FilterSidebar.svelte`, `FilterSidebar.test.ts`, `RangeFilter.svelte`, `MetricRow.svelte`, `MetricRow.test.ts`, `urlstate.ts`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

- **The order is a literal expected sequence written out in the test file** — not derived from the exported list, which would assert a constant equals itself.
- **Eight renders compared pairwise**: two strikes × (default + three stories). The cross product is the only place the order can actually break, because a preset under forefoot is what would otherwise introduce a row.
- Both halves of every side pair render, with the in-use half marked in text.
- Each range clears in one action; a hand-added range can be removed; a curated one offers no remove.
- Released after has an **Any** control.
- Each row's accessible name carries **heading and side** — two rows both named "Forefoot" would trip the existing no-duplicate-names guard, and rightly.

- [ ] **Step 2: Implement**

Order comes from one declared list, in the spec §6 sequence. **`CURATED_RANGE_KEYS` is rewritten**, and the rendering rule changes: *every part of a colocated entry renders always*; singles render when curated or active. The old rule — curated-or-active applied per part — is what would hide `energy-return-forefoot` and make the sidebar change shape with strike.

**Delete the clear/remove conflation and `alwaysShown`.** But note the consequence, which is the trap: `isDefaultView` treats an empty range row as non-default, so "clear leaves `{}` behind" would mean the view could never be default again and the band could never re-open. **Clearing a range deletes its key**; removing a hand-added row deletes the key *and* stops it rendering. The difference is which rows survive, not which keys do.

A side pair renders as one heading with two rows. A method pair keeps its radiogroup — the two must not look alike, because they behave differently (spec §4.3).

- [ ] **Step 3: Update the docs**

In docs/app.md §Filters the asymmetry paragraph goes; the order and the clear/remove split replace it. Then verify, e2e, commit.

---

### Task 6: The entry band

**Files:** `EntryBand.svelte`, `EntryBand.test.ts`, `PresetChips.svelte`, `StrikeToggle.svelte`, `Page.svelte`, `Page.test.ts`, `FilterSidebar.svelte`, `urlstate.ts`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

- Cards show name and count and **no description**.
- Applying a story marks it selected; editing a bound clears the mark; applying another moves it.
- **Clear** returns to `defaultView(currentStrike)` — asserting explicitly that **strike survives a Clear** and the band re-opens.
- **Flipping strike does not collapse the band**, and does change the columns.
- The strike toggle is reachable from both the band and the chip row.

- [ ] **Step 2: Implement**

Selection is derived: a story is selected when the view equals `applyPreset(id, shoes, idx, view.strike)` computed now. Export the existing `sameValue` from `urlstate.ts` rather than writing a second comparator.

`Preset.describe` stays on the type and is used as the card's `title`/tooltip and by `PresetChips`; only the visible description line goes.

**Resolve the two clear controls.** The sidebar's "Reset filters" and the band's "Clear" would otherwise sit side by side meaning different things — exactly the accretion this rework deletes. Make the sidebar's button clear *filters only* and label it so, or drop it in favour of the band's Clear. Either way, update the docs/app.md §Presets paragraph stating that Reset filters does not re-open the band, which was written before Clear existed.

- [ ] **Step 3: Update docs/app.md §Presets, verify, e2e, commit.**

---

### Task 7: The add-filter dialog

**Files:** `AddFilterDialog.svelte`, `AddFilterDialog.test.ts`, `FilterSidebar.svelte`, `FilterSidebar.test.ts`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

Opens from a sidebar control; lists addable metrics grouped, each with a coverage **bar** and percentage; has a text filter; choosing one adds the range and closes; **Escape closes it**; focus enters on open and returns to the trigger on close; an already-shown metric is not offered.

jsdom does not implement `HTMLDialogElement.showModal`. Check first; if absent, either stub it or build from a positioned element with explicit focus management. The keyboard tests pass either way.

Under 800px the sidebar is itself a drawer (`Page.svelte`), so **Escape must close the dialog without also closing the drawer**. Assert it.

- [ ] **Step 2: Implement, delete the `<select>`, remove the §Coverage note** that a bar cannot render in an `option` — no longer true. Verify, e2e, commit.

---

### Task 8: End to end

**Files:** `app/e2e/smoke.spec.ts`, `app/e2e/fixtures/shoes.json`

- [ ] **Step 1: Grow the fixture** — it already has a discontinued shoe, all three plate values and test 66. Add `forefoot-stack`, and `shock-absorption-*` or `midsole-width-*`, so more than one side pair is exercised.

- [ ] **Step 2: One flow, end to end** — land on the band, flip strike to forefoot and see the band stay open with columns changed, pick Easy, see it marked, clear and see strike survive while the band returns.

- [ ] **Step 3: Verify, e2e, commit.**

---

## Verification checklist

- [ ] `npm run verify` and `npm -w app run e2e` pass.
- [ ] `grep -rn "not-carbon\|'plated'\|hideDiscontinued\|nodisc" app/src app/e2e docs/*.md README.md BACKLOG.md CLAUDE.md` returns nothing. **Scoped deliberately**: `docs/superpowers/` is frozen history and matches by design.
- [ ] Plate multi-select round-trips; an empty selection filters nothing; the table says "Non-carbon plate".
- [ ] `disc=only` returns exactly the discontinued shoes.
- [ ] All four side pairs render both halves, forefoot first, under one heading.
- [ ] The sidebar's control order is identical across all eight strike × story combinations.
- [ ] Flipping strike keeps the band open and changes the columns; Clear preserves strike.
- [ ] No side-swappable bound is an absolute number; Easy returns a comparable count under both strikes.
- [ ] Every range clears in one action; hand-added rows can be removed; released-after can be unset.
- [ ] The dialog is reachable, Escape-dismissible, and returns focus to its trigger.
