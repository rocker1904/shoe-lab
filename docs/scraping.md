# Scraping pipeline

Four CLIs in `scraper/`, zero runtime dependencies, all live traffic through
one `PoliteHttp` instance per process. `scrape:metrics` writes `tests.json` +
`metrics.json`, `scrape:details` writes `details.json`, `scrape:releases`
writes `release-years.json`, and `build:dataset` joins those four offline into
`shoes.json` + `shoes.csv` — the only files the app reads. Workflow wiring and
schedules are docs/operations.md.

## Endpoints

Three, all discovered by reading what the site's own frontend issues. Nothing
authenticated, no route a visitor doesn't hit.

**Lab-test list** — `GET api.runrepeat.com/api/product/lab-test-list/<testId>?product_id=<entityId>`.
One call per fetchable test; each returns the *whole* catalogue's readings for
that test, which is why 58 calls cover ~464 shoes. `entityId` is the seed
page's `entity_id` (see below) — the endpoint wants the numeric product id of
the page doing the asking, not a slug, and returns the full comparison table
around it. Body is `{ rows: [[valueCell, nameCell], …] }`;
`valueCell.value` is the reading, `nameCell.url` the shoe URL, `nameCell.text`
its display name. Header rows and any other columns are ignored.

**Shoe page** — `GET runrepeat.com/uk/<slug>`, HTML. Everything useful is in
the `<script id="__NUXT_DATA__">` tag, a devalue-encoded flat array decoded by
`scraper/src/devalue.ts` (vendored; upstream devalue 5.1.1 semantics — index 0
is the root, every value is an index into the array, negative indices are
constants, `Reactive`/`Ref`-family two-element arrays unwrap to their target,
and `Set`/`Map`/`Date` tags decode to array/object/ISO-string). From the
decoded root: the first `data` entry carrying `page_data`, plus `page_type`
and `entity_id`. `page_data.lab_tests` holds the test catalogue,
`page_data.product` / `.content` / `.features` the editorial record.

**Category documents** — `GET api.runrepeat.com/api/category/documents?from=<n>&size=30&filter[]=1&f_id=2&c_id=2&orderBy=recent&include=facts&exclude=colors`.
The running-shoe listing; `f_id`/`c_id`/`filter[]` pin that category,
`include=facts` is what makes `facts['release-date']` present at all, and
`exclude=colors` drops the largest unused field. Paged by `from` in steps of
`size`, stopping on the first empty `products` array (100-page ceiling as a
runaway guard). Used only by the release-year supplement.

## Slug keying

Every file keys shoes by slug: origin stripped, a leading locale segment
(`uk`, `es`) dropped, last path segment wins (`scraper/src/slug.ts`). Metric
values key by test id **stringified** — JSON object keys, so numeric ids would
round-trip as strings anyway. Test *slugs* are the stable public key (CSV
headers, URL state); display names are neither unique nor stable, see
§Data quirks.

## Which tests are fetched

The catalogue comes from the seed shoe's page (`--seed`, default
`saucony-endorphin-azura`), and `METRIC_TYPES` in `scraper/src/coerce.ts`
decides which of them cost a request: `float`, `score`, `percent`, `rating`,
`bool`. `option` and `text` tests are catalogued but never fetched — they
carry no comparable number, nothing downstream can range or sort them
(docs/app.md §Filters), and skipping them removes 6 requests from every
weekly run.

## Politeness

Hard requirements, enforced in `scraper/src/http.ts` and covered by tests. The
posture behind them, including why `api.runrepeat.com` is used despite its
robots.txt, is docs/decisions.md §Be a good citizen toward RunRepeat.

- **One request at a time, ≥1 s apart.** The gap is measured start-to-start
  from the previous request, so a slow response never shortens it and a fast
  one never lets two requests bunch. No concurrency, ever.
- **Retries: three, 5 s → 25 s → 120 s, on 5xx and network errors only.** Any
  4xx throws `HttpStatusError` immediately — a 404 is an answer, not a
  transient, and retrying it is pure extra load. `scrape:details` converts
  exactly the 404 into a tombstone (§Decisions).
- **Honest User-Agent** with the repo URL as contact, one constant in
  `http.ts`. If RunRepeat objects, that is the channel.
- **robots.txt re-fetched and re-parsed at the start of every crawl** of
  `runrepeat.com`: `scrape:metrics` gates on the seed page path and
  `/api/product/lab-test-list/1`, `scrape:details` on a representative
  `/uk/…` path — and skips even that request when it has nothing to fetch.
  The parser reads the `*` group only (RFC 9309 grouping, consecutive
  user-agent lines share a group) and fails closed by aborting the run.
- **Request budget**, today: metrics ≈ 60 (1 robots + 1 seed page + 58 tests),
  details incremental = 1 robots + one page per uncrawled slug,
  `--force-all` ≈ 465 (one page per catalogued shoe) or 0 with `--from-corpus`,
  releases ≈ 21 (20 full pages + the empty one that stops the loop),
  `check:live` = 3.
- **`scrape:details --from-corpus <dir>` makes no requests at all.** It re-extracts
  from pages already on disk and never constructs a client, so an extractor change
  costs a local re-run rather than a crawl. It is not an exception to the rule above;
  it is outside it. The directory must exist — a missing page is skipped, a missing
  corpus aborts, so a mistyped path cannot look like a clean run. Records keep their
  original `scrapedAt` (§Determinism).

## Validation gates

`scraper/src/validate.ts`, run before anything is written, so a failed gate
means a red workflow and untouched `data/` — never a partial write.

- **Absolute floors:** fewer than 300 shoes or fewer than 50 tests fails. The
  catalogue extractor enforces the same 50 independently, so a gutted
  `lab_tests` payload fails before a single API call is spent.
- **Type matching:** every value must match its test's declared type
  (numeric family → number, `bool` → boolean, everything else → string), and
  a value for a test id absent from the catalogue is fatal.
- **Relative, previous-run gates:** shoe count below 90 % of the previous run,
  or more than 20 % of previously present (slug, testId) pairs missing. These
  are skipped when `metrics.json` does not yet exist — a first run is
  absolute-only by construction, not by a flag.
- **Release supplement** carries its own floors: 300 slugs seen, 100 years
  found.
- **Post-join:** `build:dataset` re-validates the assembled `shoes.json`
  (builtAt present, arrays, slug/name present, plate within the enum) before
  writing, so a bad join cannot reach the app either.

## Determinism

`build:dataset` reads no clock. `builtAt` is the **maximum `scrapedAt` of its
inputs** — `metrics.json` plus every details record — and deliberately
excludes `release-years.json`, which refreshes on its own rare schedule and
would otherwise churn `builtAt` without any shoe changing. Ordering is fixed:
`canonicalJson` sorts every object key, shoes sort by slug, CSV metric columns
sort by test id. Re-running the build over unchanged inputs produces no git
diff, which is what makes a data commit a readable diff
(docs/decisions.md §Git is the database).

`scrapedAt` dates the *fetch*, not the record, so `--from-corpus` re-extraction
preserves whatever the live crawl stamped. `builtAt` therefore answers "how old is
the data" rather than "when did the extractor last run" — the latter is what git
already records. A re-extraction that changed only derived fields moves no dates,
which is also what keeps its data commit legible.

`ageMonths` is computed in the app at load rather than stored, for the same
reason: storing it would make the build depend on the wall clock.

## Release-year supplement

Most shoe pages carry no `released_at`, so `scrape:releases` walks the
category listing and takes, per product, the first `facts['release-date']`
option whose `name`/`text` is a bare four-digit year. `build:dataset` uses it
**only** when the page gave no date, materialising `YYYY-01-01`.

`preciseReleaseDate` is therefore the discriminator, not the date string: true
only when the shoe page supplied a date; false means the day and month are
fiction and only the year is real. Downstream consequences are real —
year-derived shoes sort and filter as if released on 1 January — and the table
renders the year alone when the flag is false (docs/app.md).

## Data quirks

Expensive to discover, invisible in the code:

- **Most shoes have no page-level `released_at`** — hence the supplement.
  After it, roughly 437 of 464 shoes are dated and only ~24 precisely.
- **Plate detection reads the review section, not the vocabulary.** RunRepeat's
  structured plate fact and its features list both name carbon and nothing else —
  across the whole fleet the fact takes only `carbon-plate`, `false` or absent, so
  nylon and PEBA shoes are untagged. What distinguishes them is that plated shoes
  get a per-shoe "Plate" review section, nested one level inside a parent section
  that varies by shoe. So: carbon feature wins, else a plate section means
  `plated-other`, else `none`. The review prose names the material but cannot be
  parsed for it — most carbon mentions in those sections are negations
  ("rather than carbon fibre"), so a regex that catches the real ones catches more
  false ones. Roughly three shoes in the fleet are tagged wrongly at source and are
  corrected by hand (§Decisions).
- **`lab_tests.groups` covers only the seed shoe's own test run**, so about
  half the catalogue has `groupId: null` and lands in the app's "Other" column
  group (docs/app.md §Columns and sorting). Not corruption; a multi-seed merge
  would be needed to fill it.
- **Display names are neither unique nor stable.** RunRepeat revised test
  methods in 2022 and kept the old names, so tests 11 and 70 are both
  "Midsole softness" (`midsole-softness` / `midsole-softness-22`). Slugs
  disambiguate; anything user-visible that must round-trip uses the slug.

## Decisions

### First occurrence wins in lab-test-list
A response can list the same slug twice (locale variants, duplicated rows).
The first row with a usable value is kept and later ones ignored, rather than
last-wins or an error: the endpoint is ordered by relevance, and a duplicate
is not a data problem worth failing a 60-request run over. Do not "fix" this
into a merge or a conflict check — with one value per (slug, test) there is
nothing to merge, and the validation gates already catch mass value loss.

### Tombstones are records, not gaps
A 404 during the details crawl writes `{ gone: true, scrapedAt }` rather than
leaving the slug absent. Absence means "not yet crawled" and is what makes the
incremental crawl incremental; without the tombstone every run would re-fetch
every dead shoe forever. `build:dataset` treats a tombstone as "no details" —
the shoe still appears with its metrics, name and URL from `metrics.json`. Do
not delete tombstones to "clean up" `details.json`; re-crawl with `--slug` if
a page comes back.

### Empty values are skipped before duplicates are resolved
In `parseLabTestList` the order is: no URL → skip (cannot key), empty value →
skip, already-seen slug → skip. An empty first row therefore does not claim
the slug and block a later populated one. Reordering these checks silently
drops readings.

### Whitespace-only numerics are rejected, not zeroed
`coerceValue` trims and then rejects the empty result, because `Number(' ')`
is `0` and a spurious zero in a lab metric is worse than a failed run: it
sorts to an extreme and looks like a measurement. The same reasoning covers
`null`/`undefined`/`''`, which are filtered upstream as empty. Do not
"simplify" the numeric path to a bare `Number()` cast.

### Plate overrides are hand-maintained source, not data
`scraper/src/plate-overrides.ts` corrects the handful of shoes RunRepeat tags
wrongly — a carbon plate its own review describes but its fact omits, or a plate
section that describes an absence. It lives in source rather than `data/` because
`data/` is machine-generated and must not be hand-edited
(docs/decisions.md §Git is the database); in source it gets review, typechecking
and tests. Each entry cites the review sentence justifying it. The list is
corrected by hand when new shoes are reviewed, and `build:dataset` fails if an
entry goes stale or becomes redundant, so it cannot rot silently. Do not grow it
into a general data-patching mechanism: if a whole class of shoes is wrong, fix
the rule.

The `anta-zone-2-90` entry does double duty and must not be deleted as noise.
Detection matches `section_id === 'plate'` at one or two levels only, because
that is where all 89 sections sit today; if RunRepeat ever nests them deeper,
every shoe silently reads unplated and no count is checked at build time. That
entry is the one override whose rule value depends on a section being found, so
the redundancy gate fires when detection stops working — the nearest thing to a
drift alarm this rule has.
