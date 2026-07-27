# Shoe Lab

A personal running-shoe comparison tool: a static single-page app for filtering, sorting and
comparing running shoes on **exact lab-measured numbers** — heel stack, midsole softness, energy
return, toebox width, weight, torsional rigidity and ~50 more — instead of marketing copy.

It exists to answer questions like *"most-cushioned shoes released in the last two years, wide
toebox, no carbon plate, sorted by energy return"* in one click, and to hand the resulting view to
a friend as a URL.

## Data comes from RunRepeat

**Every number and every word of editorial text in this repo is [RunRepeat](https://runrepeat.com/)'s
work, not mine.** They buy the shoes, cut them in half, and run them through a real lab
(durometer, force gauge, Dremel abrasion, caliper, scale) — funded by affiliate revenue from their
reviews. This project is a filtering front-end over that public data; it produces no measurements
of its own and adds no value RunRepeat did not already create.

So: **if a shoe here looks interesting, go read the full review and buy through them.** Every row in
the table expands to a link straight to its RunRepeat review, the header carries permanent
attribution, and this repo is not monetised in any way.

- RunRepeat running-shoe catalogue: <https://runrepeat.com/catalog/running-shoes>
- Their lab methodology: <https://runrepeat.com/>

If anyone at RunRepeat wants this taken down, changed, or throttled further, the contact URL is in
the scraper's User-Agent on every request — please open an issue and it will be actioned.

## Live site

<!-- TODO: pages url after first deploy -->

## How it works

```
RunRepeat  ──scraper (polite, ~1 req/s)──▶  data/*.json  ──build-dataset──▶  data/shoes.json
                                                                                    │
                                                              GitHub Actions ──build & deploy──▶ GitHub Pages
```

There is no server and no database. **Git is the database:** the datasets are committed JSON files
in `data/`, refreshed by GitHub Actions commits, so every refresh is a reviewable diff and any bad
scrape can be reverted with `git revert`.

### Datasets (`data/`)

| File | Written by | Contents |
|---|---|---|
| `tests.json` | `scrape:metrics` | Lab-test catalogue — id, slug, display name, type, units, group |
| `metrics.json` | `scrape:metrics` | Per-shoe measured values, keyed `slug → testId → value` (464 shoes × 64 tests today) |
| `details.json` | `scrape:details` | Per-shoe editorial: pros/cons, intro, who-should(-not)-buy (sanitised HTML), features, price, score, release date. 404'd shoes are stored as `{ gone: true }` tombstones |
| `release-years.json` | `scrape:releases` | Release-year supplement from the category API, filling the gap where a shoe page has no precise release date |
| `shoes.json` | `build:dataset` | The joined, derived artifact the app loads (the only file the app reads) |
| `shoes.csv` | `build:dataset` | Same data flattened for spreadsheets |

All JSON is written with sorted keys and stable ordering, so `build:dataset` is deterministic:
re-running it without upstream changes produces no git diff.

### Refresh model

| Workflow | Trigger | What it does |
|---|---|---|
| `refresh-metrics.yml` | Cron, **Mondays 06:00 UTC** + *Run workflow* button | `scrape:metrics`, then `scrape:details` for any newly listed shoes, then `build:dataset`; commits `data: metrics refresh <date>` and dispatches the deploy |
| `refresh-details.yml` | **Manual only** (*Run workflow*), inputs `force_all` (bool) and `slug` (string) | `scrape:details` (incremental by default), `scrape:releases`, `build:dataset`; commits `data: details refresh <date>` and dispatches the deploy |
| `deploy.yml` | Push to `main` touching `app/`, `shared/` or `data/shoes.json` + manual | Builds the app and deploys to GitHub Pages |
| `ci.yml` | PRs and pushes to `main` | typecheck, lint, both test suites with coverage thresholds, Playwright smoke |
| `contract-drift.yml` | Cron, 1st of the month + manual | 3 live requests that re-run extraction and validation against RunRepeat; failure opens/updates a "RunRepeat contract drift" issue rather than breaking anything |

Notes on the schedule:

- The **release-year supplement** is not a weekly cost. It runs with every details crawl, and on a
  weekly run only when `scrape:details` actually fetched newly listed shoes (i.e. `details.json`
  changed). Most Mondays it is skipped.
- The refresh and drift workflows share a `scrape` concurrency group, so **only one crawler ever
  runs against RunRepeat at a time**, structurally.
- Actions pushes with `GITHUB_TOKEN` do not trigger push-event workflows, so the refresh workflows
  dispatch `deploy.yml` explicitly after committing.
- A scrape failure means a red workflow and **no commit** — the previous data stays live.

## Local development

Node ≥ 22 (see `.nvmrc`). npm workspaces: `scraper` and `app`.

```bash
npm install

# App (uses the committed data/shoes.json)
npm -w app run dev              # dev server
npm -w app run build            # production build into app/dist
npm -w app run preview          # serve the build on :4173

# Checks
npm run typecheck               # tsc + svelte-check
npm run lint                    # eslint
npm run test                    # unit + component tests, both workspaces
npm run test:coverage           # ...with coverage thresholds enforced
npm -w app run e2e              # Playwright smoke against the built app + fixture dataset

# Scraper (live network — read the politeness contract below first)
npm -w scraper run scrape:metrics    # ~60 requests; --seed <slug>, --data-dir <dir>
npm -w scraper run scrape:details    # incremental: only shoes missing from details.json
npm -w scraper run scrape:details -- --force-all      # re-crawl every shoe page (~460 requests, ~8 min)
npm -w scraper run scrape:details -- --slug <shoe>    # re-crawl one shoe
npm -w scraper run scrape:releases   # release-year supplement (~20 requests)
npm -w scraper run build:dataset     # offline; rebuilds shoes.json + shoes.csv
npm -w scraper run check:live        # 3 requests; contract drift check
```

Nothing but the four `scrape:*`/`check:live` commands touches the network. The whole test suite
runs offline against committed fixtures.

## CSV column names

`data/shoes.csv` (and the in-app **Export CSV**) name their metric columns by **test slug**, not by
display name — `midsole-softness-22`, `energy-return-heel`, `toebox-width-widest-part`. This is
deliberate: display names are neither unique nor stable. RunRepeat revised several test methods in
2022 and kept the old names, so `midsole-softness` (test 11) and `midsole-softness-22` (test 70)
are *both* displayed as "Midsole softness". Slugs disambiguate; names do not.

Map slugs to display names and units with `data/tests.json`:

```bash
jq -r '.tests[] | [.slug, .name, .units] | @tsv' data/tests.json
```

Exports from the app always start with `slug,name,brand` so a saved view is self-identifying, then
carry exactly the columns you had visible.

## Politeness contract

The scraper is deliberately small, slow and honest. These are hard requirements, enforced in code
and covered by tests:

- **≥1 second between requests**, single-flight. No concurrency against RunRepeat, ever
  (`PoliteHttp` in `scraper/src/http.ts`).
- **Honest User-Agent** identifying the tool and carrying a contact URL:
  `shoe-lab/0.1 (personal comparison tool; contact: <repo url>)`.
- **Retries**: at most 3, backing off 5s → 25s → 2min, and only on 5xx or network errors. Any 4xx
  fails immediately without retrying.
- **`robots.txt` re-checked at the start of every crawl** of `runrepeat.com` — both `scrape:metrics`
  and `scrape:details` fetch and parse it and abort politely if the paths they need become
  disallowed. `scrape:details` skips even that request when it has nothing to fetch.
- **Small weekly budget**: the Monday job is 1 `robots.txt` + 1 seed shoe page + one API call per
  fetchable lab test (58 today) ≈ **60 requests**, plus one page per newly listed shoe (usually a
  handful). The full details crawl (~460 requests) is manual and rare.
- **Incremental by default**: `scrape:details` fetches only shoes absent from `details.json`. A
  second consecutive run makes zero shoe-page requests.
- **Validation gates before any write** (`scraper/src/validate.ts`): shoe count below 300 or below
  90% of the previous run, fewer than 50 tests, >20% of previously present (slug, test) pairs
  vanishing, or any value failing coercion for its declared type all abort the run with no file
  writes. A RunRepeat frontend change breaks CI loudly rather than silently corrupting the data.

### Why this project uses `api.runrepeat.com` despite its `robots.txt`

*Project decision, 2026-07-26 — recorded here deliberately rather than left implicit.*

`https://api.runrepeat.com/robots.txt` serves `Disallow: /` for every user-agent. This project uses
that host anyway, for the metrics endpoint (`/api/product/lab-test-list/...`) and the category
endpoint used by the release-year supplement. The reasoning:

1. It is **the same public, unauthenticated endpoint the site's own frontend calls for every
   visitor** — the exact URL and parameters a browser issues when you open a RunRepeat comparison
   page. Nothing here is private, gated, or reached by a route a normal visitor doesn't use.
2. `Disallow: /` on an API subdomain is conventionally **index hygiene, not access policy**: it
   keeps JSON responses out of search results on a host that serves no crawlable documents. The
   document host we actually crawl, `runrepeat.com`, publishes a real crawl policy that permits
   everything this project touches — and that policy *is* checked, on every run, before any page
   is fetched.
3. The alternative is **worse for RunRepeat**. Reading the same values off rendered shoe pages
   would mean ~460 HTML page loads instead of ~60 JSON calls — roughly **7× the load** on their
   origin, for identical data.
4. The footprint is **tiny and attended**: ~60 throttled requests a week, one at a time, from a
   single personal repo, with the full crawl run by hand.
5. The User-Agent carries a **contact URL on every single request**, so RunRepeat can see exactly
   who this is and object. If they do, this stops.

This is a judgement call, not a licence. It is written down so it can be argued with. The same
reasoning is mirrored in the code at `scraper/src/release-dates.ts`.

## Repository layout

```
scraper/    TypeScript scraper + dataset builder. Zero runtime dependencies.
  src/      devalue decoder (vendored), payload extraction, HTTP, validation, build-dataset
  test/     vitest suites + committed fixtures (real captured payloads + deliberately broken ones)
app/        Svelte 5 + Vite single-page app
  src/lib/  pure logic: filters, sort, percentiles, URL state, presets, CSV export
  e2e/      Playwright smoke test (runs against a fixture dataset, not the live one)
shared/     types shared by both workspaces
data/       the datasets (see above)
docs/       design spec
```

## Known deviations from the design spec

Recorded for honesty; none of them change what the tool does.

- **Range filters ship as an SVG histogram plus min/max number inputs**, not a dual-thumb slider
  (spec §7.2). Same capability, simpler and more accessible with a keyboard.
- **`ageMonths` is computed in the app at load**, not stored in `shoes.json` (spec §4.4) — storing
  it would make an otherwise deterministic build depend on the wall clock.
- **The per-row RunRepeat link lives in the expanded row**, not in the collapsed row itself
  (spec §10.6): clicking a row expands it, and the panel opens with the shoe's review link. The
  header attribution link is always visible.
- **`option`- and `text`-typed lab tests are catalogued but not fetched** — they carry no
  comparable numbers, and skipping them removes 6 requests per weekly run.
- **Most release dates are year-only**, supplied by the release-year supplement and stored as
  `YYYY-01-01`; the table shows the year alone unless RunRepeat published a precise date
  (`preciseReleaseDate`).
