# Shoe Lab

A personal running-shoe comparison tool: a static single-page app for filtering, sorting and
comparing running shoes on **exact lab-measured numbers** — heel stack, midsole softness, energy
return, toebox width, weight, torsional rigidity and ~50 more — instead of marketing copy.

It exists to answer questions like *"most-cushioned shoes released in the last two years, wide
toebox, no carbon plate, sorted by energy return"* in one click, and to hand the resulting view to
a friend as a URL.

**Live:** https://rocker1904.github.io/shoe-lab/

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

## How it works

```
RunRepeat  ──scraper (polite, ~1 req/s)──▶  data/*.json  ──build-dataset──▶  data/shoes.json
                                                                                    │
                                                              GitHub Actions ──build & deploy──▶ GitHub Pages
```

There is no server and no database. **Git is the database:** the datasets are committed JSON files
in `data/`, refreshed by GitHub Actions commits, so every refresh is a reviewable diff and any bad
scrape can be reverted with `git revert`. A scrape that fails its validation gates means a red
workflow and **no commit** — the previous data stays live.

| File | Written by | Contents |
|---|---|---|
| `data/tests.json` | `scrape:metrics` | Lab-test catalogue — id, slug, display name, type, units, group |
| `data/metrics.json` | `scrape:metrics` | Per-shoe measured values, keyed `slug → testId → value` |
| `data/details.json` | `scrape:details` | Per-shoe editorial: pros/cons, intro, who-should(-not)-buy, features, price, score, release date |
| `data/release-years.json` | `scrape:releases` | Release-year supplement, filling the gap where a shoe page gives no date at all |
| `data/shoes.json` | `build:dataset` | The joined artifact the app loads (the only file the app reads) |
| `data/shoes.csv` | `build:dataset` | Same data flattened for spreadsheets |

Metrics refresh weekly on a schedule; the full details crawl is manual and rare. The workflows,
their triggers and inputs are docs/operations.md.

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
npm run check:docs              # doc pointers + doc index parity
npm run test                    # unit + component tests, both workspaces
npm run test:coverage           # ...with coverage thresholds enforced
npm -w app run e2e              # Playwright smoke against the built app + fixture dataset

# Scraper (live network — read the politeness contract below first)
npm -w scraper run scrape:metrics    # --seed <slug>, --data-dir <dir>
npm -w scraper run scrape:details    # incremental: only shoes missing from details.json
npm -w scraper run scrape:details -- --force-all      # re-crawl every shoe page (slow)
npm -w scraper run scrape:details -- --slug <shoe>    # re-crawl one shoe
npm -w scraper run scrape:releases   # release-year supplement
npm -w scraper run build:dataset     # offline; rebuilds shoes.json + shoes.csv
npm -w scraper run check:live        # contract drift check
```

Nothing but the four `scrape:*`/`check:live` commands touches the network. The whole test suite
runs offline against committed fixtures.

Repository layout: `scraper/` (TypeScript scraper + dataset builder, zero runtime dependencies),
`app/` (Svelte 5 + Vite SPA), `shared/` (types used by both), `data/` (the datasets),
`curated/` (hand-researched release months), `docs/`
(agent-facing reference — start at `CLAUDE.md`).

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

Exports from the app always start with `slug,name,brand,url` so a saved view is self-identifying and
every row can be traced back to its review, then carry exactly the columns you had visible.

## Politeness contract

The scraper is deliberately small, slow and honest — one request at a time, at least a second
apart, no concurrency ever; an honest User-Agent carrying a contact URL; retries only on 5xx and
network errors, never on a 4xx; `runrepeat.com`'s `robots.txt` re-fetched and re-checked at the
start of every crawl, aborting the run if what we read becomes disallowed; and validation gates
that fail the run rather than write suspect data. These are enforced in code and covered by tests.
The exact intervals, retry schedule, gate thresholds and per-crawl request budgets are
docs/scraping.md §Politeness and docs/scraping.md §Validation gates.

`api.runrepeat.com` — the JSON backend the site's own pages call — serves `Disallow: /` for every
user-agent, and this project uses it anyway, deliberately and with reasons written down:
docs/decisions.md §Be a good citizen toward RunRepeat. Short version: it is the same public,
unauthenticated endpoint a browser hits for every visitor, `Disallow: /` on an API subdomain that
serves no crawlable documents reads as index hygiene rather than access policy, and the
robots-literal alternative — reading the same values off rendered pages — would put roughly seven
times the load on their origin. The document host we actually crawl, `runrepeat.com`, publishes a
real crawl policy that permits everything this project touches, and that policy *is* checked before
every crawl. It is a judgement call, not a licence, and it is written down so it can be argued
with.

## Caveats

- **Release dates are month-precise at best**, and a good many are year-only — stored as
  `YYYY-01-01` and shown as the bare year. The rest come from RunRepeat's own date or from
  hand-researched months in `curated/`, and render as `March 2024`; the day is never shown.
- **Plate detection is carbon-shaped**: non-carbon plates (nylon, PEBA) mostly read as "none".

Both are properties of the upstream data, explained in docs/scraping.md §Data quirks; fixes are
tracked in `BACKLOG.md`.
