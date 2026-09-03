# Dataset-boundary hardening

*2026-09-03 · status: **approved, in delivery**.*

## Outcome

A newly scraped dataset may change every upstream-controlled value that the
published schema already permits without exposing a JavaScript object-key trap,
an invalid optional scalar, or an incomplete runtime shape to the app. Benign
malformations with an existing absence state degrade to that state; malformed
required structure fails before a file is written. Neither path asks a maintainer
to classify a known-safe variation.

This is one boundary-hardening change. It does not alter what Shoe Lab means by a
metric, generation, score, filter, URL or layout, and it does not remove a gate
whose purpose is to ask a human what new upstream semantics mean.

## Decisions

### Optional source fields degrade locally

The details extractor keeps an optional value only when it can produce the exact
published value the app already understands:

| source value | kept form | otherwise |
|---|---|---|
| page release date | a real Gregorian `YYYY-MM-DD`, either bare or at the start of an ISO timestamp | `null`, allowing the existing curated/listing precedence to continue |
| RunRepeat score and GBP list price | a finite number | `null` |
| image | an HTTPS `cdn.runrepeat.com` URL with the payload's positive integer size substituted and no unresolved size token | `null` |
| editorial fact value | the first non-empty value for each non-empty slug | later occurrences of that slug and values that cannot produce a slug are dropped |
| secondary test ids | distinct positive integers in source order, excluding the test itself | malformed, repeated and self ids are dropped |

The image rule is the app's current capability, not a new host policy:
`app/index.html` permits that remote image origin and no other. A URL the shipped
app is guaranteed to block is already no image; publishing `null` makes that
degradation explicit and avoids a broken image box. Adding another origin remains
a third-party decision outside this spec.

Fact values are slug-keyed by `shared/types.ts`, and the expanded row keys them by
slug. First occurrence already owns deduplication order in
docs/scraping.md §Fact values; the dedupe key becomes that declared identity rather
than identity plus display text. A label change on a repeated slug therefore
cannot create two Svelte children with one key.

These rules apply per field. One malformed optional value does not discard its
shoe, catalogue, page, or crawl.

### The published schema is checked at runtime

The existing validation entry points become complete runtime checks for the
records they claim to validate:

- `validateCatalogue` checks the `TestsFile` envelope and every `LabTest`, group,
  relationship and option field against `shared/types.ts`, while preserving the
  existing duplicate-option, duplicate-test and method-status decisions.
- `validateValuesAgainstCatalogue` applies that catalogue check and checks the
  complete metrics-shoe/value records used by the corpus rewrite path.
- `validateMetrics` checks the `MetricsFile` envelope, every shoe identity and
  every reading as well as the existing absolute and relative gates.
- `validateDetailsRecord` checks every required `DetailRecord` or `Tombstone`
  field after extraction. Optional values retain their documented `null` state.
- `validateShoesFile` checks the complete `ShoesFile` tree the app receives,
  including unique shoes, finite numeric fields/readings, catalogue value types,
  fact-value identity, version-reference shape, sanitised-HTML fields, and release
  date/source consistency.

`releasedAt` and `releaseDateSource` obey
docs/scraping.md §Release-date provenance exactly: both are null together; every non-null date is a real
`YYYY-MM-DD`; `curated` is the first of a month; `listing` is the first of a year.
The validator does not invent bounds for years, scores, prices or measurements.

Validation accepts extra object properties because the published contract is the
required shape, not an exact JSON-key allowlist. It does not add a current-fleet
roster, require optional content to be present, or turn a new count/distribution
into a failure. Guards over invariants that the current files already satisfy are
proved by mutating a valid fixture and observing the relevant entry point reject
it; implementation does not break production code merely to manufacture a red
test.

### Upstream strings are data, never object internals

Every upstream-controlled shoe slug, test slug and group id keeps its exact value
when used as a key. The implementation must not read an inherited property as a
record, skip a crawl because such a property appears present, mutate an object's
prototype, or obtain a vocabulary value from an inherited registry entry.

This applies at both sides of the boundary:

- scraper accumulation and lookup in metrics, details, release years, catalogue
  groups, tagged devalue maps, overrides and relative validation;
- app view parsing/mutation, filter and generation lookup, group lookup, dynamic
  vocabulary registries, and both tables' measured panel-height state.

Tests exercise every own property name of `Object.prototype`, plus `__proto__`,
as generated input rather than maintaining a second hand-written danger list.
They prove that each key remains an ordinary own data key through the relevant
round trip and that an absent key remains absent. JSON files, query-string
grammar, labels, sorting, filtering and rendered layout otherwise remain
byte-for-byte or behaviorally unchanged.

## Failure behaviour

- A malformed optional source value covered above becomes the existing absence
  value and the rest of the record continues.
- A required shape violation or cross-field contradiction fails the current
  pre-write validation path with the record/test/field named in the error.
- A failure cannot reach the published `shoes.json` or a data commit; the
  existing incremental-crawl write boundaries are unchanged and old data remains
  deployed, per docs/policies.md §Failure posture.
- No new request, retry, endpoint, dependency, warning channel or override is
  introduced.

## Non-goals

The following likely drift surfaces require a product, editorial or operational
decision and are deliberately not hidden inside this mechanical pass:

- changing the human-review gates for a new numeric test, option test, label,
  unit, direction, fit witness or catalogue relationship;
- defining a UI and URL model for three or more supersession generations;
- choosing precedence when an upstream slug collides with an app-owned semantic
  key such as a field or synthetic score;
- changing comma-delimited URL values to support commas in upstream names/slugs;
- changing score definitions, default columns, label abbreviations, layout
  thresholds, fleet-growth/performance limits or coverage floors;
- permitting a new image host, adding runtime validation to the fetched asset, or
  adding recovery that silently accepts a structurally invalid published file;
- changing the documented first-occurrence and fatal-duplicate decisions for lab
  readings and option vocabularies.

## Policies and contracts

- docs/policies.md §State ownership and validation — nothing bad reaches the
  repository; hostile input is handled at its owner.
- docs/policies.md §Failure posture — old data stays live and invalid required
  structure fails without a write.
- docs/policies.md §Vocabulary — upstream names and values are looked up, never
  accidentally inherited from JavaScript's object vocabulary.
- docs/policies.md §Third parties and cost — no requests, dependencies, services
  or new remote origin are added.
- docs/decisions.md §Testing bar: adversarial, no live network — all evidence is
  fixture/mutation based and offline.
- docs/decisions.md §Fewer dependencies — the implementation remains dependency
  free at runtime.
- docs/scraping.md §Slug keying owns dataset identity.
- docs/scraping.md §Validation gates owns the pre-write boundary.
- docs/scraping.md §Release-date provenance owns date/source consistency.
- docs/scraping.md §Fact values owns fact identity and deduplication.
- docs/scraping.md §Test lineage owns catalogue relationships.
- docs/app.md §View and URL ownership owns app state.
- docs/app.md §URL encoding owns hostile query input.
- docs/app.md §Table presentation owns table key consumers.
- docs/app.md §The expanded row owns fact rendering and panel measurement.

## Build sheet

### File map

**Task 1 — normalise optional upstream drift**

- Modify `scraper/src/extract-details.ts`, `scraper/src/page-text.ts` and
  `scraper/src/test-catalogue.ts`.
- Modify `scraper/test/extract-details.test.ts`,
  `scraper/test/page-text.test.ts` and `scraper/test/test-catalogue.test.ts`.
- Modify `docs/scraping.md` in the same task to record only the new extraction
  deltas under its existing owning sections.

**Task 2 — complete the runtime schema gate**

- Modify `scraper/src/validate.ts` and, if separation is earned during delivery,
  add one private scraper validation module rather than a public schema package.
- Modify `scraper/test/validate.test.ts`; reuse `scraper/test/helpers.ts` where a
  complete valid fixture is needed.
- Modify `docs/scraping.md` in the same task under §Validation gates.

**Task 3 — make scraper keys prototype-independent**

- Modify `scraper/src/devalue.ts`, `scraper/src/scrape-metrics-main.ts`,
  `scraper/src/scrape-details-main.ts`, `scraper/src/release-dates.ts`,
  `scraper/src/test-catalogue.ts`, `scraper/src/build-dataset.ts` and
  `scraper/src/validate.ts` wherever an upstream string addresses a record.
- Modify the directly corresponding scraper tests, including
  `devalue.test.ts`, `scrape-metrics.test.ts`, `scrape-details.test.ts`,
  `release-dates.test.ts`, `test-catalogue.test.ts`, `build-dataset.test.ts` and
  `validate.test.ts` only where each path needs evidence.
- Modify `docs/scraping.md` in the same task under §Slug keying.

**Task 4 — make app keys prototype-independent**

- Modify the key-owning app libraries and components discovered by the registry
  sweep: `app/src/lib/view.ts`, `app/src/lib/urlstate.ts`,
  `app/src/lib/lineage.ts`, `app/src/lib/population.ts`,
  `app/src/lib/labels.ts`,
  `app/src/lib/direction.ts`, `app/src/lib/metric-help.ts`,
  `app/src/lib/ordering.ts`, `app/src/components/FilterSidebar.svelte`,
  `app/src/components/FeaturesFilter.svelte`,
  `app/src/components/ColumnPicker.svelte`,
  `app/src/components/AddFilterDialog.svelte`,
  `app/src/components/ShoeTable.svelte` and
  `app/src/components/ShoeTableMobile.svelte` only where an upstream key is
  actually used as an object property.
- Modify the nearest existing unit/component tests for those paths. Do not add a
  parallel integration harness when `urlstate.test.ts`, the vocabulary tests and
  the two table suites already own the seams.
- Modify `docs/app.md` in the same task only where the implementation exposes a
  previously unstated cross-file constraint; do not restate helper mechanics.

### Interfaces

- The public JSON interfaces in `shared/types.ts` do not change.
- `factValues(values: unknown): FactValue[]`,
  `extractDetails(pageData, slug, scrapedAt): DetailRecord`, the five existing
  validation entry points named in §The published schema is checked at runtime,
  `parseView`, `serializeView`, `defaultView` and the
  table component props retain their signatures.
- Any key-safe record helper is private to its package unless both packages
  genuinely consume the same semantic operation. No shared abstraction is a
  deliverable by itself.

### Tasks

1. **Normalise optional drift.** Implement the table in §Optional source fields
   with failing extractor tests first, preserving each field's existing absence
   and precedence behaviour. Evidence: the three focused scraper suites and a
   corpus re-extraction comparison showing no change to currently valid records.
   Pointers: §Decisions; docs/scraping.md §Release-date provenance;
   docs/scraping.md §Fact values; docs/scraping.md §Test lineage.
2. **Close the runtime schema.** Make each existing validation entry point check
   its whole declared record and documented cross-field invariants. Evidence: a
   mutation matrix in `validate.test.ts` that rejects each malformed field at its
   owning gate, accepts the committed files, accepts absent optional content and
   accepts finite scores outside 0–100. Pointers: §The published schema is checked
   at runtime; docs/scraping.md §Validation gates;
   docs/decisions.md §Frozen scores and live thresholds.
3. **Remove prototype-sensitive scraper storage.** Preserve every generated
   hostile key through extraction, accumulation, validation, canonical JSON and
   rebuild without phantom records or prototype mutation. Evidence: focused
   generated-key cases across the listed scraper seams, followed by the scraper
   workspace tests. Pointers: §Upstream strings are data, never object internals;
   docs/scraping.md §Slug keying.
4. **Remove prototype-sensitive app storage and lookup.** Make every valid
   catalogue/group/shoe key behave identically to an ordinary slug through URL
   state, filtering, vocabulary fallback, grouping, expansion and virtual height
   accounting. Evidence: generated-key round trips and component cases in the
   existing owning suites; no URL or rendered-output change for the committed
   dataset. Pointers: §Upstream strings are data, never object internals;
   docs/app.md §URL encoding; docs/app.md §Table presentation;
   docs/app.md §The expanded row.
5. **Whole-boundary verification and landing.** Review the combined branch for
   missed dynamic record access, run the full offline gate and all three browser
   engines, then land by the repository's linear-history workflow. Evidence:
   `npm run verify` and `npm -w app run e2e` green on the rebased tip.

### Global constraints

- No implementation begins before this file reads `status: **approved, in delivery**`.
- TDD first for behaviour changes; mutation evidence for guards over invariants
  that already hold.
- No live network in tests or verification.
- Zero new runtime or development dependencies.
- No new RunRepeat requests, endpoints, retries or concurrency.
- Do not hand-edit or commit regenerated `data/` on the feature branch.
- Land by rebase and fast-forward with no merge commit.
- After landing, regenerate `data/` once in the primary checkout and commit it
  only if the normalisers change generated records.

### Sequencing notes

Tasks 1–4 are reviewed as separate behaviour slices. Tasks 1 and 3 both touch
catalogue extraction, and Tasks 2 and 3 both touch validation, so their commits
land in that order rather than being developed as overlapping filesystem edits.
The app task may be investigated in parallel but rebases after the scraper tasks.
The whole-boundary review is the registry-sweep backstop, not a substitute for
each task's focused tests.
