# Strike as a Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the side a preset rather than a field — derived, deselectable and absent from the URL — so the two selection groups above the table behave alike.

**Architecture:** `ViewState` loses `strike`, so `serializeView`/`parseView` lose a key and `defaultView()` gets a constant. What replaces the field is a pair of pure functions over a view: `sideOf` reads which side a view is about, and `projectSide` moves a view onto a side. `selectedPreset` already matches the view against each story; this extends the same idea to the side.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright.

**Design spec:** `docs/superpowers/specs/2026-07-29-strike-as-preset-design.md`, **as corrected below**.
**Frontend contracts:** `docs/app.md` §Presets, §View and URL ownership, §URL encoding.

## Corrections to the approved spec

Six decisions were taken after the spec was approved, after a plan review found some of the
originals unbuildable and a second review found one of the corrections self-contradictory.
**Where this plan and the spec disagree, this plan wins**; Task 3 records the outcome in
`docs/app.md`, which is what either of them ultimately answers to.

1. **A side click projects the view onto that side; it does not reset it and does not preserve
   the other side.** The spec deletes `swapStrike` on the grounds that "a side change re-derives
   from `(side, story)`", which only holds for a view that *is* a story. For everything else the
   spec's own §7 ("without touching unrelated filters") and a reset are incompatible. The rule
   that satisfies both, and the one this plan builds:

   > Picking a side moves every side-specific column and sort key onto that side and **drops**
   > any bound on the other half. Anything with no side — price, weight, brands, search, the
   > discontinued and missing-data flags — is untouched. A view that already equals a story is
   > rebuilt as that story on the new side instead, so its bounds re-resolve at the new side's
   > percentiles.

   Bounds are dropped rather than translated: 36 mm is the median heel stack and the 98th
   percentile of forefoot (`presets.ts:11`), so carrying the number across is a lie and carrying
   the *percentile* across silently rewrites a number the runner typed.

   This gives the property the spec wanted and could not state: **after a side click the view
   uses no key from the other side**, so the mark is always exactly the side that was clicked.
   `sideOf` can therefore read everything — columns, bounds and sort — and still never leave a
   just-clicked control unlit. Mixed views remain fully reachable by hand and by link, and remain
   unmarked *in the side group* — correction 3 is what decides whether `All` lights on one — they
   are simply not *preserved* across an explicit side click.

2. **A side click always leaves the view committed to that side.** When the view names no side at
   all — reachable by unticking both Stack and Energy return in the column picker, or by a link
   like `cols=score,weight,msrpGbp` — there is nothing to move and nothing to drop, so the naive
   rule makes the control a dead button that also silently deletes any opposite-side bound.
   `projectSide` therefore appends that side's two default measurement columns in that case,
   making the invariant total: `sideOf(projectSide(v, s)) === s`, for every `v` and `s`.

3. **The `All` mark is derived from the `All` action, not restated beside it.** The spec left the
   mark unspecified, and `Page.svelte` currently derives it from `isDefaultView`, which becomes a
   *heel* constant under this change — so a forefoot runner would click `All` and see nothing
   light up (`Page.test.ts:319` and `app/e2e/smoke.spec.ts:91` both assert the opposite today).
   The rule is one function used twice:

   > `allView(v, side)` is what `All` produces. `All` is marked when `sameValue(v, allView(v, side))`.

   **Marked means pressing it changes nothing** — true by construction, rather than by two
   definitions kept in step by hand. Marking on "no filter is active" was considered and rejected:
   it would leave `All` lit on a view whose columns and sort were hand-edited, so pressing a lit
   control would still change the table.

   An earlier draft of this correction marked `All` against *the derived side's plain table*,
   which is the same thing on a sided view and wrong on every other. Two consequences of the
   identity above are what it got wrong, and both are deliberate and pinned by tests:

   - **A mixed view with no filters marks `All`.** Under the earlier rule it was unmarked *and*
     `All` was a no-op on it — the dead button correction 2 exists to prevent, reappearing in the
     other group. A view showing everything is an `All` view whether or not it commits to a side.
   - **`All` is not idempotent when clearing a filter is what gives the view a side.** From
     `cols=score,heel-stack` with a bound on `forefoot-stack`, the first press clears the bound
     and leaves the columns alone as spec §4 requires; the view is now heel-derived but is not
     heel's plain table, so `All` stays unlit and a second press restores that table. That is the
     definition being honest rather than a bug — there really is something left for `All` to do —
     and the alternative would light a control that still changes the table.

4. **`All` on a mixed view keeps the runner's added rows; on a sided view it does not.** The mixed
   branch replaces `filters` and nothing else, so a hand-added row that was on screen only because
   it carried a bound stays listed and empty: clearing a bound is not removing its row
   (docs/app.md §Filters), and the shape of a deliberately mixed table is none of `All`'s business.
   The sided branch is a wholesale restore of that side's *plain* table, which by definition
   carries no hand-added rows, so they go. The two branches disagreeing is the point, not an
   oversight; both halves are pinned.

5. **The side mark survives hand-editing a bound**, reversing spec §7's "hand-editing a bound drops
   the side mark, exactly as it drops the story mark". A side is not a story: correction 1's
   invariant depends on `sideOf` reading bounds, and a runner who types a heel number has not
   stopped being on heel.

6. **A view using no side-paired metric at all is unmarked**, reversing spec §3's "keeps whichever
   mark its columns imply" — which cannot be honoured, because such a view's columns imply none.
   It is the state correction 2 makes escapable.

`All`'s **action** is unchanged from spec §4, and is now the sole source of its mark: with a
derived side it restores that side's plain table; on a mixed view it clears the filters and
touches nothing else.

## Global Constraints

- **`npm run verify` before every commit** (check:docs + typecheck + lint + test:coverage). Tasks 2 and 3 also need `npm -w app run e2e`; Task 4 touches no code.
- Coverage floors: lines ≥ 90, branches ≥ 85 on `app/src/lib/**` (currently 100 / 99.15 — do not spend the headroom).
- **TDD**: failing test first, observed failing, then implement.
- `noUncheckedIndexedAccess` is on.
- **Feature work happens in a worktree** (CLAUDE.md): `git worktree add -b strike-preset ~/dev/shoe-lab-strike-preset main`, then **`npm install` inside it** — a worktree does not inherit `node_modules`.
- **Docs ride the change**; comments are WHY-only and point at owning docs; never reference `docs/superpowers/` from source.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- **A deletion lands with its replacement in the same commit.** No shims, no compatibility branches.
- The per-task file lists are indicative. `npm run verify` is the gate: fix collateral breakage in the same commit.

## Known traps, learned the hard way

- `@testing-library/user-event` is **not** a dependency. Use `fireEvent`.
- `readFileSync(new URL(..., import.meta.url))` fails under the jsdom environment. Use `fileURLToPath` + `join`.
- Bare `vi.useFakeTimers()` breaks the suite (it fakes `queueMicrotask`, which the `Element.animate` stub needs). Fake only `['setTimeout','clearTimeout']`.
- `window.matchMedia`, `ResizeObserver` and `Element.animate` are stubbed in `app/src/test-setup.ts`; `matchMedia` always reports non-matching, so the suite sees the desktop rendering.
- Svelte 5 `transition:` runs through WAAPI, so animated state changes need `waitFor`, not synchronous assertions.
- `check:docs` reads `git ls-files -co`, so deletions must be **staged** before `verify` will run. It also scans this plan: every `docs/*.md §Heading` written here must name a real heading.
- **The view write is debounced.** `Page.test.ts` settles before reading `location.search`; new assertions must do the same. The restore-from-storage write flushes immediately and must keep doing so.
- **While the setup strip is up the toolbar draws no radiogroups** (`Toolbar.svelte:33`), and the strip's cards are `aria-pressed` **buttons** (`SetupStrip.svelte:41,52`) — `Page.test.ts:304` pins exactly that. A test that renders on a bare URL and then queries `role="radio"` finds nothing. Use the strip's button, or set a query string first so the strip never opens. The two roles never collide, so radio queries stay unambiguous even mid-transition.
- **`shock-absorption-forefoot` and `midsole-width-*` are not in the test fixture** (`app/src/lib/test-fixtures.ts:12–25`). Anything that round-trips through `parseView` must use `forefoot-stack` / `energy-return-forefoot`, or the column is filtered out against `idx.bySlug` and the view under test is not the one that was written. `side.ts` is pure slug math over `SIDE_PAIRS` and never consults the catalogue, so its own unit tests may use any declared slug.
- **`URLSearchParams.toString()` percent-encodes commas and tildes** — `,`→`%2C`, `~`→`%7E`, `-` left alone. Assert `cols=score%2Cheel-stack`; `Page.test.ts:99` shows the same encoding on `plate=none%2Cplated-other`. **This bites the e2e spec too**, where the post-`All` URL is the encoded 119-character form, not the readable one the spec §4a prints.
- **`defaultColumns('forefoot')` does survive a `parseView` round trip on the fixture** — verified before writing this plan, because a filtered-out column would quietly make the view under test the wrong one. `forefoot-stack` (5), `energy-return-forefoot` (66), `weight` (24) and `toebox-width-widest-part` (55) are all present, the other four are `COLUMN_FIELDS`, and the `toebox-width-at-the-widest-part` → `toebox-width-widest-part` generation pair does not trip `parseView`'s exclusion loop because only the current half is ever in the list.

## Deletions and replacements

| Deleted | Replaced by | Task |
|---|---|---|
| `ViewState.strike` | `sideOf(view)`, a derived mark | 1, 3 |
| `swapStrike` | `projectSide` — same column and sort mapping, plus dropping the opposite side's bounds | 1, 3 |
| `strike=` in `serializeView` and `parseView` | nothing; the columns already encode the side | 3 |
| `defaultView(strike)`'s parameter | `DEFAULT_SIDE`, named once | 3 |
| `Page.svelte`'s `atDefault` | `atAll` — `sameValue(v, allView(v, sideMark))`, the mark and the action being one function | 3 |
| `isDefaultView` | `sameValue(v, defaultView())` at its two remaining call sites, both in tests | 3 |
| `StrikeToggle.svelte`, the `strike` props, `.strike-wrap` | `SideToggle.svelte`, `side` props, `.side-wrap` | 2, 3 |

**Not a deletion:** `FilterSidebar` has no `strike` prop — it went with `· in use`, and its props are
`data, view, onchange, population` (`FilterSidebar.svelte:16`). Its `strike` references are a loop
variable in one unrelated test (`FilterSidebar.test.ts:401–409`). Leave the component alone.

## Existing tests this plan breaks

| Thing | Because | Task |
|---|---|---|
| `urlstate.test.ts` — `describe('isDefaultView')` (`:229–278`) | `isDefaultView` is deleted (Task 3 step 3); the block becomes `sameValue(v, defaultView())`, which is all it ever meant | 3 |
| `urlstate.test.ts` — ~50 further `defaultView('heel')` call sites outside the two ranges named here | mechanical: the argument goes | 3 |
| `urlstate.test.ts` — `describe("the runner's strike")` (`:280–333`) | `:281–291`, `:307–319` assert the field, the URL key and the strike-relative baseline — all delete. `:292–306` assert `defaultColumns`, which is unchanged — keep. `:320–333` rewrite: a forefoot baseline now round-trips through `cols=` and is **not** `isDefaultView` | 3 |
| `presets.test.ts` — 46 references | `applyPreset` keeps its side argument; `defaultView(strike)` calls lose theirs. `:41` asserts the key list and `:42` asserts `v.strike` — both go | 3 |
| `Page.test.ts:310–320` (`All` keeps who you are) | the URL becomes `cols=…`, not `strike=forefoot`; `All` must still mark | 3 |
| `Page.test.ts:333–345` (strike changes columns) | same URL change | 3 |
| `Page.test.ts:362–372` (swaps a hand-edited view) | **behaviour change**: the heel bound is now dropped, not kept. Rewrite as the projection's headline case | 3 |
| `Toolbar.test.ts` — 6, `SetupStrip.test.ts` — 9 | the prop becomes a nullable `side` | 2 |
| `FilterSidebar.test.ts` | `:401–409` loops `defaultView(strike)` → `projectSide(defaultView(), strike)`; ~30 further `defaultView('heel')` call sites lose their argument | 3 |
| `ShoeTable.test.ts:12`, `ShoeTableMobile.test.ts:15` | both harnesses build `{ ...defaultView('heel'), ...over.view }`; neither file is otherwise affected | 3 |
| **`app/e2e/smoke.spec.ts`** | `:77` and `:89` assert `strike=forefoot`, and **so does `:250`** — the arrow-key path in the roving-focus test, which is the one Task 2's e2e run will not catch because Task 2 only renames a class. `:165` selects `.strike-wrap`. `:90` (Forefoot marked) and `:91` (`All` marked) must keep passing untouched | 2, 3 |
| `docs/app.md` | seventeen `strike` sites, not the three Task 4 used to name; all of them move in Task 3, because a doc describing `swapStrike` at the commit that deletes it is the thing "docs ride the change" forbids | 3 |
| `persist.ts` `VIEW_STORAGE_KEY` | the URL encoding changes; bump `v3` → `v4` **once**, in Task 3 | 3 |

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/side.ts` | **create** — `sideOf(view)` and `projectSide(view, side)` |
| `app/src/lib/urlstate.ts` | `ViewState` without `strike`; `DEFAULT_SIDE`; parameterless `defaultView()`; `strike=` gone; `swapStrike` gone |
| `app/src/lib/presets.ts` | unchanged in shape — `applyPreset` keeps taking a side. **But it calls `defaultView(strike)` (`:46`)**, which becomes `defaultView()`. Safe: all three arms overwrite `columns` and `sort` (`:58–59, 68–69, 76–77`), so nothing depends on the baseline's side |
| `app/src/lib/persist.ts` | storage key bump |
| `app/src/Page.svelte` | `allView`; derived `sideMark`, `storyMark`, `atAll`; `onSide` via `projectSide`; `All` per the corrections above |
| `app/src/components/SideToggle.svelte` | renamed from `StrikeToggle.svelte`; nullable mark |
| `app/src/components/Toolbar.svelte`, `SetupStrip.svelte` | nullable `side` prop |

---

### Task 1: `side.ts` — the derivation and the projection

Pure library work. `ViewState` still carries `strike` at the end of this task and `projectSide`
simply never touches it, so the tree compiles and the suite stays green throughout.

**Files:**
- Create: `app/src/lib/side.ts`, `app/src/lib/side.test.ts`

**Interfaces:**
- `export function sideOf(v: ViewState): Side | null`
- `export function projectSide(v: ViewState, side: Side): ViewState`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/side.test.ts
import { describe, expect, it } from 'vitest';
import { projectSide, sideOf } from './side';
import { defaultColumns, defaultView, type ViewState } from './urlstate';
import type { Side } from './lineage';

// `defaultView` still takes a side in this task; Task 3 drops the argument here.
const base = (): ViewState => defaultView('heel');
const withCols = (cols: string[]): ViewState => ({ ...base(), columns: cols });
const SIDES: Side[] = ['heel', 'forefoot'];

describe('sideOf', () => {
  it('reads heel from a heel-shaped view', () => {
    expect(sideOf(base())).toBe('heel');
  });
  it('reads forefoot when every side-paired key is forefoot', () => {
    expect(sideOf(withCols(defaultColumns('forefoot')))).toBe('forefoot');
  });
  // `shock-absorption-forefoot` is absent from the test fixture, which is fine here and only
  // here: side.ts is slug math over SIDE_PAIRS and never consults the catalogue.
  it('is null when the view mixes sides — the case that makes mixing legible', () => {
    expect(sideOf(withCols(['score', 'heel-stack', 'shock-absorption-forefoot']))).toBeNull();
  });
  it('reads the side from a bound as well as a column', () => {
    const v = withCols(['score']);
    v.filters.ranges['energy-return-forefoot'] = { min: 60 };
    expect(sideOf(v)).toBe('forefoot');
  });
  it('reads the side from the sort key', () => {
    expect(sideOf({ ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' } })).toBe('heel');
  });
  it('is null when no side-paired metric is used at all', () => {
    expect(sideOf(withCols(['score', 'msrpGbp', 'weight']))).toBeNull();
  });
});

describe('projectSide', () => {
  it('turns one side\'s plain table into the other\'s, exactly', () => {
    expect(projectSide(base(), 'forefoot').columns).toEqual(defaultColumns('forefoot'));
  });
  it('drops a bound on the half being left, and keeps every sideless filter', () => {
    const v = withCols(['score', 'heel-stack']);
    v.filters.ranges['heel-stack'] = { min: 36 };
    v.filters.ranges['weight'] = { max: 250 };
    v.filters.search = 'nike';
    const next = projectSide(v, 'forefoot');
    expect(next.filters.ranges['heel-stack']).toBeUndefined();
    expect(next.filters.ranges['weight']).toEqual({ max: 250 });
    expect(next.filters.search).toBe('nike');
    expect(next.columns).toEqual(['score', 'forefoot-stack']);
  });
  it('keeps a bound already on the side being chosen', () => {
    const v = base();
    v.filters.ranges['heel-stack'] = { min: 36 };
    expect(projectSide(v, 'heel').filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('maps both halves onto one column rather than exchanging them', () => {
    expect(projectSide(withCols(['score', 'heel-stack', 'forefoot-stack']), 'forefoot').columns)
      .toEqual(['score', 'forefoot-stack']);
  });
  it('moves the sort key too — a sort names no number, so it follows', () => {
    const v = { ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' as const } };
    expect(projectSide(v, 'forefoot').sort).toEqual({ key: 'forefoot-stack', dir: 'desc' });
  });
  it('gives a side-free view that side\'s measurements rather than doing nothing', () => {
    const v = withCols(['score', 'weight']);
    v.filters.ranges['heel-stack'] = { min: 36 };
    const next = projectSide(v, 'forefoot');
    expect(next.filters.ranges['heel-stack']).toBeUndefined();
    expect(next.columns).toEqual(['score', 'weight', 'forefoot-stack', 'energy-return-forefoot']);
  });
  // The invariant the whole design rests on: a click always lands the view on the side clicked,
  // so the control is never left unlit and the mark can honestly read everything.
  it('always leaves the view committed to the side chosen', () => {
    const views = [base(), withCols(defaultColumns('forefoot')),
      withCols(['score', 'heel-stack', 'shock-absorption-forefoot']), withCols(['score', 'weight'])];
    for (const v of views) for (const s of SIDES) expect(sideOf(projectSide(v, s))).toBe(s);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm -w app run test -- side`
Expected: FAIL — cannot resolve `./side`.

- [ ] **Step 3: Create `side.ts`**

```ts
import { SIDE_PAIRS, swapSide, type Side } from './lineage';
import { defaultColumns, type ViewState } from './urlstate';

/** Every key that names one half of a declared side pair, and which half it is. */
const SIDE_OF_KEY = new Map<string, Side>(
  SIDE_PAIRS.flatMap((p) => [[p.forefoot, 'forefoot'] as const, [p.heel, 'heel'] as const]));

/**
 * The side a view is *about*, or null when it does not commit to one. Derived rather than stored,
 * exactly as the story mark is: a view that mixes sides is not wrong, it simply is not either
 * preset, and the toolbar marks neither (docs/app.md §Presets).
 */
export function sideOf(v: ViewState): Side | null {
  const used = new Set<Side>();
  for (const key of [...v.columns, ...Object.keys(v.filters.ranges), v.sort.key]) {
    const side = SIDE_OF_KEY.get(key);
    if (side) used.add(side);
  }
  return used.size === 1 ? [...used][0]! : null;
}

/**
 * Moves a view onto `side`. Columns and the sort key carry no number — "sorted by energy return"
 * means the same thing on either half — so they follow; a bound on the half being left carries a
 * number that does not transfer (36 mm is median heel stack and the 98th percentile of forefoot),
 * so it is **dropped rather than translated**, and every sideless filter is untouched.
 *
 * `rows` and `generations` need no attention, for the same reason in two forms: every side-paired
 * key is curated, so a hand-added row can never name one (docs/app.md §Filters), and the declared
 * side pairs resolve as `colocated` ahead of the catalogue's own links, so a side key can never be
 * the current generation of a supersession either (docs/app.md §Model lineage).
 */
export function projectSide(v: ViewState, side: Side): ViewState {
  const next = structuredClone(v);
  next.sort = { ...v.sort, key: swapSide(v.sort.key, side) };
  // Dedupe preserving order: a view can hold both halves of a pair, and both land on the same key.
  next.columns = [...new Set(v.columns.map((c) => swapSide(c, side)))];
  for (const key of Object.keys(next.filters.ranges)) {
    const of = SIDE_OF_KEY.get(key);
    if (of !== undefined && of !== side) delete next.filters.ranges[key];
  }
  // Everything above maps onto `side`, so the only way to be unmarked here is to name no side at
  // all. Left alone that makes the control a dead button — and one that has just silently dropped
  // a bound. Giving it that side's measurements is the literal reading of what was clicked.
  if (sideOf(next) === null) {
    next.columns = [...next.columns, ...defaultColumns(side).filter((k) => SIDE_OF_KEY.has(k))];
  }
  return next;
}
```

- [ ] **Step 4: Run `npm run verify`** → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Derive a view's side, and project a view onto one"
```

---

### Task 2: Both selection surfaces accept a nullable mark

Widening only — `Page.svelte` still passes a non-null side, so nothing changes on screen. This
task exists so the removal in Task 3 is the only commit that has to be atomic.

**Files:**
- Rename: `app/src/components/StrikeToggle.svelte` → `SideToggle.svelte`
- Modify: `app/src/components/Toolbar.svelte`, `Toolbar.test.ts`, `SetupStrip.svelte`, `SetupStrip.test.ts`, `app/src/Page.svelte` (prop names only), `app/e2e/smoke.spec.ts` (the `.strike-wrap` selector)

- [ ] **Step 1: Write the failing tests**

```ts
// Toolbar.test.ts
it('marks neither side when the view commits to none', () => {
  render(Toolbar, { ...props, side: null });
  expect(screen.getByRole('radio', { name: /Heel/ })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: /Forefoot/ })).not.toBeChecked();
});
```

```ts
// SetupStrip.test.ts — anchored regexes, matching the file's own convention (:29, :51): the card
// carries a reserved count span as well as its name (SetupStrip.svelte:46).
it('presses neither card when the view commits to no side', () => {
  render(SetupStrip, { ...props, side: null });
  for (const name of [/^Heel/, /^Forefoot/]) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
  }
});
```

Add this one too, labelled in the file as a **regression guard, not a red-first test** — verified
before writing this plan: `roving.ts:31` already falls back to the first radio when nothing is
checked (`list.find(checked) ?? list[0]`), so it passes on arrival. It is here because a nullable
mark makes "nothing checked" reachable for the first time, and a later refactor assuming a checked
radio would break keyboard access silently. **Do not try to make it fail first.**

```ts
it('keeps one tab stop even with nothing selected', () => {
  render(Toolbar, { ...props, side: null });
  const sides = screen.getAllByRole('radio', { name: /Heel|Forefoot/ });
  expect(sides.filter((r) => r.tabIndex === 0)).toHaveLength(1);
});
```

- [ ] **Step 2: Run and watch the first two fail.**

- [ ] **Step 3: Implement**

Rename the file with **`git mv app/src/components/StrikeToggle.svelte app/src/components/SideToggle.svelte`**, not by writing a new file and deleting the old one: `check-docs.mjs:9` lists tracked files from `git ls-files -co` and `readFileSync`s each at `:35`, so an *unstaged* deletion makes it throw `ENOENT` rather than report an error. `git mv` stages both halves.

`strike: Side` becomes `side: Side | null` on all three, and the callback `onstrike` becomes
`onside` on `Toolbar` and `SetupStrip` — the whole vocabulary moves in this commit, or Task 3
lands a `side` prop wired to an `onstrike` handler. **`SideToggle`'s own callback is `onchange`
and stays `onchange`** (`StrikeToggle.svelte:5`; `Toolbar.svelte:34` wires `onchange={onstrike}`):
only its `strike` prop is renamed. `Page.svelte` passes `side={view.strike}` and
keeps its `onStrike` function name for now; a `Side` is assignable to a `Side | null` rune prop,
so this compiles and behaves exactly as before.

The setup strip needs **no** heel fallback and must not grow one: on a first arrival the view is
the plain heel table, so the derived mark is already `'heel'` and the card is already pressed. A
`?? 'heel'` there would be unreachable — a mixed view requires a query string, and a query string
means the strip never opens (`Page.svelte:55`) — so it would be dead code carrying a coverage cost.

The remaining `strike` spellings on these three surfaces go with it: `.strike-wrap` → `.side-wrap`
in `Toolbar.svelte` (follow it in `app/e2e/smoke.spec.ts:165`), `SideToggle`'s `class="strike"` /
`.strike` rule (`StrikeToggle.svelte:15,23`) → `side`, `SetupStrip`'s `.strike-label` (`:39,72`) →
`.side-label` and its `STRIKE_LABEL`/`STRIKE_HELP` → `SIDE_LABEL`/`SIDE_HELP`. **The visible
wording is unchanged** and is not this task's business.

The comments on these three files that call the group "the strike" (`Toolbar.svelte:7,90,92`,
`SetupStrip.svelte:44`) name a control, not a runner, so they move too. Comments elsewhere that
reason about a *runner's* strike — `MetricRow.svelte:12`, `test-fixtures.ts:51`, `lineage.ts` —
stay, and Acceptance 2 allows for them.

- [ ] **Step 4: `git add -A`, then run `npm run verify` and `npm -w app run e2e`.**

Stage first: `check:docs` reads the index, so a rename left half-unstaged crashes it.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Let both selection groups show nothing selected"
```

---

### Task 3: The side leaves `ViewState`, the URL and storage

The atomic one. `ViewState.strike` cannot be removed without every consumer moving in the same
commit — `serializeView`, `parseView`, `isDefaultView`, `swapStrike`, `Page.svelte` and both
surfaces all read it — so this is one commit by necessity, not by preference.

**Files:**
- Modify: `app/src/lib/urlstate.ts`, `urlstate.test.ts`, `app/src/lib/persist.ts`, `app/src/lib/presets.ts`, `presets.test.ts`, `app/src/Page.svelte`, `Page.test.ts`, `app/src/lib/side.test.ts`, `app/src/components/FilterSidebar.test.ts`, `ShoeTable.test.ts`, `ShoeTableMobile.test.ts`, `app/e2e/smoke.spec.ts`, `docs/app.md`
- Delete: `swapStrike`, `isDefaultView`, and their tests

- [ ] **Step 1: Write the failing tests**

`urlstate.test.ts`:

```ts
it('never writes a side key', () => {
  expect(serializeView({ ...defaultView(), columns: defaultColumns('forefoot') })).not.toContain('strike');
});
it('carries the side in the columns instead', () => {
  const v = { ...defaultView(), columns: defaultColumns('forefoot') };
  expect(parseView(serializeView(v), idx).columns).toEqual(defaultColumns('forefoot'));
});
it('ignores a legacy strike key rather than honouring it', () => {
  // No compatibility branch: the tool was never shared, so no such link is in anyone's hands.
  expect(parseView('strike=forefoot', idx)).toEqual(defaultView());
});
it('round-trips a mixed-side view losslessly', () => {
  // Both halves must exist in the fixture, or parseView drops the column and the round trip is
  // not the thing under test.
  const v = { ...defaultView(), columns: ['score', 'heel-stack', 'forefoot-stack'] };
  v.filters.ranges['energy-return-forefoot'] = { min: 60 };
  expect(parseView(serializeView(v), idx)).toEqual(v);
});
```

`Page.test.ts` — the marks. `markedStory()` and `clickForefoot()` (`Page.test.ts:259–267`) already
span both surfaces; use them rather than reaching for a role directly.

Two setup notes before writing these. **The file imports none of `indexTests`, `parseView` or
`defaultColumns` today** (`Page.test.ts:1–14`) — add them and `const idx = indexTests(TESTS);`.
And **three of the eight below pass before the implementation**: `'marks both groups when the view
is a story on a side'` (today `view.strike` is `'heel'`, so Heel is already checked), `'All clears
a filter the user set by hand'` (today's `onStory` routes `all` to `defaultView(snapshot.strike)`,
which already clears filters — correction 3 above calls this unchanged behaviour) and `'a story
picked from a mixed view lands on the baseline side'` (today's `snapshot.strike` is heel for the
same reason `workingSide` will be). They are **regression guards, not red-first tests**; do not
hunt for a way to make them fail. The other five must be seen failing.

```ts
it('marks both groups when the view is a story on a side', async () => {
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));   // the strip's card
  expect(markedStory()).toEqual(['Easy']);
  expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
});

it('marks neither side when the view mixes them, and All when nothing is filtered', () => {
  history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack');
  render(Page, { props: { data } });
  expect(screen.getByRole('radio', { name: 'Heel' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Forefoot' })).not.toBeChecked();
  // A view showing everything is an All view whether or not it commits to a side; the mark is
  // `sameValue(v, allView(v))`, so it is lit exactly when pressing it would do nothing.
  expect(markedStory()).toEqual(['All']);
});

it('All restores the derived side\'s own plain table, and stays marked on it', async () => {
  history.replaceState(null, '', `/?cols=${defaultColumns('forefoot').join(',')}&r.weight=~250`);
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  expect(markedStory()).toEqual(['All']);
  expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
  settle();
  expect(location.search).not.toContain('r.weight');
  expect(parseView(location.search.slice(1), idx).columns).toEqual(defaultColumns('forefoot'));
});

it('All on a mixed view clears the filters, leaves the table\'s shape, and then marks itself', async () => {
  history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack&sort=-forefoot-stack&r.weight=~250');
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  expect(markedStory()).toEqual(['All']);   // nothing left for it to do
  settle();
  expect(location.search).not.toContain('r.weight');
  expect(location.search).toContain('cols=score%2Cheel-stack%2Cforefoot-stack');
  expect(location.search).toContain('sort=-forefoot-stack');   // spec §7: the sort is left exactly as it was
});

// Correction 3's second consequence. Mixed *only* because of the bound, so clearing it is what
// gives the view a side — and the view it leaves is not that side's plain table.
it('All takes two presses when clearing the bound is what makes the view sided', async () => {
  history.replaceState(null, '', '/?cols=score,heel-stack&r.forefoot-stack=20~');
  render(Page, { props: { data } });

  await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  expect(markedStory()).toEqual([]);        // honestly unlit: there is still something All can do
  expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
  settle();
  expect(location.search).not.toContain('r.forefoot-stack');
  expect(location.search).toContain('cols=score%2Cheel-stack');

  await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  expect(markedStory()).toEqual(['All']);
  settle();
  expect(location.search).toBe('');
});

// `workingSide`'s only reason to exist: the stories each bind one half, so one has to be picked.
it('a story picked from a mixed view lands on the baseline side', async () => {
  history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack');
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('radio', { name: /Easy/ }));
  expect(markedStory()).toEqual(['Easy']);
  expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
});

it('All clears a filter the user set by hand, not only a preset\'s', async () => {
  render(Page, { props: { data } });
  await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'nova' } });
  await fireEvent.click(screen.getByRole('button', { name: /^All/ }));   // strip is still up
  settle();
  expect(location.search).not.toContain('q=');
});
```

`Page.test.ts` — the projection, replacing `:362–372`:

```ts
it('picking a side drops the other half\'s bound, keeps the rest, and moves the columns', async () => {
  history.replaceState(null, '', '/?cols=score,heel-stack&sort=-heel-stack&r.heel-stack=36~&r.weight=~250&q=nova');
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));

  // `\u00a0`, not a space: the sort arrow is nbsp-joined inside `.h-name`
  // (ShoeTable.svelte:64) and `columnHeaders()` reads that span. Written as an escape,
  // exactly as Page.test.ts:368 does, so a copy-paste cannot silently lose it.
  expect(columnHeaders()).toEqual(['Shoe', 'Score', 'Forefoot stack\u00a0▼']);
  expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
  settle();
  expect(location.search).not.toContain('r.heel-stack');   // the number does not transfer
  expect(location.search).toContain('r.weight=%7E250');    // no side, so not this control's business
  expect(location.search).toContain('q=nova');
  expect(location.search).toContain('sort=-forefoot-stack');
});

it('gives a side-free view that side\'s measurements rather than doing nothing', async () => {
  history.replaceState(null, '', '/?cols=score,weight');
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
  expect(columnHeaders()).toContain('Forefoot stack');
  expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement — `urlstate.ts`**

Remove `strike` from `ViewState`. Name heel exactly once, and let both `defaultView` and
`Page.svelte` read it from there:

```ts
/** The arbitrary half, named here and nowhere else. It is not a silent assumption: the toolbar
 *  renders Heel as marked on this view, because the mark is derived from it (docs/app.md §Presets). */
export const DEFAULT_SIDE: Side = 'heel';

/** `defaultColumns` still demands a side, which is what stops another call site defaulting by accident. */
export function defaultView(): ViewState {
  return { filters: { ...EMPTY_FILTERS, ranges: {} }, sort: { ...DEFAULT_SORT },
           columns: defaultColumns(DEFAULT_SIDE), generations: {}, rows: [] };
}
```

- **Delete `isDefaultView`.** Its only production caller is `Page.svelte:135`, which becomes the
  action-derived `atAll` below — so with a constant baseline it would survive as a one-line
  alias for `sameValue(v, defaultView())`, kept alive by assertions alone. Its two
  `FilterSidebar.test.ts` call sites (`:263`, `:291`) both start from the heel baseline, so they
  become `sameValue(next, defaultView())` unchanged in meaning, as does `describe('isDefaultView')`
  in `urlstate.test.ts`. (CLAUDE.md §Working approach: prefer deleting an assumption to
  abbreviating it.)
- Delete the `strike` read at `parseView`'s head (`:146`) and the `strike` write in `serializeView`
  (`:132`). The `cols` comparison becomes `defaultColumns(DEFAULT_SIDE).join(',')` — do **not**
  write a second `'heel'` literal, and do not add a `side=` shorthand (spec §4a).
- Delete `swapStrike`; `projectSide` is its replacement and already exists. **`swapSide` then
  becomes an unused import at `urlstate.ts:5` and `lint` fails on it** — drop it from that import
  list. `sideKey` stays: `defaultColumns` still uses it.
- **`presets.ts:46`**: `defaultView(strike)` → `defaultView()`. One token, and it is the reason
  `presets.ts` is in this task's file list at all.

**Step 3b — `persist.ts`:** bump `VIEW_STORAGE_KEY` from `shoe-lab.view.v3` to `v4`. The encoding
changed, and a stored `strike=forefoot` would otherwise read as a view that quietly lost its side.
`Page.test.ts:408` derives the previous version arithmetically and needs no edit — confirm rather
than assume.

**Step 3c — `Page.svelte`.** The import line (`:33`) changes as much as the body does: drop
`isDefaultView` and `swapStrike`, add `DEFAULT_SIDE` and `defaultColumns` from `./lib/urlstate`,
add `projectSide` and `sideOf` from `./lib/side`, and add `EMPTY_FILTERS` to the existing
`./lib/filters` import (`:27`), which today brings in `applyFilters` alone.

```svelte
const sideMark = $derived(sideOf(snapshot));
/** Somewhere to stand when the view names no side: the stories each bind one half, so applying
 *  one has to pick, and the baseline's own half is the least surprising pick. */
const workingSide = $derived(sideMark ?? DEFAULT_SIDE);

/**
 * What `All` produces — and, because the mark is `sameValue(v, allView(v))`, also what lights it.
 * One function rather than an action and a matching predicate, so "marked means pressing it
 * changes nothing" is true by construction and cannot drift (docs/app.md §Presets).
 *
 * `All` speaks for the story group and means "all paces". With a side to work from it restores
 * that side's plain table; with none — a deliberately mixed view — it clears the filters and
 * leaves the table's shape alone, because there is no defensible column set to impose and a row
 * the runner added is not a filter.
 */
function allView(v: ViewState, side: Side | null): ViewState {
  if (side !== null) return { ...defaultView(), columns: defaultColumns(side) };
  const next = structuredClone(v) as ViewState;
  next.filters = { ...EMPTY_FILTERS, ranges: {} };
  return next;
}

const atAll = $derived(sameValue(snapshot, allView(snapshot, sideMark)));
const storyMark = $derived(
  sideMark === null ? null
  : PRESETS.find((p) => sameValue(snapshot, applyPreset(p.id, data.shoes, idx, sideMark)))?.id ?? null);
const selected = $derived(atAll ? 'all' : storyMark);

/**
 * A side click makes the view about that side (docs/app.md §Presets). A view that is a story is
 * rebuilt as that story on the new side, so its bounds re-resolve at the new side's percentiles;
 * anything else is projected, which moves the columns and sort and drops the other half's bounds.
 */
function onSide(next: Side) {
  if (next === sideMark) return;   // already there: a no-op click must not rebuild the view
  setView(storyMark ? applyPreset(storyMark, data.shoes, idx, next) : projectSide(snapshot, next));
}

function onStory(id: string) {
  stripOpen = false;
  setView(id === 'all' ? allView(snapshot, sideMark) : applyPreset(id, data.shoes, idx, workingSide));
}
```

`presetCounts` (`:145–149`) takes `workingSide`. Both surfaces get `side={sideMark}` and
`selected={selected}`. The default-branch of `onSide` needs no special case: projecting the heel
baseline onto forefoot yields `defaultColumns('forefoot')` exactly, which Task 1 pins.

`allView` is deliberately *not* idempotent (correction 3): a mixed view whose only forefoot key is
a bound becomes heel-derived the moment that bound goes, and heel's plain table is then a further
change. Do not "fix" this by marking `All` after the first press — that would light a control that
still changes the table.

**Step 3d — the e2e spec, at three sites, not two.** `:77` becomes an assertion that the URL
carries `cols=` and the forefoot columns rather than `strike=forefoot`; **`:250`** is the same
assertion reached by arrow key inside the roving-focus test and needs the same treatment (it is
the one site Task 2's e2e run cannot catch, because Task 2 only touches a class name); `:89`
becomes the same for the post-`All` URL — write the whole string into the test, so spec §4a's
accepted cost is visible in the suite rather than only in a design doc. **It is the encoded form**,
~119 characters rather than the readable 110 spec §4a prints, because `serializeView` returns
`URLSearchParams.toString()`:

```
?cols=releasedAt%2Cscore%2CmsrpGbp%2Cforefoot-stack%2Cplate%2Cenergy-return-forefoot%2Ctoebox-width-widest-part%2Cweight
```

Read it off the running app in Step 5 rather than trusting the line above. `:91` (`All` marked)
and `:90` (Forefoot marked) must keep passing untouched — they are the regression this task most
has to protect.

- [ ] **Step 4: Run `npm run verify` and `npm -w app run e2e`.**

- [ ] **Step 5: Verify by rendering**, per CLAUDE.md §Working approach. Build, serve `app/dist`, drive Playwright and confirm at 1280px: a default view marks Heel and All; a forefoot-columns URL marks Forefoot and All; a mixed-column URL marks neither side but *does* mark All; picking Forefoot on a hand-edited heel view drops the heel bound, keeps the search and the weight bound, and marks Forefoot; `All` from a filtered mixed view leaves the columns and sort untouched and then marks itself. **Report the measured URLs**, including the post-`All` forefoot one Step 3d hard-codes.

- [ ] **Step 6: Update `docs/app.md`** in the same commit — all of it, not the sections this task
  touched. A doc describing `swapStrike` at the commit that deletes it is what "docs ride the
  change" (CLAUDE.md) forbids, so nothing here defers to Task 4. `grep -n strike docs/app.md`
  returns seventeen sites; work the list:

  - **§View and URL ownership** (`:26–32`) — the paragraph goes: `ViewState` no longer carries the
    side, the baseline is a constant, `defaultColumns` still demands one, and `parseView` has
    nothing to resolve before it builds the baseline.
  - **§URL encoding** (`:102`) — drop `strike=forefoot` from the token list; the side rides in
    `cols`, so a forefoot plain table is verbose, with `side=` named as the remedy if it ever
    matters (spec §4a, and BACKLOG.md in Task 4).
  - **§Presets** (`:555–557`) — `applyPreset` still takes a side, so this stays; check the wording
    reads as an input to the mapping rather than a field being carried.
  - **### The setup strip** (`:595`, `:617`) — the count-free side cards are unchanged; "a strike
    click leaves the strip up" is still true, but the reason is now that a side click leaves the
    view equal to that side's plain table, so `All` stays marked through it.
  - **### The toolbar** (`:631`, `:642`, `:677–682`) — `defaultView(strike)` and the three-branch
    flip both go. Replace with: both marks derived; `allView` as the single source of `All`'s
    action *and* its mark, with the two consequences from correction 3; what a side click does in
    each of the three states and why a bound is dropped rather than translated; that `All` clears
    hand-set filters too, and why undoing only the preset's share would need the stored `preset`
    field the section already rules out. "Who you are survives it" (`:645`) is no longer the
    mechanism and must not be reinstated as prose.
  - **§Filters** (`:143`), **§Columns and sorting** (`:272`, `:321`), the responsive tier table
    (`:664–672`) and **§Coverage** (`:789`) — prose about a runner's strike or about a control by
    its visible name. Re-read each, change none of them by default, and say so in the commit if
    one turns out to need it.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Make the side a derived mark rather than a stored field"
```

---

### Task 4: The runner's vocabulary, and the backlog

`docs/app.md` is **not** in this task — Task 3 step 6 lands all of it, in the commit that changes
the behaviour it describes.

**Files:**
- Modify: `docs/shoe-stories.md`, `BACKLOG.md`

- [ ] **Step 1: `docs/shoe-stories.md`**

§Which half a story uses still holds: a story bounds one side. What changes is that the side is a
*selection* rather than an identity, so "a forefoot striker browsing with nothing selected still
gets forefoot columns" (`:56–58`) is no longer true and must not be reinstated, and `:73`'s "the
field is called `strike`" no longer names anything. The doc may keep reasoning in strikes — that is
a runner's vocabulary and the reason §Which half a story uses exists — but it must stop describing
a stored field.

- [ ] **Step 2: Update `BACKLOG.md`**

Add the `side=` URL shorthand as a deferred item, with spec §4a's reasoning and the trigger — do
it if a forefoot plain-table link's length becomes annoying in practice, not before.

- [ ] **Step 3: Run `npm run check:docs`** → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Record what the side change leaves behind"
```

---

## Acceptance

1. `npm run verify` and `npm -w app run e2e` both green; coverage on `app/src/lib/**` no worse than 100 / 99.15.
2. `grep -rn "strike" app/src` returns no `ViewState` field, no `swapStrike`, no `isDefaultView`, no URL key, no prop, no component and no CSS class, **and no comment describing a control**. What it does still return is deliberate and out of scope: `strike` as a *parameter* name in `lineage.ts` (`sideKey`, `swapSide`) and `presets.ts` (`applyPreset`, `easyColumns`, `fastColumns`), and prose comments reasoning about a *runner's* strike (`MetricRow.svelte:12`, `MetricRow.test.ts:157`, `test-fixtures.ts:51`, `lineage.test.ts:170`, `lineage.ts`). Those take the runner's strike as a concept, which docs/shoe-stories.md still reasons in. Renaming them is a separate, optional tidy.
3. `serializeView` never emits `strike=`, and `parseView('strike=forefoot', idx)` equals `defaultView()`.
4. `sideOf(projectSide(v, s)) === s` for every view and side — a side click always leaves the view committed to the side clicked, and the clicked control always lights.
5. Picking a side drops the other half's bounds, keeps every sideless filter, and moves the columns and sort; a view equal to a story is rebuilt as that story on the new side.
6. A mixed-side view marks neither side and no story, and both groups still have exactly one tab stop each.
7. **`All`'s mark is its action**: exactly one function decides both, so a lit `All` is one that changes nothing when pressed, in all three states. It restores a derived side's plain table; on a mixed view it clears the filters and touches neither columns nor sort; on an unfiltered mixed view it is already marked; and where clearing the filters is what gives the view a side, it honestly stays unlit for a second press. In every state it clears hand-set filters, not only a preset's.
8. A round trip of a mixed-side view through `serializeView`/`parseView` is lossless.
9. `defaultView()` takes no argument, `defaultColumns` still requires a side, and `'heel'` is written in exactly one place.
10. `docs/app.md` names no `strike` field, no `swapStrike` and no `strike=` token, and it landed in Task 3's commit rather than Task 4's.
