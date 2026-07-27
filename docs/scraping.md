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
  writing, so a bad join cannot reach the app either. The absolute shoe floor is
  re-applied after the category exclusion (§Non-running shoes), so a renamed
  category fails the run instead of quietly emptying the dataset.

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
  After it, roughly 433 of 450 shoes are dated and only ~24 precisely.
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
- **Display names are neither unique nor stable.** RunRepeat revised test
  methods and kept the old names, so tests 11 and 70 are both "Midsole
  softness" (`midsole-softness` / `midsole-softness-22`). Slugs disambiguate;
  anything user-visible that must round-trip uses the slug. §Test lineage is
  what says which of a same-named pair supersedes the other.
- **Editorial prose arrives HTML-escaped.** `intro`, `pros` and `cons` are
  plain-text fields carrying `&rsquo;`, `&mdash;` and friends; two shoes in five
  have at least one. `scraper/src/page-text.ts` decodes them at extraction,
  because the app renders these by interpolation and would otherwise print the
  escape verbatim (docs/app.md §Sanitised-HTML boundary). The two sanitised-HTML
  fields are deliberately left encoded — there an entity is correct markup.
- **Two readings arrive unrounded.** Shock absorption heel and forefoot come
  through with twelve significant figures where every other test gives one or
  two decimals. Stored as received; trimmed for display only
  (docs/app.md §Number display).

## Fact values

`page_data.features` is a list of editorial facts, each with a `values` array.
A value's `text` is a bare string on some facts (`terrain`, `features`) and an
**array of link objects** on others (`pace`, `width`, `material`, `collection`)
— the nested form carries the useful slugs one level down. `factValues` in
`scraper/src/page-text.ts` flattens the nested form onto its own entries and
dedupes, because values repeat: the `width` fact lists a SKU width once per
size run. A `String(value.text)` cast yields `"[object Object]"` on the nested
shape, which is why every fact read goes through that helper.

## Editorial facts

`KEPT_FACTS` in `extract-details.ts` names the facts stored per shoe. These are
RunRepeat's **labels**, not measurements, and cost no requests — they ride on
the page the details crawl already fetches. Widening the list is one array
entry plus a rebuild.

- `pace` — daily-running / tempo / competition, multi-valued, on every shoe.
- `arch-support` — neutral or stability.
- `strike-pattern` — heel and/or forefoot.
- `width` — the **SKU widths sold**, not a measurement of this shoe. It does
  not track measured toebox width at all: median widest-part is flat across
  every combination of the fact. Presenting it beside a toebox measurement
  needs that distinction made, or it reads as a contradiction.

Do not treat any of these as ground truth for a filter preset — they are one
editor's classification, not a lab reading (BACKLOG.md).

## Test lineage

The catalogue entry for each test carries RunRepeat's own relationships, kept
raw for a later presentation pass:

- **`previousId` / `updateId`** — the supersession chain, consistent in both
  directions, over nine pairs. **Readings are not comparable across it.** The
  unit changes on most (HA→AC durometer scales) and even the same-unit pairs
  shift systematically: 27→55 moves the mean 3.4 mm, 14→59 moves it 12 N.
  Coalescing or averaging the two generations invents measurements. What the
  chain is for is saying which column is the current method and pairing the two
  in the UI.
- **`primaryTestId` / `secondaryTestIds`** — the heel/forefoot halves of one
  measurement (traction, energy return, shock absorption).
- **`chartLabel`** — the shared family name for such a pair ("Shock
  absorption", "Energy return"). It does **not** disambiguate a supersession:
  both generations of a pair carry the same label, or none.
- **`isNew` is unreliable and must not be read as "current method".** Tests 59
  and 55 are the current generation of their pairs — 14 and 27 name them in
  `updateId` — yet both report `isNew: false`, exactly as their superseded
  predecessors do. Only `previousId`/`updateId` settle which reading is
  current. Pinned in `scraper/test/test-catalogue.test.ts`, so if upstream ever
  fixes this the assertion fails and the claim can be retired.

## Test groups

A page groups only the tests its own shoe was run for, so any single page —
the seed included — leaves about half the catalogue with `groupId: null`, in
the app's "Other" column group (docs/app.md §Columns and sorting). Every page
carries its own map and the details crawl fetches them all, so
`scrape:details` unions them into `details.json`'s `testGroups` and
`build:dataset` overlays that onto the catalogue. The overlay never overwrites
a group the catalogue already states. Free in requests, and it cuts the
ungrouped set to the handful nobody groups.

The union is monotone across incremental runs: a group learned from an earlier
page stays. Re-running `scrape:details --from-corpus` rebuilds it from scratch.

## Empty tests

RunRepeat's catalogue is the same on every page and lists tests it does not
run for road shoes — retired methods, trail-only measurements. `build:dataset`
drops any test with no reading anywhere from the published `tests[]` and from
the CSV header, so they stop filling the column picker, the filter menu and the
export with dead entries.

Dropped at **build** time rather than skipped at fetch time, so a test returns
by itself the moment RunRepeat runs it again — no list to maintain, no
`metrics.json` change. Emptiness is relative to the surviving fleet: excluding
non-running shoes emptied `lug-depth` and `insulation`, which only hiking boots
ever carried.

Two of the dropped tests are not empty upstream: `tongue-gusset-type` and
`heel-tab` are populated on nearly every page but are `option`-typed, so
§Which tests are fetched never requests them. They are recoverable from the
details crawl at zero request cost if they are ever wanted (BACKLOG.md).

## Model lineage

`product.previous_version` names the **immediately preceding** model;
`last_version` names the **newest in the line** and may skip generations
(Cumulus 25's `last_version` is Cumulus 28). They are stored separately for
that reason.

The forward link is derived, not scraped: `build:dataset` inverts the fleet's
`previousVersion` map, which yields far more successor links than
`last_version` does and cannot disagree with the backward one. Every reference
names a shoe RunRepeat also reviewed. Inversion runs after category exclusion,
so a link never points at a shoe the dataset dropped, and slug order settles
the winner if two shoes ever claim the same predecessor.

## Review language

RunRepeat has published a few reviews in the wrong language: the prose is
Spanish while the canonical URL, the `lang` attribute and the section headings
are all English. **There is no other page to fetch** — the `/uk/` page is the
one already crawled and carries no alternate. `scraper/src/review-language-overrides.ts`
records the language by slug and the app labels it
(docs/app.md §Review language), so nothing is hidden and nothing is
translated. Hand-maintained
source rather than a `data/` edit, for the reasons in §Decisions.

## Re-extracting from a corpus

Both crawlers take `--from-corpus <dir>` and read saved pages instead of the
network, which is how a new extracted **field** is backfilled across the fleet
without spending a crawl. `scrape:details` re-extracts every record;
`scrape:metrics` re-extracts the **catalogue only** and deliberately leaves
`metrics.json` untouched, because the readings live behind the API and cannot
be replayed from a page. Neither path constructs a request, so neither passes
through the robots gate. Recorded `scrapedAt` values stand: re-reading disk is
not reading RunRepeat (§Determinism).

## Decisions

### First occurrence wins in lab-test-list
A response can list the same slug twice (locale variants, duplicated rows).
The first row with a usable value is kept and later ones ignored, rather than
last-wins or an error: the endpoint is ordered by relevance, and a duplicate
is not a data problem worth failing a 60-request run over. Do not "fix" this
into a merge or a conflict check — with one value per (slug, test) there is
nothing to merge, and the validation gates already catch mass value loss.

### Non-running shoes
A `lab-test-list` response is the whole lab-tested catalogue rather than one
category, so RunRepeat's hiking footwear rides in with the running shoes — 14 of
464, 9 `hiking-boots` and 5 `hiking-shoes`. The shoe page's top-level
`pageData.category.slug` is the authoritative per-shoe category, captured as
`categorySlug`, and `build:dataset` drops a shoe whose details record carries one
that is present and not `running-shoes`. Absence keeps the shoe: no details
record, a tombstone, or a null `categorySlug` all stay, because "not crawled yet"
is not "not a running shoe". Do not swap the discriminator for absence from
`release-years.json` — 53 shoes are missing from that file, mostly discontinued,
and dropping them would take genuine racing shoes with them.

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
