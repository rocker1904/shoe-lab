# App

Svelte 5 SPA, no router, no store, no runtime dependency beyond Svelte. It
fetches one file — `shoes.json`, copied into `app/public/` by `sync-data` at
dev/build time — and everything else is pure functions in `app/src/lib`
(filters, sort, stats, presets, URL state, CSV export) driving dumb
components. Dataset shape and field semantics are docs/scraping.md.

## View and URL ownership

`Page.svelte` holds the whole view — filters, sort, columns — as one local
`$state` object. The URL is **write-only**: `parseView` runs exactly once, at
init, inside `untrack`; every change goes through `setView`, which sets the
state, `history.replaceState`s the serialised form, and stores it.

The state assignment is immediate — the table filters live, which is the whole
point of filtering — but the URL and storage write is **trailing-debounced at
200ms** (`lib/debounce.ts`), because a dragged histogram handle emits about
sixty view updates a second: a two-second gesture would otherwise make 120
`replaceState` calls, past Safari's ~100-per-30-seconds throttle inside a single
drag, plus 120 synchronous storage writes. The search box had the same latent
problem on every keystroke. It is still **one** write path, now asynchronous,
and it flushes on `pagehide` so a page being torn down never loses the pending
write.

`ViewState` carries **no zone**. Which half of each zone pair a view is about is
read back out of it by `zoneOf` (§The zone is a preset too), so the baseline is a
constant: `defaultView()` takes no argument and `DEFAULT_ZONE` is the one place
`'heel'` is written. `defaultColumns` still *requires* a zone, which is what
stops a second call site defaulting by accident. `parseView` has nothing to
resolve before it builds that baseline — the columns a link carries are the
zone it carries.

Init takes the first of: a query string in the URL, a stored view, the
defaults. A shared link must always beat a previous session, so the query
string wins outright and storage is only read when there is none. A view
restored from storage is passed straight back through `setView` once, which is
what puts it in the URL — otherwise a returning visitor would see a filtered
table behind a bare URL and copying the link would share the default view.
That reuses the single write path rather than adding a second write site, and
**that one write flushes immediately** rather than waiting out the debounce: it
is a one-off at init, not part of a burst, and the 200ms in between is exactly
the window in which a returning visitor copies the address bar.

The view is never re-derived from the URL. Not a shortcut — a correctness
requirement: state that does not serialise would be silently dropped on the
round trip. Every field of `ViewState` therefore serialises, `rows` included.

"Serialises to nothing" and "is the default" are still different questions, and
`sameValue(v, defaultView())` answers the second: a range key holding no bound
at all is real view state that `serializeView` omits, so
`serializeView(v) === ''` would call such a view default. `sameValue` compares
the whole `ViewState` **by value**, never by key presence — `structuredClone`
keeps own properties whose value is `undefined`, so every cleared field leaves
its key behind and a key count would never let a derived control re-open. Every
derived mark in the app is one such comparison (docs/app.md §Presets).

`persist.ts` stores the view between visits as **the exact output of
`serializeView`** and nothing else — no bespoke JSON shape. Restoring runs the
string back through `parseView`, so it inherits the hostile-input handling that
already exists and is already adversarially tested: a test slug that has since
left the catalogue is dropped by machinery that exists today, and no second
parser can drift from the first. The storage key carries a hand-maintained
schema version, bumped when the URL encoding changes; a value under any other
key is never read, and there are **no migrations, ever**. It is deliberately
not derived from the build, because `main` deploys continuously and a
build-derived version would discard state on every push. Storage access is
wrapped in both directions (docs/app.md §Theming).

`popstate` is deliberately unhandled: Back does not restore the previous view.
Wiring it up means re-entering the view from outside `setView` and needs the
above worked through — BACKLOG.md item, not an oversight to patch casually.
`replaceState` (never `pushState`) is what keeps the history stack from
filling with keystrokes.

## Sanitised-HTML boundary

`{@html}` appears in exactly two places, both in `DetailPanel.svelte`:
`details.whoShouldBuy` and `details.whoShouldNotBuy`. Those two fields are the
only ones sanitised at build time, by the allowlist in
`scraper/src/sanitize.ts`, which is regression-tested against breakout
attempts. Every other field — name, brand, intro, pros, cons, features — is
raw scrape text and must stay plain interpolation.

Adding an `{@html}` sink is a security decision, not a formatting one: it
requires the field to be sanitised in the scraper first, and tests on both
sides. Removing the sanitiser and "escaping in the component" is not
equivalent — these fields are meant to render as markup.

Two mechanisms enforce this, and they fail on different mistakes.
`svelte/no-at-html-tags` errors on a careless sink but is silenced by an inline
disable, so it cannot see a deliberate one added with a disable attached;
`app/src/html-boundary.test.ts` pins the exact two expressions and catches that.
Neither is redundant — a change satisfying only one of them is a change to this
boundary, and needs the decision above.

## URL encoding

Compact and default-omitting, so a shared link carries only what was changed:
`r.<key>=<min>~<max>` per range (either side may be empty for open-ended),
`plate` and `brands` (comma-joined), `after`, `q`, `disc=hide|only`, `missing=1`,
`stab=1`, `rows` (comma-joined), `sort` (`-` prefix means descending),
`cols` (comma-joined), and
`gen.<currentSlug>=<chosenSlug>` per superseded pair. A value equal to the
default is not written at all — a generation choice naming its own key is the
default and never appears.

`stab=1` is written only when the stability preference is on
(docs/app.md §The story scores), so a shared link carries the sender's own
preference alongside their filters. That is accepted rather than overlooked: the
preference changes what the score means, so a link that dropped it would show
the recipient a different ranking under the same URL.

**There is no zone token.** The zone rides in `cols`, which is the only thing
that records it (§The zone is a preset too), so a plain forefoot table is a verbose
link: eight column slugs where `zone=forefoot` would be one. That is the
accepted cost of having one encoding of the zone rather than two that can
disagree. A `zone=` shorthand expanding to `defaultColumns(zone)` is the remedy
if the length ever becomes annoying in practice (BACKLOG.md).

`parseView` treats the query string as hostile input and drops anything it
cannot vouch for, always falling back to the default rather than throwing:
range and sort keys must name a numeric test or a numeric shoe field, a
malformed bound voids that whole range (dropping one side would silently widen
it), `after` and `disc` are pattern-checked, `plate` keeps only allowlisted members and is
deduped into declared order, an all-separator `brands`, `plate` or `rows` stays
absent instead of becoming an empty array, `rows` keeps only rangeable
non-curated keys, and `cols` is deduped and filtered against the column
allowlist. A `gen.` choice survives only when its key names
the current generation of a resolved pair and its value names that pair's
retired generation. Bound serialisation accepts everything `String(number)`
emits, exponent form included, so round-trips are lossless.

The two generations of a pair are mutually exclusive, and `parseView` is where
that is enforced for URLs — the one place both can arrive together. When a
range or a column names both, the current generation is kept and the other is
dropped. Only about 40% of shoes carry both readings, so ANDing them collapses
the fleet for no visible reason. The click path enforces the same invariant
itself (docs/app.md §Columns and sorting).

## Filters

Range filters and the Add-filter dialog offer **numeric-typed tests only**
(`float`, `score`, `percent`, `rating`, plus the `score`/`msrpGbp` shoe
fields). A range over an `option`, `bool` or `text` test reads as missing for
every shoe and would empty the whole fleet in one click, so both the UI and
`parseView` refuse them. Each row is titled by its `MetricRow` rather than by
the fieldset legend, so the name is stated once — but the fieldset's accessible
name carries heading **and** zone, because two rows both called "Forefoot"
would be indistinguishable to anyone not looking at the screen.

The order is fixed: search, released after, plate, brand, discontinued, then
the range rows, which come from one declared list, `CURATED_RANGE_KEYS` — price,
then the measurements a runner narrows on most, then the rest curated, then
anything added by hand. Price leads because it is the bound almost every search
has.

**The curated list is not the set of terms the story scores read**, and it is
not meant to become one: a filter row narrows a search, a term ranks one. Heel
counter stiffness is a term with no row, because nobody searches in five-point
heel-counter buckets; drop and the toebox measurements are rows no score reads,
because fit is exactly the thing a runner filters on and no score can speak to.
Where the two coincide the row still has to earn its place on its own footing —
**outsole durability** is listed because "I want a shoe that lasts" is an
ordinary search, not because Easy weights it. **Midsole softness is not listed**:
it is redundant with shock absorption, which is one row above it and measures the
outcome rather than the material cause (docs/shoe-stories.md). It stays
reachable from the Add-filter dialog like any other metric.

The order does not rearrange itself under the story or the zone — someone
comparing two stories must not have the controls move underneath them. Both halves of every zone pair
are curated for that reason, and **every part of a zone pair renders always**;
a single renders when it is curated, active, or listed.

**Clearing a value and removing a row are different actions.** Clearing empties
both bounds in one click and deletes the key outright — leaving `{}` behind
would mean `isDefaultView` never returned true again and the toolbar could
never mark `All` again. Its control is an **✕** icon rather than the word
"Clear": ten rows spelling it out is most of the sidebar's width, and the
`aria-label="Clear {name}"` still says which row it belongs to. Removing drops
the row and its bound together, and is offered
only on a hand-added row. That needs somewhere to record which rows are
*shown*, so `ViewState.rows` carries the hand-added list; deriving it from the
bound keys is exactly what made clearing and removing the same action. A row
that arrived by link holding a non-curated bound is seeded into the list by
`parseView`, or clearing it would silently remove it. Released after is unset
from an **Any** chip: a chip that sets a date cannot also clear it.

The sidebar stays for the filters in use — filtering is a tuning loop, and a
modal over the table breaks the feedback that makes it work. **Choosing which
filters those are is a dialog**, because picking among forty-odd metrics is a
different task and wants room for grouping, search and coverage bars. It is
built from a positioned element rather than `<dialog>`: jsdom implements
neither `showModal` nor the top layer, and the focus handling is the part that
has to be right anyway — focus enters on the search box and returns to whatever
held it. The node itself is moved to `<body>` on mount; §Stacking order says
why. That is also why this dialog, alone among the panels here, does **not**
stop Escape from propagating: living outside the drawer, it is not on a bubble
path that reaches the drawer's key handler, so there is no second dismissal to
suppress. The month picker still does stop it, because its panel is a real
descendant of the drawer.

Discontinued is three-valued — `hide`, `only`, or absent meaning both. A
boolean could only ever hide, and "only the last-generation models" is half
the value strategy in docs/shoe-stories.md.

**Brand counts respect the other filters, and a facet must not filter itself.**
`brandCounts` counts over the population with the *brand* filter removed —
neither over `population` nor over the whole fleet. `applyFilters` applies
brands before pushing to `considered`, so counting over what the sidebar is
handed would read `(0)` beside every unticked brand the moment one is ticked,
and clicking one of those still returns shoes, because brands are OR'd. The key
set is seeded from the whole fleet, so a brand matching nothing keeps its row:
it stays in the list, greyed, showing `(0)` and clickable — the list does not
reflow under the cursor, and a 0 is an answer. A search box narrows the
fifty-odd brands in a 14rem scroll box.

**Every bounded row states what it is costing**: `N excluded`, from
`lib/relax.ts`, is the number of shoes that would return if *that one bound*
were cleared and everything else kept. Leave-one-out, so it is order-independent
and conditioned on the rest of the set. There is no ranking and no
recommendation — singling out the most restrictive bound imposes a priority we
cannot know, and a budget is usually the *least* relaxable thing in the set —
so the number simply sits beside the control that acts on it. An unbounded row
shows nothing, because there is nothing to relax; **`0 excluded` does show**,
because "this bound is doing no work" is worth knowing and its absence would be
ambiguous against the unbounded case.

The count is computed over the whole fleet under the **live `showMissing`**,
never over `population`: `population` has already had the other bounds applied,
and a range bound also excludes shoes with no reading for its metric, so with
the flag off those come back when it is cleared and with it on they were never
hidden. Run it under the wrong setting and the number is simply wrong wherever
coverage is incomplete. The counts **overlap** — a shoe failing two bounds is
counted by both — so they must never be totalled, and this is deliberately not
the receipt's "outside your bounds", whose word is not reused here for that
reason. It is the first thing in the app whose cost grows with filter count,
which is worth stating: six passes over 450 shoes is well inside a frame.

`applyFilters` accounts for every shoe it drops: `considered` is the
population surviving the non-range filters alone, and
`visible + outsideBounds + hiddenMissing === considered.length` holds for any
filter state. Each excluded shoe is counted exactly once, missing-ness first.

`undatedHidden` is the same idea one filter earlier: shoes an active
released-after bound drops because they have **no release date at all**, rather
than because they are too old. An undated shoe cannot be shown to qualify, so it
stays hidden — but folding it into the population line would report it as
excluded by a bound it was never measured against, which is the silence this
count exists to break. It sits outside the `considered` reconciliation above,
because those shoes never reach `considered`. There is deliberately no
show-them-anyway escape: `showMissing` answers "I accept shoes with unknown
readings inside my bounds", where this is "I asked for shoes released after a
date, and these have no date" — a different question, and clearing the date
filter already answers it.

`hiddenMissing` is a deterministic count of shoes that pass every non-range
filter but have **no data** for at least one active range filter. Missingness
is settled across all active ranges before any bound is applied, so the count
does not depend on key iteration order. It deliberately over-counts against
"would otherwise be visible" — a shoe with no midsole reading might have
failed the weight bound anyway — and the copy is written to match: "N shoes
have no data for the active filters", never "N would otherwise match".

`showMissing` is the escape from that: a missing reading stops excluding the
shoe and stops being counted, while a shoe that *has* a reading and fails the
bound is still dropped. It is one flag over the whole filter set rather than
per range — the receipt offers one control, so one flag is what the user can
actually address.

**A range row has two input modes because they serve different needs**, not for
accessibility: the number field is *precise*, the plot is *intuitive*.
Accessibility is a property of how each is built, not the reason either exists.
The plot carries an edge handle per side, dragged inward; a handle left at its
extreme means **no bound on that side**, so the row still serialises open-ended.
The number fields stay authoritative and independently editable.

The drawn axis is **trimmed to p2–p98** (`lib/axis.ts`), with the excluded
readings drawn as hatched overflow bins at each end rather than dropped. A
linear axis over the full range is unusable for dragging and price says why:
79% of it is empty pixels, the densest single pixel holds 64 shoes, and the
middle half of the fleet gets 23px of a 222px control. Trimming roughly doubles
that. p2–p98 is symmetric, needs no per-metric tuning, and is deliberately
conservative — a wider trim buys travel but starts discarding real spread.

**Snapping is to values that exist, not to round numbers.** £5 and 1g detents
are arbitrary; a boundary between two shoes is not, and the rule self-adjusts
across the two regimes the fleet contains — 43 stops on price (10% distinct),
324 on energy return (90%) — with no constants. Both axis ends are readings too,
because `quantile` is floor-of-rank.

**Bounds may cross, and a crossed range honestly matches zero shoes.** Dragging
clamps each handle against the other, but the number fields do not, and a value
outside the axis **clamps only where it is drawn** — `clampPct` moves the
position, never the stored number. Clamping on input is actively broken: with
max at 180, typing "200" into min would rewrite the field at the third keystroke
and further typing would append to what it rewrote.

Two details the plot has to get right. **It is not a tab stop**: giving it
`tabindex` so `:focus-within` could reveal the grips would add an empty stop in
an app that already has 49, so the reveal hangs off the **row** — hover or
focus-within on the fieldset — which also means tabbing into either number
field reveals them. And **the touch hit areas are gap-aware**: 44px on a 222px
plot is a fifth of the width each way, so each shrinks to half the gap once the
handles are within 88px. Under `@media (hover: none)` the grips are permanently
visible, because hover never fires there. A *set* bound is drawn either way — an
edge is state, a grip is affordance, and they have different visibility rules.

**Each number field is named for the metric it bounds** — `Weight (g) minimum`,
not `min`. Ten range rows put twenty of these on screen, and a fieldset's
accessible name is not announced with the field inside it, so the metric is the
only thing that tells them apart.

**Every `role="radiogroup"` is one tab stop and answers the arrow keys**, from
one action, `lib/roving.ts`, applied to all four of them — the zone, the story
segment, discontinued, and the generation picker. The role promises exactly
that, and each group made every radio its own stop and ignored the keys. The
radios are buttons rather than native inputs — two rendered copies of a group
must not join one document-wide radio group by sharing a `name` — so the
browser does none of it for us, and moving focus must also *activate*, which
`click()` is. Both axes move, because the generation picker is a column. The
tab stop is whatever is checked, tracked through a `MutationObserver` on
`aria-checked` so a selection made with the mouse, or re-derived from a link,
carries it too; a group with nothing checked still admits focus at its first
radio.

**Below 800px the sidebar is a drawer, and a drawer traps focus.** It slides
on a transform rather than toggling `display`, which cannot be animated;
`visibility` is what keeps a closed drawer out of the tab order, switched
immediately on the way in — the panel is handed focus the moment it opens, and
a hidden element cannot take it — and 200ms late on the way out, so the slide
is seen first. Escape closes it and returns focus to the control that opened
it, found by its `aria-controls`. **A drawer left open across a resize past
800px closes itself**: above that width it is simply part of the page, and its
trap would hold the keyboard inside a panel that is no longer modal.

## Columns and sorting

`cols` accepts the four shoe fields that have cells (`releasedAt`, `score`,
`msrpGbp`, `plate`), the six synthetic score keys — two per story
(docs/app.md §The story scores) — and any test slug; `name` and
`brand` are rendered by the table itself and have no cell, so they are sortable
but never columns.

**The default view holds six numeric columns**, plus `releasedAt` and `plate`,
which carry words and dates rather than figures. Six is the bound: it is the
widest numeric set that fits the narrowest common phone without horizontal
scrolling. `midsole-softness-22` is the column the default gives up — the
sparsest of the seven it used to carry, and the only one no story reads,
because docs/shoe-stories.md argues softness should not drive a shortlist.
This is a product change rather than a phone workaround, because **columns
never vary by viewport**: `cols` serialises into the URL, so a
viewport-dependent default would mean a link shared from a phone carried fewer
columns than the sender saw and the URL would stop describing the view
(docs/app.md §View and URL ownership). A stored view from before the change
simply reads as non-default, which is why `VIEW_STORAGE_KEY` was bumped
alongside it; shared links carry explicit `cols` and are unaffected.

The picker and the sidebar both offer `metricEntries` (`app/src/lib/lineage.ts`)
rather than the raw catalogue, so a superseded pair is one entry and a
heel/forefoot split is one entry. The picker groups by the dataset's test
groups, with the tests carrying no `groupId` collected under **Other** — that
gap is upstream's shape, not a bug here (docs/scraping.md §Data quirks). A
colocated entry takes its **primary's** group, which is what moves the forefoot
halves beside their heel counterparts. Both halves stay separately checkable
and separately sortable: a forefoot striker wants the forefoot number, and
merging them would destroy the distinction.

The four heel/forefoot pairs — stack, energy return, shock absorption, midsole
width — are **declared** in `ZONE_PAIRS`, because the catalogue links only two
of them and carries no notion of zone at all. The declaration is authoritative
where it applies: it names the heading, orders the halves forefoot-first, and
puts `zone` on each part. `parts[].label` stays the full test name, so the
column picker can still tell "Forefoot stack" from "Heel stack". A declared
pair takes its group from the **heel** half. Pairs are never inferred from a
slug or a name pattern — `heel-padding-durability` has no forefoot
counterpart, `forefoot-traction`'s secondary is unpublished, and an upstream
rename would silently regroup the sidebar.

Agreement with the catalogue is asserted by `lineage.test.ts`, **not** thrown
at runtime: a pair whose slugs are absent is skipped silently, because
`metricEntries` is called on partial catalogues throughout the suite — including
single-half cases it must degrade rather than reject — and a throwing validator
would take the app down with them. When that assertion fires, read
docs/operations.md §Contract-drift runbook.

A pair offers exactly one generation — the chosen one, current by default. The
click path enforces that: choosing a generation drops the sibling's range and
its column in the same `setView` call, matching what `parseView` does to a URL
(docs/app.md §URL encoding). `metricEntries` takes `LabTest[]`, so the sidebar
constructs `score` and `msrpGbp` as entries itself; they are shoe fields, and
without that the price filter would disappear.

Sorting reads numbers, with missing values always last and score as the
tie-break, so a sort never silently reorders the tail. `releasedAt` sorts as
an ISO string; year-derived dates therefore sit at 1 January, and the table
prints the year alone unless `preciseReleaseDate` is set. `sortShoes` takes the
resolved score lookup as an optional fourth argument and consults it **by column
key**, because the score keys are the ones `numericValue` cannot answer for.

**Easy shows the score and most of the terms behind it.** Six numeric columns is the
phone bound above, and Easy spends them on the score, shock absorption, energy
return, price, weight and the RunRepeat score. Two of those are not Easy terms at
all and are there anyway: price, because the value call is the runner's, and
weight, because it is the number a runner compares trainers by whatever the story.
**Outsole durability is the term that pays for weight** — a deliberate swap, not a
shortage of slots, since Easy has three terms and three free columns. What every
story gives up is toebox width, because fit is the runner's own last filter and no
score speaks to it, and stack, because the score reads shock absorption rather than
the millimetres behind it, so a shown stack invites a hand ranking the story argues
against.

### Table presentation

Every header is two lines: the metric name, then the units-and-direction line
`headerUnits` derives in `app/src/lib/units.ts`. Units are **derived, never
authored** — `float` carries its own, `percent` is `%`, `score` and `rating`
are `/5`, the `score` field is `/100` and `msrpGbp` is `£` — and the arrow is
`directionOf`'s, so a neutral metric gets none. `size-rating` is the one
override: it reads `3 = true`, because `/5` would present a runs-small /
true / runs-large scale as a mediocre mark.

Figures are right-aligned with `tabular-nums`; `plate` and `releasedAt` hold
words and dates and are not. Those two are the cells that carry
`white-space: nowrap`: "Non-carbon plate" wrapped to three lines in an
auto-sized column and made the row heights ragged. It goes on the **cell**,
never the header — `nowrap` on a `th` makes each column's minimum its longest
header, which is the bug that pushed the document sideways.

**The plate cell reads "Non-carbon", not "Non-carbon plate".** The dropped word
is the one the column heading already carries, and it was costing 39px in the
only place the table could not afford them. Measured with the real fleet at
1200px: the plate column asks 137px with the longer label and 98px without, and
the table's min-content is 934px against a 908px track — so the document
scrolled 10px sideways at 1200px, and does not now.

Letting the cell wrap instead was measured and rejected: the column collapses to
73px, the label stacks onto three lines and rows carrying it grow from 44px to
77px, which is the raggedness `nowrap` exists to prevent. The rule stays; only
the string got shorter.

**Sideways scroll still exists below 1171px**, which is where the table now
first fits — it was 1210px before this. At 1100px the document overruns by
71px. That band runs down to the 800px breakpoint, where the sidebar becomes a
drawer and the content track takes the full width; below 700px the mobile
rendering takes over and there is no horizontal scroll at all.

The e2e assertion is `toBeLessThanOrEqual(1200)` rather than `toBe(1200)`.
Equality tested more than the claim: a document *narrower* than the viewport
scrolls sideways just as little, and `scrollWidth` falls below the viewport
whenever the runner draws a classic scrollbar. The two forms agree in headless
Chromium, where a fitting document reports exactly 1200 — this is a statement
of the claim, not a bug fix.

**The overflow above is measured, not guarded.** The e2e fixture is five shoes
with one-word names, and its `scrollWidth` is 1200 with the long plate label or
the short one, so no test in the suite reproduces the 10px the real fleet
overran by. Widening the fixture is what a guard would take, and the counts and
score values that every other e2e assertion pins are what makes that expensive.

The name cell is a
plain `table-cell` with an inner flex row, because `display: flex` on a `td`
takes it out of the table-cell box, so it stops stretching to the row and
leaves a gap the numeric cells show through under the sticky column.

Any number of rows expand at once — comparing two shoes means having both
panels open — and the panel scrolls itself into view, under a
`prefers-reduced-motion` guard. An expandable row carries `aria-controls` as
well as `aria-expanded`, in both renderings, **while it is open**: the panel is
a *sibling* row rather than a child of the control, so nothing else says what
the row expands, and it exists only while the row does — an IDREF naming a node
that is not in the document resolves to nothing.

**A skip link is the first element in the page.** It is 49 tab stops from the
top to the first table row, and `SkipLink.svelte` moves focus to
`TABLE_ANCHOR_ID` (`lib/anchor.ts`) itself rather than letting the `href`
navigate: the query string is the view and nothing else may write to the
address bar, so a `#shoe-table` left behind would ride along in every copied
link. The anchor carries `tabindex="-1"`, because `.focus()` on a plain
container is a silent no-op, and `scroll-margin-top: var(--thead-top)`, because
the top of the scrollport is behind the pinned chrome: without it the jump
lands the anchor at y=0 and the runner arrives looking at the third row.

**No brand line under the name.** 442 of 450 names already begin with their
brand and the remaining 8 shorten it ("Topo", "Hylo") rather than drop it, so
the line was duplication on every row. `brand` stays in the data: it is still
filtered and sorted on. There is no dimming of discontinued rows either — the
`disc-tag` chip says it in text, and dimming would argue against the
`discontinued=only` filter, which exists because those shoes are worth finding.

The `thead` pins at `--thead-top`, and the first column pins left.

`--thead-top` is **measured, never assumed**. `Page.svelte` wraps the header
and the toolbar in one `.chrome` box, pins that box at `top: 0`, and binds its
`clientHeight`; the same number gives the sidebar its `top` and its
`max-height`. There is no fallback value, because there is no width at which a
constant is right: the chrome is 44px at 1200px, 70px at 700px once the header
wraps, and 103px at 375px once the toolbar wraps too. A hard-coded `3.2rem`
pinned the header row 19px behind the chrome at 700px and 52px behind it at
375px, so the row was partly invisible on every phone.

The `.layout` grid is `260px minmax(0, 1fr)`, and the `minmax` is load-bearing:
a bare `1fr` track takes an automatic minimum of `min-content`, which the
table's 14rem name column and `white-space: nowrap` headers inflate past the
viewport. It scrolled the whole document 42px sideways at 1200px.

Both sticky rules also depend on `Page.svelte`'s `.content` having **no
`overflow-x`**: setting
it forces `overflow-y` to compute to `auto`, which makes `.content` a
scrollport, and a sticky header inside a box that never scrolls vertically
rides off with the page. Measured in Chromium at 1200×700 scrolling 800px: with
`overflow-x: auto` the header goes from y 266 to −534; without it, it pins at
51 and stays. Horizontal overflow therefore falls to the page. Do not "fix"
the horizontal scrollbar by putting `overflow-x` back — that trades a working
pinned header for it.

### Two renderings, and only one of them mounted

Below 700px the same columns render as `ShoeTableMobile.svelte`: the shoe name
takes its own full-width row with the chevron, and the numbers get the whole
viewport beneath it in true columns under one shared sticky header. A pinned
name column with the numbers scrolling behind it is not a design at 375px — it
spends 40% of the width on the name and shows about two numbers.

**Which one renders is decided in script, not by a media query.** `Page.svelte`
holds a `matchMedia('(max-width: 699px)')`-backed `$state` and mounts only the
winner, because a `display: none` table is still in the DOM: it would answer
"what are the columns?" twice, for assistive tech and for the suite alike.
jsdom evaluates no media query and vitest applies no component CSS, so the
suite cannot see the difference at all — `test-setup.ts` stubs `matchMedia`
non-matching, and the phone rendering is checked directly in
`ShoeTableMobile.test.ts` and at real widths by Playwright.

The geometry is the contract, and these numbers are measured rather than
chosen:

- `table-layout: fixed`, `border-collapse: separate`, `border-spacing: 2px 0`.
  Content-sized columns made every chip a different width and detached each
  header from the values it labels. The spacing-derived gap is what makes
  every chip one box.
- **57px minimum column**, so six columns need 358px and fit any phone from
  360px up. The table bleeds out of `.content`'s inline padding to get there.
  Past six columns the minimum holds and the page scrolls, so every column
  always has the geometry the labels were validated against — measured at
  360px with nine columns: 57px each, page scrolling to 533px, nothing clipped.
- **2px of horizontal header padding, deliberately not the nearest token.**
  `--s1` is 4px and would take 4px off a 57px column, which is the difference
  between "softness" fitting its header and clipping. It is the one place the
  token scale is overridden.
- The sticky header **paints its own `border-spacing` gaps**, with `--bg` side
  shadows either side of each `th`. A cell background stops at the cell, so the
  band was see-through in 2px slits and scrolled rows showed through them.
- That leaves **53px of header text** at 360px and 56px at 375px, which is what
  `app/src/lib/labels.ts` validates every catalogue name against. Names wider
  than that get a short label; 35 of 53 keep their real name. `Outsole wear` is
  the one entry that is not a length fix — the test is Dremel dent depth in mm,
  so "durability" contradicts its own units, and this is a deliberate
  divergence from RunRepeat's name.
- The `score` field reads **RunRepeat Score** everywhere a human sees it — the
  header, the column picker and the filter row — because our own score sits
  beside it and "Score" alone no longer says whose it is. It is one of the
  entries that then needs a short label as well: `RunRepeat` alone is 63.5px
  against the 52px bound, so the phone reads `RR score`. The CSV writes raw
  column keys and is unaffected.
- **Up to three lines**, which `labels.ts` validates as well: the width bound
  alone lets a name of short words grow without limit, and the header is
  sticky, so a fourth line is paid once by every screen. Every label is at or
  inside the bound today, several exactly on it, so the guard is what an
  upstream name one word longer runs into.
- Values are **centred**, not right-aligned: with fixed equal columns that is
  the more composed object and leaves no dead colour. The cost is that `73`,
  `74.3` and `80.38` centre on different axes, judged acceptable at real
  density. If it is ever revisited, right-alignment is the rigorous choice and
  column-sized widths are its necessary partner.
- The wash is **inset as a rounded chip** rather than filling the cell. At this
  density full-bleed cells read as a solid band of colour, far louder than the
  desktop table where borders and wider cells break the wash up.
- `releasedAt` and `plate` render as dim metadata after the name and **wrap
  rather than truncate**. Neither fits a ~53px cell and neither is a thing you
  scan down a column; moving them is what keeps the value row uniformly
  numeric.

Rows are double height in this rendering, so roughly half as many shoes fit a
screen. That is the direct price of keeping the numbers in columns, and it is
worth paying: columns are what make this a comparison tool rather than a list.

Plate filters as a **set of the real values** a shoe can carry — `none`,
`plated-other`, `carbon` — with empty meaning no constraint, so "not carbon"
is chosen directly as the first two rather than named by a token. The set is
always ordered as `PLATES` declares it, in the UI and in `parseView` alike,
because a selection is compared to a story's by value. As a **sort**, plate
is ordinal: `none` 0, `plated-other` 1, `carbon` 2, so descending reads "most
plate first" like every other column. `plated-other` reads **Non-carbon**
everywhere a human sees it — the desktop cell, the mobile name line and the
filter box. It read "Non-carbon plate" until the trailing word was found to be
both a repeat of the column heading and 39px the table could not spare
(§Table presentation).

## Categorical columns

`option` and `bool` readings name a choice rather than measure a quantity.
`lib/categorical.ts` owns them: `categoricalValue` renders one through the
catalogue's declared labels, falling back to the raw slug so an upstream
addition reads as an unfamiliar word rather than as no reading at all.

They are **choosable as columns but never rangeable**, which is why the picker
reads them from `categoricalEntries` rather than `metricEntries` — the
Add-filter dialog reads `metricEntries` too, and a range over a categorical test
would empty the fleet in one click (docs/app.md §Filters). They also carry no
units and no direction arrow: there is no better end to point at.

Four readings were already in the dataset and unreachable before this existed —
the two option tests plus `removable-insole` and `reflective-elements`, which
are `bool`. Sorting orders them alphabetically by the label a reader sees, not
by the stored slug, so the order matches the column; that sort is a URL-legal
one, because a header that offers a sort a link cannot carry would make
`Copy link` hand back a different view (§Columns are permissive, ranges and
sorts are strict). On a phone they join the name line rather than the value row,
for the same reason plate and the release date do: the value row stays uniformly
numeric (§Columns and sorting).

**`plate` is the shoe field's, not the catalogue's.** The catalogue also has a
`bool` test slugged `plate`, read on two shoes of 450, and one column cannot
have two sources. `isCategorical` excludes the slug, so the derived field —
which reads the whole page and says Carbon / Non-carbon — answers for the
cell, the picker offers the column once, and the test's own reading is simply
never shown. Any future field/test slug collision belongs in the same set.

**The phone's name line is prose, and says only what a shoe has.** A cell sits
under a header that asks the question, so it prints `None`, `No`, or an em dash
for no reading, and all three are legible. The name line has no header, so it
does two things a cell does not. It **drops an absence** — `isNegativeReading`:
a `false` bool, or the `none` choice both option tests spell that way — because
"None · None · No" tells a reader nothing they came for. And it **names the
column**: an option reads `Gusset: Both sides (semi)`, because the value alone
answers a question nothing on that line asked, while a true `bool` reads as the
feature alone (`Removable insole`), since naming it is the whole reading. The
noun comes from `chipLabel`: the catalogue name for most tests, overridden for
the two whose name already carries a colon, since "Tongue: gusset type" would
put a second one on the line. Not `SHORT_LABELS` — those are bounded to a 53px
header, and "Remv. insole" reads as an abbreviation in a sentence.

**That line keys each entry by its column, never by its text.** A keyed
`{#each}` over the text itself throws `each_key_duplicate`, which blanks the
whole page rather than the row. Today's labels happen to keep any two chips
apart, so the regression test builds a catalogue where they collide rather than
resting on that: the invariant is the key, not the label rules that currently
protect it.

**There is no categorical filter yet.** A set-membership facet is the obvious
next step and is a backlog item, not an oversight — the column is useful for
comparison without it.

## Number display

`displayNumber` rounds to two decimals at the cell. The dataset stores every
reading exactly as RunRepeat computed it — the two shock-absorption tests
arrive with twelve significant figures (docs/scraping.md §Data quirks) — and
trimming belongs to the view, not the record. The in-app CSV export therefore
writes full precision: it is a data export, not a rendering.

The export's columns are the visible ones, plus four that are always there:
`slug`, `name`, `brand` and **`url`**. The link is emitted whatever the view
holds, for the same reason the numbers are unrounded — a row that has left the
app has no other way back to the page its readings came from. `reviewUrl` in
`lib/dataset.ts` is the single spelling of that URL, shared with the detail
panel. Release-date precision travels with the date rather than being dropped:
where a `releasedAt` column is shown, `releaseDateSource` is emitted beside it
(docs/app.md §Release-date provenance).

## Release-date provenance

The table renders every release date at **month precision** — `March 2024` —
except a `listing`-sourced one, which renders as the bare year because only the
year was ever real (docs/scraping.md §Release-date provenance). `displayReleaseDate`
in `lib/release-date.ts` is the single spelling of that rule, shared by the
table and the mobile strip.

The day is never shown, even for the 24 shoes whose date is precise: a column
that is day-precise for 5% of rows implies a resolution the dataset does not
have. The day is not lost — `releasedAt` keeps it, so sorting stays exact and
the CSV exports it in full, for the same reason the numbers are unrounded
(docs/app.md §Number display).

The in-app export emits `releaseDateSource` **beside the date column it
qualifies**, not among the always-present identity columns: a provenance column
with no date column beside it is noise. `shoes.csv` carries it unconditionally,
because that export has a fixed header.

## Released after is month-granular

Every bound is stored as the first of a month. The dataset is month-precision
at best — only 24 of 450 shoes could supply a day
(docs/scraping.md §Release-date provenance) — so a day picker would offer a
bound the data cannot honour.

**The control is `MonthPicker.svelte`, not `input type="month"`.** Firefox and
WebKit implement none of that type: both reflect it back as `text`, so what
Chromium drew as a picker was a bare box in the other two, with no picker, no
format hint and no validation. Worse than cosmetic — `startOfMonth` is
`iso.slice(0, 7) + '-01'`, so a typed "July 2024" became the bound
`"July 20-01"` and filtered wrongly in silence. Only someone who knew to type
`2024-07` got a correct answer, and a Chromium-only e2e suite reported it
working throughout.

The replacement is a trigger reading `July 2024` — or `Any month` — over a
popover holding a `‹ 2024 ›` year stepper and a `role="grid"` of twelve months.
**A grid, not a radiogroup, and not `lib/roving.ts`.** That action activates
whatever it moves to, which is exactly right where the role promises selection
follows focus — and exactly wrong here, where activating writes a filter and
shuts the panel. As a radiogroup the first arrow press committed a neighbouring
month the runner never chose and dismissed the picker on them, so the grid was
un-browsable by keyboard. Now the arrows only move: left and right by one, up
and down by four, Home and End to either end of the year, clamped rather than
wrapped and stepping over any month the fleet never reached. Enter and Space
need no handler at all, because these are real buttons and the browser turns
both into the click that commits.

The grid owns its own `tabindex`, and the one tab stop is the bound's month
when the year on screen holds it and the first offered month otherwise —
never nothing, and never a disabled month, either of which takes all twelve
buttons out of the tab order. The stepper and the grid are both bounded by the fleet's own first and last
release dates, derived from the loaded shoes: this is an affordance rather than
a score constant, so docs/decisions.md §Frozen scores and live thresholds does
not apply, and the brand list beside it is derived the same way. Months with no
shoes *inside* that span stay enabled — for an "after" bound an empty month is
still a meaningful cut, and 8 shoes span 2015–2020, so disabling by coverage
would grey out most of the list and read as broken.

The panel is `position: absolute` in the sidebar rather than portalled to
`<body>` like the Add-filter dialog (§Stacking order): it is the width of the
column, so it never reaches the table, and the section hangs near the top of
the sidebar's scroll content, so it is never clipped vertically. It is sized
`width: 100%` with `border-box` because the sidebar's `overflow-y` makes
`overflow-x` compute to `auto` — a fixed 15rem panel lost its fourth column and
half the next-year control to that clip, measured rather than reasoned.

Two behaviours are load-bearing and easy to break. The displayed year is state
of its own, not the bound's year, so stepping can leave the bound and return
without emitting. And the year is **clamped in the step handler**, not only by
the buttons' `disabled`: a guard living in markup is one a stray click walks
past, and disabling a focused stepper drops focus to `<body>`, which arrives at
`focusout` as a null `relatedTarget` — closing on that would make the last year
unreachable, so a null is explicitly not treated as leaving.

Firefox and WebKit run this filter in CI for exactly this reason
(docs/operations.md §The e2e run needs three browsers).

`startOfMonth` in `lib/release-date.ts` is the one normalisation, applied at
three edges: the input, the 1y/2y/3y chips, and `parseView`. It exists because
bounds compare against full ISO dates and a bare `YYYY-MM` sorts *before* every
day in that month, so an unnormalised bound would silently shift the window by a
month. `applyFilters` is untouched by this and still compares whole ISO strings.

The chips truncate too, which **widens** the window by up to a month rather than
narrowing it. That is the deliberate direction: this filter's failure mode
should be showing a shoe that is marginally too old, not hiding one that
qualifies.

The URL carries `after=YYYY-MM`. A day-precise `after` from an older link still
parses and normalises inward, so shared links keep working and round-trip
stably thereafter.

## Resolved price

Lab test 52 and the `msrpGbp` field are the same GBP list price from two
sources. `priceOf` prefers the test, which refreshes with every weekly metrics
run, and falls back to the field, which only changes when a shoe's page is
re-crawled. `numericValue` routes the `msrpGbp` key through it, so the column,
the sort and the range filter cannot disagree with each other. Both fields stay
in the dataset; this is a view-layer resolution, not a build-time merge.

## Model lineage

The expanded row links a shoe's predecessor, its successor and — only when it
is not the successor repeated — the newest model in its line
(docs/scraping.md §Model lineage). Links go to RunRepeat: shoe-lab has no
per-shoe page of its own to point at.

## Review language

`reviewLanguage` is non-null only for the handful of reviews RunRepeat
published in the wrong language (docs/scraping.md §Review language). The panel
names the language above the prose. The text is shown, not hidden — it is
RunRepeat's copy either way, and a reader who wants it translated has the
review link.

## Presets

Preset chips are canned view states: `applyPreset` builds a complete
`ViewState` from the defaults, so applying one **replaces** the view rather
than layering on it. A preset sets its own **columns** as well as its filters
and sort, which makes it the single place a story is expressed.

**A story is a pool and a ranking, and nothing else.** No story bounds a metric:
Easy and Tempo resolve to the plate gate and a sort by their own zone's score key,
Race to a sort and **no filter at all**. `applyPreset` therefore reads nothing from
the loaded fleet — the percentile bounds were the only thing that ever needed it, so
its signature is `(story, zone, stability)` and a fleet argument reappearing would be
a threshold in disguise. One consequence worth stating because it is a safety net
rather than a line of code: **no story participates in the sparse-bound guard** below,
which only ever looks at range keys. All three have lost it by having nothing to guard,
and what replaces it is asserted over terms instead of bounds
(docs/app.md §The story scores).

**`applyPreset` carries `stability` through unchanged** rather than rebuilding it
from `defaultView()`, and so does `allView`. Both marks are `sameValue` over the
*whole* view, so a new `ViewState` field participates in the comparison whether or
not it should: reset it and turning the preference on would unmark Easy, clicking
Easy again would silently switch the preference back off, and a plain table with it
on would mark neither `All` nor any story. It is the same rule the zone follows —
who you are survives, what you searched for does not.

This section owns the mechanism only. What each preset is *for*, and why its terms
and weights are what they are, is docs/shoe-stories.md — read it before changing
a number.

`applyPreset` takes a zone as an **input**, so the mapping is
`(story, zone) → view` with nothing special-cased: a story sorts by and shows
the half of each zone pair that the zone names — why is
docs/shoe-stories.md §Which half a story uses.
Nothing carries the zone afterwards; the view it produces simply uses one
half's keys, which is what `zoneOf` then reads back.

Each story's columns are six numeric — the phone bound
(docs/app.md §Columns and sorting) — spent on its score and the terms behind it,
though not uniformly. Race has three terms and shows all of them. Tempo has four
and leaves out shock absorption, which is its floor rather than its point. Easy
has three and still leaves out outsole durability, spending the slot on weight
instead — the reasoning is docs/app.md §Columns and sorting.

A preset must never bound a metric whose coverage over its own `considered`
population falls below `SPARSE_BELOW` (docs/app.md §Coverage) — a preset that
recommends against itself is self-inflicted. The guard is still asserted, but no
story has a range key for it to look at, so today it can only fail on a
counter-example `presets.test.ts` builds for it. The equivalent claim for a ranking
is made per term, and belongs to the scores (docs/app.md §The story scores).

Selection is **derived, never stored**: a story reads as chosen while the view
equals what `applyPreset` would build for it right now. Editing a bound drops
the highlight because the view genuinely is not that story any more, where a
stored `preset` field would keep claiming Easy.

### The story scores

`app/src/lib/score.ts` is a **story-agnostic engine**; each story arrives as a
`ScoreDef` in `app/src/lib/score-defs.ts` — its column keys, its term weights, its
divisors and its anchors, as data. The engine reads nothing story-specific, so a
fourth story is a fourth definition and one `DERIVED_ZONE_PAIRS` entry rather than a
fourth code path, and `SCORE_DEFS`/`defForKey`/`defForPreset` mean no consumer
enumerates the stories. Four stages, each doing one job, and the separation is the
design:

1. **Physical map** — each raw reading becomes 0–1, **linear in goodness**, with its
   true zero preserved. What the measurement *means*; reaching for a percentile by
   default is what hides it.
2. **Divide by that term's standard deviation**, without centring. Equalises spread
   across terms. Not centring is what keeps the true zero, and the differing means only
   add a constant to every shoe, which cannot change an ordering.
3. **Weight** — editorial, and only *effective* because of stage 2.
4. **Rescale the weighted mean between two frozen anchors** to give 0–100. Cosmetic;
   the ranking is settled by stage 3.

Stage 2 is not optional, and this is the part that is easy to drop. A term's influence
is otherwise set by its spread on its own mapped scale, not by its weight: measured
across the pool, outsole durability at weight 1 outweighs shock absorption at weight 2,
and heel counter stiffness — five subjective buckets — becomes the most influential term
in the function. The coarsest metric wins *because* it is coarse. Min-max does not fix
it (both are linear; influence comes from spread, not range) and rank does but discards
the magnitudes stage 1 exists to capture. `score.test.ts` asserts the effective
influence against the real dataset, so this is a regression test rather than a
measurement someone took once.

Which terms each story has, what each is for, and why the missing ones are missing is
docs/shoe-stories.md. Stage 1 is **shared by all three**: a metric means the same thing
whichever score reads it, so there is one mapping per term and one `TERM_ORDER` every
breakdown reads in — two score columns on screen would otherwise list their shared terms
differently. A per-story mapping constant is the one thing that would let two scores over
one pool disagree about one measurement, which is why `L_OK` is not one.
The mappings are ratios rather than percentiles because
each has a defensible physical form: shock absorption over a fixed reference (a fit
through the origin gives ≈3.6 SA per mm of stack and predicts the barefoot shoes, so 0
SA ≈ bare ground); energy return is already a true percentage; outsole life is
`thickness / wear`, so goodness is **reciprocal** rather than negated — half the wear
rate lasts twice as long — and **capped**, because past a few Dremel-units of life the
outsole is not what retires the shoe, the midsole packing out is, and that is
unmeasured; midsole width over stack, because stability is a lever from foot to ground
and the dimensionless ratio also stops "stability" covertly selecting heavy shoes — measured
against weight over the pool, the raw width correlates positively and the ratio slightly
negatively, and opting in barely moves the top 30's mean weight, which stays under the pool
mean on both sides; heel counter stiffness off its own five-point scale, because a
percentile would invent resolution the measurement does not have.

**No story weights a thin term.** This is the score's half of the sparse-bound guard
(§Presets), and it is the half that still has something to check: `score.test.ts` counts
every weighted term over the pool its story is scored on — the plate-filtered 378 for
Easy and Tempo, the fleet for Race — and fails when one falls below `SPARSE_BELOW`
(§Coverage). The stability pair is counted too, because a runner can turn those terms on.
Counting is on the **mapped term** rather than a metric slug: outsole life and midsole
width are ratios, and a shoe missing either half is as unscoreable as one missing a
reading outright. Every term sits comfortably clear of the threshold today, so a failure
means upstream coverage has genuinely collapsed — drop the term, or the story that
weights it. Do not lower the threshold, which is owned elsewhere and shared with the
presets. The live margin is the test's to report, not this doc's to restate.

**Every constant is frozen** — derived once from the fleet at `data/` commit `baed23b`
and never recomputed from the loaded catalogue: the two references, the outsole cap, the
per-zone width caps, the sd divisors per zone, and the anchors. Why, and what an
agent must not "fix", is docs/decisions.md §Frozen scores and live thresholds.
Consequences, all intended: a shoe's score never
moves because the catalogue grew, and **a future score may exceed 100**, which is why
the column's header carries no `/100`. `score.test.ts` pins every constant, so an
accidental recompute fails the build rather than silently moving every score.

**A divisor belongs to a pool, never to a story.** It is a property of
`(metric, mapping, pool)`, so Easy and Tempo — which rank the same plate-filtered 378 —
share **one object by reference**, and keeping two copies would be two homes for one
fact. Race ranks the whole fleet, where carbon widens every spread, so its divisors are
materially larger than the pooled ones — the values themselves live in `score-defs.ts`
and nowhere else. The frozen tables are named for their pool
(`PLATED_POOL_SD`, `WHOLE_FLEET_SD`) and must not be collapsed into one global table.
The shared table carries every term, including ones a given story ignores — `weights`
decides which are read, and that is what lets two stories share one object.

**The pool names where a definition's constants came from; it does not gate
computation.** `Page` scores every loaded shoe against every definition, so a carbon
shoe gets an Easy score and is filtered out of Easy's *view* by the plate gate. A shoe
outside a definition's pool can therefore read above 100 or below 0, which is correct
and **must not be clamped**. There is deliberately no `pool` predicate on `ScoreDef`: a
callable would invite exactly that mistake.

The anchors are frozen **per story, per zone and per stability state** — four pairs each
for Easy and Tempo, two for Race, which has no stable variant. Only the anchors are per
story, because they are the one constant that depends on the weights. The toggle changes
what the score means, so one shared scale would invite a comparison that is not
meaningful; on shared anchors the stability-on list would top out at 77.6 purely
because the best shoe overall is not the most stable. `r0` cannot be dropped in favour
of the physical zero either: preserving true zeros through stage 2 leaves every shoe
carrying a large common baseline, so an unanchored scale compresses the fleet into
44–100 with a median of 82.

**Each score is two synthetic keys** — `easy-score-heel`, `tempo-score-forefoot` and so
on, six in all — and they are the columns whose value depends on the *view* rather than
on the shoe: the stability preference decides how many terms there are.
`numericValue` therefore cannot answer for them. **A score column names its own zone rather than taking the derived
one**: resolved through `zoneOf`, unticking two measurement columns turned every score
into a heel score with nothing on screen saying so, and the panel below could then
explain a half the header did not name. There is no zone fallback in scoring at all now.

Naming its own zone does not exempt it from the zone control. The pair is declared in
`DERIVED_ZONE_PAIRS`, held apart from `ZONE_PAIRS` because `metricEntries` resolves that
list against the catalogue and a key with no `LabTest` behind it would drop out of the
column picker — but `swapZone` and `zoneOf` read both. So a score column **follows a zone
click**, like every other column that carries no number, and a table showing only the Easy
heel score **names the heel**. Without that, clicking Forefoot swapped the stack column and
left a heel score sitting beside it. `labels.ts`, `direction.ts`, `urlstate.ts` and the
column picker all **derive** from that list rather than naming a score, so a further
story reaches the header, the wash, the URL allowlist and the picker with no edit.

**The stability preference reaches Easy and Tempo only.** A definition carries a
`stable` variant exactly when it applies, so the flag is inert inside `scoreOf` for Race
rather than branched on by any caller — and the toolbar's caption and help derive which
stories they name from the definitions rather than spelling them out. Why Race is
excluded, measured rather than assumed, is docs/shoe-stories.md §Race. **One named
preference is a deliberate decision rather than an unfinished generalisation**: a general
metric picker for the score is rejected, not deferred (BACKLOG.md).

`Page.svelte` iterates `SCORE_DEFS`, resolves one map per key and hands the whole lookup
— column key to slug to score — to `sortShoes`, both tables, the CSV export and the
detail panel, each of which reads it **by column key**, so a further story is a further
entry rather than a further parameter. It is computed
**client-side at render time**, like a percentile bound and unlike anything in `data/`:
while the weights are still moving, a dataset rebuild between experiments would defeat
the point. Moving it to build time later is a performance decision, not a correctness
one, and no determinism gate applies: nothing about it enters `data/`
(docs/scraping.md §Determinism).

An unscored shoe renders an **em dash** and sorts last whichever way the column
sorts — never a 0, which would read as the worst shoe in the fleet — and the CSV
leaves its cell empty for the same reason. The column's wash ranks over the
**rendered rows** (`rankMap` in `lib/stats.ts`), like every other column's, or its
tint would mean something different from its neighbours' in the same row.

Expanding a row shows the **per-term breakdown**: the raw reading, the mapped term, the
weighted contribution and the share, per term. That is not decoration — it is what makes
a surprising rank diagnosable rather than arguable, and it is the reason the feature
ships before the weights settle. The **reading** column is what makes it work at all:
two terms cap, and most of the scoreable pool sits at exactly 1.0 on outsole durability,
so a mapped value alone cannot say what put them there. Where a term reads a derived
quantity the cell shows the division — `1.33 = 4 / 3` — because the ratio alone does
not say which reading moved. `readings` in `score.ts` owns those readings, so the
panel never re-derives them. Five columns need 354px against the 321px a 375px phone
leaves the panel, so the block is **its own scrollport**: the page must not go sideways
for it, and the e2e run asserts that at 375px with a row open. The panel is handed the
view's **columns**, and renders one breakdown per score column on screen — labelled with
that column's own header text, keyed by the column and resolved through `defForKey` and
`zoneOfKey` — and none at all without one. Keyed by the **column** rather than the zone
because with three stories on screen a zone appears three times, and Svelte throws on a
duplicate key. Reading the columns rather than a zone is what makes panel and column
unable to disagree; `stability` still applies to all alike, and Race simply ignores it.

### The zone is a preset too

**A zone, and never a "side".** The heel and the forefoot are the two *ends* of
a shoe: a runner asked to pick a side reasonably thinks of the medial and
lateral ones, which this tool has no readings for at all. The control reads
**Measured at**, which describes where the number came from rather than how the
reader runs — naming the runner's strike would claim a self-diagnosis the tool
cannot check (docs/shoe-stories.md §Which half a story uses). The type is
`Zone`; "side" is not a synonym for it anywhere in the code, the copy or these
docs.

Both groups above the table are derived marks over one view, not a field and a
mark. `lib/zone.ts` is the whole mechanism:

- **`zoneOf(v)`** is the zone a view is *about*: the one half every zone-paired
  key it uses belongs to — columns, range keys and the sort key alike — or
  `null` when it uses both halves or neither. A mixed view is not wrong, it is
  simply neither preset, exactly as a hand-edited view is neither story. Unlike
  the story mark, this one **survives hand-editing a bound**: a zone is not a
  story, and a runner who types a heel number has not stopped being on heel.
- **`projectZone(v, zone)`** is what a click does. Columns and the sort key
  carry no number — "sorted by energy return" means the same on either half — so
  they follow; a bound on the half being left carries one that does not
  transfer, the median heel stack landing in the top few percent of forefoot
  stacks, so it is **dropped rather than translated**. Carrying the
  *percentile* across instead would silently rewrite a number the runner typed.
  Everything with no zone — price, weight, brands, search, the discontinued and
  missing-data flags — is untouched. A view that names no zone at all gains that
  zone's two default measurement columns, so the control is never a dead button
  that has just deleted a bound.

Together those give the invariant the rest depends on:
`zoneOf(projectZone(v, z)) === z` for every view and zone. A click always leaves
the view committed to the zone clicked, so the mark can honestly read
everything and the just-clicked control is never left unlit. `Page.svelte`
routes a view that *is* a story through `applyPreset` on the new zone instead,
so it re-resolves as that story's own view of the new half — its sort key, its
score column and its measurement columns all move together.

Mixed views stay reachable by hand and by link, and stay unmarked in the zone
group. They are simply not *preserved* across an explicit zone click.

### What All does

`allView(v, zone)` is both what `All` produces and what lights it: `All` is
marked exactly when `sameValue(v, allView(v, zone))`. One function rather than
an action and a matching predicate, so **marked means pressing it changes
nothing** is true by construction and cannot drift.

With a derived zone, `All` restores that zone's plain table. With none it
replaces the filters and touches nothing else — there is no defensible column
set to impose on a deliberately mixed table, and clearing a bound is not
removing its row (docs/app.md §Filters), so a hand-added row that was on screen
only because it carried a bound stays listed and empty. The zoned branch is a
wholesale restore, which by definition carries no hand-added rows, so there they
go. The two branches disagreeing is the point.

**A view with no zone covers two states**, and this branch treats them alike: one
using *both* halves, and one using *neither* — reachable by unticking Stack and
Energy return in the column picker, or by a link like `cols=score,weight`. The
second gets the timid rule too, so `All` leaves those columns alone rather than
imposing a table on someone who chose not to have one. It costs a click getting
back: pick a zone and the two measurement columns are appended at the end where
`defaultColumns` interleaves them, so the order differs, `All` goes unlit, and a
second press restores the plain table (BACKLOG.md).

Two consequences follow from the identity, and both are deliberate:

- **A mixed view with no filters marks `All`.** A view showing everything is an
  `All` view whether or not it commits to a zone; the alternative leaves `All`
  unlit on a view it cannot change.
- **`All` is not idempotent when clearing a filter is what gives the view a
  zone.** From `cols=score,heel-stack` with a bound on `forefoot-stack`, the
  first press clears the bound and leaves the columns alone; the view is now
  heel-derived but is not heel's plain table, so `All` stays unlit and a second
  press restores it. There really is something left for it to do.

Marking on "no filter is active" was considered and rejected: it would light
`All` on a view whose columns and sort were hand-edited, so pressing a lit
control would still change the table.

When the view names no zone, applying a story has to pick one — the stories each
bind one half — and `DEFAULT_ZONE` is that pick.

### The setup strip

`SetupStrip.svelte` asks **both** questions once and then hands over to the
toolbar for good. Six equal cards in one row, in two divided groups: *Measured
at* — Heel, Forefoot; *Built for* — All, Easy, Tempo, Race with a one-line
description each.

**Neither label makes a claim about the person.** "I land on my heel" tells a
curious browser they are being mislabelled; "Measured at" describes what the
control does to the table, and "Built for" puts the claim on the shoe. This is a
deliberate stance — do not "fix" it back to something friendlier.

No card carries a count (docs/app.md §The toolbar). The descriptions align to a
common baseline by giving the **name** line a fixed height: bottom-aligning with
`margin-top: auto` leaves them ragged, because the descriptions wrap to different
line counts. The grid is
`repeat(2, minmax(0, 1fr)) 1px repeat(4, minmax(0, 1fr))`, so the group divider
gets a track of its own in the gutter and no card is resized to make room for
it; it is drawn in `--divider`, which exists because `--border` is invisible
against `--chrome`. Below 700px each group becomes two columns at full card
size — six in a row is a desktop layout.

A `?` beside each label opens `HelpPopover.svelte`, **one mechanism on every
device**: a click-triggered popover anchored beside the `?` above 700px and a
bottom sheet below, with focus return and Escape. A hover tooltip was rejected
— it is the same mechanism as the `title` attribute this pass removes from the
cards, and it needs a wholly separate touch path.

**Visibility is ephemeral `$state`**, initialised from "no query string *and* no
stored view" — a genuine first arrival, which `Page.svelte` already knows at
init — cleared on the first story click, never serialised and never persisted.
That is not the stored dismissal flag this section rules out, and the property
it protects is preserved exactly: a bare link opens expanded, a filtered link
opens collapsed. A zone click leaves the strip up, because the zone is the
strip's other question; a story click collapses it with a height transition
under a `prefers-reduced-motion` guard. The strip's `All` card stays marked
through a zone click, because the click leaves the view equal to that zone's
plain table, which is what `allView` produces.

**The strip never returns**, and nothing is lost by that: the only thing the
cards hold that the bar does not is the descriptions, which are a
first-encounter need. It is also why the strip needs no card of its own for
"everything": `All` is a permanent toolbar peer, reachable long after the strip
has gone.

### The toolbar

`Toolbar.svelte` is the permanent surface: two segmented radiogroups in one
visual language — the zone, a divider, then `All | Easy | Tempo | Race` — and an
actions group (`Filters`, `Columns`) pushed right by
`margin-left: auto`. The strip cannot hold the controls that reset it, because
it is gone by the time they are needed.

**The bar draws only its actions while the strip is up** (`showGroups`). The
strip *hands over* rather than sharing the screen: both surfaces drawing the
same two groups put the four stories on screen twice on a first arrival, which
is the one screen the strip exists to own.

**The stories carry no counts**, on the bar or on the strip. A scored story's
count is the size of its **pool** rather than of a shortlist — every non-carbon
shoe passes Easy, scored or not — so the number promised a filtering that no
longer happens. All three are scores now, and Easy and Tempo share one pool
while Race takes the whole fleet, so the three counts would distinguish nothing
anyway. The receipt's
`N of M shoes` is a different number and stays: it counts what is on screen.
Dropping them also drops three `applyPreset` passes over the whole dataset per
render.

**There is no `Clear` button.** `All` is the fourth peer of the stories and the
same state a Clear produced, `allView` (docs/app.md §What All does), named for
what you get rather than what you destroy — and it dissolves the ambiguity
between a toolbar "Clear" and the sidebar's "Clear filters". `All` leads the
group so it reads as everything → narrow to a story. It clears **hand-set
filters too**, not only a story's share: telling the two apart would need the
stored `preset` field this section rules out. The sidebar's **Clear filters** is
a different, smaller thing and keeps its name: it empties the filters and leaves
sort and columns alone.

Both marks are passed in, not held: `'all'` while the view equals what `All`
would produce, a story id while it equals that story, and `null` once it is
neither; the zone group takes `zoneOf` and marks nothing on a mixed view. Each
group is a nullable mark, so either can show nothing selected, and `roving`
still gives a group with nothing checked one tab stop.

**The score is explained where it is changed.** The stability checkbox is the one
control that alters the score, so the `?` beside its label opens the same
`HelpPopover` the setup strip uses rather than a second mechanism. It says that each
story ranks on measurements chosen for it and the breakdown names them, which stories
the preference reaches and why race shoes have no stable variant to surface, what every
score deliberately leaves out — price and release date, so the value call stays the
runner's — that a shoe missing a measurement is unscored rather than zero, and that the
scale is fixed to a dated fleet so a future shoe may read above 100. No maths: docs/app.md §The story scores owns that, and a second copy would drift.
The checkbox's label is explicit rather than wrapping it, because a button inside a
label is a click on the label: the help would toggle the preference it explains.

`ZoneToggle` carries **no visible lede**. Two segmented groups side by side
are one language, and the words live on the setup strip, where the question is
asked once; the group keeps `aria-label="Measured at"` so it is still
named for a screen reader.

The cascade has three tiers, and the rule is whether all three groups fit on
one line rather than phone-versus-desktop:

| width | layout |
|---|---|
| above 880px | one line, actions right-aligned |
| 560–880px | actions ride up beside the zone group on line 1; pace takes line 2, shrink-wrapped |
| 560px and below | as above, with pace stretched to fill the line and its pills `flex: 1` |

Three details that were bugs first. The **divider is removed** the moment the
groups stop sharing a line, or it wraps with the zone group and dangles after
Forefoot. `flex-basis: 100%` belongs on the **wrapper**, never on the
segment: on the segment, the bordered pill container stretches the full width
with its pills clustered at the left. And the narrow tier **tightens the bar's
own padding, gaps and button padding**, because line one is the zone group plus
actions and at 360px — the usual Android width, and the binding one — the two
needed 345px against the 336px the wider padding left them, so the actions
dropped to a third line and left the void the middle tier exists to prevent.

Picking a zone always leaves the view about that zone, in three states: a view
equal to a story is rebuilt as that story on the new zone; a view that names a
zone is projected onto the new one; a view that names none gains that zone's
measurement columns. In all three, the other half's bounds are **dropped rather
than translated**, and everything with no zone is untouched — the reasoning is
§The zone is a preset too. A no-op click on the marked zone returns
early, so it cannot rebuild the view.

## Stacking order

**Not one scale — a tree.** A z-index only ever means something next to its
siblings, and three of the boxes here are stacking contexts of their own, so
the numbers inside them are not comparable with the numbers outside. Read the
indentation, not the column:

| Layer | z-index | Ranked against |
|---|---|---|
| sticky shoe-name column | 1 | the page |
| pinned `thead` (its name cell, 3) | 2 | the page |
| **pinned chrome** — header and toolbar | 5 | the page |
| ↳ column picker panel | 10 | *the chrome's children only* |
| **sidebar** — sticky, so a context at `z-index: auto` | — | the page, at 0 |
| ↳ help popover, month picker panel | 20 | *the sidebar's children only* |
| filter drawer, below 800px | 30 | the page |
| Add-filter dialog | 35 | the page |
| skip link | 40 | the page |

So the column picker's 10 does **not** outrank the chrome's 5 — it is inside
it, and rides wherever the chrome goes. The month picker's 20 does not outrank
the drawer's 30 for the same reason. Only the unindented rows can be compared
with one another. The help popover is in the chrome and the setup strip rather
than the sidebar, but it shares the sidebar picker's number and its constraint:
both only ever have to clear their own siblings.

**A modal has to be a child of `<body>`, or its number is not on this scale at
all.** `position: sticky` creates a stacking context whatever its z-index, so
the desktop sidebar is one; the Add-filter dialog was written inside it and its
`z-index: 20` was therefore ranked against the sidebar's own children, never
against the page. The pinned chrome and the table's sticky header both painted
over the open dialog, and no value would have fixed it — 2000 inside a context
that sits at 0 still loses. The dialog moves itself to `<body>` on mount and is
removed from there when it closes.

The drawer is the reason the dialog sits at 35 rather than below 30: below
800px the dialog opens *from* the drawer, and once it is no longer a descendant
of that drawer it has to outrank it explicitly. Both facts are measured in
`smoke.spec.ts`, at 1200px and at 375px, by sampling `elementFromPoint` across
the open dialog's box — the desktop fix broke the phone once, and each width
only catches its own failure.

## Theming

Three-state cycle (auto → light → dark) persisted in `localStorage` and
applied in `main.ts` **before** the dataset fetch, so a saved dark theme never
flashes light. Storage access is wrapped: it throws rather than returning null
in blocked contexts, and losing the preference beats losing the click.

Colour, spacing, radius, type and elevation all live in `app.css` as tokens on
`:root`, with dark values under both `prefers-color-scheme` and `[data-theme]`
so the toggle wins in either direction. Components choose none of them: the
scales are `--s1`…`--s6`, `--r-sm`/`--r-md`/`--r-full`, `--t-xs`…`--t-xl` and
the two shadows, and `app/src/lib/tokens.test.ts` fails the build on a
component that writes its own rem font size or px radius.

The row surface sits at the end of the lightness axis in each theme — white in
light, near-black in dark — and both washes travel inward from it, separated
only by hue. **Grey means "more"; blue means "better".** A metric with a
declared direction gets `--wash-blue` **squared**, so only leaders read as
tinted, which is what a ranking wants; a neutral metric gets `--wash-grey`
**linear**, because a scale must read as a gradient rather than a podium.
Row hover paints as a translucent layer so the wash underneath survives it.

**The surface is painted on the row** — `tr.shoe` in the desktop table,
`tr.values` on a phone — and never on the numeric cell. The wash is a
translucent `background-color` on that cell at higher specificity, so a
cell-level surface would simply be replaced by it and the wash would composite
over the page instead of over the surface, which is the one thing the rule
above is about. The sticky name cell carries a surface of its own as well,
because the numeric cells scroll underneath it rather than behind the row.

The page sits one step behind the chrome and two behind the row surface
(`--bg`, `--chrome`, `--surface`), which is what makes the phone's cards read
as surfaces rather than as the page. Both themes keep that ordering: at
`#eeeeea` the light identity strip was 1.04:1 against the page and only the
white value row read as a card, where `#e6e6e1` gives 1.12:1 — the separation
dark already had.

Direction is **declared**, in `app/src/lib/direction.ts`, and never inferred
from a slug or a name: `outsole-durability` is Dremel dent depth in mm, so
lower is the more durable shoe despite the word, and `size-rating` is a
runs-small/true/runs-large scale on which 3 is correct rather than a mediocre
score. Stack, drop, softness, stiffness and every width are `neutral` because
they are fit and feel preferences with no fleet-wide better end
(docs/shoe-stories.md). Only `lower` inverts the percentile; `neutral` changes
the ramp's colour and nothing else, and drops the header's direction arrow.
An unlisted key reads `neutral`, and `direction.test.ts` fails the build when
an upstream numeric test arrives unclassified (docs/operations.md
§Contract-drift runbook).

The contrast obligation splits by the kind of mark, because one rule cannot
cover both:

- **Flat mark** — the inactive histogram bars and the coverage rule are a
  single fill, drawn or not. They clear **3:1 against the surface**.
- **Gradient wash** — governed by **text over the endpoint at 4.5:1**, with no
  surface floor. Every intermediate value of a ramp is closer to the surface
  than its endpoint and tends to 1:1 as p→0, so a surface floor is
  unsatisfiable by construction. The endpoint *is* the cap: it is the worst
  case of the ramp, so checking it is sufficient and no separate strength
  factor exists. Retune `--wash-grey` and `--wash-blue` against that.

## Coverage

A metric's coverage is the share of shoes carrying a reading among the shoes
passing every **non-range** filter — the population `applyFilters` reports as
`considered`. Non-range is load-bearing twice over: if range filters counted, a
metric's own bound would move its own denominator as the user typed it, and any
bounded metric would read 100% every time, because a bound already excludes
every shoe lacking a reading. The number would become a tautology exactly when
it was being used.

It is stated as **counts, not a percentage**: `378 / 450 measured` on the
heading line, and **only below complete coverage**, so most rows on a default
view fall silent. "84%" of an unstated pool is the complaint; both numbers on
screen state the denominator instead of assuming it. Filter to last year and it
reads `120 / 180`, where both numbers visibly moved.

**One vocabulary, and the shape decides only how many figures there are.** A
single metric and a **zone pair** each carry one, on the heading line; a
**superseded pair** carries one per generation, on its radio rows, with the word
repeated rather than hoisted to a column label so a row read on its own still
says what its numbers mean.

A zone pair takes one figure because **both halves are read in the same test
run**, so the two halves carry identical counts and a figure per half is
duplication. Generations take two because they genuinely differ, often by an
order of magnitude — a retiring method near-complete while its replacement is
still in the low tens. That difference is the whole basis of the choice, so it
has to be on screen. `coverage.test.ts` asserts the zone-pair equality against
the dataset rather than trusting it
(docs/operations.md §Contract-drift runbook).

There are **no coverage bars anywhere in the sidebar**. With only ever two rows
to compare, a bar earned less than it cost, and it competed with the emphasis
below. `ColumnPicker` and `AddFilterDialog` keep their percentage bars: those
choose among forty-odd metrics against a constant denominator, where a
percentage is a comparison device rather than a claim about a pool.

### Emphasis marks what is filtering

Bold reports a fact about the view: a metric heading is bold when any of its
rows carries a bound, and so is the specific half or generation carrying it.
Scanning the sidebar then answers "what is constraining this shortlist?" without
reading a number.

It replaced a `· in use` marker that named the half the zone group had selected.
That was a preset's business rather than a property of the filter, and it made a
zone pair look like a control it is not — the two halves were named twice, once
by the marker and again by each range row's own legend. **The halves are named
once now, by their legends.**

Both halves of a zone pair stay independently filterable, and that is deliberate
rather than incidental: a link carrying `r.heel-stack` and
`r.shock-absorption-forefoot` together is a legitimate thing to want. Do **not**
give a zone pair the superseded pair's switch — generations are mutually
exclusive by nature, zones are two measurements of two parts of a shoe
(docs/app.md §URL encoding).

### There is no sparse warning

The live count is the whole treatment: **do not add a badge that classifies a
metric as thin.** Coverage by release year shows every sparse metric is
**era-shaped**, not sporadic — each is either *arriving* (a clean adoption ramp
from nothing, like `breathability-25`) or *retiring* (near-total coverage then a
cliff, like `stiffness`). Not one is uniformly thin, so "this test is rarely
run" is a sentence that is false about every metric it would be shown on. The
per-year shares are not quoted here on purpose: curating release months moves
shoes between years, so any figure written down goes stale on the next curation
pass rather than on the next scrape.

Any such classifier needs a notion of **era per test**, which the dataset does
not carry; that is a BACKLOG.md item, not something to approximate from the age
of the oldest reading. Meanwhile the count **demonstrates** the answer as the
runner filters: narrow to recent shoes and an arriving metric fills in while a
retiring one empties out, which is more than a static label could have said.

`SPARSE_BELOW` and `isSparse` stay, redefined: they are a **preset-safety**
threshold, not a warning threshold. Nothing on screen reads them; the one
consumer is `presets.test.ts`, which asserts in both directions that no preset
bounds a metric below it — a preset that recommends against itself is
self-inflicted. Why generations exist at all is docs/scraping.md §Test lineage.

## Decisions

### Every row links back to RunRepeat
Attribution is structural, not decorative: the header carries a permanent
RunRepeat link and every expanded row opens with a link to that shoe's review.
The link lives in the expanded panel rather than the collapsed row because the
row's click target is the expander. Do not remove or defer-load either link
(docs/decisions.md §Be a good citizen toward RunRepeat).

### Columns are permissive, ranges and sorts are strict
`cols` accepts any test slug — showing a column the catalogue no longer carries
is harmless, it just prints nothing — while range keys are restricted to numeric
tests and sort keys to the keys that have an order: numeric tests, the shoe
fields, and the categorical columns, which sort by their label
(§Categorical columns). The asymmetry is the point: a bad column costs one ugly
cell, a bad range hides the entire fleet. Do not unify the allowlists — but
every sort a header offers has to be one the parser accepts, or `Copy link`
hands out a URL that reopens on a different view than the one that was shared.

### The dataset is a fetched asset, not a bundled import
`sync-data` copies `data/shoes.json` into `public/` and the app fetches it at
runtime. That keeps the dataset swappable after the build — which is exactly
how the e2e run substitutes its fixture into `dist/` — and gives a load
failure somewhere to surface, as an error message with a Retry button rather
than a blank page. Importing the JSON as a module would take both away.

**The loading state waits before it appears.** Nothing renders for the first
`SKELETON_AFTER_MS` (300ms); past that, a skeleton shaped like the chrome and
the rows that are coming, so the layout does not jump when they arrive. The
2MB asset is same-origin and most loads finish well inside the delay, and a
placeholder that flashes for one of those is worse than the text it replaced.

### Sharing is copying the address bar
`Copy link` in the header writes `location.href` to the clipboard, which is the
whole feature: the URL already *is* the view (§View and URL ownership). The
confirmation is a separate `role="status"` region rather than a relabelled
button — swapping the label would change the control's accessible name to
something that cannot then be pressed — and both an absent clipboard (outside a
secure context) and a rejected write leave it unsaid, because neither may claim
a success that did not happen. The region is **always rendered and only its
text arrives late** — a live region created together with its text is not
reliably announced — and it collapses its own flex gap while it is silent, so
the header is spaced the same whether or not a link has ever been copied.
The page carries a `<title>` and an SVG favicon
so a shared link previews as something; Open Graph tags need an image and a
decision, and are their own BACKLOG.md item.
