# Entry Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the page on the question a runner actually arrives with — what am I running? — without taking free-form filtering away from anyone who wants it, and resume where they left off next time.

**Architecture:** The three stories become real presets driven by market percentiles rather than fixed constants. An entry band renders them as cards with live counts and collapses to today's chip row the moment the view stops being the default. View state persists as the serialised query string and restores through the existing parser.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright.

**Design spec:** docs/superpowers/specs/2026-07-27-entry-flow-design.md
**Domain reasoning:** docs/shoe-stories.md — read it before touching a threshold. It owns *why*; this plan only implements.

## Scope note

The spec lists preset thresholds as a non-goal, deferring them to BACKLOG.md item 1. That
cannot hold literally: the entry band offers cards for Easy, Tempo and Race, and the code
today has `easy-day-cruiser`, `tempo-plated` and `wide-toebox`. **This plan therefore
also replaces the preset set**, using the thresholds docs/shoe-stories.md already
settles. Tuning those numbers after real use stays BACKLOG.md item 1.

## Global Constraints

- **`npm run verify` must pass before every commit** (check:docs + typecheck + lint + test:coverage).
- Coverage thresholds: lines ≥ 90, branches ≥ 85, scoped to `app/src/lib/**`.
- **TDD**: write the failing test, run it, watch it fail, then implement.
- `tsconfig.base.json` sets `noUncheckedIndexedAccess` — indexing yields `T | undefined`; house style is a trailing `!`.
- **Docs ride the change**: each task updates its owning doc section in its own commit. There is no documentation task at the end.
- **The Page owns view state and only writes the URL** (docs/app.md §View and URL ownership). `popstate` stays unhandled.
- Thresholds come from the live fleet, not from constants — docs/shoe-stories.md §How a story becomes a threshold. A preset must never bound a metric its own coverage warning would flag (docs/app.md §Coverage).
- Comments are WHY-only and point at owning docs. Never reference a plan or anything under `docs/superpowers/` from source.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- Locate code by symbol name, not line number.

## Existing tests this plan will break

| Test | Breaks because | Task |
|---|---|---|
| `presets.test.ts` — every case | preset ids, thresholds and the recency default all change | 3 |
| `Page.test.ts` preset-chip assertions | the chip row is replaced by the band at default view | 5 |
| `FilterSidebar.test.ts` plate assertions | a fourth plate token appears | 2 |
| `urlstate.test.ts` plate round-trips | `PLATES` gains a member | 2 |

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/stats.ts` | modify — add `quantile` |
| `app/src/lib/filters.ts` | modify — the `not-carbon` plate token |
| `app/src/lib/urlstate.ts` | modify — accept the new token |
| `app/src/components/PlateFilter.svelte` | modify — a fourth option |
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
  it('picks the nearest rank below the fraction', () => {
    const v = [10, 20, 30, 40, 50];
    expect(quantile(v, 0)).toBe(10);
    expect(quantile(v, 0.5)).toBe(30);
    expect(quantile(v, 1)).toBe(50);
  });
  it('does not care about input order', () => {
    expect(quantile([50, 10, 30, 20, 40], 0.5)).toBe(30);
  });
  it('does not mutate its input', () => {
    const v = [3, 1, 2];
    quantile(v, 0.5);
    expect(v).toEqual([3, 1, 2]);
  });
  it('is null-safe on empty input', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
  it('handles a single value at any fraction', () => {
    expect(quantile([7], 0)).toBe(7);
    expect(quantile([7], 1)).toBe(7);
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

`quantile` sorts a copy ascending and returns `sorted[Math.floor(p * (sorted.length - 1))]`, or `null` when empty. Nearest-rank, not interpolated — a threshold that lands on a real shoe's value is easier to reason about than one between two shoes.

Leave `median` alone. It averages the middle pair on even-length input, which `quantile` deliberately does not; collapsing them would change `median`'s behaviour for no gain.

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

**Files:** `app/src/lib/filters.ts`, `app/src/lib/filters.test.ts`, `app/src/lib/urlstate.ts`, `app/src/lib/urlstate.test.ts`, `app/src/components/PlateFilter.svelte`, `app/src/components/FilterSidebar.test.ts`, `docs/app.md`

**Produces:** `FilterState['plate']` gains `'not-carbon'`; URL value `plate=not-carbon`.

**Why it exists:** Easy excludes carbon but must keep the nylon- and plastic-plated daily trainers — eleven shoes in the fleet carry a stability plate and a pure daily-running label. `none` drops them and `plated` is the wrong direction, so the vocabulary cannot express the rule without this (docs/shoe-stories.md).

- [ ] **Step 1: Write the failing test**

```ts
describe('plate not-carbon', () => {
  it('keeps unplated and non-carbon plated shoes, drops carbon', () => {
    const r = applyFilters(FLEET, { ranges: {}, plate: 'not-carbon' }, idx);
    expect(r.visible.every((s) => s.plate !== 'carbon')).toBe(true);
    expect(r.visible.some((s) => s.plate === 'none')).toBe(true);
    expect(r.visible.some((s) => s.plate === 'plated-other')).toBe(true);
  });
  it('is not the same set as none', () => {
    const notCarbon = applyFilters(FLEET, { ranges: {}, plate: 'not-carbon' }, idx).visible.length;
    const none = applyFilters(FLEET, { ranges: {}, plate: 'none' }, idx).visible.length;
    expect(notCarbon).toBeGreaterThan(none);
  });
});
```

The fixture must contain a `plated-other` shoe for this to mean anything — check `test-fixtures.ts` and add one if absent.

In `urlstate.test.ts`, add a round-trip for `plate=not-carbon` and a case asserting an unknown plate value is still dropped.

- [ ] **Step 2: Run it and watch it fail, then implement**

`applyFilters`: the plate branch becomes three cases — `plated` keeps anything but `none`, `not-carbon` keeps anything but `carbon`, and any other value is exact. `urlstate.ts`: add the token to `PLATES`. `PlateFilter.svelte`: a fifth button labelled **No carbon**, and widen both prop types.

Four buttons already crowd the sidebar; if five will not fit, the label may shorten but the token may not.

- [ ] **Step 3: Update docs/app.md**

The plate paragraph in §Columns and sorting describes the token set. Extend it: `not-carbon` is the third inexact token, and it exists because excluding carbon is not the same as excluding plates.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/lib/filters.ts app/src/lib/filters.test.ts app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts app/src/components/PlateFilter.svelte app/src/components/FilterSidebar.test.ts app/src/lib/test-fixtures.ts docs/app.md
git commit -F - <<'EOF'
Let a filter exclude carbon without excluding every plate

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 3: The three stories

**Files:** `app/src/lib/presets.ts`, `app/src/lib/presets.test.ts`, `docs/app.md`, `docs/shoe-stories.md`

**Produces:** `PRESETS` of `easy` / `tempo` / `race`; `applyPreset(id, shoes, idx)` — the `now: Date` parameter goes, because no preset filters by date any more.

Thresholds, all computed from the live fleet at click time:

| preset | filters | sort | columns |
|---|---|---|---|
| `easy` | `heel-stack` ≥ 36; `plate: 'not-carbon'`; price ≤ `quantile(prices, 0.8)` | `score` desc | releasedAt, score, msrpGbp, heel-stack, weight, plate |
| `tempo` | `energy-return-heel` ≥ 65; `weight` ≤ `quantile(weights, 0.3)`; price ≤ `quantile(prices, 0.8)` | `energy-return-heel` desc | releasedAt, score, msrpGbp, energy-return-heel, weight, plate |
| `race` | `weight` ≤ 230; `energy-return-heel` ≥ 70 | `energy-return-heel` desc | releasedAt, score, msrpGbp, energy-return-heel, weight, plate |

Notes an implementer needs:

- **No preset sets `releasedAfter`.** Recency is a strategy, not a story (docs/shoe-stories.md).
- **No preset bounds a superseded pair**, so every preset leaves `generations` empty. Assert that rather than assuming it — it is acceptance criterion 9.
- **Easy sorts by score, not energy return.** The story says explosiveness is a bonus, not the priority; sorting by it would contradict the filter set. This is a change from today's behaviour and is deliberate.
- **Race has no price cap** and Easy and Tempo share one.
- Prices must come through `numericValue(s, 'msrpGbp', idx)`, which resolves the fresher of the two sources (docs/app.md §Resolved price) — not `shoe.msrpGbp` directly.
- `wide-toebox` is deleted. Toebox width remains a filter anyone can set.

- [ ] **Step 1: Rewrite `presets.test.ts`**

Every existing case changes. Cover: each preset returns a complete `ViewState`; ids and labels are the three stories; **no preset sets `releasedAfter`**; **no preset populates `generations`**; each sets its own columns rather than the defaults; the price cap tracks the fleet (build two fleets with different price distributions and assert the resulting bound differs); an unknown id still throws; a preset over an empty fleet does not throw and omits the bounds it cannot compute.

Add the guard for acceptance criterion 9: for every preset, every bounded key has coverage at or above `SPARSE_BELOW` over the whole fleet.

- [ ] **Step 2: Run, watch fail, implement**

- [ ] **Step 3: Update the docs**

`docs/app.md §Presets`: the constants block is gone; thresholds are fleet percentiles resolved at click time, and a preset now sets columns as well as filters and sort.

`docs/shoe-stories.md`: Tempo's open question is answered — record the weight bound as the 30th percentile of fleet weight, and that it is provisional pending real use.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/lib/presets.ts app/src/lib/presets.test.ts docs/app.md docs/shoe-stories.md
git commit -F - <<'EOF'
Replace the presets with the three running stories

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 4: Persist the view between visits

**Files:** `app/src/lib/persist.ts`, `app/src/lib/persist.test.ts`, `docs/app.md`

**Produces:**

```ts
export function readStoredView(): string | null;   // a query string, or null
export function writeStoredView(qs: string): void;
```

**Design, from the spec:** the stored value is the output of `serializeView` and nothing else, so restoring runs it back through `parseView` and inherits hostile-input handling that already exists and is already adversarially tested. The storage key carries the schema version; on a bump the old key is simply never read again. **No migrations, ever.**

- [ ] **Step 1: Write the failing test**

Cover: a written value reads back; a value written under a different key version is not read; a blocked `localStorage` makes both functions no-ops rather than throwing (assign a throwing stub, as `theme.test.ts` does); reading when nothing was stored returns `null`; an empty query string round-trips as an empty string, not `null` — the default view is a legitimate thing to have stored.

- [ ] **Step 2: Run, watch fail, implement**

Wrap both directions in `try`/`catch` exactly as `theme.ts` does; storage throws rather than returning null where it is blocked, and losing a saved view must never cost the page (docs/app.md §Theming).

- [ ] **Step 3: Document it** in `docs/app.md §View and URL ownership`: precedence is URL, then storage, then defaults, and why the stored shape is a query string rather than JSON.

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

### Task 5: The entry band

**Files:** `app/src/components/EntryBand.svelte`, `app/src/components/EntryBand.test.ts`, `app/src/Page.svelte`, `app/src/Page.test.ts`, `docs/app.md`

**Props:** `{ counts: Map<string, number>, total: number, onapply: (id: string) => void, onbrowse: () => void }`.

- [ ] **Step 1: Write the failing tests**

`EntryBand.test.ts`: renders all three stories with name, description and count; clicking a card calls `onapply` with that id; **Browse all N shoes** is present, reachable and calls `onbrowse`; a story returning zero shoes still renders its card, showing zero rather than hiding.

`Page.test.ts`: the band shows on a default view and the chip row does not; after applying a preset the band is replaced by the chip row; after clearing back to defaults the band returns; a URL carrying filters renders the chips, not the band.

- [ ] **Step 2: Implement**

**Expanded when the view is the default.** Use `serializeView(view) === ''` — the serialiser already omits every default, so an empty string *is* "this is the default view". Do not hand-roll a deep equality.

Counts come from applying each preset and running `applyFilters`, in `Page.svelte`, derived from the loaded dataset. Three preset applications over 450 shoes at load is cheap; do not memoise prematurely.

**Browse all** sets the default view — the same thing the band's absence means — so it collapses the band by making the view non-default. It must not be styled as a lesser option (spec §3).

Wire persistence: on init, use `location.search` if non-empty, else `readStoredView()`, else defaults; call `writeStoredView(serializeView(v))` inside `setView`. Restoration must still go through `parseView`, and the whole thing still happens once inside `untrack`.

- [ ] **Step 3: Update the Presets section**

Record the band's collapse rule and where the counts come from in docs/app.md §Presets.

- [ ] **Step 4: Verify and commit**

```bash
npm run verify
git add app/src/components/EntryBand.svelte app/src/components/EntryBand.test.ts app/src/Page.svelte app/src/Page.test.ts docs/app.md
git commit -F - <<'EOF'
Open on the three stories, with a way past them

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 6: End-to-end

**Files:** `app/e2e/smoke.spec.ts`, `app/e2e/fixtures/shoes.json`

- [ ] **Step 1: Write the failing test**

A first visit shows the band; clicking **Easy** narrows the table and replaces the band with chips; reloading with no query string restores that narrowed view rather than the band. That last assertion is the only end-to-end proof persistence works, since it spans a real page load.

Check whether the fixture supports the preset bounds — it needs shoes on both sides of the heel-stack and price thresholds, and at least one `carbon` shoe for the `not-carbon` token to exclude. Grow it if not.

- [ ] **Step 2: Implement, verify, commit**

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
- [ ] No preset sets `releasedAfter`, and none populates `generations`.
- [ ] No preset bounds a metric below `SPARSE_BELOW` coverage.
- [ ] The price cap moves when the fleet's price distribution moves.
- [ ] A shared link with filters opens collapsed and matches the link, ignoring stored state.
- [ ] A reload with no query string restores the previous view; a bumped storage version silently discards it.
- [ ] Blocked `localStorage` breaks nothing in either direction.
- [ ] `plate=not-carbon` keeps `plated-other` shoes and drops `carbon` ones.
