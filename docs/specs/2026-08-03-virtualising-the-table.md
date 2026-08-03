# Virtualising the table body

*2026-08-03 · from BACKLOG's "Cut what a drag re-renders, not just what it
recomputes", item 4 · status: **approved, in delivery**.*

Both renderings put every visible shoe in the DOM, up to the whole fleet. That
is the larger half of a held grip's per-frame cost, and it is a row-count
problem rather than a reactivity one (docs/app.md §What a drag may recompute).
This renders only what is on screen, plus what the runner has claimed.

**It is no longer urgent, and the spec should be read knowing that.** The wash
ramp now steps, so a drag costs about 13.5ms a frame against a 16.7ms budget at
1440px on a fleet of 450 — inside budget, where it used to be at 22ms. What
remains is the rows themselves. This is worth doing for the DOM it removes and
the headroom it buys on hardware slower than the machine these numbers came
from; it is not worth doing badly to hit a deadline that no longer exists.

## What this changes, in one line

The `<tbody>` stops holding one entry per shoe and starts holding a *plan*: a
run of rendered shoes bracketed by spacer rows that stand in for the ones left
out, with any shoe the runner has expanded or focused rendered wherever it
belongs even when it is far off screen.

## Decisions

**Column widths are declared, not derived — and that is the prerequisite.**
The desktop table has no `table-layout`, so every column's width is a function
of the rows in the DOM. Rendering a window instead of the fleet moves the name
column by up to 72px and three figure columns by 22–33px, measured in Chromium
and Firefox alike. Nothing else about this change is possible until the widths
stop depending on which rows happen to be rendered, so the table takes
`table-layout: fixed` and a `<colgroup>` computed by the model in
`app/src/lib/fit.ts`. `ShoeTableMobile` is already `table-layout: fixed` with
its own `min-width` arithmetic and is untouched by this
(docs/app.md §Two renderings, and only one of them mounted).

**The model is the authority; the engine is not being copied.** The reason to
own the widths is that the app should know its own geometry — the same reason
`fit.ts` already computes the width at which the phone rendering takes over
rather than measuring the mounted table. So the distribution rule is chosen on
merit and there is no assertion pinning it to what a browser would have done.
It happens to agree with CSS auto layout wherever the track is full, which is
every default view, and that is a convenience rather than a requirement.

**The rule has two clauses.** Slack is shared among the columns that can still
use it, in proportion to how much each still needs to unwrap; any excess beyond
that is shared in proportion to max-content. The first clause is right rather
than merely conventional: `Released`, `Price`, `Plate` and `Weight` carry
nowrap phrases or unbreakable mono figures and gain nothing at all from extra
width, so giving them any is waste. The second clause was tested against the
alternative of giving every excess pixel to the name column, and lost to
nothing: because every figure column is right-aligned and the last one ends at
the track's edge whatever happens, the only thing a rule can move is where the
figures *start*, and dumping the excess in the name column starts them 159px
further right at three columns.

**The table always fills its track, and the expanded row is why.** A model is
free not to stretch, and a compact table reads better on a small column set —
but the expanded row lays out against the table's width, not the window's
(docs/app.md §The expanded row). Measured at three columns: a full-width panel
is 1146×844, the same panel in a table left at its natural 651px is 649×1384 —
64% taller, collapsed to a single column with the photo, chips, prose and
breakdown stacked. The table is the container for the panel as much as it is a
grid of figures, and starving it starves the panel. The alternative of natural
columns plus a trailing spacer column was rejected: it makes every body row
short by one cell, which is a table claiming more columns than its rows carry,
in an app that is careful about exactly that kind of claim.

**The window is what is on screen, plus what the runner has claimed.** Two
things survive scrolling past them: an expanded row, and the focused row. That
is one rule with one reason, not three special cases.

*The focused row is pinned rather than surrendered.* A shoe row is
`tabindex="0"` and is the control that expands it, wearing the one inset focus
ring the app permits (docs/app.md §Theming). Unmounting it while it holds focus
drops `activeElement` to `<body>`: no ring anywhere, and the next Tab restarts
from the top of the document past every filter. Moving focus to the nearest
row still on screen was rejected — it changes what Enter would expand without
telling the runner, which is the shape of the failure the expanded-row scroll
rule already exists to prevent. Focus is moved deliberately or not at all
(docs/policies.md §Interaction chrome).

*Open rows are always rendered.* An expanded panel is 843–1005px on the
desktop and 1595–1768px on the phone, so estimating one costs 25 rows of
scrollbar error per item — by far the worst estimate available. Always
rendering them cannot be worse than today, because today renders all of them
anyway: measured on a link naming every shoe, 455 panels reach ready in 574ms
with 36,782 nodes and scrolling unaffected, the panel images being
`loading="lazy"`. There is no cap on the `open` token and this change does not
add one; it inherits the existing ceiling rather than creating one.

**Both renderings, one change, and the unit is a shoe.** The stacked list is
the worse case, not the safer one: measured at 390px it costs 26.1ms a frame
against the desktop's 20.9, on a desktop CPU — real phone silicon is worse
again. It is also the cheaper half, because it needs none of the width work
above. Its complications are different rather than larger: a shoe there is two
rows plus a rule row, its focus ring spans the name row and the chips row
through an adjacent-sibling selector, and `revealRow` walks two siblings to
find the panel. All three want the group emitted intact, which it is when the
virtualiser's unit is **a shoe** rather than **a row** — one row plus a panel
on the desktop, two or three plus a panel on the phone. Splitting the work
would leave one rendering windowed and one not, which is the drift
docs/app.md §Two renderings, and only one of them mounted exists to prevent.

**Heights are derived, then corrected by measurement.** A desktop row's height
is a pure function of how many line boxes its name occupies: measured across
the desktop band, 36px maps to one line and 53px to two with no exceptions at
any width, and no cell other than the name can wrap at all — every other one is
a nowrap phrase or an unbreakable mono figure. The predictor has to be a real
greedy line-break at pixel widths, not a heuristic: at 1440px a 39-character
name wraps where a 41-character one does not. That is what `fit.ts`'s committed
per-character tables already do, and it is only possible because the widths
above are declared — the derivation needs an exact name-column width, which
does not exist while the engine is deriving widths from whichever rows are
present. When an item is actually rendered its measured height replaces the
derived one, so a modelling error is transient and self-healing rather than
permanent, and the scrollbar never creeps for content already visited.

**The scroll extent is exact, and it is affordable because of what it is keyed
on.** The line-break simulation is per shoe per name-column width, and that
width changes only when the viewport or the column set changes — never when a
filter moves. So the cache survives a drag untouched and a frame is a sum over
cached integers, not a walk of the fleet's strings
(docs/app.md §What a drag may recompute).

## Bounds

Each names where the assertion lives. The three marked *measured at
implementation* have no honest value until the thing exists.

| Bound | Home |
|---|---|
| No cell's content exceeds its declared column by more than the model's cross-engine spread, over every column and every mounting width, in all three engines. The spread is *measured at implementation* (~0.8px at the readings taken so far) and must be justified against the cell padding that absorbs it, never asserted as a bare number | `app/e2e/cross-browser.spec.ts`, `app/e2e/smoke.spec.ts` |
| The model's min-content still agrees with the engine's, measured with the override off, within `FIT_TOLERANCE_PX` | `app/e2e/fit-support.ts` (unchanged claim, new measurement path) |
| Derived row height equals rendered row height for every shoe in the fleet, three engines | `app/e2e/cross-browser.spec.ts` |
| With no measured viewport, every item renders and no spacer is emitted | `app/src/lib/virtual.test.ts` |
| A focused row and an open row are in the plan at any scroll position | `app/src/lib/virtual.test.ts` |
| Spacer height equals the summed height of exactly the items it stands for | `app/src/lib/virtual.test.ts` |
| Per-drag fleet-wide pass counts stay independent of fleet size | `app/src/recompute-budget.test.ts` (existing, must not regress) |
| Desktop row base and line step, in px | *measured at implementation*; `app/e2e/smoke.spec.ts` |
| Phone shoe base and line step, in px | *measured at implementation*; `app/e2e/smoke.spec.ts` |
| Overscan, in px | *measured at implementation*; asserted as behaviour in `virtual.test.ts` |

## Interfaces

```
// app/src/lib/virtual.ts — pure, no DOM, no Svelte
export interface VirtualItem { readonly key: string; readonly height: number }
export type VirtualEntry =
  | { readonly kind: 'gap'; readonly px: number }
  | { readonly kind: 'item'; readonly index: number };

export function virtualPlan(
  items: readonly VirtualItem[],
  scrollTop: number,
  viewportPx: number,
  overscanPx: number,
  kept: ReadonlySet<string>,
): VirtualEntry[];

// app/src/lib/fit.ts — additions
export function headerMaxPx(key: string, test: LabTest | undefined): number;
export interface FitModel {
  columnPx(key: string): number;      // existing: min-content
  columnMaxPx(key: string): number;   // new: max-content
}
export function columnWidths(
  columns: readonly string[], trackPx: number, model: FitModel,
): number[];                          // name column first, one entry per rendered column

// app/src/lib/row-height.ts
export function nameLines(name: string, discontinued: boolean, widthPx: number): number;
export function desktopRowPx(shoe: Shoe, nameColumnPx: number): number;
export function phoneShoePx(shoe: Shoe, columns: readonly string[], widthPx: number): number;
```

`virtualPlan` returns entries in document order, so a kept item above the
window appears between two gaps rather than being hoisted — a table row cannot
be positioned out of flow, and splitting the spacer around it is what keeps
every row where the scrollbar says it is.

## Failure behaviour

**No measured viewport → render everything.** jsdom lays nothing out, every box
is zero, and `test-setup.ts`'s `IntersectionObserver` stand-in delivers
nothing. `virtualPlan` therefore treats a non-positive `viewportPx` as "cannot
window" and returns every item with no gaps. This is not only a test
affordance: it is the honest answer whenever the app cannot measure, and it
matches how `fit.ts` already falls back under jsdom
(docs/app.md §Two renderings, and only one of them mounted).

**A width model that under-measures overflows a cell — and the risk is not
one-sided.** Under `table-layout: auto` a model error only nudged the width at
which the phone rendering takes over; under declared widths the content leaves
its box. Every declared width is `min + share`, so a column can never fall below
its *modelled* min-content — but the model is Chromium's, and the engines
disagree.

*Amended 2026-08-03, during delivery.* This section originally claimed the
min-content half "errs 1px high", making the risk one-sided. **That was true of
Chromium only and is false in direction elsewhere.** Measured against each
engine's own min-content on the real fleet: Chromium is exact on seven of the
eight default columns and 1px high on the eighth; Firefox and WebKit have the
model *low* on three of the eight (`score` −0.72px, `msrpGbp` −0.60px,
`energy-return-heel` −0.52px) and on five of the eleven in the wide set. The
column count at which the margin goes negative is reachable: eighteen columns
mounts the desktop table from 1920px up.

What survives is the consequence rather than the direction, and for a reason
worth stating because it is structural rather than lucky. **Every figure
column's min-content is set by its header, not its cells** — `score`'s header
needs 84px against 17px of cells, `msrpGbp`'s 45px against 26px — and the only
cell-bound columns are the three that carry upstream phrases (`releasedAt`,
`plate`, `tongue-gusset-type`). So a sub-pixel shortfall puts a header's longest
word, or a phrase, that far past its box, into the `--s2` padding the cell
already carries on each side. The excursion is bounded by the model's
cross-engine spread and absorbed an order of magnitude over: nothing clips,
nothing wraps differently, nothing shifts.

**So the no-overflow bound is a tolerance, and the tolerance has to be a bound
over every column at every mounting width** — not an exception for the column
that happened to surface it. Task 3 measures it. The case to check hardest is
the three cell-bound phrase columns, where the thing leaving the box is a
runner's data rather than a header we authored.

The max-content half is new arithmetic but can only misplace a distribution
boundary; nothing clips from it.

**A height model that is wrong drifts the scrollbar, then heals.** Measurement
on render replaces the derived value, so error is bounded by how far the runner
has not yet scrolled.

**Engine scroll anchoring must be switched off** over the body. Both engines
re-anchor when content is added or removed above the viewport, which is what
this does on every scroll frame, and this project has already paid for that
twice.

## Non-goals

- **Find-in-page.** Rows not in the DOM cannot be found by the browser's own
  search. The shoe search filter covers the need and this trade is accepted.
- **A cap on the open set.** Unbounded today, unbounded after.
- **Any change to which rendering mounts.** `fit.ts`'s boundary, the 700px
  floor and the six-column default are untouched
  (docs/app.md §Two renderings, and only one of them mounted).
- **Any change to the wash, the sort, the filters, the URL encoding or the
  score maps.** Ranking stays over the whole filtered set, never the window —
  a wash ranked over what is on screen would mean something different in every
  scroll position.
- **Deferring the table's update while the phone drawer is open.** Measured as
  a cheap alternative and left out deliberately: it is a behaviour change of
  its own and belongs in its own decision.
- **Horizontal windowing.** There are at most a dozen columns.

## Policies cited

- docs/policies.md §Compatibility floor — three engines and 360px of layout;
  every rendered bound above is asserted in all three.
- docs/policies.md §Interaction chrome — focus is moved deliberately, never
  dropped; the pinned focused row is that rule applied.
- docs/policies.md §State ownership and validation — the virtualiser holds no
  view state. Scroll position is the browser's, the open set stays
  `Page.svelte`'s, and no URL token is added
  (docs/app.md §View and URL ownership).
- docs/policies.md §Announcement — `aria-rowcount` is a property of the table,
  not something a control says, so it does not collide with the rule that no
  control announces a row count.
- docs/policies.md §Vocabulary — the width model and the height model get one
  home each and both renderings read them, which is what keeps the two from
  drifting.
- docs/decisions.md §Testing bar: adversarial, no live network — every rig here
  runs against the committed dataset or the e2e fixture.

## Registry sweep

Everything that quantifies over columns, rows or widths, and what this change
owes it.

| Registry | Owed |
|---|---|
| `FIT_SETS`, `FIT_TOLERANCE_PX` in `app/e2e/fit-support.ts` | the same four column sets guard the new max-content model and the no-overflow bound. **Unpaid as of task 2**: `measureFit` still asks only for `min-content`, so nothing committed holds the max-content half or the no-overflow bound to any engine, and the evidence for both lives in gitignored one-shot scratch. Task 3 pays it; until then this row is a promise, not a fact |
| `SCORE_COLUMN_KEYS`, `SCORE_CELL_CHARS` in `fit.ts` | `columnMaxPx` must answer for score columns, which have no cells in the dataset |
| `PLATE_LABELS` (`categorical.ts`) | feeds `cellMaxPx`, and therefore feeds `columnMaxPx` |
| `MAX_LABEL_PX`, `MAX_UNITS_PX`, `MAX_UNITS_CLEAR_PX` in `labels.ts` | `headerMaxPx` is new arithmetic over the same labels and must not restate their bounds |
| the `:not(tr)` focus-ring exemption in `app.css` | unchanged, and load-bearing for the pinned focused row |
| the `.scrollport` class walked by `focus-scroll.ts` | nothing joins it — the page scrolls the table, and making the body a scrollport would detach the sticky `thead` |
| `TABLE_ANCHOR_ID` and `#shoe-table`'s `scroll-margin-top` | unchanged; the skip link still lands on the anchor, not on a row |
| `parseOpen` in `urlstate.ts` | no cap added; the always-rendered rule inherits its ceiling |
| `recompute-budget.test.ts`'s per-drag counts | must stay fleet-size-independent |

---

# Build sheet

## File map

| File | Create / modify | For |
|---|---|---|
| `app/src/lib/virtual.ts` | create | `virtualPlan` and its types |
| `app/src/lib/virtual.test.ts` | create | the plan's bounds |
| `app/src/lib/row-height.ts` | create | the line-break simulation and both height models |
| `app/src/lib/row-height.test.ts` | create | derived heights against known names |
| `app/src/lib/fit.ts` | modify | `headerMaxPx`, `columnMaxPx`, `columnWidths` |
| `app/src/lib/fit.test.ts` | modify | the two-clause distribution, the no-slack case |
| `app/src/components/ShoeTable.svelte` | modify | `<colgroup>`, `table-layout: fixed`, the plan, scroll-to-index |
| `app/src/components/ShoeTableMobile.svelte` | modify | the plan, scroll-to-index |
| `app/src/components/ShoeTable.test.ts` | modify | plan rendering under the render-everything fallback |
| `app/src/components/ShoeTableMobile.test.ts` | modify | as above |
| `app/src/Page.svelte` | modify | pass the track width; `revealRow` becomes index-based |
| `app/src/Page.test.ts` | modify | the reveal path |
| `app/e2e/fit-support.ts` | modify | measure min-content with the override off |
| `app/e2e/smoke.spec.ts` | modify | no-overflow, derived-height, row constants |
| `app/e2e/cross-browser.spec.ts` | modify | the same in Firefox and WebKit |
| `docs/app.md` | modify | §Columns and sorting, §Table presentation, §Two renderings, and only one of them mounted, §What a drag may recompute |
| `BACKLOG.md` | modify | close item 4 and record what it left |

## Tasks

Each is a reviewer's gate: a deliverable, the evidence that proves it, and
where to read first.

1. **`headerMaxPx` and `columnMaxPx`.** Max-content per column, the sibling of
   the existing min-content arithmetic. Evidence: `fit.test.ts` against the
   e2e fixture; the engine's own max-content per column on the real fleet, via
   a `.hunt/` rig. Read `app/src/lib/fit.ts` and docs/app.md §Table presentation.
2. **`columnWidths`, the two-clause rule.** Including the case where no column
   wants any slack. Evidence: `fit.test.ts`, with the three-columns-of-figures
   case pinned by name. Read spec §Decisions.
3. **Declared widths in the desktop table.** `<colgroup>` and
   `table-layout: fixed`, no behaviour change yet. Evidence: the no-overflow
   bound in all three engines, and `fit-support.ts` measuring with the override
   off. This task must land green on its own — it is the prerequisite and it is
   independently defensible. Read docs/app.md §Columns and sorting.
4. **`nameLines` and `desktopRowPx`.** Evidence: `row-height.test.ts`, plus the
   derived-vs-rendered bound over the whole fleet in three engines. The
   `discontinued` chip is an inline nowrap token after the name and is part of
   the simulation. Read docs/app.md §Table presentation.
5. **`virtualPlan`.** Pure, no DOM. Evidence: `virtual.test.ts` covering the
   render-everything fallback, kept items above and below the window, and
   spacer arithmetic. Read spec §Interfaces.
6. **The desktop table renders a plan.** Spacer rows, `overflow-anchor: none`,
   `aria-rowcount` / `aria-rowindex`, and `revealRow` by index. Evidence: the
   existing expanded-row scroll e2e must pass unchanged in behaviour, rewritten
   only where it indexes rows by fleet position.
   Read docs/app.md §Table presentation and docs/app.md §View and URL ownership.
7. **The pinned focused row.** Evidence: an e2e that focuses a row, scrolls it
   far out of the window, and asserts focus is still on that row and Tab
   continues from it. Read docs/policies.md §Interaction chrome.
8. **`phoneShoePx` and the stacked list's plan.** The unit is a shoe, so the
   group emits intact. Evidence: the phone reveal e2e, the two-row focus ring,
   and the derived-height bound at 390px.
   Read docs/app.md §Two renderings, and only one of them mounted.
9. **Drag and scroll cost, recorded.** Evidence: a `.hunt/` rig reporting
   ms/frame before and after at 1440px and 390px, and the scroll-path cost the
   drag rigs do not exercise. Read docs/app.md §What a drag may recompute.
10. **Docs and backlog.** The owning sections above, and BACKLOG item 4 closed
    with what it left behind.

## Global constraints

- `table-layout: fixed` on the desktop table only; the phone is already fixed.
- The wash ranks over the whole filtered set, never the plan.
- `viewportPx <= 0` renders every item with no gaps.
- Spacer height is the summed height of exactly the items it replaces.
- `overflow-anchor: none` over the body.
- No new URL token, no new view state, no new `.scrollport`.
- No live network anywhere, including rigs.

## Sequencing notes

Task 3 is the gate: declared widths must be green in three engines before any
windowing exists, because everything after it assumes a column width that does
not move. Task 4 depends on 3 for the same reason — the derivation needs an
exact name-column width. Tasks 5 and 6 are separable from 8: the desktop can be
windowed and reviewed before the phone is, provided both land before the branch
does.
