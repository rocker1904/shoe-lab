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
state and then `history.replaceState`s the serialised form.

The view is never re-derived from the URL. Not a shortcut — a correctness
requirement: state that does not serialise would be silently dropped on the
round trip. An Add-filter row with both bounds empty is exactly that case, and
re-deriving would turn adding a filter into a no-op. The accepted cost is that
an empty range row does not survive a reload.

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
`plate`, `after`, `brands` (comma-joined), `q`, `nodisc=1`, `sort`
(`-` prefix means descending), `cols` (comma-joined). A value equal to the
default is not written at all.

`parseView` treats the query string as hostile input and drops anything it
cannot vouch for, always falling back to the default rather than throwing:
range and sort keys must name a numeric test or a numeric shoe field, a
malformed bound voids that whole range (dropping one side would silently widen
it), `plate` and `after` are pattern-checked, an all-separator `brands` stays
absent instead of becoming an empty array, and `cols` is deduped and filtered
against the column allowlist. Bound serialisation accepts everything
`String(number)` emits, exponent form included, so round-trips are lossless.

## Filters

Range filters and the Add-filter menu offer **numeric-typed tests only**
(`float`, `score`, `percent`, `rating`, plus the `score`/`msrpGbp` shoe
fields). A range over an `option`, `bool` or `text` test reads as missing for
every shoe and would empty the whole fleet in one click, so both the UI and
`parseView` refuse them. The sidebar shows a curated key list plus any
non-curated key already active, so an active filter is always visible and
clearable; a cleared curated slider drops out of state entirely, a cleared
extra row keeps an empty entry so its row survives.

`hiddenMissing` is a deterministic count of shoes that pass every non-range
filter but have **no data** for at least one active range filter. Missingness
is settled across all active ranges before any bound is applied, so the count
does not depend on key iteration order. It deliberately over-counts against
"would otherwise be visible" — a shoe with no midsole reading might have
failed the weight bound anyway — and the sidebar copy is written to match:
"N shoes have no data for the active filters", never "N would otherwise
match".

Range inputs are a histogram plus min/max number fields rather than a
dual-thumb slider: same capability, keyboard-accessible, no drag maths.

## Columns and sorting

`cols` accepts the four shoe fields that have cells (`releasedAt`, `score`,
`msrpGbp`, `plate`) plus any test slug; `name` and `brand` are rendered by the
table itself and have no cell, so they are sortable but never columns. The
picker offers numeric tests grouped by the dataset's test groups, with the
roughly half that carry no `groupId` collected under **Other**. That gap is
upstream's shape, not a bug here (docs/scraping.md §Data quirks).

Sorting reads numbers, with missing values always last and score as the
tie-break, so a sort never silently reorders the tail. `releasedAt` sorts as
an ISO string; year-derived dates therefore sit at 1 January, and the table
prints the year alone unless `preciseReleaseDate` is set.

Plate has two different token sets, on purpose. As a **filter**, `plated`
means *any* plate — it keeps carbon and non-carbon alike and excludes only
`none` — while `carbon` and `none` are exact. As a **sort**, plate is ordinal:
`none` 0, `plated-other` 1, `carbon` 2, so descending reads "most plate
first" like every other column. The table renders `plated-other` as "plated".

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
than layering on it. Every threshold lives in one constants block at the top
of `app/src/lib/presets.ts` — tuning is a one-line edit there, and new presets
are cheap (BACKLOG.md).

One threshold is not a constant: easy-day-cruiser's softness ceiling is the
**median of the live fleet**, computed at click time from the loaded dataset.
That keeps "softer than average" true as the catalogue grows, at the cost of
the same click producing different URLs across refreshes — which is fine,
because the URL records the resolved number, not the preset.

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
