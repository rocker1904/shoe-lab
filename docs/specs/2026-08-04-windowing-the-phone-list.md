# Windowing the stacked phone list

*2026-08-04 · the deferred half of docs/specs/2026-08-03-virtualising-the-table.md,
split out when the desktop half was delivered on its own · status: **delivered
2026-08-05** — approved explicitly for execution on 2026-08-05.*

The desktop table now renders a windowed plan. `ShoeTableMobile` still puts every
visible shoe in the DOM — 1,364 `<tr>` for 455 shoes, since a shoe there is a
name row, a values row and a rule row between. This does to it what the desktop
half already had done, reusing everything that was built to be reusable.

**Read the desktop spec first.** Every decision it records applies here unless
this one says otherwise, and the corrections it carries — every one of
them marked *Amended*, and they are most of what the delivery learned — are the
load-bearing parts.

## Why this was deferred rather than dropped, honestly

The original argument was that the phone is the *worse* case: 26.1ms a frame at
390px against the desktop's 20.9, on desktop silicon. **That figure is stale and
the argument no longer holds.** It was measured before the wash ramp was
quantised; afterwards the same unchanged probe read **12.7ms phone against 13.0
desktop**. The phone is now the ordinary case, not the urgent one.

What survives is the DOM: 1,364 rows and 9,433 nodes against a 29,125px
document, on the hardware least able to carry it. That is worth removing. It is
not worth rushing, and this spec should be read knowing the deadline it was
written under no longer exists.

**The baseline, measured the way the desktop half was measured rather than
quoted from it.** `.hunt/task9/cost.ts` at 390×900 on the real fleet, three runs
an engine, before and after the desktop change so the reading is known to be
about this rendering and not about that one: a drag step is **7.3–7.4ms** median
in Chromium and **10–11ms** in Firefox, worst step 26.0–27.7 and 51–57; a scroll
frame is **0.0ms**, because nothing happens on one. The same rig at 1440px, and
what the desktop's plan cost and bought, is docs/app.md §Table presentation.
Read these as the floor a windowed list has to beat and as the shape of the
instrument, never as a target: the run-to-run spread on one quiet machine is a
tenth of the median and a fifth of the worst step, which is the whole reason the
desktop half asserts a row count and records the milliseconds.

**Know in advance which half of that a window can take, because it is not all of
it.** A parked experiment held the phone's rows still while the filter drawer was
open — the same rows, unchanged, for a whole drag — and measured what that did
and did not buy. Style recalculation and layout fell to about a tenth and the DOM
writes went with them; **script barely moved**. The filter pass, the sort, and one
ranking per rendered column all recompute every frame *whatever the table
renders*, because `setView` replaces the whole `ViewState` and every update
clones its column list, so no `$derived` over the columns can hold
(docs/app.md §What a drag may recompute).

Windowing removes the same half that experiment removed — the paint — and leaves
the same half standing. So the figure to predict against is not the drag total
but its paint share, and the ranking is fleet-wide by necessity rather than by
oversight: the wash must rank over every filtered shoe or a tint would mean
something different at each scroll position. If the remainder still matters after
this lands, the thing to attack is the cloned column list, not the window.

## What is already built for this

The desktop delivery deliberately cut the seams rather than leaving a
phone-shaped hole. Confirmed by reading, not assumed:

- **`app/src/lib/virtual.ts` is rendering-agnostic.** `virtualPlan` takes items
  of `{ key, height }` and knows nothing about tables. Its comments name desktop
  specifics as *examples of what a caller owes it*; this spec's implementer
  should read them as obligations, not as facts about the other rendering.
- **`createRowHeights(onInvalidate, measure)` takes the measurement as a
  parameter**, defaulting to the desktop's. Everything hard about it is generic:
  the cache and its key, what invalidates it, the `loadingdone` subscription, and
  the width-ruler that exists because **WebKit dispatches no `loadingdone` at
  all**. The phone supplies a `measure` and inherits the rest.
- **`revealRow(index)` already speaks in fleet positions on both renderings**,
  so `Page.svelte` does not need to know which is mounted. `ShoeTableMobile`
  takes the index today and resolves it directly, because it is not yet
  windowed. **Its half of that signature change is untested, and this spec owns
  the gap**: `ShoeTableMobile.test.ts` has no reveal case at all, and
  `Page.test.ts`'s popstate-scroll block pins `innerWidth` at 1400, so only the
  desktop path is exercised end to end. An index/slug confusion on the phone
  would redden nothing today. Three lines with a null guard close it, and they
  belong with the rewrite rather than before it.

## What the phone still needs, and where it genuinely differs

**The item is a shoe, and a shoe is a group of rows.** Two rows always — the
name row and the values row — plus a rule row between shoes, plus a panel row
when open. The desktop's item is one row plus a panel. So the plan's `item`
entry expands to a group here, and the group must emit intact: the focus ring
spans the name row and the values row through an adjacent-sibling selector
(`tr.shoe:focus-visible + tr.values`), and `revealRow` walks two siblings to
find the panel. Splitting a group is the failure mode to design against.

**The height is not a function of the name alone.** The desktop's row height is
set by how many lines the name takes, and nothing else in the row can wrap. The
phone's ident cell carries the name, the discontinued chip, *and* the metadata
run — the release date, the plate, and every categorical reading, each of which
appears or not depending on the ticked columns.
See docs/app.md §Categorical columns. So the measured input is the whole cell's
content at the current column set, not a name at a width.

Whether the desktop's technique survives that — laying the strings out in one
hidden container and reading line counts back — **is the first thing to
establish, and it is not assumed here.** Measured at 390px the per-shoe height
takes only two values, 60px and 76px, which suggests it will; two values is what
one wrapping line looks like. Prove it before building on it.

**No column-width work at all.** `ShoeTableMobile` is already
`table-layout: fixed` with its own `min-width` arithmetic, so none of the
declared-width apparatus applies.
See docs/app.md §Two renderings, and only one of them mounted.

**Its spacers are harder than the desktop's.** That table has
`border-spacing: 0`; this one has `2px 0`, a four-layer box-shadow lid on the
sticky header, and `overflow-y: clip` on the panel. A spacer row must reset its
cell's padding and borders — the desktop's rendered **17px taller than asked**
until it did — and here it must also not disturb the shadow stack or the
`colspan` geometry.

## Requirements carried from the desktop delivery

Each of these cost a review round to find there. They are not optional and they
are not re-derivable cheaply.

1. **The measurement prototype lives outside the plan.** A window can remove any
   row, so a measurement that clones a live row oscillates: no row → decline →
   render everything → row → measure → window → no row. The desktop renders a
   permanent hidden prototype table. Do the same, and **demonstrate convergence
   rather than assume it**.
2. **Pass the fleet as one referentially stable array.** The cache compares by
   identity; a per-render `.map()` misses on every call and re-measures the
   whole fleet per keystroke.
3. **Hold the previous plan when a measurement declines**, rather than falling
   back to rendering everything — the fallback alternates without limit whenever
   the cache misses every pass, which a resize drag does by construction.
4. **A spacer resets its cell's padding and border**, or every one of them
   stands taller than its `px`.
5. **Anything that waits on the table having settled waits on the *sharing*,
   never on a sum.** Four assertions on the desktop branch were bitten by an
   aggregate that survives a redistribution; a windowed body redistributes
   without changing the total.
6. **`aria-rowcount` and `aria-rowindex` carry the real positions, and spacers
   are absent from the accessibility tree** — otherwise the accessibility case
   for keeping a real table partly defeats itself.
7. **`overflow-anchor: none` over the body.** Both engines re-anchor when
   content is added or removed above the viewport, which is what this does every
   scroll frame.
8. **The focused row is pinned.** Unmounting the row that holds focus drops
   `activeElement` to `<body>` and the next Tab restarts from the top of the
   document (docs/policies.md §Interaction chrome). Here that means pinning the
   *group*.
9. **Open rows are always rendered.** A phone panel is 1,595–1,768px, so
   estimating one is the worst estimate available.
10. **The wash ranks over the whole filtered set, never the plan.** A wash ranked
    over what is on screen would mean something different at every scroll
    position.

## The test lesson, which is the most expensive thing the desktop half learned

**A guard that cannot window is not a guard.** The desktop's e2e fixture is five
shoes — about 180px against 1,280px of overscan at each end — so *no viewport
and no arrangement of open panels could window it*. Every committed assertion
passed because windowing never happened, and **ten mutations at the plan/DOM
seam survived the entire suite**, including spacers escaping the accessibility
tree, the focused row being dropped, and the wash ranking over the plan.

The remedy that worked: a spec routing a larger fleet through the suite's own
`page.route` idiom, leaving every other file's counts untouched, plus a `vi.mock`
of the measurement module so jsdom can window without fabricating geometry. It
cost roughly 70 lines and 0.4s of wall clock.

**So: before claiming this rendering is guarded, mutate the seam and report what
survives.** Of the twelve mutations in the desktop half's formal set — found by
reviewers rather than by implementers — ten are caught, and the two that are not
are *recorded as unheld* rather than left looking guarded. It is not the count
that transfers, and the set was not complete: more survivors turned up outside it
in every round that went looking, the last of them at whole-branch review.

Three specifics from that work transfer directly, and each was expensive.

**A test file with several tests masks its own flake.** A snapshot taken before
an opened panel's `ResizeObserver` re-cut the plan failed 4 times in 8 isolated
runs — and passed every time under the parallel suite, because the other tests
*are* the masking load. The honest repro was one test, one worker: 7 failures in
10 with the guard removed, 10 passes with it. Thirty runs across three conditions
is what made the mode **known absent** rather than merely unobserved. The phone's
panels are 1,595–1,768px, so its re-cut is larger and this shape is likelier
here, not less.

**Some claims cannot be held by the obvious assertion.** Omitting an open shoe's
panel height from its item height moves the desktop window about 370px per panel
— but it cannot be caught by comparing body heights, because an open shoe is
always rendered and so its modelled height never enters a spacer. What moves is
*which rows the window selects*. The assertion that works is what a runner would
see: sample down the middle of the table with panels open above, and require
every point to land on a shoe row rather than a spacer. Reach for that framing
here too — the phone's panels are twice the size, so the displacement is worse.

**The rendering swap is this spec's own hazard.** The render-everything fallback
is reachable whenever the table mounts fresh at a scroll position, which is
exactly what a desktop↔phone swap does. Constructed from the desktop side: at
390px scrolled to 12,000 and resized to 1440px, a broken fallback selects
nothing, the document collapses and `scrollY` clamps to **0** — the runner is
thrown back to the top of the fleet. That direction is now guarded there by
*keeps the runner where they were when the rendering swaps under them*. **This
spec owns the other direction**, and nothing guards it yet.

One correction to inherit rather than repeat: an early requirement said a gap
must be keyed by the run it stands for, because an array position would make
Svelte reuse the wrong node. **That was over-specified and its reason was
false** — measured, the two render byte-identical bodies across 27 DOM states,
and the run index is if anything the *less* stable identity. The only real
requirement is that a gap key is namespaced away from slugs.

## Bounds

Every one is *measured at implementation*; none is inherited, because the
phone's geometry is its own.

| Bound | Home |
|---|---|
| Measured group heights equal what the list renders, every shoe, three engines | `app/e2e/cross-browser.spec.ts` |
| The measurement's cost, and that it is paid per column-set change rather than per filter change | `app/e2e/smoke.spec.ts` |
| A group is never split across a plan boundary | `app/src/components/ShoeTableMobile.test.ts` |
| A focused group and an open group are in the plan at any scroll position | e2e, three engines |
| Spacer height equals the summed height of exactly the groups it stands for | `app/src/components/ShoeTableMobile.test.ts` |
| Overscan, in px — touch scrolling is not wheel scrolling and the desktop's 1,280px is not inherited | `app/src/lib/virtual.ts` |
| Drag and scroll cost at 390px on the real fleet, before and after | recorded in docs/app.md §What a drag may recompute |

## Non-goals

- **Any change to the desktop rendering.** It is landed and windowed.
- **Any change to which rendering mounts.** `fit.ts`'s boundary, the 700px floor
  and the six-column default are untouched.
- **Find-in-page.** Out by the same decision the desktop half took.
- **A cap on the open set.**

## Policies cited

- docs/policies.md §Compatibility floor — three engines and 360px of layout.
- docs/policies.md §Interaction chrome — focus is moved deliberately, never
  dropped.
- docs/policies.md §State ownership and validation — no view state, no URL
  token; scroll position is the browser's.
- docs/policies.md §Vocabulary — one home per name; the measurement and the plan
  are shared with the desktop rather than copied.

## Registry sweep

| Registry | Owed |
|---|---|
| `virtualPlan` in `app/src/lib/virtual.ts` | gains a second caller; its caller-obligation comments must stop reading as desktop facts |
| `createRowHeights` in `app/src/lib/row-height.ts` | gains a second `measure`; the cache key must answer for a column set as well as a width |
| `measureExcursions` / `FIT_OVERFLOW_PX` | walks only rows in the DOM — it narrows silently under a window and does not fail |
| `revealRow` on both renderings | already index-based; the phone's must survive a group outside the window |
| the e2e fixture | five shoes cannot window; a larger fleet is routed for the windowing spec alone |
| `SHORT_LABELS` and the metadata run | feed the measured cell content, so a vocabulary change moves a height |

---

# Build sheet

## File map

| Task | Create / modify | For |
|---|---|---|
| 1 | `app/src/lib/row-height.ts`, `app/src/lib/row-height.test.ts`, `app/src/components/ShoeTableMobile.svelte` | measure one stable fleet of complete phone groups at the current column set and make the shared cache accept a rendering-specific layout key and face ruler |
| 2 | `app/src/components/ShoeTableMobile.svelte`, `app/src/components/ShoeTableMobile.test.ts`, `app/src/lib/virtual.ts` | render the mobile body from `virtualPlan`, with intact groups, exact spacers, panel heights, pinned focus/open/reveal groups and real ARIA positions |
| 3 | `app/e2e/virtual.spec.ts`, `app/e2e/fit-support.ts`, `app/e2e/smoke.spec.ts`, `app/e2e/cross-browser.spec.ts`, `app/src/Page.test.ts`, `docs/app.md`, `BACKLOG.md` | route a fleet that can window, hold the mobile seam in three engines, measure the real fleet, and close the delivered backlog item |

## Interfaces

- `PhoneHeightEntry` carries `name`, the ordered metadata strings and
  `discontinued`; `measurePhoneGroupHeights(entries)` returns each closed
  shoe group's full height in fleet order, including its inter-shoe rule where
  that group owns one, or `null` when the permanent prototype cannot be
  measured.
- `createRowHeights(onInvalidate, measure, environment)` keeps its existing
  desktop defaults. A non-default environment supplies the rendered layout key
  and the face-ruler element whose resize invalidates a cached answer.
- `ShoeTableMobile.revealRow(index)` pins `shoes[index]` before querying the
  DOM, matching the desktop component's fleet-position contract.

## Tasks

1. **Measure phone groups.** Establish the exact group geometry in the real
   table, then implement the stable fleet/column-set input and shared cache
   environment. Evidence: cache unit tests plus measured-versus-rendered
   readings at 390px before any plan consumes them. Read §What the phone still
   needs and docs/app.md §Categorical columns.
2. **Render the plan.** Add the permanent prototype and plan seam, with group
   ownership of rule rows, measured open-panel heights, namespaced spacers,
   `overflow-anchor: none`, focus/open/reveal pinning and semantic row indices.
   Evidence: `ShoeTableMobile.test.ts` must force a window under jsdom and prove
   exact group/spacer accounting. Read §Requirements carried from the desktop
   delivery and docs/policies.md §Interaction chrome.
3. **Prove the integration and record the result.** Extend the routed 400-shoe
   e2e fixture to the phone rendering; hold the opposite rendering swap,
   measured heights, accessibility, focus, open panels and viewport coverage in
   all three engines. Measure the real-fleet DOM and cost, update the owning
   docs, freeze this spec and close the backlog entry. Read §The test lesson and
   docs/app.md §What a drag may recompute.

## Global constraints

- The plan's item is one whole shoe group; it never splits the name, values,
  rule or open panel rows.
- The wash, filtering, sorting and scoring continue over the whole filtered
  fleet, never the rendered plan.
- A failed first measurement renders everything; a later failed measurement
  holds the last good plan.
- The desktop rendering, fit boundary, URL and open-set semantics do not move.
- Every behavior bound runs without live network and the compatibility floor is
  Chromium, Firefox, WebKit and 360px of layout.

## Delivery record

- The shared cache now takes a rendering-specific layout key and face ruler;
  the phone ruler watches both Inter Tight and JetBrains Mono. The stable fleet
  input is rebuilt only for a new dataset or column signature, not a sort or
  filter replacement.
- The plan item is the complete closed group. The leading rule belongs to the
  following shoe, panels are observed live, and open, focused and revealed
  groups are kept at their own fleet position. Semantic row counts exclude
  rules, spacers and the permanent three-row prototype.
- `PHONE_OVERSCAN_PX` is independently 1,280px. The real-fleet 390×900 probe
  measured ordinary wheel travel at 600px/frame in Chromium and Firefox and
  825px in WebKit; Page Down and End remain uncovered jumps by design.
- At rest on 455 shoes, the phone body fell from 1,364 rows / 9,386 nodes to 81
  rows / 561 nodes. Three comparative runs cut the driven range-filter step
  from 13.4–14.5ms to 3.5–3.7ms median in Chromium and 23–24ms to 5ms in
  Firefox. Scroll work is 1.4–1.8ms and 3ms median. Measuring all groups costs
  24.6ms and 29ms respectively and is cached across filter changes.
- A routed 400-shoe browser fixture now forces the phone seam. Chromium holds
  exact grouping, accessibility, wash invariance, panel-aware viewport coverage
  and both rendering-swap directions; Firefox and WebKit hold measured height
  equality plus focused/open retention. The Docker suite passes in all three.
- Adversarial checks caught the hidden prototype leaking into two broad e2e
  selectors, a fleet array that initially lost identity on sort-only changes,
  and a ruler that initially watched only one of the two faces. The final guards
  fail if a group is split, a spacer is redistributed, an open/revealed group is
  dropped, the fallback is removed, ARIA positions collapse to DOM positions,
  or the wash is ranked over the plan.
