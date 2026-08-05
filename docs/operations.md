# Operations

Five workflows, no other moving parts: there is no server, no database and no
deploy key. Everything runs on `ubuntu-latest` with the `.nvmrc` Node and `npm ci`, bar one
job (§The classic-scrollbar job). Request budgets and gate thresholds are
docs/scraping.md.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PRs, pushes to `main`, + dispatch from a changed refresh | two jobs: `full-suite` on `ubuntu-latest` — typecheck, lint, doc and workflow checks, both suites with coverage, Playwright smoke on Chromium plus a cross-browser spec on Firefox and WebKit — and `classic-scrollbars` on `macos-latest` (§The classic-scrollbar job) |
| `refresh-metrics.yml` | Mondays 06:00 UTC + dispatch | the refresh chain, starting from `scrape:metrics` |
| `refresh-details.yml` | Dispatch only, inputs `force_all` (bool) and `slug` | the refresh chain, starting from `scrape:details` |
| `deploy.yml` | After `CI` succeeds on `main`, including a refresh-dispatched CI run; deploys that exact commit (§The refresh chain) | builds the app, publishes to Pages |
| `contract-drift.yml` | 1st of the month 07:00 UTC + dispatch | `check:live`, files or comments on an issue when it fails |

## The e2e run needs three browsers

`npm -w app run e2e` drives Chromium, Firefox and WebKit, so a local checkout
needs all three:

```
npx playwright install chromium firefox webkit --with-deps
```

Only `cross-browser.spec.ts` runs in Firefox and WebKit; the smoke suite stays
on Chromium, because it asserts layout and one font stack is what makes those
numbers mean anything. The split exists because Firefox and WebKit implement
none of `input type="month"` and a Chromium-only suite reported the release
filter working when it was a bare text box in both
(docs/app.md §Released after is month-granular).

On CI the two extra engines cost 23–54s to install across the runs measured so
far — the spread is the runner's apt cache, not the payload — and about a second
of test time, since `cross-browser.spec.ts` runs alongside the smoke suite
rather than after it.

**WebKit does not launch on a distribution Playwright supports only through
apt.** Its bundle wants 19 sonames pinned to Ubuntu 24.04 — `libicu*.so.74`,
`libxml2.so.2`, `libjxl.so.0.8`, `libbacktrace.so.0` and fourteen `libflite`
libraries. On Arch those are ICU 78, `libxml2.so.16` and jxl 0.11, which are
ABI-incompatible major bumps rather than missing packages, so symlinking them
crashes instead of fixing anything, and `flite` and `libbacktrace` are absent
outright. Chromium and Firefox launch natively; WebKit does not.

Run it in Playwright's own image instead, which is the same Ubuntu CI uses:

```
npm -w app run e2e:docker
```

**That is the route for every WebKit question, not only the full e2e suite.**
A host launch failure does not make a WebKit-specific behaviour, layout or
design question deferrable. Build outside the container when the probe needs
the app, then run the probe through the same image:

```
npm -w app run build
sh hunt/in-docker.sh hunt/<probe>.mjs webkit
```

`hunt/in-docker.sh` accepts any probe path and further arguments; probes that
do not need the built app can omit the build. This is also the route for a
one-off browser measurement before its assertion has a permanent suite home.

That mounts the repo and runs as the calling user, so nothing lands root-owned.
The image tag is **read from the installed `@playwright/test` at run time**
rather than written down: the dependency is a caret range, so a pinned tag
would drift silently on the next `npm install`, and a container whose bundled
browsers do not match the client refuses to launch.

## The classic-scrollbar job

A scrollbar that takes layout is 12–15px this app's boundaries are all about
(docs/app.md §Two renderings, and only one of them mounted), and no Linux runner
here draws one: Playwright is headless, which is overlay in every engine, and a
headed WebKit under `xvfb` inside the Playwright image hangs. So `ci.yml`'s
second job runs on `macos-latest`, sets `AppleShowScrollBars` to `Always`,
installs **WebKit only**, and asks the two things a bar can break — the real
fleet's fit boundary through `hunt/fit-boundary.mjs`, then `cross-browser.spec.ts`
**headed**, which is where the one-row toolbar's fit, the panels' ways out, the
sidebar's tab stops and the fit ladder live.

**Whether Playwright's WebKit honours that default is answered by the log, not
assumed.** The rig measures the bar and names the width it found for each regime
on its closing line, so `0px bar` there means macOS served an overlay after all
and the job is covering WebKit's layout rather than the classic regime.

It gates the deploy like every job in this workflow — `deploy.yml` waits on the
whole workflow's conclusion (§Deploy).

## The refresh chain

Both refresh workflows run the same tail: **scrape → `build:dataset` →
commit-if-changed → dispatch CI → deploy on success**. Two properties matter.

*Commit-if-changed* is a `git diff --cached --quiet -- data` on staged data
plus a step output; nothing else in the job is conditional on it. Because the
build is deterministic (docs/scraping.md §Determinism), "no diff" genuinely
means "nothing moved upstream", so an unchanged week costs one workflow run
and no commit.

*CI is dispatched explicitly*, with `gh workflow run ci.yml`, and the job
carries `actions: write` for it. This is not belt-and-braces: pushes made with
`GITHUB_TOKEN` do not trigger push-event workflows. Dispatching the same CI
workflow code changes use makes data compatibility guards run before
`deploy.yml` sees the successful `workflow_run`; dispatching deploy directly
would publish a refresh that can fail the app suite (§Decisions).

## The weekly release supplement

`scrape:releases` is not a weekly cost. The Monday job runs it only when
`scrape:details` actually fetched something — the sentinel is
`git diff --quiet -- data/details.json` immediately after that step — so on a
typical Monday, where no new shoes were listed, it is skipped and the weekly
footprint stays at the metrics budget. When new shoes did land, it runs so
they are never left undated. The manual details refresh always runs it.

## Where failures are contained

`continue-on-error` is used in the refresh chain only where an expensive
completed crawl must survive a cheap failed step, and never weakens the
validation gates, which still abort their own run before writing anything.
`grep -rn continue-on-error .github/workflows` is the exhaustive list; what it
finds outside the refresh chain is the drift reporter
(§Drift is reported, never enforced).

- **`refresh-metrics.yml`, `scrape:details`** — that CLI exits 1 if *any*
  single slug fails, and metrics are the primary product of the Monday job.
  One permanently broken shoe page must not discard a completed metrics
  scrape every week. Failed slugs simply stay absent from `details.json` and
  are retried next week; the step still shows red in the run.
- **`refresh-details.yml`, `scrape:releases`** — a drifted supplement must not
  discard a full details crawl (its budget is
  docs/scraping.md §Politeness). `build:dataset` works without
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

Both are dispatch-only, and deliberately
(§Repo access is the gate on who may trigger a refresh).

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
run either failed or wrote nothing. Where the fix legitimately moves the whole
fleet — a real category rename, a test retired upstream — the fleet gates hold
the run red until the shift is taken deliberately
(docs/scraping.md §Validation gates).

`check:live` is not the only drift detector. `lineage.test.ts` asserts the
declared heel/forefoot pairs (docs/app.md §Columns and sorting) against the
committed `data/shoes.json`, so an upstream **rename or unlink** of one of
those eight tests turns the refresh-dispatched CI red before deploy. Fix the
declaration to match the new catalogue; do not delete the assertion.

`direction.test.ts` is the second such guard, over
`app/src/lib/direction.ts` (docs/app.md §Theming). It reads the **full**
`data/tests.json` catalogue rather than the shipped subset in `shoes.json`, so
a new numeric test fails the build while it still has no readings instead of
the day one shoe gets a reading and it appears as a column. Classify the new
slug; do not widen the guard. An unclassified key reads `neutral`, which is
unmarked rather than mis-marked — that is the safe fallback, not the answer.

`labels.test.ts` is the third, over `app/src/lib/labels.ts`
(docs/app.md §Columns and sorting). It reads the same full catalogue and fails
when a numeric test's label — its short form, or its real name where none is
declared — has a word wider than `MAX_LABEL_PX`, or when two metrics that can
be on screen together resolve to the same label. So an upstream rename to
something long fails the build rather than clipping silently on a phone. Add a
short label; **do not raise `MAX_LABEL_PX`**, which is a measured column width
and not a preference.

`score.test.ts` is the fourth, and the only one that reads coverage rather than
names: it fails when a metric a story's score *weights* drops below
`SPARSE_BELOW` over that story's pool. Every term sits well clear of it, so
this fires only on a real collapse upstream. What to do about one is
docs/app.md §The story scores — and it is not lowering the threshold.

The same file carries a **second, tighter coverage guard** with a different
remedy: Tempo's and Race's scoreable lists are floored as a share of the pool
each ranks, well above `SPARSE_BELOW`, so a partial collapse that leaves a term
usable still turns it red. Two ways in: a term's coverage genuinely fell, which
is the case above and is fixed upstream; or the pool grew while the scoreable
count did not — a catch-up batch of new models with no lab tests yet — which is
not a regression and clears itself on the refresh that tests them. Neither is
fixed here: **do not lower a floor**, and do not swap one back for a count,
which is what the growing fleet already broke
(docs/app.md §The story scores). The same file's anchor checks are one-sided
for the same reason: a shoe better than the anchor holder reads above 100 by
design, and only a scale falling *short* of an anchor is a fault.

## Resuming release-date curation

Curation is author-side work: it spends the author's interactive-agent budget and
produces a committed file, and adds nothing to the weekly refresh
(docs/decisions.md §Free tools only). Nothing here runs in CI. Semantics and
gates are docs/scraping.md §Curated release months; method and evidence rules
are the spec under docs/superpowers/specs.

**State when you pick this up**, counted rather than remembered. The file is
written by many sessions and carries both `"month":null` and `"month": null`, so
every count over it wants `-E` and an optional space, or a JSON parse:

```
grep -cE '"month": ?null' curated/release-dates.jsonl        # evidenced dead ends
grep -cE '"reliability": ?"suspect"' curated/release-dates.jsonl  # months that may be off by one
node -e 'console.log(require("./data/shoes.json").shoes.filter(s=>!s.releaseDateSource||s.releaseDateSource==="listing").length)'
```

The third is the population still needing a month: every shoe whose
`releaseDateSource` is `listing` or null — all of them, because the listing year
runs late in only one direction, so no shoe can be assumed outside a recency
window.

**The loop.** Discovery is offline and costs no web search:

1. Build the publisher index once from sitemaps, then match shoes to review URLs
   by exact canonical token equality. Loose containment matches the wrong
   generation — it once matched "Brooks Hyperion" to `hyperion-elite-3`.
2. Hand each lookup its shoe *and its candidate URLs*, ordered **WearTesters and
   meta-endurance first**. Yield is set almost entirely by publisher: WearTesters
   prints a literal `Release Date:` row and resolved 21 of 22; Doctors of Running
   and Believe in the Run never print one and resolved 1 of 19. A candidate from
   a specs-table publisher costs about a quarter as much as grinding to a null
   without one.
3. For those publishers, rendering the page directly beats dispatching an agent —
   one render both finds the row and verifies it.
4. Re-fetch and substring-match **every** quote before recording. One outright
   fabrication appeared in fifty lookups, rated "high confidence" and
   indistinguishable from genuine results by that field. Sampling would have
   missed it.
5. Record nulls as carefully as months, then commit.

**What is left, and why it is harder.** Roughly 108 shoes have no indexed review
at all. This is not an age problem — their years and scores match the rest. They
are budget models, variants of covered models (GTX/GTS/EasyOn), and brands with
no English coverage. A publisher only helps if it reviews that tier at all, so
no further sitemap will move it: adding two trail publications grew the index by
6,000 URLs and matched one extra shoe. The tested lead is the Wayback CDX API,
which is public, free and honest-User-Agent reachable, and finds brand product
pages for exactly these shoes with style codes in the URL. It yields an
availability *bound* rather than a month, first capture lags release, and
captures are regional — so treat a lone hit as a bound recorded in `notes`.

## Deploy

Pages is configured to publish from the workflow (build type: workflow), not
from a branch — `deploy.yml` uploads `app/dist` as the Pages artifact and
`deploy-pages` publishes it. Nothing else writes to Pages, and there is no
`gh-pages` branch to keep in sync. Merged `main` is live once **every** CI job
has passed and the deploy has run — a few minutes, and a red CI deploys nothing
— which is why the repo has no separate live-state doc.

## Decisions

### Refresh commits are pushed with GITHUB_TOKEN and dispatch CI
Pushing as `github-actions[bot]` with the default token is what keeps the
refresh credential-free — no PAT, no deploy key, no App to rotate. The
documented consequence is that such pushes trigger no push-event workflows, so
each changed refresh dispatches `ci.yml`; a successful run triggers
`deploy.yml` exactly as a code push does. Do not "fix" the missing push trigger
by introducing a PAT, and do not dispatch deploy directly — the explicit CI
dispatch is the cheaper half of the trade and the app's data-compatibility gate.

### Repo access is the gate on who may trigger a refresh
Both refresh workflows are `workflow_dispatch` only, so triggering one takes
write access — and that is the permission model, not a gap to route around with
issue-ops or a comment trigger. A dispatch spends the politeness budget against
runrepeat.com (docs/scraping.md §Politeness) and commits to `data/`, so the set
of people who may spend it is exactly the set who may commit. Everyone else is
served by the weekly schedule, which keeps the data current without anyone
having to ask for a run.

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
