> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# UX polish and accessibility

**Date:** 2026-07-28
**Status:** Approved design, pending implementation plan
**Supersedes in scope:** BACKLOG.md items 3 (UX polish) and 7 (accessibility polish),
which the backlog already says to land together.

## 1. Problem, and an honest note on scope

Nothing here is a defect. The app works; it is not yet pleasant, and it is not yet
pretty. Two objectives, in that order: **make it pleasant to use**, then **make it
look designed rather than assembled**.

The scope grew during design, and the reader should know that before starting. Three
items are features rather than polish, admitted deliberately because they solve a
problem the polish item exposed and because they touch the same files:

- **Drag-to-bound on the histogram** (§7.2) — new interaction.
- **Leave-one-out relax counts** (§7.3) — new computation over `applyFilters`.
- **Metric direction as a declared property** (§5) — new data, and a correctness fix:
  the percentile tint currently points the wrong way for several columns.
- **The entry band becomes a setup strip** (§6.3) — a replaced component and a changed
  model of how a session starts, not a restyled one.
- **A second table rendering below 700px** (§4.2) — the phone stops being a narrow
  desktop, and brings a short-label map for the metric names (§4.3) and a change to the
  default column set (§4.4).
- **Debounced persistence in `setView`** (§7.2) — a documented invariant becomes
  asynchronous, because drag-to-bound makes 60 view updates a second.

Everything else is presentation. If the branch needs cutting, those are the seams.

**On method.** The responsive behaviour in §6.4 and the mobile table in §4.2 were
settled by rendering them in a real browser at fixed widths and looking, not by
reasoning about CSS. That found three layout bugs and one wash-density problem that
were invisible in the written design. Anything in this spec described as "verified by
rendering" should be re-verified the same way rather than trusted.

## 2. What is out of scope

- **Row expansion in the URL.** Adds a field to `ViewState`, which must serialise, and
  an expanded row would then stop equalling `defaultView` and collapse the entry band.
  Belongs with BACKLOG.md item 6 (back/forward).
- **CSV schema changes** beyond a URL column. BACKLOG.md item 5 already owns
  `preciseReleaseDate`; both CSV edits should land in one visit to `csv-export.ts`.
- **Per-column user-declared direction.** The only treatment of preference metrics that
  is *right* rather than merely honest — the runner says "I want more stack" and the
  wash follows. It adds serialised view state and changes what a shared link means.
  New backlog item.
- **Method era ("this reading is being retired").** Real, and newly evidenced (§8.2),
  but needs a notion of era per test that the dataset does not carry. New backlog item.
- **Preset threshold tuning.** BACKLOG.md item 1. Untouched here, though §9 notes new
  evidence for it.

## 3. The visual system

All colour, spacing, radius, type and elevation move to tokens on `:root` in
`app.css`. Components stop choosing values.

### 3.1 The wash rule

This is the load-bearing decision of the whole pass, and it replaces
`--tint-strength`.

> **The row surface sits at the end of the lightness axis in each theme — white in
> light, near-black in dark — and both washes travel inward from it, separated only by
> hue. Grey means "more". Blue means "better". Neither theme has a ramp pointing the
> other way, because there is no other way left to point.**

|  | surface | "more" → grey | "better" → blue |
|---|---|---|---|
| light | `#ffffff` | `#b0b6bf` | `#4a86f0` |
| dark | `#0e1014` | `#454b54` | `#2b6cb0` |

- Grey is **linear** in percentile; blue is **squared**. A squared ramp makes only the
  leaders read as tinted, which is right for a ranking and wrong for a scale — a
  neutral column must read as a gradient, not a podium.
- **The endpoint is the cap.** Each endpoint is chosen so cell text clears 4.5:1
  against it, and the endpoint is the worst case of the ramp, so checking the endpoint
  is sufficient. `--tint-strength` disappears as a tunable.
- The dark surface is flat: page and table share `#0e1014`. There is no elevated or
  recessed data surface.

### 3.2 The 3:1 rule needs splitting

`docs/app.md §Theming` currently requires data marks to clear 3:1 against the surface.
That is correct for the **flat** marks it was written about — the inactive histogram
bars in `MetricRow.svelte` are a single fill, drawn or not drawn. It is
**unsatisfiable by any gradient**: every intermediate value of a ramp is closer to the
surface than the endpoint, tending to 1:1 as p→0, so most of a ramp fails it by
construction.

The doc must state which obligation governs which kind of mark:

- **Flat mark** (histogram bar, coverage rule): ≥3:1 against the surface.
- **Gradient wash**: text over the endpoint clears 4.5:1. No surface-contrast floor,
  because the wash never carries the value alone — the number is in the cell.

### 3.3 Other tokens

| group | tokens |
|---|---|
| spacing | `--s1` 0.25rem, `--s2` 0.5rem, `--s3` 0.75rem, `--s4` 1rem, `--s5` 1.5rem, `--s6` 2rem |
| radius | `--r-sm` 4px (inputs, small buttons), `--r-md` 8px (panels, cards), `--r-full` 999px (pills, segmented controls) |
| type | `--t-xs` 0.75rem (units, sub-labels), `--t-sm` 0.83rem (secondary), `--t-md` 0.92rem (cells, controls), `--t-lg` 1.05rem (card titles), `--t-xl` 1.2rem (h1) |
| elevation | `--shadow-sticky` (pinned chrome only), `--shadow-dialog` |

Today the app uses radii of 3/4/6/8/10/999px and nine distinct font sizes between
0.7 and 1.15rem, each chosen per component. Every component's `<style>` is rewritten
against these tokens — which is why the visual pass has to follow the structural work
in the same branch rather than after it, or every file is edited twice.

Elevation is deliberately thin: with a flat table surface there is nothing to raise
except the pinned chrome and the Add-filter dialog.

The type steps were chosen by rendering the whole surface at three candidate scales
and comparing. A tighter scale was rejected because it shrank the table from 0.90 to
0.88rem — the app's primary reading surface, reduced as a side effect of tidying rather
than as a decision. Every step above lands at or just over today's equivalent, so
nothing gets smaller, and the smallest text rises from 0.72 to 0.75rem (11.5 → 12px),
which matters because it is the units line under every column header.

## 4. The table

### 4.1 Presentation

- **Numeric cells right-aligned with `font-variant-numeric: tabular-nums`.** Currently
  left-aligned proportional digits across the seven numeric columns of the default
  view; this is the single
  largest legibility gain available and it makes the wash read as columns rather than
  confetti.
- **Stacked headers.** Name on the first line; units and direction on a second, smaller,
  dimmer line — `Price` over `£ · lower ↓`, `Heel stack` over `mm`. Vertical is the axis
  we have spare, especially on mobile.
- **Units are derived**, not authored: `float` → `test.units` (31 of 49 tests carry one),
  `score` → `/5`, `percent` → `%`, `rating` → `/5`, plus `/100` for the `score` field
  and `£` for `msrpGbp`.
- **Sticky `thead`**, offset below the sticky header and toolbar (§6.2), carrying
  `--shadow-sticky`.
- **Sticky first column** (shoe name), **above 700px only** — below that the table is a
  different rendering entirely and has no horizontal scroll to pin against (§4.2).
- **Chevron affordance** in the name cell. Expandability is signalled by `cursor:
  pointer` alone today.
- **Multiple rows expand at once.** `expanded` becomes a `Set<string>`.
- **Row expansion transitions**, and the panel scrolls into view when it opens below
  the fold.
- **`class:discontinued` is deleted.** It is styled by nothing today. The `disc-tag`
  chip already carries the message in text, and dimming the row would argue against the
  `discontinued=only` filter, which exists because those shoes are worth finding.
- **The brand line is deleted.** `ShoeTable.svelte:67` prints `s.brand` under `s.name`,
  and **442 of 450 names already begin with their brand** — "ASICS Megablast", "Nike
  Vaporfly 4". The 8 exceptions are `Topo Athletic` and `Hylo Athletics` rendered as
  "Topo" and "Hylo", so the brand is still present, just shortened. It is duplication on
  every row of both renderings. `brand` stays in the data: it is still filtered and
  sorted on.

### 4.2 Below 700px the table is two-tier

A pinned name column with nine columns scrolling behind it is not a design: at 375px it
spends 40% of the width on the name and shows about two numeric columns. Below 700px the
same column set renders differently.

- **The shoe name takes its own full-width row**, on a banded background, with the
  chevron. The numbers get the whole viewport width on the row beneath, in true columns
  under **one** shared sticky header. Seven columns fit at 375px with no horizontal
  scrolling and no pinning.
- **The wash is inset** as a rounded chip inside each cell rather than filling it edge to
  edge. Full-bleed cells at this density read as a solid band of colour — far louder than
  the desktop table, where borders and wider cells break the wash up. Verified by
  rendering both.
- **`table-layout: fixed` with `border-collapse: separate` and `border-spacing: 2px 0`.**
  Content-sized columns made every chip a different width and detached each header from
  the values it labels — the single biggest source of the "alignment is all over the
  place" reading. Fixed widths plus spacing-derived gaps make every chip one box.
- **Values centred, not right-aligned.** Considered at length against right-alignment,
  which keeps digits on one axis down a column. Centring wins on the grounds that with
  fixed equal columns it is the more composed object and leaves no dead colour, and the
  cost — `73`, `74.3` and `80.38` centring on different axes — was judged acceptable
  after seeing both at real density. If this is ever revisited, right-alignment is the
  rigorous choice and column-sized widths are its necessary partner.
- **Each shoe is a card**: an identity strip carrying the name, then the value row on the
  card surface beneath, with a gap between cards and the page recessed behind them. Still
  **one table** underneath — per-card tables would break the shared column geometry.
- **The value row uses symmetric vertical padding.** A first pass had `padding-bottom`
  with no matching top, which pushed every chip upward in its band. It reads as a
  rendering fault rather than a choice, and is invisible until drawn.
- **Minimum column width 57px.** Six columns then fit any viewport from 358px up, so the
  default never scrolls on any common phone — 360px is the usual Android width and is the
  binding case, not the 375px the design was drawn at. Past six columns the min-width
  holds and the value row scrolls, so every column always has the geometry the labels
  were validated against.
- **Text-valued columns move to the name line** as dim metadata after the name:
  `› ASICS Megablast · 2025 · Carbon`. `releasedAt` renders as `2026-03-01` and `plate`
  as `Non-carbon plate`; neither fits a ~50px grid cell, and neither is a thing you scan
  down a column. The value row is then only ever numeric, which is what keeps the chips
  uniform. The name line wraps rather than truncating, so nothing is lost on a long name.
- **The header wraps** to two or three lines and carries the same name-over-units-and-
  direction structure as the desktop header. Real names — "Energy return heel", "Midsole
  softness" — cannot fit one line at this width at any size on the scale. It is sticky,
  so the height is paid once rather than per row. Header padding is 2px, not the usual
  step, because "softness" needs the full cell to fit at `--t-xs`.
- **The header uses `--t-xs`**, not the ad-hoc `0.66rem` a first draft reached for, which
  was below the scale's own floor.
- **The chevron takes the name's font size**, not the metadata's.
- Name at `--t-sm`: one step below `--t-md` keeps it distinct from the values without the
  jarring jump to the header that a larger size produced.

### 4.3 Short metric labels, and the six-column bound

Mobile headers need their own labels, and the map was authored by **measuring** rather
than by taste: render each name in a real header cell and report the widest unbreakable
word and the wrapped line count. `.superpowers/audit.mjs` does this and is reusable —
any proposed wording can be checked against the bound in seconds.

The bound: **six columns at 375px**, which is 57px per column and 56px of text. The
narrowest common phone (360px) yields 53px, and the map is validated against **53px**,
not 56 — designing for 375 alone would clip on a large share of Android devices.

Three container decisions came out of the measurement, and together they matter more
than the wording:

- **`-0.02em` tracking on the header** — 0.24px per character at 12px. It moves survivors
  from 37 to 44 of 53. Nearly free, and invisible.
- **Up to three lines**, not two. A two-line rule was my own invention, not a
  requirement; relaxing it keeps 8 more real names. Beyond three lines nothing improves,
  because the remaining failures are *word* overflow, not line count.
- **Six columns, not seven.** At seven columns the text space falls to 47px and only 19 of
  53 names survive — the vocabulary would become codes. See below.

**35 of 53 names are kept verbatim.** The 18-entry map:

| slug | label | why |
|---|---|---|
| `breathability`, `-25` | Airflow | "Breathability" is 78px; a paraphrase, not an abbreviation |
| `toebox-durability` | Toebox durab. | "durability" is 55.7px against 53 |
| `heel-padding-durability` | Heel pad durab. | as above |
| `outsole-durability` | **Outsole wear** | not a length problem: the test is Dremel dent depth in mm where lower is better, so "durability" contradicts its own units. Deliberate divergence from RunRepeat's name |
| `outsole-thickness` | Outsole depth | "thickness" is 55.1px |
| `insole-thickness` | Insole depth | as above |
| `stiffness`, `flexibility-stiffness` | Stiffness | "Flexibility" is 55.4px; the group already says Flexibility / Stiffness |
| `difference-in-midsole-softness-in-cold` | Cold softness Δ | wrapped to four lines |
| `difference-in-stiffness-in-cold` | Cold stiffness Δ | for symmetry with the above |
| `midsole-width-in-the-forefoot` | Forefoot midsole width | fits, but wraps with a dangling hyphen; side-first also matches Heel stack and Heel shock |
| `midsole-width-in-the-heel` | Heel midsole width | as above |
| `removable-insole` | Remv. insole | "Removable" is 66px |
| `reflective-elements` | Hi-vis | "Reflective" is 60px; idiomatic for running |
| `secondary-foam-softness`, `-22` | 2nd foam softness | "Secondary" is 62px |
| `shock-absorption-heel` | Heel shock | "absorption" is 65px |
| `shock-absorption-forefoot` | Forefoot shock | as above |
| `sweat-evaporated` | Sweat evap. | "evaporated" is 68px |

Superseded pairs may share a label safely — only one generation is ever shown — and a
collision check confirms no two simultaneously-visible metrics share one.

**`Size` must not show `/5`.** The type-derived unit rule maps `rating` → `/5`, but
`size-rating` runs 2.1–3.9 where **3 is true-to-size**. It is not a five-point quality
score and labelling it one invites the reading the direction audit exists to prevent. It
carries **`3 = true`** instead.

### 4.4 The default view loses a column

`defaultColumns` drops **`midsole-softness-22`**, leaving six numeric columns once
`releasedAt` and `plate` move to the name line.

The default was the only view exceeding the bound: Easy shows five numeric columns, Tempo
and Race four. Softness is the defensible one to lose — at **51% coverage** it is by far
the sparsest of the seven, and it is the only default column no preset uses, because
`docs/shoe-stories.md` argues softness should not drive a shortlist at all.

This is a product change, not a mobile workaround: it changes what desktop shows too. A
stored view from before the change simply reads as non-default and opens collapsed;
shared links carry explicit `cols` and are unaffected.

### 4.5 Columns never vary by viewport

Tempting and wrong. `cols` serialises into the URL, so a viewport-dependent default would
mean a link shared from a phone carried fewer columns than the sender saw, and the URL
would stop describing the view (docs/app.md §View and URL ownership). Both renderings
show whatever columns the view holds; §4.4 changes the default for *everyone* rather than
for phones.

Note also that rows are double height in the two-tier rendering, so roughly half as many
shoes fit a screen. That is the direct price of keeping the numbers in columns, and it is
worth paying: columns are what make this a comparison tool rather than a list.

### 4.6 Detail panel

`DetailPanel.svelte`'s image is `width: 220px` with no height, so it shifts layout on
load. It gets an `aspect-ratio`. **The row image is to be verified in a browser before
being written down as a defect** — it carries fixed `width` and `height` already, so
the usability review's claim that it shifts is unconfirmed.

## 5. Direction as a declared property

The percentile tint asserts a direction for **every** numeric column, driven by
`LOWER_IS_BETTER` in `stats.ts` — a hand-written set of six keys. Everything outside it
is tinted "higher is better" whether or not that is true. Two columns are actively
wrong today:

- **`outsole-durability`** is Dremel dent depth in mm (values 0.16–16.3, correlating
  −0.22 with outsole hardness). Lower is more durable. The tint currently marks the
  **least** durable shoes as column leaders.
- **`size-rating`** is a 2.1–3.9 runs-small/true-to-size/runs-large scale where 3 is
  correct. The tint currently rewards shoes that run large.

Direction moves out of `stats.ts` and becomes a declared map in
`app/src/lib/direction.ts`, following the `SIDE_PAIRS` precedent in `lineage.ts`:
declared in the app because it is a judgement, never inferred from a slug or a name,
and asserted against the catalogue by a test so an upstream addition fails the build
rather than silently defaulting (docs/operations.md §Contract-drift runbook).

Three values: `higher`, `lower`, `neutral`. Neutral columns get the grey wash and no
arrow; `higher`/`lower` get the blue wash and an arrow.

**Higher is better (11 tests + the `score` field):** `breathability`,
`breathability-25`, `drying-potential`, `sweat-evaporated`, `toebox-durability`,
`heel-padding-durability`, `energy-return-heel`, `energy-return-forefoot`,
`shock-absorption-heel`, `shock-absorption-forefoot`, `forefoot-traction`.

**Lower is better (7 tests + the `msrpGbp` field):** `weight`, `price`,
`outsole-durability`, `difference-in-midsole-softness-in-cold`,
`difference-in-stiffness-in-cold`, `sweat-on-skin`, `sweat-in-shoe`.

**Neutral (28 tests + `releasedAt`):** all stack and `drop`; all softness variants
(`midsole-softness`, `-in-cold`, `-22`, `-in-cold-22`, `secondary-foam-softness`,
`-22`); all stiffness and rigidity (`stiffness`, `stiffness-in-cold`,
`flexibility-stiffness`, `torsional-rigidity`, `torsional-rigidity-23`,
`heel-counter-stiffness`); both midsole widths; every toebox measurement and
`toebox-height`; `internal-length`; `size-rating`; `insole-thickness`;
`tongue-padding`; `outsole-thickness`; `outsole-hardness`.

**Non-numeric, no direction and no wash (3):** `plate`, `removable-insole`,
`reflective-elements`.

This flips three of the six current `LOWER_IS_BETTER` members — `drop`, `stiffness`,
`stiffness-in-cold` — to neutral. All three are fit and feel preferences, and today a
low-drop shoe is tinted as a leader over a high-drop one for no defensible reason.

`docs/shoe-stories.md` supports the neutral bucket in two places: stability "matters to
some runners a great deal and to others not at all, and there is no fleet-wide answer"
(§Race), and softness is deliberately unbounded (§How a story becomes a threshold).
Stack is the borderline call — Easy floors it, so it is directional *inside a story* —
and is classified neutral because it is not directional outside one.

## 6. How a session starts: setup strip and toolbar

### 6.1 Two radiogroups, one language

```
[ Heel | Forefoot ]  │  [ All | Easy | Tempo | Race ]        …        [Filters] [Columns]
```

- Both are segmented pills with an `--accent-dim` fill on the selected item — which is
  what `StrikeToggle.svelte` already does. No ledes on either; the divider separates
  them.
- **`Clear` is deleted, replaced by `All`** as a fourth peer of the stories. It is the
  same state (`defaultView(strike)`) named for what you get rather than what you
  destroy, and it dissolves the ambiguity between the toolbar's "Clear" and the
  sidebar's "Clear filters". `All` leads the group so it reads as everything → narrow
  to a story.
- Selection stays **derived**, never stored: a hand-edited view matches no story and
  nothing is highlighted. Unchanged behaviour, now with a fourth cell.
- The sidebar's **Clear filters** is unchanged and keeps its name.

### 6.2 Pinned chrome

Header + toolbar + `thead` all stay pinned; the receipt scrolls. Filtering is a tuning
loop, and every control that changes the view has to be reachable from anywhere in a
25,000px table.

### 6.3 The entry band becomes a setup strip

`EntryBand.svelte` is replaced. The band showed three story cards and reappeared
whenever the view returned to a clean state; the new surface asks **both** questions
once, then hands over to the bar for good.

**Six equal cards in one row**, two groups divided:

| | cards | each card carries |
|---|---|---|
| **Use measurements from the** | Heel · Forefoot | name only, centred |
| **Built for** | All · Easy · Tempo · Race | name, live count, one-line description |

- **Neither label makes a claim about the person.** "I land on my heel" tells a curious
  browser they are being mislabelled; "Use measurements from the" describes what the
  control does to the table, and "Built for" puts the claim on the shoe. This is a
  deliberate stance and must be recorded, or it will be "fixed" back to something
  friendlier (§10).
- **Strike cards carry no count** — strike does not change how many shoes exist. The
  count slot is reserved rather than removed, so every card is the same height.
- **A `?` beside each label** opens the fuller explanation. **One mechanism on every
  device**: a click-triggered popover, anchored beside the `?` above 700px and a bottom
  sheet below it. Edge-aware positioning, focus return and Escape — the machinery
  `AddFilterDialog` already has.

  A hover tooltip was rejected: it is the same mechanism as the `title` attribute this
  pass removes from the preset cards, and it needs a wholly separate touch path. An
  inline disclosure was rejected for moving the cards down as you reach for them.

  The copy:

  > **Use measurements from the** — Stack, energy return, shock absorption and midsole
  > width are each measured twice — once at the heel, once at the forefoot. Pick the end
  > you want the table and filters to use. Usually that is the end you land on, but
  > either is fine.

  > **Built for** — Easy, Tempo and Race each set the filters, columns and sorting to
  > suit that kind of run. All clears them again, and you can change anything at any
  > point.

  Two things the wording deliberately does **not** do. It never says "session" — that is
  our word, not a runner's. And it does not contrast these against "labels the shoe comes
  with": the reader has no idea the data carries editorial labels, so denying it plants
  the question. The strike paragraph is also the one place the interface can say *either
  is fine*, which is the assumption the label itself was rewritten to avoid making.
- Descriptions: All — *Everything in the catalogue*; Easy — *Cushioned, no carbon,
  affordable*; Tempo — *Light, fast, affordable*; Race — *Lightest, fastest, price no
  object*. Deliberately cheap, because BACKLOG.md item 1 may change the presets.
- The group divider is drawn **in the grid gap**, so it separates without resizing any
  card. It needs a colour above `--border`, which is invisible against `--chrome`.
- Card descriptions must align to a common baseline. Bottom-aligning them with
  `margin-top:auto` leaves them ragged, because the descriptions wrap to different line
  counts.

On mobile the strip becomes a **2×2 grid per group, cards at full size** — six equal
cards in one row is a desktop layout. It costs the whole first screen, which is the
complaint the usability review made about today's preset cards; that is accepted here
because the strip appears only on a genuine first arrival and never again.

**Clicking a pace card collapses the strip** into the toolbar, with a height transition
that respects `prefers-reduced-motion`. Not "once both are chosen" — that would never
fire, because the table cannot render without a strike and `defaultView(strike)`
requires one. Strike is pre-set and changeable either here or in the bar afterwards.

**The strip never returns**, and nothing is lost by that: the bar carries the counts, so
the only thing the cards held exclusively is the descriptions, which are a
first-encounter need. This is the split that makes the whole model work — **descriptions
at first encounter, counts permanently**.

**Visibility needs no new state.** The strip shows when there was no query string *and*
no stored view — a genuine first arrival, which `Page.svelte` already knows at init. It
is then ephemeral `$state`, cleared on the first pace click, never serialised and never
persisted. `docs/app.md §Presets` rules out a *stored* dismissal flag; this does not add
one, and the property that section actually protects — bare link opens expanded, filtered
link opens collapsed — is preserved exactly.

- **"Browse all N shoes" is deleted.** `All` owns that affordance now.
- `TABLE_ANCHOR_ID` survives with a new owner: the skip link (§10).

### 6.4 Toolbar responsive cascade

Three groups: strike, pace, and actions (Filters, Columns). The rule is driven by
whether all three fit on one line, **not** by phone-versus-desktop — checked by rendering
at 900, 820, 620, 480 and 375px.

| width | layout |
|---|---|
| ≥880px | one line; actions right-aligned via `margin-left:auto` |
| 560–880px | actions ride up beside strike on line 1; pace takes line 2, shrink-wrapped |
| <560px | as above, pace stretched to fill the width, pills `flex:1` |

Three implementation notes, each of which was a bug found by looking at it:

- **The divider must be removed** whenever the two groups stop sharing a line, or it
  wraps with the strike group and dangles after Forefoot.
- **`flex-basis:100%` belongs on a wrapper, not on the segment.** Put it on the segment
  and the bordered pill container stretches across the full width with its pills
  clustered at the left.
- The middle tier matters: without it, 620px puts the groups on line 1 with a large void
  and drops actions alone onto line 2.

## 7. The sidebar

### 7.1 Tidier rows

A metric section is four stacked elements today — heading, coverage bar + percentage,
histogram, bounds row — and ten of those is most of the sidebar's height.

- Coverage moves **onto the heading line**, right-aligned (§8).
- The coverage bar becomes a 2px underline beneath the heading.
- `Clear` on a bounded row becomes an ✕ icon button, keeping its
  `aria-label="Clear {name}"`.
- Net: the row is **shorter than today while carrying more information**.

### 7.2 Drag-to-bound

`docs/app.md §Filters` justifies "histogram plus number fields" as *not* a dual-thumb
slider, on keyboard-accessibility grounds. **That rationale is replaced**: the two
inputs exist because they serve different needs — the number field is **precise**, the
histogram is **intuitive**. Accessibility is a property of how each is built, not the
reason either exists.

- **Edge handles**, dragged inward from either side. A one-sided bound — which is most
  real filters here — is one gesture from the correct side.
- A handle at its extreme means **no bound on that side**, so the row still serialises
  open-ended.
- **Handles appear on hover or focus**, anywhere over the row rather than only at the
  edges, so the target is generous. At rest the sidebar is charts and numbers.
- **A set bound is always drawn** — an edge is state, a grip is affordance, and they
  have different visibility rules.
- **`@media (hover: none)`: handles are permanently visible.** Hover never fires on
  touch, and the sidebar is a drawer on small screens where resting tidiness matters
  less.
- The number fields remain authoritative and independently editable.

#### The axis is trimmed to p2–p98

A linear axis over the full range is unusable for dragging, and the numbers say why: on
price, **79% of the axis is empty pixels and the densest single pixel holds 64 shoes**.
The middle half of the fleet gets **23px of a 222px control**.

That is not an outlier problem — trimming to p1–p99 barely moves it. **Price is
effectively categorical**: 450 shoes across 47 distinct values, five of which (£140, £160,
£180, £150, £170) hold 49% of the fleet. £140 alone accounts for 64 of them. Metrics range
from 10% distinct (price) to 99% (shock absorption), so any rule has to serve both.

The axis is clipped to **p2–p98** with the excluded readings drawn in hatched overflow
bins at each end. It roughly doubles to triples the travel given to the middle half
(price 23px → 45px) and fixes the chart's shape, which today is one spike and a long flat
tail. p2–p98 is a compromise: symmetric, needs no per-metric tuning, and deliberately
conservative — a wider trim buys more resolution but starts discarding real spread.

#### Snapping is to values that exist, not to round numbers

An earlier draft snapped to £5 / 1 g / 0.5%. Round numbers are arbitrary; **values present
in the data** are not, and the rule self-adjusts across the two regimes with no constants:

| metric | distinct | stops in axis | median gap |
|---|---|---|---|
| price | 10% | 43 | 5.0px |
| weight | 29% | 117 | 1.3px |
| energy return heel | 90% | 324 | 0.5px |

Chunky, meaningful detents where the data is categorical; indistinguishable from free
movement where it is continuous. Every stop is a real boundary between shoes, so no drag
step is wasted.

#### Crossed bounds clamp the drawing, never the value

Dragging already clamps each handle against the other. The number fields do not, and a
typed value outside the axis previously drew its edge off the side of the chart. **The fix
is to clamp the rendered position to the axis and leave the stored value alone.**

Bounds are allowed to cross. A crossed range honestly matches zero shoes and says so —
the fields mark themselves and the count reads zero — and this is the behaviour the app
already has today via the number fields. The alternatives were all rejected for mutating
what the user typed, and **clamping on input is actively broken**: with max at 180, typing
"200" into min rewrites the field to 180 at the third keystroke and further typing appends
to that, making the bound unreachable.

#### Persistence must be debounced

`setView` writes `history.replaceState` and `localStorage` on every change. A drag fires
about 60 view updates a second — **a 2-second drag makes 120 `replaceState` calls**,
past Safari's ~100-per-30-seconds throttle in a single gesture, plus 120 synchronous
storage writes.

State assignment stays immediate, so the table filters live; the URL and storage write
becomes **trailing-debounced (~200ms), flushed on `pagehide`**. Still one write path, now
asynchronous. This also fixes the same latent problem in the search box, which writes on
every keystroke today.

Live filtering is affordable: `percentileMap` over 450 shoes and five columns measures
**2.1ms**, well inside a 16.7ms frame — the sorted-values `break` keeps it far from its
nominal O(n²). The expensive thing was never the recompute.

#### Two details that are easy to get wrong

- **The plot must not be a tab stop.** Giving it `tabindex` so `:focus-within` can reveal
  the grips adds an empty tab stop, in the pass that adds a skip link *because* there are
  already 49 of them. Hang the reveal off the row instead — `:hover` or `:focus-within` on
  the fieldset — so tabbing into either number field reveals the handles, which also
  connects the two input modes.
- **Touch hit areas must be gap-aware.** A 44px target on a 222px plot is a fifth of the
  width each; when the bounds sit close the areas overlap and the wrong handle grabs. Each
  shrinks to half the gap once the handles are within 88px.

### 7.3 Relax counts

Every **bounded** range row shows **`N excluded`**, right of the number fields: the shoes
that would return if *this one bound* were removed and everything else kept.

- Leave-one-out, so it is order-independent and conditioned on the rest of the filter
  set. With a £60 ceiling set, each other filter's count is "of the shoes under £60, how
  many did this cost me".
- **No ranking and no recommendation.** An earlier design singled out the most
  restrictive bound; that imposes a priority we cannot know, and a budget is usually the
  *least* relaxable thing in the set. The number goes next to the control that acts on it
  and the runner chooses.
- **An unbounded row shows nothing** — there is nothing to relax. **`0 excluded` does
  show**, because "this filter is doing no work" is worth knowing and its absence would
  be ambiguous against the unbounded case.

**The numbers are informative, which was not obvious in advance.** Measured against the
real presets:

| filter set | result | per-bound |
|---|---|---|
| Easy | 150 | heel stack **204**, price **22** |
| Tempo | 54 | energy **74**, weight **74**, price **46** |
| Race | 39 | energy **50**, weight **19** |
| price ≤ 180, stack ≥ 36, energy ≥ 60 | 44 | energy **118**, price **52**, stack **37** |

No zeros, no absurdities, and the spread carries meaning: Easy's stack floor does almost
all the work while its price cap barely binds, and in the last set energy return is by far
the most restrictive bound — which nothing else on screen would tell you.

**The count must be computed under the current `showMissing`.** A range bound excludes
shoes with no reading for that metric, so clearing Tempo's energy bound returns 74 — but
only 54 failed the bound; the other 20 have no energy reading. With `showMissing` on those
20 are already visible and clearing returns 54. Run the calculation under the live setting
or the number is simply wrong. This only bites where coverage is incomplete: every
fully-covered metric splits 100/0.

**One number, not a split.** `54 · 20 no data` keeps the receipt's distinction at the point
of decision, but the single total is what actually happens when the bound is cleared, and
prediction is the job. Once cleared, those shoes show a dash in the column, so nothing is
concealed.

**Do not reuse the receipt's word "outside".** The receipt says "96 outside your bounds";
borrowing it here would imply the per-row numbers sum to that figure. They do not — a shoe
failing two bounds is counted by both, so **the counts overlap and must never be
totalled**.

**Cost is not a concern**: six passes over 450 shoes measures **0.77ms**, or ~2.9ms per
frame alongside `percentileMap` during a drag — comfortably inside 16.7ms. It is still the
first thing in the app whose cost grows with filter count, which is worth stating rather
than discovering.

### 7.4 Brands

- **Counts respect the other filters.** `brandCounts` currently reduces over
  `data.shoes`; it moves to `population` (`filtered.considered`), which is the
  denominator every coverage number beside it already uses. It is the one number in the
  sidebar that promises something it does not keep.
- A brand at zero **stays in the list, greyed, showing (0), and clickable**. The list
  does not reflow under the cursor, and a 0 is an answer.
- **A search box**, for ~50 brands in a 14rem scroll box.

### 7.5 Empty state

One short honest line, unchanged in spirit. The relax counts in §7.3 do the explaining,
where the controls are.

## 8. Coverage

### 8.1 What it says

`measured on 378 / 450` on the heading line, **shown only below complete coverage**.

- **Counts, not a percentage.** "84%" of an unstated pool is the complaint; both numbers
  on screen states the denominator instead of assuming it. Filter to last year and it
  reads `120 / 180`, where both numbers visibly moved.
- The denominator stays `considered` — the non-range population. This is not a free
  choice: with the **visible** set as denominator, any metric carrying a bound reads
  100% every time, because a bound already excludes every shoe lacking a reading. The
  number would become a tautology exactly when it is being used.
- Silent at complete coverage. On a default view most rows fall silent.

### 8.2 The sparse warning is deleted

`MetricRow.svelte`'s warning — "Only 30% of these shoes have this reading — the method
is new / it is rarely run" — is removed, and **the classifier behind it is wrong**, not
merely verbose.

Coverage by release year shows every sparse metric is **era-shaped**, not sporadic:

| test | '21 | '22 | '23 | '24 | '25 | '26 |
|---|---|---|---|---|---|---|
| `torsional-rigidity` | 85% | 97% | 100% | 100% | 98% | 51% |
| `torsional-rigidity-23` | 0 | 0 | 0 | 1% | 47% | 100% |
| `stiffness` | 85% | 100% | 98% | 99% | 23% | 0 |
| `outsole-hardness` | 85% | 100% | 98% | 99% | 47% | 1% |
| `toebox-width-widest-part` | 8% | 14% | 47% | 76% | 100% | 99% |
| `breathability-25` | 0 | 0 | 0 | 1% | 11% | 36% |
| `sweat-in-shoe` | 0 | 0 | 0 | 0 | 10% | 17% |

Metrics are **arriving** (a clean adoption ramp) or **retiring** (near-total coverage
then a cliff). Not one is uniformly thin; the closest is the `sweat-*` family, which is
both new and incompletely adopted.

The warning has two labels, derived from `oldestReading` + `ageMonths`. `stiffness` has
readings going back years, so it is labelled *rarely run* — but it is **retired**, with
better historical coverage than most of the fleet. The case that matters — this reading
will keep thinning — is not expressible in the vocabulary the warning has.

And because coverage is era-shaped, the live `378 / 450` count **demonstrates** the
answer as the runner filters: narrow to recent shoes and an arriving metric fills in, a
retiring one empties out. The number is a truer signal than the label, and it updates
rather than asserting.

**Deleted:** `oldestReading`, `ageMonths`, `YOUNG_METHOD_MONTHS`, and their tests.

**Retained:** `isSparse` and `SPARSE_BELOW`. `presets.test.ts` asserts in both
directions that no preset bounds a metric below that threshold, and
`docs/app.md §Presets` calls that assertion load-bearing. It stops being a *warning*
threshold and becomes a *preset-safety* threshold; the doc's wording must follow, since
it currently defines it by the UI element being removed.

## 9. Incidental finding

Applying the current presets to the live fleet returns Easy 150, Tempo 54, Race 39 of
450. `docs/shoe-stories.md` describes Tempo as the widest of the three by intent — "it
is where most weeks' hard running happens" — and it is the narrowest but one. This is
BACKLOG.md item 1's open question, now measured rather than suspected. **Not addressed
here**; recorded so item 1 starts from a number.

## 10. Accessibility

Folded in per BACKLOG.md item 7, because these touch the same components.

- **Roving tabindex** on every `role="radiogroup"` — strike, discontinued, generation
  pickers, and the new story segment. Each currently makes every radio its own tab stop
  and ignores arrow keys, which is the interaction the role promises. One fix serves all
  four.
- **Skip link** to `TABLE_ANCHOR_ID`. It is 49 tab stops from the top of the page to the
  first table row.
- **Focus trap and Escape** in the mobile filter drawer. The drawer also gains a
  transition — it toggles `display` today, which cannot animate, so it needs a transform.
- **`aria-controls`** on expanders.
- **Range inputs named by their metric**, not "min"/"max".
- **`StrikeToggle` needs an `aria-label`.** Removing the "I land on my" lede (§6.1)
  removes the target of its `aria-labelledby`, so the group would otherwise lose its
  accessible name. The lede's own comment justifies it as protection against being
  misread beside the Clear button — and Clear is being deleted, so the rationale expires
  with it.
- **Touch targets.** The drag grips (§7.2) are a 16px visible mark; under
  `hover: none` the *hit area* must reach 44px without the mark growing to match.
- **`?` help affordances** (§6.3) are buttons, not `title` attributes — `title` is
  exactly the mechanism this pass is removing from the preset cards, and it does not
  exist on touch.

## 11. Also included

- **Copy-link button.** Shareable URLs are a stated project goal with no affordance at
  all today.
- **CSV gains a RunRepeat URL column**, consistent with `docs/app.md §Number display`
  calling the export "a data export, not a rendering". Visible-columns behaviour is
  unchanged.
- **Delayed loading skeleton.** A skeleton that flashes for a 200ms fetch is worse than
  the text it replaced.
- **Favicon and page `<title>`.** Shared links currently preview as nothing. Open
  Graph tags are not included — that needs an image and a decision.

## 12. Documentation

Behaviour-changing commits carry their doc (CLAUDE.md §Conventions). Sections that must
change:

| doc | change |
|---|---|
| `docs/app.md §Theming` | the wash rule (§3.1); split the 3:1 obligation by mark type (§3.2); drop `--tint-strength` |
| `docs/app.md §Coverage` | rewrite around counts and the era finding; delete the `oldestReading` paragraph; redefine `SPARSE_BELOW` as a preset-safety threshold |
| `docs/app.md §Filters` | replace the accessibility rationale for two inputs with precision-vs-intuition; document drag, snapping, and handle visibility |
| `docs/app.md §Presets` | delete the "Browse all" paragraph; `Clear` → `All`; the band becomes a first-arrival setup strip with ephemeral visibility, and why that is not the stored dismissal flag the section rules out |
| `docs/app.md §Columns and sorting` | the two table renderings and the 700px switch; that columns never vary by viewport |
| `docs/shoe-stories.md §Which half a story uses` | the interface deliberately does not assert the runner *is* a heel or forefoot striker, though the code still calls it `strike` |
| `docs/app.md §Columns and sorting` | direction as a declared property; where it lives and why it is declared; short mobile labels and the six-column bound; `defaultColumns` loses softness |
| `docs/app.md §View and URL ownership` | `setView` still the single write path, but persistence is debounced and flushed on `pagehide` — the section currently describes setting state, replacing the URL and storing as one act |
| `docs/operations.md` | direction-map drift joins the contract-drift runbook |
| `BACKLOG.md` | items 3 and 7 closed; new items for user-declared direction, method era, OG tags |

## 13. Testing

TDD throughout, per CLAUDE.md.

- **`direction.test.ts`** — every numeric test in the catalogue has a classification;
  an unclassified one fails. Both known-wrong cases (`outsole-durability`,
  `size-rating`) pinned explicitly.
- **`stats.test.ts`** — the wash reads direction from the map; neutral yields no blue.
- **Relax counts** — leave-one-out is order-independent; counts do not sum; `0 excluded`
  renders while an unbounded row shows nothing; and the count changes with `showMissing`
  on a metric with incomplete coverage, which is the case a naive implementation gets
  wrong.
- **Coverage** — silent at complete; counts track `considered` as non-range filters
  change.
- **Drag** — axis trimming, snap-to-nearest-value and position clamping are pure
  functions, tested directly rather than through the DOM. Bound-at-extreme serialises as
  absent; a crossed pair stores what was typed and clamps only its drawn position; a typed
  value outside the axis clamps its handle without altering the value.
- **Short labels** — `.superpowers/audit.mjs` is the rig, and its assertion belongs in the
  suite: every numeric test resolves to a label whose widest word fits 53px and which wraps
  to at most three lines, so an upstream metric with a long name fails the build rather
  than silently clipping on a phone. Collision check: no two simultaneously-visible
  metrics share a label.
- **Debounced persistence** — state updates immediately; the URL and storage write is
  trailing and flushed on `pagehide`. Test with fake timers, not by waiting.
- **Accessibility** — roving tabindex moves selection on arrow keys within each
  radiogroup; drawer traps focus and closes on Escape.
- **Setup strip** — shows on a bare first arrival; hidden when a query string is present;
  hidden when a stored view is restored; a pace click collapses it and it does not return
  after the view is cleared to `All`.
- **e2e** — the sticky chrome, the story segment, the toolbar cascade at the three tiers,
  and the 700px table switch. None of these are observable in jsdom, and the cascade in
  particular produced three separate layout bugs that only rendering revealed.

No live network, ever (CLAUDE.md).

## 14. Sequencing

Tokens first, then structure, then the rest — because every component's `<style>` is
rewritten against the tokens, and doing it in the other order edits each file twice.

1. Tokens and the wash rule (§3) — invisible except for colour, lands everywhere.
2. Direction map and the tint fix (§5) — correctness, independently verifiable.
3. Table presentation (§4).
4. Toolbar cascade, then the setup strip that collapses into it (§6). The bar has to
   exist and be right before the thing that hands over to it.
5. The two-tier mobile table (§4.2) — independent of everything above it.
6. Sidebar: rows, coverage, brands (§7.1, §7.4, §8).
7. Relax counts (§7.3).
8. Drag-to-bound (§7.2).
9. Accessibility (§10).
10. Incidentals (§11).

Regenerate `data/` once in the primary checkout **after** landing, never on the branch
(CLAUDE.md). Nothing here changes the dataset, so this is a formality — but the branch
must stay code-only for the rebase to work.
