# Categorical filters

*2026-08-02 · BACKLOG item 5 · status: approved, in delivery*

Make the four categorical columns filterable: `tongue-gusset-type` and
`heel-tab` (closed enums), `removable-insole` and `reflective-elements`
(bools). "Show me shoes with a gusseted tongue" becomes askable. The columns
themselves, and everything docs/app.md §Categorical columns owns about
rendering them, do not change.

## Decisions

**A fixed Features section, not addable rows.** One collapsed `<details>`
section (Brand's shape, drawn marker and all) after Discontinued and before
the direction legend — always present, nothing to add or remove, no entry in
`ViewState.rows`, an empty selection constrains nothing. The Add-filter
dialog stays numeric-only: it adds *range* rows, and a range over a
categorical test empties the fleet in one click, which is why it and
`parseView` already refuse them (docs/app.md §Filters). The accepted cost:
typing "gusset" into Add filter answers `No metrics match`, the same answer
"stack" already gets because its row is on screen — here the control is one
section up. The rejected alternative (facets arriving as removable rows via
the dialog) bought one entry point at the price of `rows`, clear-vs-remove
and the dialog each growing a second control kind.

**The section derives from the catalogue.** Its content is
`categoricalEntries` in catalogue order — `option` tests render as flat
checklists with counts (7 and 4 rows today: no search box, no scrollport),
`bool` tests as Any/Yes/No segmented tri-states built the way
`DiscontinuedFilter` is (role=radio buttons, so two rendered copies cannot
join one document-wide native group). An upstream categorical addition
arrives with a control the way it already arrives as a column, not as a code
change. The two bools are tri-states rather than Yes/No checkboxes because
checking both would be a near-no-op whose only effect is excluding the
handful of unread shoes — a state no runner means.

**Checklist rows order by the catalogue's declared option order, with `none`
sunk to the end.** Rendered and read rather than argued: heel-tab declares
None third of four, and a list ending in None reads as a scale where one
interrupted by it does not. One rule, both lists end with None. Group
headings inside the section stay sentence-case, small, dim — quieter than
the uppercase section heading so they do not compete with it (mockup
approved as drawn, 2026-08-02).

**State: `FilterState.categorical: Record<string, string[]>`** — test slug
to selected raw values (option slugs; `'true'`/`'false'` for bools, held as
a one-element selection). Required and `{}` when empty, like `ranges`, so
every site that constructs a `FilterState` literal is found by the compiler.
A selection that empties deletes its key outright — the ranges rule, and for
the same reason: a leftover `{'heel-tab': []}` keeps `isDefaultView` false
forever and All unlit (docs/app.md §Filters).

**Semantics: set-membership on the population side.** A shoe passes an
active selection iff the string of its raw reading is in the selection,
tested beside brand and plate, before `considered` is built — so a selection
moves the coverage denominator exactly as a brand tick does (docs/app.md
§Coverage). A shoe with no reading fails any active selection, as a
brandless shoe fails a brand selection; `showMissing` stays range-only; no
receipt line, because facets are not bounds and brand has none either. One
honest edge, stated rather than hidden: selecting *every* option of gusset
is not a no-op — it excludes the 5 unread shoes, and the counts make that
visible. Because `populationKey` is built from `FilterState`'s own entries,
the new field joins the drag-identity key with no edit there: a selection
change recomputes the population (it is a click), a held grip still does not
(docs/app.md §What a drag may recompute).

**Counts: the brand facet rule, generalised.** Each option checklist's
counts are taken over the population with *that one facet* removed — a facet
must not filter itself, and everything else (other facets included) does
filter it. The key set is seeded from the catalogue's declared options, so a
value matching nothing shows `(0)` greyed and still clickable (today real:
`one-side-full` matches no shoe), and from the selection, so a link-borne
value the catalogue has dropped still has a row to untick. Same
identity-holding closure shape as `stableBrandCounts`, one per facet row.
Tri-states carry no counts, like Discontinued — the machinery is easy to add
if missed in practice.

**URL: `c.<slug>=<comma-joined values>`, strict keys, verbatim enum values,
allowlisted bool values.** Absent when nothing is selected. The key must
name a categorical test in the current catalogue or the token is dropped —
an unknown key has no control to untick and no cell to cost. Enum values are
kept verbatim, the `brands` posture and for the brands reason: `data/`
regenerates on a schedule, and a strict parse would silently narrow a shared
link when upstream renames an option slug, with nothing on screen saying why
(docs/app.md §URL encoding). Bool values are not catalogue vocabulary —
`true`/`false` cannot be renamed by a refresh — so they stay allowlisted,
and a link carrying both collapses to absent: the tri-state has no state
that could display both, and a state no control can show is what `parseView`
exists to refuse. Values are deduped; an all-separator value stays absent
(the `brands`/`plate`/`rows` rule). The UI emits selections in display order
(declared-with-none-sunk, stale values after), so serialisation is stable
whatever the click order.

**Vocabulary is looked up, never restated** (docs/policies.md §Vocabulary).
Group nouns come from `chipLabel` — already the one home that renders
"Gusset" without a second colon — value words from the catalogue's declared
option names with the raw-slug fallback `categoricalValue` already argues
for, and Yes/No stay the bool words `categorical.ts` already owns.

**The empty state names the new class.** `narrowingNames` gains
`'the feature selection'` between the discontinued filter and the bounds,
matching sidebar order (docs/app.md §Filters).

**Announcement: exempt.** A facet value change announces nothing — the
receipt owns the count, the same side every other filter value change is on;
the exemption list is `announce.test.ts` and the new controls join it
(docs/policies.md §Announcement).

## Rendering evidence

Probed by injecting the section into the live app (real styles, real
counts) and screenshotting Firefox at 1400px (sidebar, light and dark) and
360px (drawer): the closed state costs one row, every label fits both
widths without clipping, the zero row and tri-states read correctly. No
numeric bound fell out, so none is invented here; the implementation is
re-verified by rendering at both widths. No new text inputs, so the iOS
16px guard's enumeration (`cross-browser.spec.ts`) passes unchanged
(docs/app.md §Filters).

## Failure behaviour

- Unknown `c.` slug, malformed values, all-separator values: token dropped,
  view falls back to default — `parseView`'s standing posture
  (docs/policies.md §State ownership and validation).
- Stale enum value in a link: kept, rendered as a zero-count row, untickable
  away; matches no shoe rather than erroring.
- Upstream adds an option or a categorical test: the row or control appears
  from the catalogue with a zero-seeded count; an unrecognised stored value
  renders as itself (docs/app.md §Categorical columns).
- A selection emptying the table: the empty state names the feature
  selection (docs/policies.md, "nothing empties silently").

## Non-goals

- The editorial facts as a fifth source — the `Record` accommodates them;
  nothing is built for them.
- The Add-filter dialog offering categoricals.
- Counts on the tri-states.
- A receipt line for shoes a facet hides (unread or otherwise).
- Filtering auto-adding the column: filters and columns stay independent,
  as ranges already are.

## Policies cited

§Identity and sharing (URL tokens, no storage) · §State ownership and
validation (hostile parse; the strict/verbatim split argued above) ·
"nothing empties silently" (`narrowingNames`) · §Vocabulary (`chipLabel`,
declared option names) · §Announcement (exempt side) · §Interaction chrome
(no floating panel: a `<details>` is disclosure, not a panel — Brand is the
precedent).

---

## Build sheet

### File map

| Task | Files |
|---|---|
| 1 State + membership | `app/src/lib/filters.ts`, `filters.test.ts` |
| 2 Facet value order | `app/src/lib/categorical.ts`, `categorical.test.ts` |
| 3 Facet counts | `app/src/lib/population.ts`, `population.test.ts` |
| 4 URL token | `app/src/lib/urlstate.ts`, `urlstate.test.ts` |
| 5 Section component | `app/src/components/FeaturesFilter.svelte` (create), `FeaturesFilter.test.ts` (create) |
| 6 Sidebar wiring | `app/src/components/FilterSidebar.svelte`, `FilterSidebar.test.ts` |
| 7 Announcement exemption | `app/src/lib/announce.test.ts` |
| 8 Docs and backlog | `docs/app.md`, `BACKLOG.md` |

### Interfaces

- `FilterState.categorical: Record<string, string[]>` — required; `{}` in
  `EMPTY_FILTERS` and (as a fresh object) in `defaultView()`.
- `narrowingNames`: emits `'the feature selection'` when any selection is
  non-empty.
- `facetValues(test: LabTest): { value: string; label: string }[]`
  (categorical.ts) — declared options in catalogue order, `none` sunk last;
  option tests only.
- `facetLabel(test: LabTest, value: string): string` (categorical.ts) — the
  declared option name, or the value itself when undeclared. *(Amended
  during delivery, task-2 review: as first written nothing could label a
  stale link-borne value — `facetValues` excludes it by design and
  `categoricalValue` needs a shoe that does not exist — so the component
  would have restated the raw-slug fallback §Vocabulary forbids it to own.
  One home; task 5 implements and consumes it.)*
- `stableFacetCounts(slug: string): (shoes: Shoe[], f: FilterState, idx: TestIndex) => Map<string, number>`
  (population.ts) — keys are raw value strings.
- `FeaturesFilter.svelte` props:
  `{ tests: LabTest[]; selections: Record<string, string[]>; countsFor: (slug: string) => Map<string, number>; onchange: (slug: string, values: string[] | undefined) => void }`
  — `tests` are the categorical tests in catalogue order (the rule
  `categoricalEntries` reads); the counts map's keys already carry stale
  selection values, so the checklist's rows derive from `facetValues` plus
  the map; `onchange(_, undefined)` deletes the key.
- URL token: `c.<slug>=<comma-joined values>`, absent when empty.

### Tasks

1. **State and membership.** `categorical` on `FilterState`; `applyFilters`
   tests membership beside brand/plate, before `considered`; unread fails an
   active selection; `narrowingNames` entry. Evidence: `filters.test.ts` —
   membership, unread exclusion, bool matching, empty-record no-op, the
   all-options-selected edge. The compiler names every literal to touch
   (`Clear filters` in `FilterSidebar.svelte` among them). → spec
   §Semantics; docs/app.md §Filters, §Coverage.
2. **Facet value order.** `facetValues` with the none-sunk rule. Evidence:
   `categorical.test.ts` — declared order kept, `none` sunk, both real
   fixtures end in None. → spec §Decisions; docs/policies.md §Vocabulary.
3. **Facet counts.** `stableFacetCounts` beside `stableBrandCounts` with
   the same three seeded-map decisions and identity rule. Evidence:
   `population.test.ts` — facet excludes itself, others filter it, zero and
   selection seeding, identity held while a range moves. → docs/app.md
   §What a drag may recompute.
4. **URL token.** Serialise and parse `c.<slug>`. Evidence:
   `urlstate.test.ts` — round-trip, strict keys, verbatim enum values,
   stale-value survival, bool allowlist, both-bools collapse,
   all-separator, dedupe, display-order emission. → spec §URL;
   docs/app.md §URL encoding.
5. **Section component.** `FeaturesFilter.svelte`: checklists with counts,
   zero rows greyed-not-disabled, tri-states, quiet group headings,
   summary `Any feature` / `N selected`. Stale rows label through
   `facetLabel` (Interfaces, amended), implemented here with its test —
   this task is its consumer. Evidence: `FeaturesFilter.test.ts`
   — display-order emission, key deletion on empty, tri-state exclusivity,
   stale row rendered from selection — plus `categorical.test.ts` for
   `facetLabel`'s fallback. → spec §Decisions; docs/app.md
   §Categorical columns, §Theming.
6. **Sidebar wiring.** Section after Discontinued, before the legend;
   counts closures instantiated where `readBrandCounts` is; `Clear filters`
   clears selections. Evidence: `FilterSidebar.test.ts` — placement, wiring,
   clear. Then render at 260px sidebar and 360px drawer, light and dark,
   and read the result. → docs/app.md §Filters.
7. **Announcement exemption.** Facet changes announce nothing. Evidence:
   the exemption-list cases in `announce.test.ts`. → docs/policies.md
   §Announcement.
8. **Docs ride the change.** `docs/app.md` §Filters (order sentence, the
   new section), §Categorical columns (replace "There is no categorical
   filter yet"), §URL encoding (token list); BACKLOG item 5 removed.
   Evidence: `npm run check:docs`. Rides the commits, not a trailing one.

### Global constraints

- No live network in tests, ever.
- TDD: failing test first, per task.
- `npm run verify` green before every commit lands; `npm -w app run e2e`
  before push (three engines).
- Comments WHY-only; single-line commit subjects; model trailer.
- Feature branch in a worktree `~/dev/shoe-lab-<branch>`; land by rebase
  onto local `main`, fast-forward, no merge commits; no `data/`
  regeneration (code-only change).

### Sequencing

Task 1 first — everything types against `FilterState`. 2–4 in any order
after it; 5 needs 2 and 3; 6 needs 5; 7 and 8 ride alongside. Nothing else
is order-sensitive.
