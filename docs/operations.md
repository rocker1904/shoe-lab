# Operations

Five workflows, no other moving parts: there is no server, no database and no
deploy key. Everything runs on `ubuntu-latest` with the `.nvmrc` Node and
`npm ci`. Request budgets and gate thresholds are docs/scraping.md.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PRs, pushes to `main` | typecheck, lint, doc check, both suites with coverage, Playwright smoke |
| `refresh-metrics.yml` | Mondays 06:00 UTC + dispatch | the refresh chain, starting from `scrape:metrics` |
| `refresh-details.yml` | Dispatch only, inputs `force_all` (bool) and `slug` | the refresh chain, starting from `scrape:details` |
| `deploy.yml` | Push to `main` touching `app/`, `shared/`, `data/shoes.json` or itself, + dispatch | builds the app, publishes to Pages |
| `contract-drift.yml` | 1st of the month 07:00 UTC + dispatch | `check:live`, files or comments on an issue when it fails |

## The refresh chain

Both refresh workflows run the same tail: **scrape → `build:dataset` →
commit-if-changed → dispatch deploy**. Two properties matter.

*Commit-if-changed* is a `git diff --cached --quiet -- data` on staged data
plus a step output; nothing else in the job is conditional on it. Because the
build is deterministic (docs/scraping.md §Determinism), "no diff" genuinely
means "nothing moved upstream", so an unchanged week costs one workflow run
and no commit.

*The deploy is dispatched explicitly*, with `gh workflow run deploy.yml`, and
the job carries `actions: write` for it. This is not belt-and-braces: pushes
made with `GITHUB_TOKEN` do not trigger push-event workflows, so `deploy.yml`
would never fire on a data commit otherwise (§Decisions).

## The weekly release supplement

`scrape:releases` is not a weekly cost. The Monday job runs it only when
`scrape:details` actually fetched something — the sentinel is
`git diff --quiet -- data/details.json` immediately after that step — so on a
typical Monday, where no new shoes were listed, it is skipped and the weekly
footprint stays at the metrics budget. When new shoes did land, it runs so
they are never left undated. The manual details refresh always runs it.

## Where failures are contained

`continue-on-error` sits in exactly two places, both protecting an expensive
completed crawl from a cheap failed step. Neither weakens the validation
gates, which still abort their own run before writing anything.

- **`refresh-metrics.yml`, `scrape:details`** — that CLI exits 1 if *any*
  single slug fails, and metrics are the primary product of the Monday job.
  One permanently broken shoe page must not discard a completed metrics
  scrape every week. Failed slugs simply stay absent from `details.json` and
  are retried next week; the step still shows red in the run.
- **`refresh-details.yml`, `scrape:releases`** — a drifted supplement must not
  discard a ~460-request details crawl. `build:dataset` works without
  `release-years.json`, and shoes already dated by it keep their previous
  values.

## Concurrency

`refresh-metrics`, `refresh-details` and `contract-drift` share the `scrape`
group with `cancel-in-progress: false`, so **one crawler runs against
RunRepeat at a time**, structurally rather than by scheduling luck. `deploy`
uses the `pages` group, also no-cancel: a deployment is never killed
mid-flight and queued runs coalesce to the latest. Only `ci` cancels, per ref.

## Triggering a refresh

`gh workflow run refresh-metrics.yml --ref main`, or the Actions UI. The
details refresh takes inputs — `force_all: true` re-crawls every shoe page
(slow; see the budget in docs/scraping.md §Politeness), `slug: <shoe>`
re-crawls one, and with neither it is incremental, fetching only shoes absent
from `details.json`. Inputs reach the shell through `env:`, never string
interpolation.

A red refresh means the data is unchanged, not corrupt: read the failing step,
and if it is a validation gate, treat it as a contract-drift report
(§Contract-drift runbook).

## Contract-drift runbook

`contract-drift.yml` runs `check:live` monthly: three polite requests that
re-run the real extractors against the live site — robots.txt still permitting
the two path classes the metrics crawl needs, the seed page's
`__NUXT_DATA__` still decoding into a test catalogue and a valid detail
record, and one `lab-test-list` call still returning 300+ rows. Failure opens
(or comments on) a single **"RunRepeat contract drift"** issue and fails the
run; it changes no data and blocks nothing.

An issue therefore means one of two things:

- **Robots drift** — the site now disallows what we crawl. Stop crawling
  first, then discuss (docs/decisions.md §Be a good citizen toward RunRepeat).
  Do not "fix" it by narrowing the gate.
- **Payload drift** — the page or API shape moved. Recapture the affected
  fixture under `scraper/test/fixtures/raw/` from the live response, fix the
  extractor against it, and let the suite pin the new shape. The fixtures are
  the only sanctioned way to reproduce upstream shapes offline
  (docs/decisions.md §Testing bar: adversarial, no live network); do not
  hand-edit a fixture to make a test pass.

Then run the matching refresh by hand: drift usually means the last scheduled
run either failed or wrote nothing.

`check:live` is not the only drift detector. `lineage.test.ts` asserts the
declared heel/forefoot pairs (docs/app.md §Columns and sorting) against the
committed `data/shoes.json`, so an upstream **rename or unlink** of one of
those eight tests turns it red. Expect it on an unrelated branch: the refresh
workflows run scrape → build → commit and never `verify`, and their pushes use
`GITHUB_TOKEN`, which triggers no push workflows. So the failure surfaces on
the next PR touching anything, not on the refresh that caused it — the diff
under review is not the cause. Fix the declaration to match the new catalogue;
do not delete the assertion.

`direction.test.ts` is the second such guard, over
`app/src/lib/direction.ts` (docs/app.md §Theming). It reads the **full**
`data/tests.json` catalogue rather than the shipped subset in `shoes.json`, so
a new numeric test fails the build while it still has no readings instead of
the day one shoe gets a reading and it appears as a column. Classify the new
slug; do not widen the guard. An unclassified key reads `neutral`, which is
unmarked rather than mis-marked — that is the safe fallback, not the answer.

## Deploy

Pages is configured to publish from the workflow (build type: workflow), not
from a branch — `deploy.yml` uploads `app/dist` as the Pages artifact and
`deploy-pages` publishes it. Nothing else writes to Pages, and there is no
`gh-pages` branch to keep in sync. Merged `main` is live within about a
minute, which is why the repo has no separate live-state doc.

## Decisions

### Refresh commits are pushed with GITHUB_TOKEN and dispatch the deploy
Pushing as `github-actions[bot]` with the default token is what keeps the
refresh credential-free — no PAT, no deploy key, no App to rotate. The
documented consequence is that such pushes trigger no push-event workflows, so
each refresh ends by dispatching `deploy.yml` itself. Do not "fix" the missing
trigger by introducing a PAT; the dispatch is the cheaper half of the trade.

### Drift is reported, never enforced
`check:live` runs with `continue-on-error` and its result is turned into an
issue before the job is failed deliberately at the end. The scrapers are not
gated on it: a drift check that could block a refresh would turn a cosmetic
upstream change into missing data. One issue is reused for repeat failures so
a long drift does not become a monthly issue pile.

### Refresh timeouts are generous, not tight
30 minutes for the weekly job, 90 for a full details crawl. At one request per
second a `--force-all` crawl is inherently slow, and a timeout that trips
mid-crawl wastes every request already made without producing a commit. Do not
tighten these to "fail fast" — the politeness floor, not the runner, sets the
duration.
