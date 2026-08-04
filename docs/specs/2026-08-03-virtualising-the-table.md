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

## Why a real table at all — re-tested from first principles

Everything hard here follows from keeping semantic `<table>` markup: declared
column widths, a height model, spacer rows. The alternative is a CSS grid
carrying `role="table"`, which unlocks `content-visibility: auto` — the browser
skipping off-screen work for no virtualisation code at all, with rows still
focusable, tabbable and findable by Ctrl+F. That is the most attractive answer
to "the upstream data is not ours", because there is no model of ours to rot.

**It was measured and it loses.** Same synthetic 455×9 grid, same drag — every
cell's tint class rewritten sixty times — four renderings (`.hunt/grid-vs-table.mjs`):

| rendering | Chromium | Firefox |
|---|---|---|
| real table, every row | 5.17 ms/frame | 4.98 |
| **real table + spacer rows, ~30 rows in the DOM** | **0.43** | **0.40** |
| CSS grid, every row | 4.70 | 6.22 |
| grid + `content-visibility: auto` | 0.83 | **5.95** |

Two things settle it. **The browser-managed option optimises one engine** — 5.7×
in Chromium, about 4% in Firefox. And **it does not remove the height problem**:
`contain-intrinsic-size` is itself an estimate, and a wrong one made the
document 33,067px against a true 16,137px. Content-visibility is
estimate-and-correct implemented by the browser, not an escape from it — which
is the strategy whose users report scrollbar drift and mis-landed scrolls.

The windowed real table is fastest in **both** engines by an order of magnitude,
keeps the semantics, and — with heights measured rather than estimated — is
strictly more robust to data nobody here controls than an intrinsic-size guess.

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

**Heights are measured in bulk, never derived.** *Amended 2026-08-04, before
implementation — this originally specified a greedy line-break simulation over
`fit.ts`'s committed per-character tables, corrected by measurement on render.*
Investigation killed that: **line breaking is engine-dependent, so no
single-engine model can be right in three.** `Under Armour Charged Pursuit 3` is
two lines in Chromium and one in Firefox and WebKit at a 224px name column, and
Firefox implements UAX #14's numeric context where the others do not — the
model's word-splitter is 14.62px and 34.87px short of Firefox's own min-content
on `10-12` and `2024-2025`. There is no tolerance that repairs this, because the
thing being modelled genuinely has three answers.

So the app measures instead: **every name laid out in one hidden container at
the current name-column width, and the line counts read back.** Exact by
construction, in whatever engine is running, with no font table involved. What
remains true from the original reasoning is that one cell wraps and the others
cannot: every other cell is a nowrap phrase or an unbreakable mono figure, so a
row's height is a function of its name alone.

*Amended 2026-08-04, at implementation.* Two things this paragraph asserted
before the thing existed are wrong and were replaced by measurement, both
recorded in `app/src/lib/row-height.ts`, which owns both figures. **The cost came
in over the 2.0–2.3ms estimated here**, and it is the engine laying out 455 boxes
rather than anything reducible; it stays affordable on WHEN it is paid.
And **a line count is not a height**: a one-line row is not set by the name at
all, so there is no base and no line step to multiply by — the height is read off
a replica of the whole row, one per distinct line count.

*Amended 2026-08-04, at review.* Two more sentences here were wrong, both found
by measuring. **A line count is not what is read back either** — the name's own
box is. A count has to be turned back into a height by a rule about what a line
is worth, and that rule is face-dependent as well as engine-dependent, so a
two-line Japanese name counts as three in Firefox and over-reserves. A row is
now the taller of a measured floor — the row the table draws when the name is
not what sets it — and the name's box plus what the row adds to it; the replica
is two rows, one forced line and two, rather than one per distinct count. And
**nothing may be measured off a live node**: a row's open state is drawn with a
`transform`, a rect reports the transformed box, and a transform moves no
layout — so an expanded row rendered exactly as before while every name in the
fleet was laid out against a width 13px short. That is the plausible-but-wrong
answer the `null` contract exists to prevent, reached by the most ordinary
action there is, so every geometry now comes off a clone with that state
stripped before it is attached.

*Amended 2026-08-04, at review again.* **The width a name is laid out against is
not always the column either.** The block a name lands in is a flex item with
`min-width: auto`, so its automatic minimum size is its min-content width: a
name carrying one unbroken token wider than the column lays out in a block wider
than the cell, and the rest of the name then wraps against that wider box. About
28 unbroken characters is enough, hyphens do not count because every engine
breaks at them, and the error is a whole line in the over-reserving direction —
which the `null` contract cannot catch, because the function returns numbers.
The measured container now carries the same `min-width: min-content` the flex
item has. That was the last derived width in a file whose thesis is that derived
widths are wrong.

**The cache is keyed on width, and width is the fragile part — not row count.**
Anything that changes how a name breaks invalidates every measured height at
once: a resize, a browser zoom, a ticked column, and **the face swapping in
after first paint**, which this app does by self-hosting its own (docs/app.md
§Theming). The measurement therefore re-runs on `document.fonts` settling as
well as on a width change, or every height is the fallback face's. That is the
same hazard `Page.svelte` already documents for the pinned chrome's height,
which is `ResizeObserver`-backed for exactly this reason.

**It is affordable because of what it is keyed on.** The measurement is per
fleet per name-column width, and that width changes only when the viewport or
the column set changes — never when a filter moves. So a drag pays nothing and a
frame is a sum over measured integers, not a walk of the fleet's strings
(docs/app.md §What a drag may recompute). Canvas `measureText` was considered
and rejected: it is 14× sharper than the tables (0.62px worst, in Firefox) but
it answers width and not where a line may break, which is the half that
actually differs between engines.

**The width model keeps its tables, and gets three guards.** Widths must be
answerable *before* the table mounts, which is the one thing bulk measurement
cannot do, so `fit.ts` stays as it is — its errors are sub-pixel and land in the
`--s2` padding each cell already carries. But the same investigation found three
places where that is not enough, each of which is a dataset nobody here controls
rather than a rounding error:

- **The model never models a browser's break rules; it over-reserves.** First
  written as "implement UAX #14's numeric context", which delivery proved wrong:
  Firefox refuses to break after *any* hyphen followed by a digit, `-<digits>`
  is upstream's remethod convention with five such slugs already in the
  catalogue, and the model came out 17.30px **narrow** — the clipping direction.
  Chasing a browser's line-breaking is the same losing game this spec already
  abandoned for row heights. So a hyphen is never a break opportunity and the
  widest whitespace-delimited token is the answer.

  **That is an upper bound only if the split is on genuine break
  opportunities**, which is where it was got wrong a second time: JS `\s`
  matches U+00A0, U+2007, U+202F and U+FEFF, whose purpose is to *forbid* a
  break, so splitting there put the model **193.47px narrow** on a real
  catalogue label. `data/shoes.json` already carries 302 U+00A0 and 77 U+FEFF in
  prose fields.

  **And a third time, which is the one worth remembering.** The obvious repair —
  HTML's ASCII whitespace, what `white-space: normal` collapses — is *also*
  narrow: Chromium and WebKit offer no break at U+000C, and WebKit none at a
  lone U+000D, for −247.58px, −182.65px and −155.78px on a real catalogue label.
  These strings arrive as JS text nodes, so the parser's newline normalisation
  never runs on them, and JSON turns `\f` and `\r` into the real control
  characters. So the separator set is **space, tab and line feed**, and it is
  closed **by measurement in three engines rather than by any definition of
  whitespace**. Three attempts to name this set from a standard were all wrong;
  the measurement was right first time.

  The model can then only come out wide, **except where a break adds ink no
  token carries** — and the two mechanisms belong to different engines, which this
  paragraph first got wrong in both directions. **Firefox** draws the hyphen at a
  U+00AD, 6.42px at the name face and the worst reading taken anywhere; it needs
  no separator in the string at all, so it is the soft hyphen's property rather
  than the split's. **Chromium** keeps a space's advance under a combining mark,
  at 4.08px. Each is bounded by one glyph on one line however long the string and
  neither accumulates, so it lands in the cell's own padding; that is the
  difference from the `\s` defect, which grew with the string. **4.08px is
  nevertheless outside `FIT_TOLERANCE_PX`** — reachable only by a string written
  to reach it, since nothing upstream publishes either character in a name or a
  label, but outside the tolerance rather than inside it.

  The price is paid entirely by raw-slug headers. One rendered label carries an
  intra-word hyphen — `Hi-vis`, 29.56px against the phone's 48px bound and one
  line either way — and it is the only one across every catalogue name, the
  hand-written names, the derived score labels and every `SHORT_LABELS` value, so
  no real view and no mount boundary moves. The bound is **not** the worst slug in
  today's catalogue: `urlstate.ts` accepts 64 characters, and over every chunking
  that length admits the worst models a 762px header against the 71px an engine
  that breaks at hyphens needs — **691px of over-reservation**, whose one home is
  `app/e2e/fit-support.ts` for the witness slug and the arithmetic, and whose pin
  is `app/src/lib/fit.test.ts`, where either input moving reddens the build rather
  than restating a new truth. A
  dropped slug is already a degraded rendering, so the remedy is to render one
  breakable and model it that way rather than to reason about break rules again;
  that lands with the declared widths, because model and render have to agree.
- The name column's floor is **the fleet's longest unbreakable token**, not a
  bare `14rem`. A 34-character single token measures 223.7–231px and crosses
  224px; under declared widths that is an overflowing cell rather than a
  widening column.
- "Every figure column is header-bound" is **a margin, not a law**. It
  reproduces to the pixel today, but `Width / Fit` has only 8.47px of it — one
  more rendered character flips the column cell-bound — so it is asserted with
  its margin rather than stated as structure.

An unseen character is safe without a guard: `FALLBACK_PX` is 15px, the maximum
across all three tables, so unknown input makes the model pessimistic. Emoji
(3.0–3.36px short each) and kana (0.37px) are the exceptions, bounded per
character and unbounded only in count.

## Bounds

Each names where the assertion lives. The three marked *measured at
implementation* have no honest value until the thing exists.

| Bound | Home |
|---|---|
| No cell's content exceeds its declared column by more than the model's cross-engine spread, over every column and every mounting width, in all three engines. The spread is *measured at implementation* (~0.8px at the readings taken so far) and must be justified against the cell padding that absorbs it, never asserted as a bare number | `app/e2e/cross-browser.spec.ts`, `app/e2e/smoke.spec.ts` |
| The model's min-content still agrees with the engine's, measured with the override off, within `FIT_TOLERANCE_PX` | `app/e2e/fit-support.ts` (unchanged claim, new measurement path) |
| Bulk-measured row heights equal the heights the table renders, for every shoe in the fleet, three engines | `app/e2e/cross-browser.spec.ts` |
| The bulk measurement is paid per name-column change rather than per filter change | `app/e2e/smoke.spec.ts` asserts the load-bearing half without timing anything — a filter moves no declared width, so the cache key does not move. The **milliseconds are a rig reading, not an assertion**: the e2e fixture is five shoes, so a cost measured there would be a cost for five names, and a wall-clock bound on CI hardware is a flake rather than a guard. `.hunt/task4/rig.ts` measures it on the committed fleet in three engines and `app/src/lib/row-height.ts` owns the figures — restating them here is how they go stale, so this row points and does not quote. It came in **over the 5ms this row asked for**, and the paragraph above says why that is the wrong thing to hold it to |
| The model is never narrower than any engine's own min-content — the over-reserve rule's whole justification. Held for **raw-slug headers**, in three engines. Over every catalogue label and every name in the fleet it is a **rig reading rather than an assertion**: no committed suite quantifies over either, `fit.test.ts` having no engine in it and `FIT_SETS` running on the five-shoe e2e fixture | `app/e2e/fit-support.ts` (`FIT_DROPPED_COLS`, three engines); the fleet-wide half is unheld, and its sweep is gitignored |
| What that over-reservation costs at the worst slug a link can name — pinned against both of its inputs, so a longer `MAX_SLUG_LEN` or a regenerated `HEADER_PX` reddens rather than silently restating it | `app/src/lib/fit.test.ts`; the figure and its derivation live in `app/e2e/fit-support.ts` |
| The word split happens on break opportunities only — never on non-breaking whitespace | `app/src/lib/labels.test.ts` |
| The name column's floor clears the fleet's longest unbreakable token | `app/src/lib/fit.test.ts` |
| Every figure column's header exceeds its widest cell, and by how much — the margin is the assertion, not the ordering | `app/src/lib/fit.test.ts` |
| The plan reaches the DOM as a window: spacers standing for exactly the shoes left out and out of the accessibility tree, the fleet's own row numbers on rows the DOM no longer counts, a focused row and a revealed row kept wherever the fleet has scrolled to, a declined measurement holding the last one, and a shoe's tint the same at every scroll position. **Added at the task-6 fix**, because nothing committed had ever run against a windowed body — the e2e fixture cannot window at any viewport and jsdom lays nothing out, so ten mutations at this seam survived the whole suite | `app/e2e/virtual.spec.ts` on a fleet routed for that file alone, and `app/src/components/ShoeTable.test.ts` §windows the body for the half jsdom reaches with the row measurement stubbed |
| With no measured viewport, every item renders and no spacer is emitted | `app/src/lib/virtual.test.ts` |
| A focused row and an open row are in the plan at any scroll position | `app/src/lib/virtual.test.ts` |
| Spacer height equals the summed height of exactly the items it stands for | `app/src/lib/virtual.test.ts` |
| Per-drag fleet-wide pass counts stay independent of fleet size | `app/src/recompute-budget.test.ts` (existing, must not regress) |
| ~~Desktop row base and line step, in px~~ — **withdrawn at implementation: there is no such pair.** A row is 36px at one line and 53 at two, and every line after that adds 18, so the first step is not the step: one line is set by the rest of the row rather than by the name. Any base-and-step constant is therefore wrong at 445 of the fleet's 455 rows. A height is the taller of a measured floor and the name's own measured box instead, and the bound above holds it | `app/e2e/fit-support.ts` |
| Phone shoe base and line step, in px | *measured at implementation*; `app/e2e/smoke.spec.ts` |
| Overscan, in px | **1,280 at each end**, asserted as behaviour in `virtual.test.ts` over a fleet of 1px shoes, so a rendered index is a distance rather than a row count — and written there as **its own px figure rather than in terms of `OVERSCAN_PX`**, which is what makes it a bound at all: the first shape of the assertion was in the constant's own terms, so 1280 → 640 left the suite green. `app/src/lib/virtual.ts` owns the number and its derivation, which is the one thing worth carrying here: the plan is applied in the SAME FRAME as the scroll in every engine and gesture a rig can drive, so this is a stall budget rather than a catch-up distance, and it covers wheel and scrollbar work only — a keyed jump *and* a held Page Down outrun it and are repaired by the next frame's plan rather than covered (`.hunt/task6/overscan.ts`) |

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

// app/src/lib/row-height.ts — DOM, no Svelte. Delivered shape, task 4.
// Bulk rather than per name: the measurement is one layout of the whole fleet, so a per-name
// signature would be one layout per name. Import-free by construction, so `page.evaluate` can be
// handed the function itself and the three-engine bound is about this code.
export interface NameEntry { readonly name: string; readonly discontinued: boolean }
export function measureDesktopRowHeights(names: readonly NameEntry[]): number[] | null;
export interface RowHeights {
  heights(names: readonly NameEntry[]): number[] | null;   // null: cannot measure, render everything
  destroy(): void;
}
export function createRowHeights(
  onInvalidate: () => void, measure?: typeof measureDesktopRowHeights,
): RowHeights;    // `measure` is the seam the cache's own rules are tested through

// Task 8's, unbuilt: the phone's ident cell wraps the name AND the metadata run, which varies with
// the column set, so it is a different measurement and gets its own evidence.
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
needs 84px against 17px of cells, `msrpGbp`'s 45px against 26px. *Amended
during delivery, twice:* the cell-bound columns are **four** phrase columns, not
three — `heel-tab` was missed, and at **−87.00px** it is the widest excursion in
the table, so a tolerance measured without it would have been measured against
everything but the worst case. And two heel story scores are cell-bound as well,
by 3.26px, safely, because `SCORE_CELL_CHARS` over-reserves by declaration. The
margin is now asserted per column with its size rather than as an ordering: the
tightest is `size-rating` at 5.16px, not `Width / Fit` at 8.45px as this section
first claimed, and with one mono advance at 8.71px **two** columns sit within a
single character of flipping. So a sub-pixel shortfall puts a header's longest
word, or a phrase, that far past its box, into the `--s2` padding the cell
already carries on each side. The excursion is bounded by the model's
cross-engine spread and absorbed an order of magnitude over: nothing clips,
nothing wraps differently, nothing shifts.

**So the no-overflow bound is a tolerance, and the tolerance has to be a bound
over every column at every mounting width** — not an exception for the column
that happened to surface it. Task 3 measures it. The case to check hardest is
the **four** cell-bound phrase columns above, where the thing leaving the box is
a runner's data rather than a header we authored.

The max-content half is new arithmetic but can only misplace a distribution
boundary; nothing clips from it.

**A height model that is wrong drifts the scrollbar, then heals.** Measurement
on render replaces the derived value, so error is bounded by how far the runner
has not yet scrolled.

*Amended 2026-08-04, at task 6.* **That sentence is what made two real defects
invisible for two tasks, and neither of them heals.** Both are about *when* the
measurement is taken rather than about what it computes, both put plausible
numbers on screen rather than a `null`, and both were only reachable once a
spacer was sized from the result — task 4's own sweep measures the function, not
the app's call of it, so both were green throughout.

**The `<colgroup>` can be a flush behind the model.** The cache keys on the width
read back off the DOM, which is right — the names are laid out inside the live
cell, so the answer has to be filed under the width that cell was laid out at.
But the effect that measures ran with the model already at 372.76px and the
`<col>` still at 240px: every name was laid out 133px narrow, the answer was
filed under `240px` correctly, and nothing asked again, because the model's width
never moved after that. Measured on the real fleet: a table 19,634px tall against
the 16,623px it renders, in **every** engine, healed only where an unrelated
`loadingdone` happened to fire afterwards. The measurement is now taken after a
`tick`.

**And a face swap cannot be listened for.** WebKit dispatches `loading` and then
nothing — no `loadingdone`, no `loadingerror`, `document.fonts.status` reading
`loaded` all the same — so the subscription this spec relied on is silent in one
of the three engines. The prototype's own name block is now part of the cache key
and is watched for a change of width, which is the same fact in every engine.

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
- **`content-visibility: auto`, the browser-managed alternative.** It would keep
  every row focusable, tabbable and findable by Ctrl+F for no code at all, and
  it is Baseline. It does not apply to `tr` or `tbody` in Chromium or Firefox,
  because containment does not apply to internal table elements — this is not a
  support gap and will not arrive. Proven with a discriminating test, because an
  earlier attempt was not one: asked with the `auto` keyword the engine may
  reuse a remembered size, so nothing moves whether or not it applied. Asked
  with a **fixed** `contain-intrinsic-size: 500px` the document stays at
  16,940px where containment would have made it about 228,000px, `tbody` has
  the value coerced to `visible` outright, and the control — the same
  declaration on `.tblwrap`, a plain `div` — collapses the document to 1,057px
  in both engines. Anyone reopening this should re-run `.hunt/cv-retest.mjs`
  rather than reason about support tables.

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
| `FIT_SETS`, `FIT_TOLERANCE_PX` in `app/e2e/fit-support.ts` | **Paid in part by task 3, and the remainder is owed to nothing.** The no-overflow bound is held in three engines over all four sets and `FIT_DROPPED_COLS`, and `measureFit` measures min-content with the override off, so the model-versus-engine claim survives declared widths. The **max-content half has no engine check and needs none**: every declared width is `min + share`, so max-content can only move where slack lands and can never put ink outside a box — §Failure behaviour argues it and the no-overflow bound measures the consequence directly. Asserting it would be checking a thing that cannot fail, which is worse than not asserting it. This row was a promise for three tasks; it is now a fact with a stated exception rather than a silent one. **Third consuming file as of task 3b**: `app/src/lib/fit.test.ts` imports `FIT_SETS` and pins `phrases` against the committed fleet, so the array carries a second kind of claim — an edit to it answers to the unit suite as well as to the three engines |
| `SCORE_COLUMN_KEYS`, `SCORE_CELL_CHARS` in `fit.ts` | `columnMaxPx` must answer for score columns, which have no cells in the dataset |
| `PLATE_LABELS` (`categorical.ts`) | feeds `cellMaxPx`, and therefore feeds `columnMaxPx` |
| `MAX_LABEL_PX`, `MAX_UNITS_PX`, `MAX_UNITS_CLEAR_PX` in `labels.ts` | `headerMaxPx` is new arithmetic over the same labels and must not restate their bounds |
| the `:not(tr)` focus-ring exemption in `app.css` | unchanged, and load-bearing for the pinned focused row |
| the `.scrollport` class walked by `focus-scroll.ts` | nothing joins it — the page scrolls the table, and making the body a scrollport would detach the sticky `thead` |
| `TABLE_ANCHOR_ID` and `#shoe-table`'s `scroll-margin-top` | unchanged; the skip link still lands on the anchor, not on a row |
| `parseOpen` in `urlstate.ts` | no cap added; the always-rendered rule inherits its ceiling |
| `wordsOf` in `labels.ts` | the one home for where a string may break; four consumers across two files, and every one of them must want the conservative rule |
| `FIT_DROPPED_COLS` in `app/e2e/fit-support.ts` | the raw-slug headers held to three engines. **Two claims, and only one of them is separate.** The min-content claim is one-sided where `FIT_SETS` carries a ±4px tolerance, which is why the array stands apart. The no-overflow claim is not separate at all: as of task 3 both names are passed to `sweepDeclaredColumns` and get an identical assertion, so a guard added to that sweep reaches the slug headers too and one added to only one caller is a bug |
| `FIT_OVERFLOW_PX` and `measureExcursions` in `app/e2e/fit-support.ts` | **Paid in full at task 6, both ways the row asked for.** `sweepDeclaredColumns` now asserts its own population — the rows in the DOM against the row model's own count — so a fixture or an overscan that started windowing the sweep reddens rather than quietly guarding less, and `measureExcursions`'s docblock says what the bound quantifies over. The fleet-wide half is `.hunt/task6/no-overflow.ts`, which scrolls the window across all 455 shoes in five column sets and three engines: **455 of 455 distinct shoes seen per set**, worst excursion 0.61px, against `FIT_OVERFLOW_PX` of 2. What follows was the promise. **Owed by tasks 4–6.** `measureExcursions` walks `thead th, tbody tr.shoe > *` — the rows in the DOM. Today that is the whole fleet, so "no cell's ink leaves its column" quantifies over every shoe. **Windowing the body silently narrows it to a windowful**, with no assertion failing and nothing in the bound to say its population changed: the widest cell in a column would simply stop being measured. Whoever lands the window either measures excursions with the window scrolled across the fleet, or states in the sweep's docblock what the bound now quantifies over. `FIT_OVERFLOW_PX`'s own size is justified against `--s2` where it is declared and does not move with this |
| the slug length `urlstate.ts` accepts | bounds the worst raw-slug header the model can be asked for, and therefore the over-reserve's true ceiling |
| `measureDesktopRowHeights` in `app/src/lib/row-height.ts` | **Paid at task 6 by moving the prototypes out of the plan entirely**: `ShoeTable.svelte` renders a permanent hidden one-row prototype table carrying a `DiscontinuedTag`, and nothing is cloned from a row the window can remove — so the loop this row warned about has no first step. `names` is the whole fleet, built from `data` and therefore one array for the life of the dataset, so the identity cache hits on every filter change. What follows was the warning. **Quantifies over the whole fleet but reads the DOM for its prototypes, and tasks 5-6 change what is in the DOM.** It clones a live `tr.shoe` for the replica and copies a discontinued chip's markup from a rendered instance, because both carry Svelte-scoped classes that cannot be reconstructed. Windowing the body means the window may contain **no discontinued row**, and then there is no chip to copy: the function returns `null` — cannot measure — rather than a set of heights short by a chip, and the caller renders everything, which puts an instance back on the page and heals it. That is correct but it is a loop, so whoever lands the window must check it settles rather than alternating. The same applies to the row clone itself: with an empty window there is no row to clone at all. **The prototype is the FIRST `tr.shoe` in the DOM**, so under a window it is whichever row you have scrolled to rather than the first in the fleet — which is what made an expanded row's rotated chevron a live wrong answer, and windowing makes "is the prototype expanded" a far likelier state than it was. And `heights()` compares `names` by **identity**, so a caller that windows the filtered list and passes a per-render `map` misses the cache every time and pays the whole measurement per keystroke |
| `renderedForNames` and `sweepRowHeights` in `app/e2e/fit-support.ts` | **The EVIDENCE narrows the same way the code does, and this is the row for it.** Ground truth is read from prototype rows found with `rows.find(…)` over `tbody tr.shoe`, so what the sweep quantifies over is whatever is in the DOM. A missing prototype now throws rather than skipping — losing the discontinued one silently dropped the chipped half of the bound while every assertion over the combined array still passed — but a windowed body would hand the sweep a different population without saying so, exactly as `FIT_OVERFLOW_PX` above. **And what the sweep waits for is the SHARING, not the sum**: the declared widths always sum to the track, so a redistribution — the sidebar becoming permanent, a windowed body tomorrow — satisfies a sum guard in both states and lands a re-layout between the half that reads ground truth and the half that measures. `settledDeclared` waits per animation FRAME, inside the page, until the widths have agreed column by column for a wall-clock window, and `compare` fails by name if they move under it — both halves of it now, the fixture heights having sat above that guard. **It is the suite's one wait over geometry**: the same sum stood as a wait in `smoke.spec.ts`'s filter test until that too was routed here, and the cheap version of the frame settle — two consecutive frames, ~12ms against ~110 — is measurably worse than either, settling on the previous sharing 10 times out of 10 in both engines against a redistribution deferred by 60ms |
| `recompute-budget.test.ts`'s per-drag counts | must stay fleet-size-independent |

---

# Build sheet

## File map

| File | Create / modify | For |
|---|---|---|
| `app/src/lib/virtual.ts` | create | `virtualPlan` and its types |
| `app/src/lib/virtual.test.ts` | create | the plan's bounds |
| `app/src/lib/row-height.ts` | create | the bulk measurement and its invalidation — no simulation, no derivation |
| `app/src/lib/row-height.test.ts` | create | the cache's rules and the cannot-measure answer; the heights themselves are a browser fact and live in the e2e |
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
3b. **The three width guards.** The over-reserve rule in `wordsOf` — split on break opportunities, never on "whitespace", never at a hyphen; the
   name column floored at the fleet's longest unbreakable token; the
   header-exceeds-cell margin asserted with its size. Evidence: `fit.test.ts`,
   plus a three-engine check that a slug-named column's header does not
   overflow. Read spec §Decisions' width-guards paragraph. Independent of
   task 3 and may land before it.
4. **Bulk height measurement.** One hidden container per name-column width,
   each name's own box read back; no font table, no derivation. The `discontinued` chip
   is an inline nowrap token after the name and is part of what gets laid out.
   Evidence: the measured-equals-rendered bound over the whole fleet in three
   engines, and the cost bound. Not unit-testable under jsdom, which lays
   nothing out — its test is the browser's. Read docs/app.md §Table presentation.
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
