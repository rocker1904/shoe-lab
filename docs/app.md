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

`ViewState` also carries the runner's `strike`, and **the baseline takes it**:
`defaultView(strike)` and `defaultColumns(strike)` require one rather than
defaulting to heel, so no call site can reinstate the old silent assumption by
forgetting. `isDefaultView` compares against `defaultView(v.strike)`, which is
what lets a runner state their strike without leaving the default view.
`parseView` therefore resolves `strike` **before** it builds the baseline: read
in the parameter loop instead, a link carrying a strike and no `cols` would open
heel-shaped and already collapsed.

Init takes the first of: a query string in the URL, a stored view, the
defaults. A shared link must always beat a previous session, so the query
string wins outright and storage is only read when there is none. A view
restored from storage is passed straight back through `setView` once, which is
what puts it in the URL — otherwise a returning visitor would see a filtered
table behind a bare URL and copying the link would share the default view.
That reuses the single write path rather than adding a second write site.

The view is never re-derived from the URL. Not a shortcut — a correctness
requirement: state that does not serialise would be silently dropped on the
round trip. Every field of `ViewState` therefore serialises, `rows` included.

"Serialises to nothing" and "is the default" are still different questions, and
`isDefaultView` answers the second: a range key holding no bound at all is real
view state that `serializeView` omits, so `serializeView(v) === ''` would call
such a view default. It compares the whole `ViewState` **by value**, never by
key presence — `structuredClone` keeps own properties whose value is
`undefined`, so every cleared field leaves its key behind and a key count would
never let a derived control re-open.

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
`strike=forefoot`, `rows` (comma-joined), `sort` (`-` prefix means descending),
`cols` (comma-joined), and
`gen.<currentSlug>=<chosenSlug>` per superseded pair. A value equal to the
default is not written at all — a generation choice naming its own key is the
default and never appears.

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

Range filters and the Add-filter menu offer **numeric-typed tests only**
(`float`, `score`, `percent`, `rating`, plus the `score`/`msrpGbp` shoe
fields). A range over an `option`, `bool` or `text` test reads as missing for
every shoe and would empty the whole fleet in one click, so both the UI and
`parseView` refuse them. Each row is titled by its `MetricRow` rather than by
the fieldset legend, so the name is stated once — but the fieldset's accessible
name carries heading **and** side, because two rows both called "Forefoot"
would be indistinguishable to anyone not looking at the screen.

The order is fixed and comes from one declared list, `CURATED_RANGE_KEYS`:
search, released after, plate, brand, discontinued, price, then the metrics the
stories bound, then the rest curated, then anything added by hand. It does not
rearrange itself under the story or the strike — someone comparing two stories
must not have the controls move underneath them. Both halves of every side pair
are curated for that reason, and **every part of a side pair renders always**;
a single renders when it is curated, active, or listed.

**Clearing a value and removing a row are different actions.** Clearing empties
both bounds in one click and deletes the key outright — leaving `{}` behind
would mean `isDefaultView` never returned true again and the entry band could
never re-open. Removing drops the row and its bound together, and is offered
only on a hand-added row. That needs somewhere to record which rows are
*shown*, so `ViewState.rows` carries the hand-added list; deriving it from the
bound keys is exactly what made clearing and removing the same action. A row
that arrived by link holding a non-curated bound is seeded into the list by
`parseView`, or clearing it would silently remove it. Released after is unset
from an **Any** chip: a chip that sets a date cannot also clear it.

Discontinued is three-valued — `hide`, `only`, or absent meaning both. A
boolean could only ever hide, and "only the last-generation models" is half
the value strategy in docs/shoe-stories.md.

`applyFilters` accounts for every shoe it drops: `considered` is the
population surviving the non-range filters alone, and
`visible + outsideBounds + hiddenMissing === considered.length` holds for any
filter state. Each excluded shoe is counted exactly once, missing-ness first.

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

Range inputs are a histogram plus min/max number fields rather than a
dual-thumb slider: same capability, keyboard-accessible, no drag maths.

## Columns and sorting

`cols` accepts the four shoe fields that have cells (`releasedAt`, `score`,
`msrpGbp`, `plate`) plus any test slug; `name` and `brand` are rendered by the
table itself and have no cell, so they are sortable but never columns.

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
width — are **declared** in `SIDE_PAIRS`, because the catalogue links only two
of them and carries no notion of side at all. The declaration is authoritative
where it applies: it names the heading, orders the halves forefoot-first, and
puts `side` on each part. `parts[].label` stays the full test name, so the
column picker can still tell "Forefoot stack" from "Heel stack". A declared
pair takes its group from the **heel** half. Pairs are never inferred from a
slug or a name pattern — `heel-padding-durability` has no forefoot
counterpart, `forefoot-traction`'s secondary is unpublished, and an upstream
rename would silently regroup the sidebar.

Agreement with the catalogue is asserted by `lineage.test.ts`, **not** thrown
at runtime: a pair whose slugs are absent is skipped silently, because neither
test fixture carries all eight and a throwing validator would take the app
down with them. When that assertion fires, read
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
prints the year alone unless `preciseReleaseDate` is set.

Plate filters as a **set of the real values** a shoe can carry — `none`,
`plated-other`, `carbon` — with empty meaning no constraint, so "not carbon"
is chosen directly as the first two rather than named by a token. The set is
always ordered as `PLATES` declares it, in the UI and in `parseView` alike,
because a selection is compared to a story's by value. As a **sort**, plate
is ordinal: `none` 0, `plated-other` 1, `carbon` 2, so descending reads "most
plate first" like every other column. `plated-other` reads **Non-carbon
plate** everywhere a human sees it — the table cell and the filter box.

## Number display

`displayNumber` rounds to two decimals at the cell. The dataset stores every
reading exactly as RunRepeat computed it — the two shock-absorption tests
arrive with twelve significant figures (docs/scraping.md §Data quirks) — and
trimming belongs to the view, not the record. The in-app CSV export therefore
writes full precision: it is a data export, not a rendering.

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
and sort, which makes it the single place a story is expressed — Race showing
toebox width is noise, Easy showing it is not. Every threshold lives in one
constants block at the top of `app/src/lib/presets.ts` — tuning is a one-line
edit there, and new presets are cheap (BACKLOG.md).

This section owns the mechanism only. What each preset is *for*, and why its
thresholds are what they are, is docs/shoe-stories.md — read it before changing
a number.

`applyPreset` takes the runner's strike, so the mapping is `(story, strike) →
view` with nothing special-cased: a story bounds, sorts by and shows the half
of each side pair that the strike names — why, and why a side-swappable bound
must be a percentile, is docs/shoe-stories.md §Which half a story uses.

Thresholds are a mix, and the split is deliberate. Where the story is relative
to the market — "affordable", "light for the fleet" — or where the bound could
swap sides, it is a `quantile` of the loaded dataset resolved **at click
time**, so it moves as the catalogue moves. Only a bound that is a property of
a shoe *and* has no sides may be an absolute constant; Race's weight ceiling is
the only one. A resolved percentile means the same click produces
different URLs across refreshes, which is fine: the URL records the resolved
number, not the preset. A fleet with no readings for a percentile bound omits
that bound rather than inventing one.

A preset must never bound a metric whose coverage over its own `considered`
population would trip the sparse warning (docs/app.md §Coverage) — a preset
that recommends against itself is self-inflicted. `presets.test.ts` asserts it
in both directions.

`EntryBand.svelte` offers the presets as cards above the table on arrival, each
carrying name and live count and nothing else — `Page.svelte` applies every
preset and runs `applyFilters` to get the counts, which is three passes over a
dataset already in memory. `Preset.describe` stays on the type and reaches the
reader as the card's tooltip and through `PresetChips`.

The band shows while the view is a **clean state**: equal to
`defaultView(strike)`, or equal to `applyPreset(story, …, strike)` for some
story. It collapses to the chip row only once the view is hand-edited into
something no story describes, and both are derived from view state and never
stored — a link carrying filters opens collapsed and a bare link opens
expanded. Selection is derived the same way, so editing a bound drops the
highlight because the view genuinely is not that story any more; a stored
`preset` field would keep claiming Easy.

The band cannot hold the controls that reset it, because it is gone by the time
they are needed. **`StrikeToggle` and Clear live in the toolbar**, as peers of
the story chips and present in both states. Clear returns to
`defaultView(strike)` — who you are survives, what you searched for does not.
The sidebar's **Clear filters** is a different, smaller thing and says so: it
empties the filters and leaves sort and columns alone.

Flipping strike **re-derives** the view rather than setting a field: from the
default view to `defaultView(next)`, from a view equal to a story to that story
under the new strike, and from a hand-edited view through `swapStrike`. Setting
the field alone would leave heel-shaped columns behind, so the view would stop
equalling its own baseline and the band would collapse on the very control this
protects.

**Browse all** changes no state, and that is not an oversight. The default view
already shows every shoe, so there is nothing to apply; and collapsing the band
from it would need the stored dismissal flag the derived rule exists to avoid.
It moves focus to the table and scrolls it into view, and it is styled as a
peer of the story cards rather than as a lesser option.

## Theming

Three-state cycle (auto → light → dark) persisted in `localStorage` and
applied in `main.ts` **before** the dataset fetch, so a saved dark theme never
flashes light. Storage access is wrapped: it throws rather than returning null
in blocked contexts, and losing the preference beats losing the click.

All colour lives in `app.css` as tokens on `:root`, with dark values under
both `prefers-color-scheme` and `[data-theme]` so the toggle wins in either
direction. The dataviz-derived values carry contrast obligations, not taste:
inactive histogram bars clear 3:1 against the surface because they are data
marks, and `--tint-strength` caps the percentile wash where cell text still
clears 4.5:1 in each mode. The wash ramp is **squared** so only leaders read
as tinted — a linear ramp across every numeric column turns the whole table
blue — and row hover paints as a translucent layer so the tint underneath
survives it.

## Coverage

A metric's coverage is the share of shoes carrying a reading among the shoes
passing every **non-range** filter — the population `applyFilters` reports as
`considered`. Non-range is load-bearing: if range filters counted, a metric's
own bound would move its own denominator as the user typed it. The number
answers "of the shoes I am considering", not "of the shoes I can still see".

Sparse means below `SPARSE_BELOW`, a fraction of that population rather than a
fixed age. `torsional-rigidity-23` covers 30% of the whole fleet but two thirds
of shoes released in the last two years: someone browsing everything needs the
warning and someone already filtered to recent shoes does not. A fixed
time-depth rule cannot express that, and would clear `breathability-25` — 2.6
years deep, 9% covered — while flagging metrics that are fine.

`oldestReading` is the *explanation* shown alongside, never the measure: a
metric sparse because the method is new reads differently from one sparse
because it is rarely run. Why generations exist at all is
docs/scraping.md §Test lineage.

## Decisions

### Every row links back to RunRepeat
Attribution is structural, not decorative: the header carries a permanent
RunRepeat link and every expanded row opens with a link to that shoe's review.
The link lives in the expanded panel rather than the collapsed row because the
row's click target is the expander. Do not remove or defer-load either link
(docs/decisions.md §Be a good citizen toward RunRepeat).

### Columns are permissive, ranges and sorts are strict
`cols` accepts any test slug — showing an `option`-typed column is harmless,
it just prints its value — while range and sort keys are restricted to numeric
tests. The asymmetry is the point: a bad column costs one ugly cell, a bad
range hides the entire fleet. Do not unify the two allowlists.

### The dataset is a fetched asset, not a bundled import
`sync-data` copies `data/shoes.json` into `public/` and the app fetches it at
runtime. That keeps the dataset swappable after the build — which is exactly
how the e2e run substitutes its fixture into `dist/` — and gives a load
failure somewhere to surface, as an error message with a Retry button rather
than a blank page. Importing the JSON as a module would take both away.
