# Shoe Lab — RunRepeat running-shoe comparison tool

**Date:** 2026-07-26
**Status:** Approved design, pending implementation plan
**Implementation note:** This spec is the end-goal contract for subagent-driven implementation. Every section is written to be independently verifiable; the acceptance criteria in §10 are the definition of done.

## 1. Overview

A static single-page web app for filtering and comparing running shoes using RunRepeat's lab-test data, backed by a lightweight polite scraper and refreshed via GitHub Actions. Primary user story:

> "I need new easy running shoes: filter to the most-cushioned shoes released in the last two years with a toebox wider than X and no carbon plate, sorted by energy return descending."

The tool is shareable with friends via URL (GitHub Pages), including the exact filter state.

### Goals

- Pull **exact per-shoe lab metrics** (not bucketed ranges) for the running-shoes category in ~65 HTTP requests.
- Pull per-shoe editorial text (pros/cons, verdict, who should/shouldn't buy) and precise release dates via a rare, incremental page crawl.
- Filterable/sortable table UI with shareable URL state and CSV export.
- Zero servers: GitHub Pages hosting, GitHub Actions refresh.
- Comprehensive automated testing throughout (see §9).

### Non-goals (v1)

- Categories other than running shoes (`c_id=2`).
- Claude-generated digests/tags (roadmap, §11).
- Public (non-repo-member) refresh triggering.
- Price tracking/deals; we store MSRP and RunRepeat's score only.
- A backend of any kind.

## 2. Data sources (verified 2026-07-26)

All endpoints are unauthenticated; a normal browser User-Agent suffices. All were verified live during design.

### 2.1 Per-metric values for all shoes (primary metrics source)

```
GET https://api.runrepeat.com/api/product/lab-test-list/{test_id}?product_id={seed_product_id}
```

- Response: `{ headers: [metricLabel, "Name"], rows: [[{text, value, sort}, {text: shoeName, url}], ...], text }`
- Returns **every lab-tested shoe** in the seed product's category (~450 rows for running).
- Rows carry shoe name + canonical URL but **no product id** → datasets key on **slug** (last path segment of `url`, locale prefix stripped).
- One request per test id. 64 test ids exist today (ids are sparse: 1–80 with gaps).

### 2.2 Test catalogue + per-shoe payload (from any shoe page)

Each shoe page embeds a Nuxt 3 `<script id="__NUXT_DATA__">` JSON payload in [devalue](https://github.com/Rich-Harris/devalue) index-referenced format. Decoding rules: the payload is a flat array; objects map keys→indices; arrays list indices; 2-element arrays whose first element is one of `Reactive | ShallowReactive | Ref | ShallowRef | EmptyRef | EmptyShallowRef` are wrappers to unwrap. Vendor a small decoder (~50 lines); do not add a dependency.

From `page_data` within the payload we use:

| Path | Contents |
|---|---|
| `lab_tests.tests` | Test catalogue: id, slug, name, type (`float\|score\|percent\|bool\|rating\|option\|text`), units, config; plus **this shoe's** `value` and category `average` |
| `lab_tests.groups` | 11 group names (Breathability, Durability, Cushioning, …) |
| `lab_test_stats` | Per-test distribution histograms (not needed v1; app computes its own from per-shoe values) |
| `content.pros_clean`, `content.cons_clean` | Editorial pros/cons (plain strings; prefer `_clean` variants — raw ones contain editor markup spans) |
| `content.intro_clean` | Verdict/intro paragraph |
| `content.lab.sections` | Titled HTML sections including "Who should buy" and "Who should NOT buy" |
| `product` | `id`, `name`, `brand_name`, `slug`, `released_at` (ISO date), `precise_released_at` (bool), `score`, `msrp`/`price_local`, image URL, `discontinued` |
| `pinia.facts.features` | Feature flags per shoe — source of "Carbon plate", "Rocker", etc. |

Fetch pages under the `/uk/` locale consistently (user is UK; prices in GBP).

### 2.3 Category enumeration (secondary / cross-check)

```
GET https://api.runrepeat.com/api/category/documents?from={n}&size=30&filter[]=1&f_id=2&c_id=2&orderBy=recent&include=facts&exclude=colors
```

Paginated product list for running shoes. Numeric facts here are **bucketed** ("35 mm – 40 mm") — not used for metrics. Available as a cross-check for shoe enumeration and as a fallback discovery source. Not required in v1 pipeline.

### 2.4 Politeness contract (hard requirements)

- ≥1 second between requests (single-flight; no concurrency against runrepeat.com).
- Honest User-Agent: `shoe-lab/<version> (personal comparison tool; contact: <repo url>)`.
- Retries: max 3 per URL, exponential backoff (5s/25s/2min), only on 5xx/network errors. 4xx → fail immediately.
- Weekly job budget ≈ 65 requests; details crawl only fetches shoes missing from the dataset.
- `robots.txt` (checked): only `/search` and filter-query URLs disallowed — nothing we touch. Re-check at scraper start and abort politely if our paths become disallowed.
- App displays "Data from RunRepeat" attribution and links every shoe to its RunRepeat review page.

## 3. Repository layout

```
shoe-lab/
├── scraper/
│   ├── src/
│   │   ├── devalue.ts          # vendored payload decoder
│   │   ├── page-payload.ts     # extract page_data from HTML
│   │   ├── lab-test-list.ts    # fetch + parse per-metric endpoint
│   │   ├── extract-details.ts  # page_data → DetailRecord
│   │   ├── http.ts             # throttled fetch, UA, retries
│   │   ├── scrape-metrics.ts   # CLI entry
│   │   ├── scrape-details.ts   # CLI entry (incremental; --force-all)
│   │   └── build-dataset.ts    # join, derive, validate, emit
│   └── test/                   # vitest + fixtures/
├── data/
│   ├── tests.json
│   ├── metrics.json
│   ├── details.json
│   ├── shoes.json              # built artifact consumed by app
│   └── shoes.csv               # built artifact for spreadsheets
├── app/                        # Svelte 5 + Vite + TypeScript
│   └── src/ (components, lib/ for pure logic, test/)
├── docs/superpowers/specs/
└── .github/workflows/
    ├── refresh-metrics.yml
    ├── refresh-details.yml
    ├── deploy.yml
    └── ci.yml
```

Language: TypeScript everywhere. Node ≥22 native `fetch`. Runtime deps: none in scraper; app deps limited to Svelte/Vite toolchain. Package manager: npm workspaces (`scraper`, `app`).

## 4. Datasets & schemas

Git is the database: datasets are committed JSON, refreshed by Actions commits. All files are pretty-printed with sorted keys for meaningful diffs.

### 4.1 `tests.json`

```ts
{ scrapedAt: string /* ISO */, seedSlug: string,
  groups: Record<string, string>,            // group id → name
  tests: Array<{ id: number; slug: string; name: string;
                 type: 'float'|'score'|'percent'|'bool'|'rating'|'option'|'text';
                 units: string; groupId: string | null }> }
```

### 4.2 `metrics.json`

```ts
{ scrapedAt: string,
  shoes: Record<slug, { name: string; url: string;
                        values: Record<testId, number | string | boolean | null> }> }
```

Value coercion by test type: `float|score|percent|rating` → number; `bool` → boolean; `option|text` → string. Missing/untested → key absent (not null).

### 4.3 `details.json`

```ts
{ shoes: Record<slug, {
    scrapedAt: string; productId: number; name: string; brand: string;
    releasedAt: string | null; preciseReleaseDate: boolean;
    score: number | null; msrpGbp: number | null; discontinued: boolean;
    imageUrl: string | null; runrepeatUrl: string;
    features: string[];                       // e.g. ["Rocker", "Carbon plate"]
    pros: string[]; cons: string[]; intro: string;
    whoShouldBuy: string | null;              // sanitised HTML
    whoShouldNotBuy: string | null; } > }
```

A shoe whose page 404s is stored as the tombstone variant `{ gone: true, scrapedAt: string }` instead of the record above; consumers must handle both shapes.

HTML sanitisation: strip everything except `p, ul, ol, li, strong, em, a[href]`; implemented in the scraper (build-time), so the app never renders unsanitised remote HTML.

### 4.4 `shoes.json` (built, consumed by app)

Join of the above keyed by slug, plus derived fields:

- `plate: 'carbon' | 'plated-other' | 'none'` — carbon if features include "Carbon plate"; else plated-other if lab test 69 (`plate`) is true or features include another plate feature; else none.
- `ageMonths: number | null` from `releasedAt` vs build time.
- Per-numeric-test fleet percentile is computed **in the app at load**, not stored.

Shoes present in metrics but missing from details appear with `details: null` (UI shows them; detail row says "not yet crawled"). Shoes in details but absent from metrics are dropped from `shoes.json` (delisted/moved).

### 4.5 `shoes.csv` (built)

One row per shoe; single header row using stable machine-friendly names: slug, name, brand, releasedAt, score, msrpGbp, plate, discontinued, then one column per numeric/score test named by `test.slug`. A note in the repo README maps test slugs to display names/units. RFC 4180 quoting/escaping.

## 5. Scraper behaviour

### 5.1 `scrape-metrics`

1. Fetch seed shoe page (default slug `saucony-endorphin-azura`, overridable via `--seed <slug>`). Extract test catalogue → `tests.json`.
2. For each test id (sorted ascending), fetch `lab-test-list`, parse rows, accumulate `slug → values`.
3. Validation gate (§5.3), then write `tests.json` + `metrics.json`.

### 5.2 `scrape-details`

1. Read `metrics.json` slugs; determine targets = slugs missing from `details.json` (or all with `--force-all`; single slug with `--slug <s>`).
2. Fetch each `https://runrepeat.com/uk/{slug}`, extract DetailRecord.
3. Per-shoe failures (404, parse failure): record in a summary printed at the end and continue; a 404'd shoe is recorded in `details.json` with a tombstone `{ gone: true, scrapedAt }` so it isn't retried every run.
4. Validation gate, then merge-write `details.json` (existing records untouched unless re-crawled).

### 5.3 Validation gates (shared, in `build-dataset` and both scrapers)

Fail the run (non-zero exit, no file writes) if:

- Metrics: shoe count < 300 or < 90% of previous run's count; test count < 50; >20% of previously present (slug, test) pairs vanished. (Relative rules apply only when a previous `metrics.json` exists; first run enforces the absolute floors only.)
- Any test value fails type coercion for its declared type.
- Details record missing name or productId.
- `shoes.json` schema check fails (validated with vendored ~80-line schema checker or hand-rolled asserts — no dependency).

Rationale: a RunRepeat frontend change must break CI loudly, never silently corrupt committed data.

### 5.4 `build-dataset`

Pure function of the three input files → `shoes.json` + `shoes.csv`. Deterministic (stable ordering) so re-runs without upstream changes produce no git diff.

## 6. Automation (GitHub Actions)

| Workflow | Trigger | Behaviour |
|---|---|---|
| `ci.yml` | PR + push to main | typecheck, lint, all tests, app build |
| `refresh-metrics.yml` | cron weekly (Mon 06:00 UTC) + `workflow_dispatch` | run scrape-metrics + build-dataset; if git diff in `data/`: commit `data: metrics refresh YYYY-MM-DD` and push (triggers deploy) |
| `refresh-details.yml` | `workflow_dispatch` only (input: `force_all` bool, `slug` string) | run scrape-details + build-dataset; commit as above |
| `deploy.yml` | push to main touching `app/` or `data/shoes.json` | build Svelte app, deploy to GitHub Pages |

Refresh workflows never run concurrently (`concurrency` group `scrape`, `cancel-in-progress: false`). Scrape failure = red workflow, no commit, previous data stays live. Commits by Actions use the standard `github-actions[bot]` identity.

## 7. Frontend

Svelte 5 (runes) + Vite + TypeScript. All filter/sort/serialisation logic lives in plain TS modules under `app/src/lib/` (framework-free, unit-testable); Svelte components are thin views over it. `shoes.json` is fetched at runtime from the deployed site (same origin), not bundled, so a data refresh needs no JS rebuild (deploy workflow still rebuilds for simplicity, but the app must not import the JSON statically).

### 7.1 Layout

Desktop: fixed filter sidebar (left) + results table (right). Mobile: filters collapse into a top drawer. Header: title, shoe-count ("173 of 450 shoes"), attribution link to RunRepeat, CSV export button, "last refreshed" date from `shoes.json` metadata.

### 7.2 Filters

- **Numeric range sliders with mini-histograms** (distribution of the fleet, selected range highlighted) for a curated set: heel stack, forefoot stack, drop, midsole softness (AC), energy return (heel), weight, toebox width at widest, toebox width at big toe, toebox height, MSRP.
- **Plate:** segmented control — Any / None / Plated / Carbon.
- **Released after:** date input + quick chips (1y / 2y / 3y).
- **Brand:** multi-select with counts.
- **Search:** substring match on name.
- **Discontinued:** shown by default with a visual tag; toggle to hide.
- Shoes missing a value for an active numeric filter are excluded while that filter is active (count of hidden-for-missing-data shown).
- "Add filter" picker exposes any other numeric/score test from the catalogue.

### 7.3 Table

- Default columns: name (+brand, +image thumbnail), release date, score, MSRP, heel stack, midsole softness, plate, energy return heel, toebox width widest, weight.
- Column picker to add/remove any test. Sortable (asc/desc) by any column; missing values always sort last. Secondary sort: score desc.
- Numeric cells get a subtle background tint by fleet percentile (follow the dataviz skill when implementing: neutral sequential ramp, colour-blind safe, identical in light/dark).
- Row click expands detail panel: photo, verdict intro, pros/cons two-column, who-should/shouldn't-buy, feature tags, link to full review.

### 7.4 URL state & presets

- Entire filter+sort+column state serialises to the query string (compact, human-tolerable encoding); load restores it exactly. Empty state = clean URL.
- Query keys are short and stable (e.g. `hs=36-` for heel stack min 36, `plate=none`, `sort=-energy-return-heel`), defined in one serialisation module with an exhaustive round-trip test.
- Built-in presets (chips above the table), including **"Easy-day cruiser"**: heel stack ≥ 36 mm, midsole softness ≤ fleet median, released within 2 years, plate = none, sorted by heel energy return desc. Preset thresholds live in one constants file and are tunable; presets are just canned URL states.

### 7.5 CSV export

Client-side Blob download of the **currently filtered + sorted** view with currently visible columns; same escaping rules as `shoes.csv`.

### 7.6 Aesthetics

Clean, data-forward, "lab report" feel. Light + dark theme (system-driven with toggle). Design pass follows the dataviz skill for histograms/percentile ramps. No component library; hand-styled with CSS custom properties.

## 8. Error handling summary

| Failure | Behaviour |
|---|---|
| RunRepeat 5xx/network | retry ×3 w/ backoff, then fail run |
| RunRepeat 4xx on API | fail run immediately (structure/contract change) |
| 404 on a shoe page | tombstone record, continue |
| Payload structure drift | extraction throws typed error → validation gate fails run |
| Validation gate failure | non-zero exit, nothing written, Action red, old data stays deployed |
| App fetch of shoes.json fails | full-page error state with retry button |
| Shoe missing details | rendered with "details not yet crawled" in expansion |

## 9. Testing (comprehensive — a definition-of-done gate)

Test runner: Vitest across both workspaces. Coverage expectation: every module listed in §3 has a dedicated test file; pure logic aims for exhaustive branch coverage; thresholds enforced in CI (lines ≥ 90% on `scraper/src` and `app/src/lib`).

### 9.1 Fixtures (committed under `scraper/test/fixtures/`)

- A real captured `__NUXT_DATA__` payload (the Endorphin Azura one from this investigation, trimmed of unrelated bulk but structurally intact).
- Real `lab-test-list` response (test 5) and a truncated variant with edge cases (string numbers, missing url, duplicate slug).
- Deliberately broken variants: renamed keys, wrong types, empty rows — used to prove validation gates fire.

### 9.2 Scraper unit tests

- **devalue decoder:** objects, arrays, nested wrappers (all six wrapper kinds), literals, deep nesting; malformed input throws.
- **page-payload:** extracts `page_data` from full HTML; missing script tag / non-JSON → typed error.
- **lab-test-list parsing:** row → (slug, value) incl. slug normalisation (`/uk/` and bare, trailing slashes), numeric strings, nulls.
- **extract-details:** full DetailRecord from fixture; `_clean` preference; who-should/shouldn't section matching (case-insensitive, tolerant of "NOT"); sanitiser strips scripts/styles/spans, keeps allowed tags; feature list extraction.
- **plate derivation:** carbon / plated-other / none truth table incl. missing test 69 and empty features.
- **coercion:** every test type; invalid values throw.
- **validation gates:** each rule in §5.3 has a passing and failing case.
- **build-dataset:** join correctness, metrics-only shoe handling, details-only shoe dropped, determinism (byte-identical on re-run), CSV escaping (commas, quotes, newlines, unicode).
- **http:** throttle spacing (fake timers), retry/backoff schedule, 4xx no-retry, UA header set. No real network in any test.

### 9.3 App unit tests (`app/src/lib`)

- Filter predicates: each filter type, boundary values, missing-data exclusion semantics, combined filters.
- Sorting: numeric/string/date columns, missing-last invariant both directions, stable secondary sort.
- Percentile computation: ties, single-value fleet, missing values.
- URL state: serialise→parse round-trip property (for randomised states), unknown/garbage params ignored, empty state = empty query.
- Presets: applying "Easy-day cruiser" over fixture data reproduces the expected shoe list exactly.
- CSV export: content matches current view, escaping rules.

### 9.4 Component & E2E

- Component tests (@testing-library/svelte): sidebar renders filters from catalogue, slider changes emit state, table sorts on header click, row expansion renders sanitised HTML, column picker toggles.
- Playwright smoke (runs in CI against built app + fixture dataset): page loads, count matches fixture; apply preset chip → table filters and sorts correctly; expand a row → pros visible; export CSV → non-empty download; reload with a filter URL → state restored.

### 9.5 Live-contract check (scheduled, non-blocking)

A tiny monthly workflow hits one shoe page + one `lab-test-list` call and runs extraction + validation. Failure opens/updates a pinned issue ("RunRepeat contract drift") rather than breaking deploys. This is the early-warning system between real refreshes.

## 10. Acceptance criteria

1. `npm run scrape:metrics` (from clean checkout, live network) produces valid `tests.json` + `metrics.json` covering ≥300 shoes and ≥50 tests in ≤3 minutes of polite requests.
2. `npm run scrape:details` fetches only missing shoes; second consecutive run makes zero shoe-page requests.
3. `npm run build:dataset` is deterministic and produces `shoes.json` + `shoes.csv` passing schema validation.
4. All four workflows green: CI (typecheck+lint+tests+coverage thresholds+Playwright), deploy to Pages, both refresh workflows runnable via dispatch.
5. Deployed app: the user story preset works end-to-end and its URL is shareable/restorable; CSV export of that view opens correctly in a spreadsheet.
6. Every shoe row links back to its RunRepeat review; attribution visible in header.
7. Test suite green with coverage thresholds met; every fixture-driven failure mode in §9.1 demonstrably fails the appropriate gate.
8. No runtime dependency in the scraper; app ships no framework runtime beyond Svelte's compiled output.

## 11. Roadmap (explicitly out of scope for v1)

- Build-time Claude digest: one-line verdict + tags per shoe from pros/cons + lab commentary.
- Other categories (trail c_id, hiking, sneakers) — pipeline already parameterised by seed product; UI needs category switcher.
- Public refresh trigger (issue-ops or a tiny serverless hook).
- Price/deal tracking over git history of `data/`.
- Head-to-head compare view (2–4 shoes side by side).
