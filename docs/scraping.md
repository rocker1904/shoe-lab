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
- **Retries: three, 5 s → 25 s → 120 s, on 5xx and network errors only.**
  Anything else throws `HttpStatusError` immediately — a 404 is an answer, not
  a transient, and retrying it is pure extra load; so is a 3xx, which reaches us
  only when `fetch` has already declined to follow it. `scrape:details` converts
  exactly the 404 into a tombstone (§Decisions).
- **Honest User-Agent** with the repo URL as contact, one constant in
  `http.ts`. If RunRepeat objects, that is the channel.
- **robots.txt re-fetched and re-parsed at the start of every crawl** of
  `runrepeat.com`: `scrape:metrics` gates on the seed page path and
  `/api/product/lab-test-list/1`, `scrape:details` on a representative
  `/uk/…` path — and skips even that request when it has nothing to fetch.
  The parser reads the `*` group only (RFC 9309 grouping, consecutive
  user-agent lines share a group), resolves `Allow` against `Disallow` by
  most-specific-match with a tie going to the allow, and anchors a rule whose
  **last** character is `$` — only the last, because a `$` anywhere else is a
  literal dollar sign in the implementation RFC 9309 codifies. A disallowed
  path fails closed by aborting the run.
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
  a value for a test id absent from the catalogue is fatal. Checked wherever
  the two can drift apart: the metrics crawl, the catalogue-only corpus rewrite
  (§Re-extracting from a corpus), and the join, which sees page readings the
  metrics path never does. All three index the catalogue through the same
  function, so the catalogue's own shape is gated on every path that writes one,
  including for a test no shoe has a reading for yet
  (§A duplicate option value fails the run).
- **Relative, previous-run gates:** shoe count below 90 % of the previous run,
  or more than 20 % of previously present (slug, testId) pairs missing. These
  are skipped when `metrics.json` does not yet exist — a first run is
  absolute-only by construction, not by a flag.
- **Release supplement** carries its own floors: 300 slugs seen, 100 years
  found.
- **Post-join:** `build:dataset` re-validates the assembled `shoes.json`
  (builtAt present, arrays, slug/name present, plate within the enum, and every
  `option` reading naming one of its test's declared choices) before
  writing, so a bad join cannot reach the app either. The absolute shoe floor is
  re-applied after the category exclusion (§Non-running shoes), so a renamed
  category fails the run instead of quietly emptying the dataset.
- **Fleet gates, against the last published `shoes.json`.** No absolute gate can
  see a fleet-wide payload drift: `extractDetails` degrades field by field on
  purpose, so a renamed or moved block arrives as an empty field on every shoe
  rather than as an error, and the join publishes it. Only the comparison with
  what shipped last time can. All of `git log -- data/shoes.json` is two
  refreshes deep, and both moved these aggregates by 0.0 %; the fleet gained
  five shoes on one of them and has only ever *lost* shoes to a curation edit,
  never to a scrape. So each bound is far wider than a real week and still
  narrower than a blanking:
  - **fleet size ≥ 95 % of the previous run**;
  - **no readmission** — a shoe absent from the previous fleet may not join it on
    a details record already on disk at the previous `builtAt`. That is the
    category discriminator ceasing to bite, not a new shoe, and it is the only
    signature a fleet-wide `categorySlug` blanking leaves;
  - **≤ 5 % of previously published (slug, testId) pairs may vanish** — the
    largest single test is ~2.8 % of them, so an upstream retirement survives
    while losing every page-derived reading (7.0 %) does not;
  - **no plate class of 20 or more may fall below 75 % of its count** — a
    fleet-wide re-tag takes carbon from 72 to 2;
  - **pros, cons and intro each present on ≥ 90 % of their previous share**,
    which is 100 % on all three today.

  Skipped with no `shoes.json` yet, as the metrics gates are with no
  `metrics.json`. `scraper/test/fleet-drift.test.ts` is the matrix these are
  calibrated against — every bound has a boundary test, and a fleet-wide drift
  of each field has a red one. A **genuine** catalogue shift is a deliberate act:
  `SHOE_LAB_ALLOW_FLEET_SHIFT=1 npm -w scraper run build:dataset` builds it the
  way a first run builds, absolute gates only, so the shift lands in one
  reviewable data commit and the next run is relative to it again.

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

Nothing derived from *today* is stored, for the same reason: any age-from-now
field would make the build depend on the wall clock. Where the app needs one —
the sidebar's "released after" chips — it computes it at render time.

## Release-year supplement

Most shoe pages carry no `released_at`, so `scrape:releases` walks the
category listing and takes, per product, the first `facts['release-date']`
option whose `name`/`text` is a bare four-digit year. `build:dataset` uses it
**only** when the page gave no date, materialising `YYYY-01-01`.

A year-derived date sorts and filters as if the shoe shipped on 1 January, which
is why the provenance below exists rather than a precision flag.

## Release-date provenance

`Shoe.releaseDateSource` records where `releasedAt` came from, and is the field
anything downstream should branch on. `DetailRecord.preciseReleaseDate` stays a
faithful transcript of RunRepeat's own flag and is an input to this, not a
substitute for it.

| source | precedence | `releasedAt` holds |
|---|---|---|
| `page` | 1 | a date the page gave and flagged precise |
| `curated` | 2 | `YYYY-MM-01` from a cited month we researched (§Curated release months) |
| `page-estimated` | 3 | a date the page gave and flagged imprecise |
| `listing` | 4 | `YYYY-01-01`, materialised from the year supplement |
| `null` | — | nothing anywhere had a date |

A boolean could not carry this. It collapsed `page-estimated` and `listing`
together, yet only the second is fiction: a `page-estimated` shoe has a real
month from RunRepeat, about half of them with a specific day as well, which the
app previously discarded by rendering the year alone. The distinction is
also the one a CSV consumer needs, so `releaseDateSource` is a column in
`shoes.csv` (docs/app.md §Release-date provenance).

Precedence is the table order.

## Curated release months

`curated/release-dates.jsonl` holds hand-researched months, one JSON object per
line, in no guaranteed order and in either whitespace spelling — sessions append
to it and nothing rewrites it, so read it with a JSON parse rather than a fixed
pattern (docs/operations.md §Resuming release-date curation). It lives outside
`data/` because `data/` is machine-generated and must not be hand-edited
(docs/decisions.md §Git is the database), and it is JSONL rather than a
TypeScript module because it holds hundreds of entries with prose quotes:
appends are safe, diffs are one line per shoe, and a malformed quote is a
validation error rather than a syntax error that breaks the build.

**A curated month outranks RunRepeat's own listing year and its own estimate.**
That inverts the usual posture, and is justified by one measured fact: the
listing year is the year RunRepeat *catalogued* the shoe, not the year it
shipped. Across roughly forty checks it has run late twenty-plus times and early
zero times — errors of one, two, three and eight years, and eleven months of
error inside a technically correct year (`asics-novablast-4` shipped 1 December
2023 against a stamp of 1 January). It does **not** outrank a `page` date.

Rows with `"month": null` are kept, not deleted: they record that a shoe was
searched and what was found, so the next pass does not re-litigate it, and the
slug stays known to the stale gate.

Gates, all fatal, for the reason plate overrides are (§Decisions) — a curated
file that silently diverges from the fleet is worse than a red build, because it
outranks the scraped data wherever it applies:

- a month that is not `YYYY-MM`, or carried on an `unresolved` row
- a month with no cited `https` source and non-empty quote
- malformed JSON, a missing slug, a duplicate slug
- an entry naming a slug no longer in the dataset — **stale**
- an entry on a shoe whose page already gives a precise date — **unusable**,
  since `page` outranks `curated` and the row can never take effect

The gathering method, the evidence rules, and every failure mode found while
building the file are in docs/superpowers/specs — that spec is the reference for
adding entries. For the operational runbook see
docs/operations.md §Resuming release-date curation

## Data quirks

Expensive to discover, invisible in the code:

- **Most shoes have no page-level `released_at`** — hence the supplement, and
  hence the curation pass. After both, all but a handful of shoes are dated, but
  only a few dozen carry a day RunRepeat itself flagged precise; the live split
  by source is `releaseDateSource` in the dataset (§Release-date provenance).
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
editor's classification, not a lab reading.

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

## Readings taken from the page

`tongue-gusset-type` and `heel-tab` are populated on nearly every page but are
`option`-typed, so §Which tests are fetched never requests them. They come from
the **details crawl instead**, which already holds the page: every shoe page
carries the whole catalogue with that shoe's reading on each test, so a
`--from-corpus` re-extract backfills the fleet at zero request cost.

`bool` readings come from there too, and for a stronger reason: **the metrics
API cannot express a "no".** Its lab-test-list only returns the shoes that have
the feature, so `metrics.json` holds `true` values for `reflective-elements` and
not one `false`, while the pages say `0` on about half the fleet. Taken from the
API alone, a column measured on nearly every shoe reads as about half covered,
and every shoe tested and found to have no reflective elements shows an em dash
meaning *unknown*. `removable-insole` is the same shape, milder.

Nothing numeric is taken from the page. Those readings already arrive via the
metrics API, refreshed weekly, and taking them from the page too would let a
stale page value shadow a fresher API one — the two disagree already, mildly:
`size-rating` differs in the last decimal on a handful of readings out of every
thousand, the page being a rounding of the same source. A page value in a shape
its declared type does not accept is dropped rather than guessed at; that is one
cell on one shoe, and the rest of the run is unaffected.

`DetailRecord.pageValues` keys them by test id as string, coerced through the
same `coerceValue` the metrics path uses, and `build:dataset` merges them
**under** the metrics values, which win any collision — so the weekly source
still decides every value it has one for, and the page only fills what it has
nothing for. They then reach `tests[]` on their own, because §Empty tests
publishes any test with a reading anywhere.

**The freshness contract differs from their neighbours.** A details record is
crawled once and never refreshed, so a page reading ages with the record while
every numeric value beside it in `Shoe.values` refreshes weekly. `msrpGbp`
already makes that trade and docs/app.md §Resolved price is the precedent for
saying so rather than hiding it.

Readings store the option **slug** (`both-sides-semi`), so `LabTest.options`
carries the declared choices and their English names — without them the app
would print the slug. Only `value` and `name` are kept; `config` also holds
per-locale translations and scoring weights, which nothing reads. That list is
also the vocabulary the post-join gate checks every published `option` reading
against (§Validation gates), which is the second half of "dropped rather than
guessed at": an `option` refuses anything but a string at coercion — a nested
link object would otherwise stringify to a reading that looks real (§Fact
values) — and a reading that survives coercion but names no declared choice
fails the run.

The other `option` and `text` tests really are empty: `length`,
`leather-suede-quality`, `tested-size` and `outsole-design` return nothing on any
of the 450 shoes, so they stay dropped. The catalogue's third `bool`, `plate`,
is read on two shoes and so survives the drop — but the app never shows it,
because the shoe field of that name owns the column
(docs/app.md §Categorical columns).

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
without spending a crawl. `scrape:details` still applies its incremental rule
there, so `--from-corpus` alone re-extracts *nothing* on a fully-crawled fleet —
a backfill needs `--from-corpus <dir> --force-all`, which reads every page and
still makes no request;
`scrape:metrics` re-extracts the **catalogue only** and deliberately leaves
`metrics.json` untouched, because the readings live behind the API and cannot
be replayed from a page — so it validates those readings against the catalogue
it is about to write, a seed that has dropped a test being the one way to
orphan them (§Validation gates). Neither path constructs a request, so neither passes
through the robots gate. Recorded `scrapedAt` values stand: re-reading disk is
not reading RunRepeat (§Determinism).

## Decisions

### First occurrence wins in lab-test-list
A response can list the same slug twice (locale variants, duplicated rows).
The first row with a usable value is kept and later ones ignored, rather than
last-wins or an error: the endpoint is ordered by relevance, and a duplicate
is not a data problem worth failing a whole metrics run over. Do not "fix" this
into a merge or a conflict check — with one value per (slug, test) there is
nothing to merge, and the validation gates already catch mass value loss.
"First with a *usable* value" is the operative half, and what makes a value
usable is §Empty values are skipped before duplicates are resolved. A duplicate
*inside* one test's declared `options` is the opposite call, for the reasons in
§A duplicate option value fails the run.

### A duplicate option value fails the run
A `value` declared twice inside one test's `options` is fatal on every path that
writes a catalogue, rather than deduped on the way in or defended in the app.
Published as-is it takes the app down, because the Features section keys its
rows by option value (docs/app.md §Filters owns what that costs).
Deduping would render — `facetLabel` resolves a value first-wins, so dropping
the later entry keeps the label the app would have shown anyway — but it is a
guess at what changed upstream. Two entries under one value are either one
choice listed twice, which is harmless, or two distinct choices whose values
have collided, in which case a dedupe silently labels every reading of one as
the other. Nothing in the payload says which, so the run fails and `data/` is
left untouched: the only outcome that leaves a person the payload to read. That
is also the difference from §First occurrence wins in lab-test-list — a
duplicate row there is a known upstream shape with a known resolution, and this
is an unknown shape. Do not soften it into a dedupe, and do not add a
component-side guard instead — a guard can only paper over a catalogue that is
already wrong.

### A test declared twice fails the run
Same gate, same call: a catalogue that repeats a test **id** or a test **slug**
fails every path that writes one. The slug is the app's key for a facet group, a
column offer and an Add-filter offer, so a repeat blanks the page exactly as a
repeated option value does (§A duplicate option value fails the run). The
repeated id is the quieter fault and the reason both are checked here rather
than left to the app: every index over the catalogue — the gates' own, and
`indexTests` in the app — is last-wins, so nothing throws and one test's
readings are simply checked and labelled against another test's declared type
and vocabulary. Wrong data that renders is worse than a red run.

### Non-running shoes
A `lab-test-list` response is the whole lab-tested catalogue rather than one
category, so RunRepeat's hiking footwear rides in with the running shoes, as
`hiking-boots` and `hiking-shoes`. The shoe page's top-level
`pageData.category.slug` is the authoritative per-shoe category, captured as
`categorySlug`, and `build:dataset` drops a shoe whose details record carries one
that is present and not `running-shoes`. Absence keeps the shoe: no details
record, a tombstone, or a null `categorySlug` all stay, because "not crawled yet"
is not "not a running shoe". Do not swap the discriminator for absence from
`release-years.json` — dozens of catalogued shoes are missing from that file,
mostly discontinued, and dropping them would take genuine racing shoes with them.

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
