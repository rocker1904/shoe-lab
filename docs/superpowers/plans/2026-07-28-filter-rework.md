# Filter Surface Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the filter surface so it reads as designed rather than accreted — plate as a real multi-select, discontinued three-valued, side pairs shown in full, every filter clearable and removable, and the metric catalogue in a dialog with room to breathe.

**Architecture:** Most of this is deletion. Two filter workarounds exist only because a control was missing; adding the control removes the workaround. The pure logic stays in `app/src/lib` and carries the tests; components render what it returns.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright.

**Design spec:** docs/superpowers/specs/2026-07-28-filter-rework-design.md — ten acceptance criteria in §10.
**Domain reasoning:** docs/shoe-stories.md.

## Global Constraints

- **`npm run verify` must pass before every commit.** Tasks touching components or presets additionally need `npm -w app run e2e`, which `verify` does not run.
- Coverage thresholds: lines ≥ 90, branches ≥ 85 on `app/src/lib/**`.
- **TDD**: failing test first, observed failing, then implement.
- `noUncheckedIndexedAccess` is on.
- **Docs ride the change** — each task updates its owning doc section in the same commit. Do not document behaviour that does not exist yet.
- **Comments are WHY-only** and point at owning docs. Never reference anything under `docs/superpowers/` from source.
- The Page owns view state and only writes the URL; `popstate` stays unhandled.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- **This plan deletes things.** A deletion and its replacement land in the same commit, or the tree is red in between. Where a task says "delete", it means no compatibility shim, no deprecated alias, no fallback branch — the spec's §1 point is that leftovers are what made this surface confusing.

## Deletions this plan makes

Track these; a leftover is a defect, and acceptance criterion 2 is explicit about the first one.

| Deleted | Replaced by | Task |
|---|---|---|
| `plate` tokens `'plated'` and `'not-carbon'` | a multi-select over real `Plate` values | 1 |
| `hideDiscontinued: boolean` and URL `nodisc=1` | `discontinued: 'hide' \| 'only'`, URL `disc=` | 2 |
| the "plate has two different token sets" paragraph in docs/app.md §Columns and sorting | a sentence saying the filter takes a set of real values and the sort stays ordinal | 1 |
| the clear-drops-key / clear-keeps-empty asymmetry in `setRange` and docs/app.md §Filters | explicit clear and remove controls | 5 |
| the `<select>` add-filter menu and the §Coverage note that a bar cannot render in an `option` | a dialog | 7 |

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/filters.ts` | modify — plate set membership, three-valued discontinued |
| `app/src/lib/urlstate.ts` | modify — new encodings, `strike`, `isDefaultView` |
| `app/src/lib/lineage.ts` | modify — declared side pairs, side labels |
| `app/src/lib/presets.ts` | modify — plate sets, strike-aware side keys |
| `app/src/components/PlateFilter.svelte` | rewrite — checkboxes |
| `app/src/components/DiscontinuedFilter.svelte` | **create** — any / hide / only |
| `app/src/components/StrikeToggle.svelte` | **create** — heel / forefoot |
| `app/src/components/RangeFilter.svelte` | modify — clear control |
| `app/src/components/MetricRow.svelte` | modify — side-pair rendering, in-use marker, remove control |
| `app/src/components/AddFilterDialog.svelte` | **create** — the catalogue |
| `app/src/components/FilterSidebar.svelte` | modify — order, clear/remove, dialog trigger |
| `app/src/components/EntryBand.svelte` | modify — no descriptions, selection, clear, strike |
| `app/src/Page.svelte` | modify — wiring |

---

### Task 1: Plate becomes a multi-select

**Files:** `app/src/lib/filters.ts`, `app/src/lib/filters.test.ts`, `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `app/src/lib/presets.ts`, `app/src/lib/presets.test.ts`, `app/src/components/PlateFilter.svelte`, `app/src/components/FilterSidebar.svelte`, `app/src/Page.test.ts`, `app/e2e/smoke.spec.ts`, `docs/app.md`

**Produces:** `FilterState['plate']?: Plate[]` — `Plate` imported from `shared/types.js`. Empty or absent means no constraint.

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
    expect(r.visible.every((s) => s.plate === 'carbon')).toBe(true);
    expect(r.visible.length).toBeGreaterThan(0);
  });
  it('an empty selection constrains nothing, exactly like no selection', () => {
    const none = applyFilters(FLEET, { ranges: {} }, idx).visible.length;
    expect(applyFilters(FLEET, { ranges: {}, plate: [] }, idx).visible.length).toBe(none);
  });
});
```

In `urlstate.test.ts`: `plate=none,plated-other` round-trips; order does not matter to the resulting set; an unknown member is dropped while valid ones survive; an all-separator value (`plate=,,`) leaves `plate` absent rather than an empty array, matching `brands`; and — the regression this task exists to prevent — **`plate=plated` and `plate=not-carbon` are dropped as unknown**.

- [ ] **Step 2: Run, watch fail, implement**

`applyFilters`: `if (f.plate?.length && !f.plate.includes(s.plate)) continue;` — the whole branch, replacing both inexact-token special cases.

`urlstate.ts`: the `PLATES` set becomes the three real values. Parse comma-joined, dedupe, drop unknown members, and follow the `brands` rule for an all-separator value. Serialise only when non-empty.

`presets.ts`: Easy's plate becomes `['none', 'plated-other']`.

`PlateFilter.svelte`: three checkboxes, `plated-other` labelled **Non-carbon plate**. It is a `role="group"` of checkboxes, not a radiogroup — the whole point is that more than one can be chosen.

- [ ] **Step 3: Update docs/app.md**

Replace the plate paragraph in §Columns and sorting. The filter takes a set of real `Plate` values; the two inexact tokens are gone, and with them the asymmetry that paragraph existed to justify. The *sort* is still ordinal — say so, because that is the part that survives.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify && npm -w app run e2e
git add -A && git commit -F - <<'EOF'
Filter plate by a set of real values

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Discontinued becomes three-valued

**Files:** `app/src/lib/filters.ts`, `app/src/lib/filters.test.ts`, `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `app/src/components/DiscontinuedFilter.svelte`, `app/src/components/FilterSidebar.svelte`, `app/src/components/FilterSidebar.test.ts`, `docs/app.md`

**Produces:** `FilterState['discontinued']?: 'hide' | 'only'`. URL `disc=hide` / `disc=only`. `hideDiscontinued` and `nodisc=1` are deleted.

- [ ] **Step 1: Write the failing tests**

Cover: `hide` excludes every discontinued shoe; `only` returns exactly the discontinued ones and nothing else; absent returns both; both values round-trip through the URL; `nodisc=1` is now simply ignored; an unknown value is dropped.

The fixture needs at least one discontinued and one current shoe — check `test-fixtures.ts` and add if missing, since `only` returning an empty list would make the assertion vacuous.

- [ ] **Step 2: Run, watch fail, implement**

Create `DiscontinuedFilter.svelte` as a three-option radiogroup: **Any**, **Hide discontinued**, **Only discontinued**. A radiogroup, not checkboxes — these three are genuinely exclusive, unlike plate.

- [ ] **Step 3: Update the docs**

Bring docs/app.md §Filters and docs/app.md §URL encoding into line, then verify, run e2e and commit.

---

### Task 3: Side pairs

**Files:** `app/src/lib/lineage.ts`, `app/src/lib/lineage.test.ts`, `docs/app.md`

**Produces:** colocated parts gain `side: 'heel' | 'forefoot' | null`, ordered forefoot first; a declared table covering all four pairs.

The catalogue links `energy-return` and `shock-absorption` through `primaryTestId` / `secondaryTestIds`. It does **not** link `forefoot-stack`/`heel-stack` or `midsole-width-in-the-forefoot`/`midsole-width-in-the-heel`, which are the same kind of pair.

```ts
/** Heel/forefoot pairs and the side of each half. The catalogue links only two of these four
 *  and carries no notion of side at all, so the grouping is declared rather than inferred:
 *  `heel-padding-durability` has no forefoot counterpart, and a rename upstream must not
 *  silently regroup the sidebar (docs/app.md §Columns and sorting). */
export const SIDE_PAIRS: { label: string; forefoot: string; heel: string }[] = [
  { label: 'Stack', forefoot: 'forefoot-stack', heel: 'heel-stack' },
  { label: 'Energy return', forefoot: 'energy-return-forefoot', heel: 'energy-return-heel' },
  { label: 'Shock absorption', forefoot: 'shock-absorption-forefoot', heel: 'shock-absorption-heel' },
  { label: 'Midsole width', forefoot: 'midsole-width-in-the-forefoot', heel: 'midsole-width-in-the-heel' },
];
```

**The declaration is authoritative**, and keyed by slug because slugs are the stable public key (docs/scraping.md §Slug keying). Where the catalogue also links a declared pair, the two must agree.

- [ ] **Step 1: Write the failing tests**

Cover: each declared pair emits one `colocated` entry with the declared label; parts are ordered forefoot then heel and carry the right `side`; a pair whose slugs are both absent from the catalogue emits nothing rather than throwing (a test can be retired upstream); a pair with only one slug present degrades to a `single` rather than a half-pair; every test still appears in exactly one entry; and the catalogue-linked pairs are **not** emitted twice now that they are also declared.

Add a validation test: a declared pair naming a slug the catalogue does not have is reported, not silently skipped — decide with the implementer whether that throws or is filtered, but assert whichever it does.

- [ ] **Step 2: Run, watch fail, implement**

Declaration first, then catalogue `secondaryTestIds` for anything not already claimed. `groupId` still comes from the primary — for a declared pair the primary is the **heel** half, which is where the existing group sits.

- [ ] **Step 3: Update the docs**

Bring docs/app.md §Columns and sorting into line, then verify and commit.

---

### Task 4: Strike preference

**Files:** `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `app/src/lib/presets.ts`, `app/src/lib/presets.test.ts`, `docs/app.md`, `docs/shoe-stories.md`

**Produces:** `ViewState['strike']: 'heel' | 'forefoot'`, defaulting to `'heel'`, serialised as `strike=forefoot` and omitted at the default.

- [ ] **Step 1: Write the failing tests**

`urlstate`: round-trips; the default is not serialised; an unknown value falls back to `heel`; **`isDefaultView` is false when strike differs** — that last one matters because strike is view state the band's collapse depends on.

`presets`: with `strike: 'forefoot'`, Tempo and Race bound and sort by `energy-return-forefoot` and include it in columns instead of the heel half; with `heel`, the heel half. The existing "shows every column it sorts or filters by" guard must hold under both.

- [ ] **Step 2: Run, watch fail, implement**

`applyPreset` gains the strike and resolves side keys through `SIDE_PAIRS`. `DEFAULT_COLUMNS` stays fixed — the spec scopes strike to what a *preset* chooses, and a default view that reshuffled its own columns would be a second, unasked-for behaviour.

- [ ] **Step 3: Document it** in docs/app.md §Presets and add a line to docs/shoe-stories.md: which half a story uses follows the runner's strike, because that is the half that describes their landing.

- [ ] **Step 4: Verify, e2e, commit.**

---

### Task 5: The sidebar

**Files:** `app/src/components/FilterSidebar.svelte`, `app/src/components/FilterSidebar.test.ts`, `app/src/components/RangeFilter.svelte`, `app/src/components/MetricRow.svelte`, `app/src/components/MetricRow.test.ts`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

- The order is exactly: search, released after, plate, brand, discontinued, price, then stack / energy return / weight, then the rest. Assert by reading the rendered control order, not by inspecting an array — the array being right while the markup is wrong is the failure worth catching.
- **The order is identical under both strike values and after applying each preset.** This is acceptance criterion 8 and the whole point of the fixed set.
- Both halves of every side pair render, with the in-use half marked.
- Each range has a clear control that empties both bounds in one action.
- A hand-added range has a remove control that deletes the key; a curated one does not offer remove.
- Released after has an **Any** control that unsets it.

- [ ] **Step 2: Implement**

Order comes from one declared list so the test and the markup cannot disagree.

**Delete the clear-versus-remove conflation.** `setRange` stops caring whether a row is curated: clearing sets `{}` and leaves the key, removing deletes it. The `alwaysShown` set goes with it. Rows render for curated keys plus any key present in `ranges`, which is the same rule for everyone.

A side pair renders as one heading with two rows; the in-use half is marked by text, not by colour alone. A method pair keeps its radiogroup — do not let the two look alike, they behave differently (spec §4.1).

- [ ] **Step 3: Update the docs**

In docs/app.md §Filters the asymmetry paragraph goes; the order and the clear/remove split replace it.

- [ ] **Step 4: Verify, e2e, commit.**

---

### Task 6: The entry band

**Files:** `app/src/components/EntryBand.svelte`, `app/src/components/EntryBand.test.ts`, `app/src/components/PresetChips.svelte`, `app/src/components/StrikeToggle.svelte`, `app/src/Page.svelte`, `app/src/Page.test.ts`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

- Cards show name and count, and **no description text**.
- Applying a story marks it selected in the chip row; editing any bound afterwards clears the mark; applying a different story moves it.
- **Clear** returns to the default view and re-opens the band.
- The strike toggle appears in both the band and the chip row, and changing it is a view change like any other.

- [ ] **Step 2: Implement**

Selection is **derived, never stored**: a story is selected when the current view equals `applyPreset(id, ...)` computed now. Reuse the existing value-equality helper rather than writing a second one. A stored `preset` field would keep claiming a story the user had since filtered away.

Note this makes selection sensitive to the live fleet, which is correct: if a refresh moves the price percentile, the URL you saved yesterday genuinely is not today's Easy any more.

- [ ] **Step 3: Update the docs**

Bring docs/app.md §Presets into line, then verify, run e2e and commit.

---

### Task 7: The add-filter dialog

**Files:** `app/src/components/AddFilterDialog.svelte`, `app/src/components/AddFilterDialog.test.ts`, `app/src/components/FilterSidebar.svelte`, `app/src/components/FilterSidebar.test.ts`, `docs/app.md`

- [ ] **Step 1: Write the failing tests**

Opens from a sidebar control; lists every addable metric grouped by test group with a coverage **bar** as well as a percentage; has a text filter; choosing one adds the range and closes; **Escape closes it**; focus moves into the dialog on open and returns to the trigger on close; a metric already in the sidebar is not offered.

jsdom does not implement `HTMLDialogElement.showModal` — check before relying on `<dialog>`, and if it is absent either stub it in the test or build the dialog from a positioned element with explicit focus management. Whichever you choose, the keyboard tests above still have to pass.

- [ ] **Step 2: Implement, delete the `<select>`, and remove the §Coverage note** saying a bar cannot render in an `option` — it is no longer true.

- [ ] **Step 3: Verify, e2e, commit.**

---

### Task 8: End to end

**Files:** `app/e2e/smoke.spec.ts`, `app/e2e/fixtures/shoes.json`

- [ ] **Step 1: Grow the fixture if needed**

It needs a discontinued shoe, shoes on both sides of the plate values, and both halves of at least one side pair, or the new assertions cannot mean anything.

- [ ] **Step 2: Write the failing test**

One flow, end to end: land on the band, pick Easy, see it marked selected, flip strike to forefoot and watch the energy-return column change, clear the selection and watch the band return.

- [ ] **Step 3: Verify, e2e, commit.**

---

## Verification checklist

- [ ] `npm run verify` and `npm -w app run e2e` pass.
- [ ] `grep -rn "not-carbon\|'plated'\|hideDiscontinued\|nodisc" app/src app/e2e docs` returns nothing.
- [ ] Plate multi-select round-trips; an empty selection filters nothing.
- [ ] `disc=only` returns exactly the discontinued shoes.
- [ ] All four side pairs render both halves, forefoot first, under one heading.
- [ ] The sidebar's control order is byte-identical across both strike values and all three stories.
- [ ] Every range clears in one action; hand-added rows can be removed; released-after can be unset.
- [ ] The dialog is reachable, dismissible with Escape, and returns focus to its trigger.
- [ ] A selected story is marked; editing a bound clears the mark.
