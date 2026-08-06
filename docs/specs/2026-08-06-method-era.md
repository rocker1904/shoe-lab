# Explicit retirement for lab-test methods

status: approved, in delivery

## Purpose and scope

Close BACKLOG.md item **Method era: say when a reading is being retired**.
Some measurements have excellent historical coverage and little or none on
newer shoes. A runner who filters on one can therefore turn a search for a
current shoe into an older-shoe shortlist without realising why. Shoe Lab will
name a retired method before it is chosen and keep that status visible while it
is filtering.

Retirement is explicit test metadata, never a conclusion the app draws from
coverage or release dates. RunRepeat's formal supersession links identify the
predecessors they cover; a small curated registry covers known retired tests
whose catalogue entries were never linked. The published catalogue carries the
resolved status so every consumer receives one answer.

The UI treatment is limited to the Add-filter dialog, an active sidebar metric,
the Columns picker, and the generation names already used on those surfaces.
Table headers and the table's summary band remain unchanged.

## Policies

- docs/policies.md §State ownership and validation: retirement is validated
  dataset metadata, not view state. It adds no URL, history, storage or
  `ViewState` field.
- docs/policies.md §Failure posture: a stale, redundant, malformed or silently
  lost retirement fails before the catalogue is written; the last good data
  remains live.
- docs/policies.md §Vocabulary: one generation formatter owns `2022 · current`,
  `2022 · retired`, `current method` and `retired method`; every surface looks
  up retirement by the test slug rather than restating a list.
- docs/policies.md §Compatibility floor: the added status copy is guarded at
  360px and on the narrower 228px permanent-sidebar track in Chromium, Firefox
  and WebKit.
- docs/policies.md §Identity and sharing: status belongs to the build's
  catalogue. A shared view uses the status shipped by the build that opens it,
  without another URL token.
- docs/policies.md §Announcement: no new control or action is introduced.
  Visible text and existing controls' accessible names carry the status; the
  live region says nothing new.
- docs/policies.md §Interaction chrome: no tooltip, disclosure, panel or focus
  stop is added.
- docs/policies.md §Third parties and cost: the existing catalogue and local
  curation are sufficient; the feature adds no request, crawl or standing cost.
- docs/decisions.md §Git is the database: the status is committed source data.
- docs/scraping.md §Determinism: status resolution and regeneration read no
  clock.
- docs/decisions.md §Testing bar: adversarial, no live network: classification,
  rendering and browser checks use fixtures, the committed fleet and the local
  corpus only.

No policy is undecided and no policy changes.

## Decisions

### One nullable published status, two explicit sources

`LabTest.methodStatus` is `'retired' | null`. `retired` is the only lifecycle
claim this feature needs; `null` means Shoe Lab makes no retirement claim. It
does not mean the test was proved current, new or universally used.

A test resolves to `retired` when either:

- its own `updateId` names the method that formally superseded it; or
- its slug is in the curated retirement registry.

The registry is slug-keyed because slugs are the stable public test identity
(docs/scraping.md §Slug keying). Its initial entries are:

- `outsole-hardness`;
- `stiffness-in-cold`;
- `difference-in-stiffness-in-cold`.

The first falls from 120/125 measured among 2024 shoes to 44/116 in 2025 and
1/70 in 2026. The two cold-stiffness entries cover exactly the same 275 shoes
as formally superseded `stiffness`; they are unlinked outputs of that retired
test run. These observations justify the authored entries but are not an
algorithm and are not emitted as mutable thresholds.

An entry that no longer resolves fails validation. An entry whose test gains an
`updateId` also fails: the upstream link has become the source and the redundant
curation must be removed. Every catalogue path verifies that the published
field equals the answer from those two sources. Once a build has published
`retired` for a slug, a later catalogue may not silently take it away.

RunRepeat's `isNew` remains ignored for lifecycle. It is already known to report
false on current methods (docs/scraping.md §Test lineage).

### Coverage never classifies a method

There is no coverage threshold, recent-year window, oldest-reading rule or
runtime inference. The 2026 fleet has formally current or arriving metrics
below 80% coverage, while a formally retired method remains above it. The live
`n / total measured` figure keeps answering how much of the runner's current
population has a reading; method status answers why a historical column can
thin toward newer shoes. Neither substitutes for the other.

`size-rating`, the only unclassified numeric test below 80% on 2026 shoes, is
deliberately not added. Its coverage changes irregularly rather than showing
the clean retirement cliff of the three curated tests. No aspiration to
classify it is created.

### Generation names state both date and lifecycle

A method year alone does not say whether that method is still in use. The one
generation formatter therefore takes a lifecycle as well as a slug:

- a dated current method is `2022 · current`;
- a dated retired method is `2022 · retired`;
- an undated current method is `current method`;
- an undated retired method is `retired method`.

`2022 · current` intentionally reads as a span from introduction to the
present. It replaces the ambiguous `2022 method`, `original` and `previous
method` vocabulary. Add filter keeps its existing dash before the modifier,
Columns keeps parentheses around it, and the sidebar's generation radio uses
the modifier directly. Those wrappers are surface grammar; the modifier itself
has one owner.

The selected generation remains the only one Add filter and Columns offer
(docs/app.md §Columns and sorting). Switching to the predecessor makes that
same row say retired; it does not add a second entry or change URL semantics.

### Retired singles use the room each surface has

An unpaired retired test receives these treatments:

- **Add filter:** a dim second line, `Not used on newer shoes`, under the metric
  name. It is ordinary text inside the existing add action, not another control.
  The action's accessible name includes `retired` and the same consequence.
- **Active sidebar:** the same line appears below the metric heading for as
  long as that metric has a row. It is static text, not a badge or live region.
- **Columns:** `(retired)` is appended to the checkbox label. No explanatory
  line, legend, symbol or focus stop is added to the compact picker.

A formally superseded pair uses its lifecycle-explicit generation modifier
instead. The pair's heading never claims that both generations are retired,
and the sidebar adds no duplicate status line under the whole pair. If its
retired generation is the one Add filter currently offers, that row also shows
`Not used on newer shoes`; in Columns, `retired method` or
`2022 · retired` already supplies the parenthetical and `(retired)` is not
repeated.

The Add-filter search treats `retired` and the visible consequence as searchable
metadata in addition to the metric name. A runner can therefore ask for the
status they can see. Columns has no search and gains none.

### Status follows every resolved test shape

Numeric singles, superseded generations and colocated parts carry the resolved
status through `metricEntries`; categorical entries carry it into Columns as
well. A colocated family may use one sidebar status line only when all of its
parts have the same retired status. The committed catalogue is asserted to
have uniform status across every colocated family, as it already asserts their
shared coverage. A future mixed-status family fails that catalogue assertion
rather than receiving a misleading shared line.

Synthetic score columns and shoe fields have no `LabTest` and no method status.
The catalogue's colliding `plate` test remains excluded in favour of the shoe
field (docs/app.md §Categorical columns).

### The table stays quiet

There is no status in a table header, below the receipt, in an ordering note or
inside an expanded row. Selecting a retired column does not filter the fleet;
the Columns label is the compact warning at that choice point. Selecting a
retired range does shape the shortlist, so Add filter warns before selection
and the sidebar keeps the warning beside the active bound.

No method status enters CSV. `shoes.csv` is a per-shoe value export and has no
test-metadata schema; `tests.json` and `shoes.json.tests` are the metadata
homes.

## Success bounds

- Every test in `tests.json` with non-null `updateId`, and exactly the three
  curated unlinked slugs above, publishes `methodStatus: "retired"`; every
  other test publishes `null`. `shoes.json.tests` preserves the same status for
  its non-empty published subset.
- A missing registry slug, a registry slug with an `updateId`, an invalid field
  value, a field that disagrees with its sources, or loss of a previously
  published retirement fails every catalogue-writing path before write.
- Re-extracting the catalogue from the primary checkout's local corpus and
  rebuilding the dataset changes test metadata only. It preserves timestamps,
  metric readings and `shoes.csv` byte-for-byte.
- Add filter visibly and accessibly marks every retired option before selection;
  searching `retired` returns those options and no unretired option merely
  because its coverage is low.
- An active unpaired retired range keeps `Not used on newer shoes` visible in
  the sidebar. A formal pair names both current and retired generations without
  applying the single's status line to the pair.
- Columns appends `(retired)` to every unpaired retired offer and uses the
  lifecycle-explicit modifier for formal pairs. Each checkbox remains the
  row's only focus stop and keeps its checked state and coverage in its
  accessible name.
- At 360px in every supported engine, the three initial `(retired)` Columns
  labels stay on one 16px name line, every lifecycle-modified Columns label
  stays within two such lines, and the picker has no horizontal overflow.
- At 360px, `Not used on newer shoes` stays on one line in Add filter with the
  help trigger, direction, coverage bar and percentage still visible. The
  measured Chromium probe gives the line 147px and uses 122px; the browser gate
  holds the result rather than those implementation measurements.
- On the 228px permanent-sidebar track, the status line stays on one line and
  does not collide with the heading, help trigger or coverage count. It adds no
  horizontal overflow at the 360px drawer either.
- The current-generation defaults, generation switch, range/column mutual
  exclusion, URL round trip, filtering results, coverage calculations, table
  labels and announcements are unchanged apart from the specified words.
- Focused suites, `npm run verify`, and the complete three-engine e2e command
  are green with no live network access.

## Failure behaviour

Catalogue validation throws before `tests.json`, `metrics.json` or a joined
dataset is written when retirement metadata is invalid, stale, redundant or
lost. The refresh is red and the previous data remains live.

At runtime, an absent or unknown `methodStatus` is treated as no claim and
renders no marker. This keeps an older cached dataset readable; it never turns
missing metadata into a retirement assertion. An unknown future test remains
visible, filterable and selectable as it is today.

If a genuinely retired method returns, that is a deliberate source change. It
requires an explicit code-and-data change to remove the irreversible published
status guard; coverage alone cannot clear it.

## Non-goals

- Inferring retirement from coverage, release dates, the oldest reading or the
  current filtered population.
- Classifying unpaired tests as arriving, current, rare or selectively run.
- Retirement dates, start/end ranges, or a complete method-history model.
- Table-header, receipt, ordering-note or expanded-row warnings.
- New help copy, tooltip, icon, legend, badge, panel, focus stop or live
  announcement.
- Changes to metric values, filtering rules, scores, presets, coverage,
  direction, table washes, URLs or stored preferences.
- Adding test metadata to `shoes.csv` or the in-app per-shoe export.
- A new request, wider crawl, live check or dependency.
- Regenerating `data/` on the feature branch or pushing any commit.

## Registry sweep

| Registry or counted claim | Owed |
|---|---|
| `LabTest` and the shared `labTest` fixture constructor | add one nullable field everywhere tests are constructed; no hand-written fixture may silently omit its default |
| `RETIRED_TEST_SLUGS` | new sole curated retirement registry; slug presence and non-redundancy are validation gates |
| `extractTestCatalogue`'s retained-field map | resolve status from `updateId` plus the curated registry and publish it into `tests.json` |
| catalogue validation in `validate.ts` | validate the enum, source agreement, registry resolution and no previously published status loss on live and corpus paths |
| `publishedTests` in `build-dataset.ts` | preserve status while dropping empty tests; joined validation repeats the catalogue gate |
| `metricEntries` / generation formatter | carry status through singles, pairs and colocated parts; replace every ambiguous generation modifier from one formatter |
| `categoricalEntries` | carry status to Columns even though categorical tests never enter Add filter |
| Add-filter `addable`, `AddFilterOption` and search haystack | carry status once, render/search it without another identity list, and preserve full-row selection/help isolation |
| ColumnPicker `Offer` / `offersOf` | append `(retired)` once for unpaired entries and use the selected pair modifier without duplication |
| docs/scraping.md §Test lineage | add the complete published status semantics and curated-source rule beside the raw lineage fields |
| docs/app.md §Columns and sorting | replace the old `original`/`previous method` vocabulary and record the three surface treatments |
| docs/app.md §Coverage | keep the live population count distinct from explicit method status |
| docs/app.md §There is no sparse warning | replace the backlog-era caveat with the deliberately narrow retired-method warning |
| generation-name assertions in component and e2e suites | update every exact accessible name and selected-generation path, including the complete segmented-generation browser registry |
| announcement exemption table | unchanged: status adds no control or action and therefore no exemption row |
| URL token grammar and arrival registries | unchanged: `methodStatus` is dataset metadata and no `ViewState` field is added |
| CSV headers and in-app export | unchanged by decision; mutation evidence proves the per-shoe schemas do not absorb test status |
| BACKLOG.md item 2 | removed only in the final post-regeneration task |

## Build sheet

### File map

| Task | File | Change |
|---|---|---|
| 1 | `shared/types.ts` | Add the nullable published method status to `LabTest`. |
| 1 | `scraper/src/method-status.ts` | Add the three-slug curated registry and the sole status resolver/registry validator. |
| 1 | `scraper/src/test-catalogue.ts` | Retain resolved status beside raw test lineage. |
| 1 | `scraper/src/validate.ts` | Gate status shape, source agreement, registry integrity and irreversible published retirement. |
| 1 | `scraper/src/scrape-metrics-main.ts` | Supply the previous catalogue to the live and corpus validation paths before write. |
| 1 | `scraper/test/method-status.test.ts` | Guard formal, curated, null, stale and redundant resolution. |
| 1 | `scraper/test/helpers.ts` | Give the shared scraper fixture constructor an explicit null default. |
| 1 | `scraper/test/test-catalogue.test.ts` | Pin real-fixture extraction and defaults. |
| 1 | `scraper/test/validate.test.ts` | Exercise malformed, mismatched and lost status on every catalogue gate. |
| 1 | `scraper/test/scrape-metrics.test.ts` | Prove both write paths change nothing on a retirement validation failure. |
| 1 | `scraper/test/build-dataset.test.ts` | Prove populated tests retain status and joined validation rejects corruption. |
| 1 | `docs/scraping.md` | Own explicit method status, its sources, validation and deterministic corpus re-extraction. |
| 2 | `app/src/lib/test-fixtures.ts` | Give every fixture test the explicit null default and representative curated/formal statuses. |
| 2 | `app/src/lib/lineage.ts` | Carry status through resolved shapes and own lifecycle-explicit generation modifiers. |
| 2 | `app/src/lib/lineage.test.ts` | Guard dated/undated current/retired names, pair selection and uniform colocated status. |
| 2 | `app/src/lib/categorical.ts` | Carry test status into categorical column offers. |
| 2 | `app/src/lib/categorical.test.ts` | Guard the categorical status path without making it rangeable. |
| 2 | `docs/app.md` | Own lifecycle vocabulary and the selected-generation rule with the behaviour commit. |
| 3 | `app/src/components/AddFilterDialog.svelte` | Render and search the retired consequence without adding an action. |
| 3 | `app/src/components/AddFilterDialog.test.ts` | Guard visible/accessibility copy, search, selection and help isolation. |
| 3 | `app/src/components/FilterSidebar.svelte` | Carry per-key status into add options and active metric rows. |
| 3 | `app/src/components/FilterSidebar.test.ts` | Guard curated, formal-current and formal-retired paths end to end. |
| 3 | `app/src/components/MetricRow.svelte` | Keep the unpaired retired line visible and use explicit pair modifiers without a duplicate line. |
| 3 | `app/src/components/MetricRow.test.ts` | Guard single, colocated and both pair-generation treatments. |
| 3 | `app/src/components/ColumnPicker.svelte` | Append compact retirement naming to every test-shaped offer. |
| 3 | `app/src/components/ColumnPicker.test.ts` | Guard current/retired pair and unpaired/categorical labels and accessible names. |
| 3 | `app/src/Page.test.ts` | Update only lifecycle-sensitive rendered-name assertions and snapshots. |
| 3 | `app/e2e/fixtures/shoes.json` | Carry one curated retired single and a formal retired/current pair for browser evidence. |
| 3 | `app/e2e/smoke.spec.ts` | Hold 360px/persistent-sidebar text fit, no overflow and real interaction paths. |
| 3 | `app/e2e/cross-browser.spec.ts` | Hold the three-engine Columns and sidebar line bounds plus generation controls. |
| 3 | `docs/app.md` | Replace the backlog-era coverage text and own the Add/sidebar/Columns presentation with the behaviour commit. |
| 4 | `data/tests.json` | Re-extract the catalogue once from the local corpus in the primary checkout after landing. |
| 4 | `data/shoes.json` | Rebuild once from the updated catalogue in the primary checkout after landing. |
| 4 | `BACKLOG.md` | Remove the delivered item and renumber the remaining list. |
| 4 | `docs/specs/2026-08-06-method-era.md` | Freeze the delivered spec through the delivery skill's finish step. |

The file map is a hypothesis. Task 1 begins by sweeping direct `LabTest`
object literals and every caller of catalogue validation; Task 3 begins by
sweeping exact generation names in unit and browser selectors. Files outside
the map change only when that sweep proves the interface reaches them.

### Interfaces

`shared/types.ts` exports `type MethodStatus = 'retired' | null` and
`LabTest.methodStatus: MethodStatus`.

`scraper/src/method-status.ts` exports:

- `RETIRED_TEST_SLUGS: readonly string[]`;
- `methodStatusOf(test: Pick<LabTest, 'slug' | 'updateId'>): MethodStatus`;
- `validateMethodStatuses(next: LabTest[], previous?: LabTest[]): void`.

The validator requires every `next.methodStatus` to equal `methodStatusOf`,
requires every curated slug to resolve exactly once without `updateId`, and
rejects `retired -> null` for any slug present in both catalogues. Existing
catalogues whose field is absent are treated as pre-feature input, not as a
published retirement claim.

`generationLabel(slug: string, lifecycle: 'current' | 'retired'): string`
returns the four modifiers in §Generation names state both date and lifecycle.

Every key-shaped resolved entry carries `retired: boolean`; each superseded
generation carries `lifecycle: 'current' | 'retired'`. `AddFilterOption` and
ColumnPicker's internal `Offer` gain `retired: boolean`. Callers derive it from
the resolved entry for that exact key; components never import the curated
registry.

### Tasks

1. **Publish and gate explicit method status.** Start with failing resolver,
   extraction and validation tests; add the curated registry, formal-link
   resolution and previous-catalogue loss gate on both metrics paths. Prove the
   join preserves only valid metadata and update docs/scraping.md §Test lineage
   and §Validation gates in the same commit. Acceptance: focused scraper tests
   plus `npm -w scraper run typecheck` and `npm run lint` are green; mutation
   of each initial registry slug, one formal `updateId`, and one previous
   retired field reddens the intended gate before write.

2. **Resolve lifecycle and one generation vocabulary in the app.** Start with
   failing lineage and categorical tests; carry status through every resolved
   test shape and replace ambiguous generation labels with the four agreed
   modifiers. Update docs/app.md §Columns and sorting in the same commit.
   Acceptance: focused lib suites prove dated/undated current/retired output,
   current default selection, retired selection, categorical propagation and
   uniform colocated status without changing URL state.

3. **Render retirement at the three agreed choice/filter surfaces.** Start with
   failing component tests, then add Add-filter copy/search, the persistent
   unpaired sidebar line, lifecycle pair names and compact Columns labels. Add
   browser bounds at 360px and the 228px sidebar in all three engines. Update
   docs/app.md §Filters, docs/app.md §Columns and sorting, and
   docs/app.md §Coverage in the same commit.
   Acceptance: component suites hold visible and accessible words, selection,
   help isolation and no duplicated pair status; browser suites hold line
   counts, overflow, focus-stop count and generation switching.

4. **Land, materialise and close.** After implementation review, rebase the
   code-only branch onto local `main`, fast-forward it, then in the primary
   checkout run
   `npm -w scraper run scrape:metrics -- --from-corpus .corpus/pages` and then
   `npm -w scraper run build:dataset` exactly once. Review the metadata-only
   diff, remove BACKLOG.md item 2,
   freeze this spec, run the complete gate and commit the primary data/closure
   change. Acceptance: `data/tests.json` and `data/shoes.json` contain the
   resolved statuses, `data/metrics.json`, `data/details.json` and
   `data/shoes.csv` have no diff, `npm run verify` and the complete three-engine
   `npm -w app run e2e` are green, and local `main` contains the linear finished
   history.

### Global constraints

- `methodStatus` is exactly `'retired' | null`; absence at runtime renders as
  null and never as retired.
- The curated registry contains exactly `outsole-hardness`,
  `stiffness-in-cold`, and `difference-in-stiffness-in-cold` at delivery.
- `isNew`, coverage, release dates and wall-clock time never feed status.
- The visible unpaired status line is exactly `Not used on newer shoes`.
- Dated modifiers are exactly `20YY · current` / `20YY · retired`; undated
  modifiers are exactly `current method` / `retired method`.
- Columns uses `(retired)` only for an unpaired retired offer; a formal
  generation's modifier is never followed by a second retirement suffix.
- No table, URL, storage, CSV, score, direction, announcement or focus-stop
  shape changes.
- No live network in tests or regeneration; no new dependency or request.
- TDD: failing test first for every behaviour change; guard-only invariants use
  mutation evidence.

### Sequencing notes

- The feature branch never regenerates or commits `data/`.
- Task 1 precedes app work so UI fixtures consume the published interface rather
  than inventing an app-local status.
- Tasks 2 and 3 remain separate reviewer gates: lifecycle resolution can be
  accepted while a surface treatment is rejected.
- Rebase and fast-forward the branch before regeneration. Run catalogue
  re-extraction and `build:dataset` exactly once in the primary checkout, then
  verify the whole local `main` before any push.
