# Curated release dates — design

Status: design agreed in discussion, data gathering under way, **nothing wired
into the pipeline yet**. The only artefact on this branch is
`curated/release-dates.jsonl`.

## The problem

Of 450 shoes, only 24 carry a release date RunRepeat marked precise. The rest
are supplemented or absent (docs/scraping.md §Release-year supplement), and the
app renders every imprecise date as a bare year. Two consequences:

- The recency chips (1y/2y/3y) bound on a fabricated `YYYY-01-01`, so a shoe
  released in October is judged as if it shipped on New Year's Day.
- 17 shoes have no date at all and are dropped silently by any date bound,
  while the receipt reports only range-filter exclusions.

Measurement across the live fleet, by provenance:

| source | n | what `releasedAt` holds |
|---|---|---|
| page date, `precise_released_at` true | 24 | a real date |
| page date, flagged imprecise | 94 | RunRepeat's own estimate |
| release-year supplement | 315 | `YYYY-01-01`, our fabrication |
| nothing | 17 | null |

The "426 shoes stamped 1 January" framing used in BACKLOG.md is wrong: only 315
are. The middle 94 carry a real month — 50 on day 01, 44 with a specific day —
and the app currently discards it.

## Evidence that RunRepeat's year cannot be trusted

Two independent release calendars were cross-checked against the fleet
(`curated/`-adjacent working data, not committed). Where both calendars agreed
within a month, RunRepeat's listing year matched 66 times, ran **later** 11
times, and ran **earlier zero times**. Agent lookups then confirmed the same
direction on individually researched shoes:

| shoe | RunRepeat | evidenced | error |
|---|---|---|---|
| xero-shoes-prio | 2025 | 2017-03 | −8 years |
| topo-athletic-cyclone-2 | 2025 | 2023-02 | −2 years |
| anta-zone-2-90 | 2026 | 2025-12 | −1 year |
| new-balance-fresh-foam-roav-v2 | *none* | 2021-05 | — |
| adidas-runfalcon | *none* | 2019-01 | — |

The listing year behaves like the year RunRepeat catalogued the shoe, not the
year it shipped, and the error is one-directional. Undated shoes skew **old**:
every no-date shoe resolved so far landed in 2019–2022.

## Data model

`releasedAt` stays a full ISO string. A curated month materialises as
`YYYY-MM-01`, exactly as a listing year already materialises as `YYYY-01-01`,
so every sort, string comparison and `releasedAfter` bound keeps working. The
precision lives beside the date, never inside it.

`DetailRecord.preciseReleaseDate` is unchanged — it is a faithful transcript of
what the page said. `Shoe.preciseReleaseDate` is replaced by
`Shoe.releaseDateSource`, resolved by `build:dataset`:

| source | where it comes from | precedence |
|---|---|---|
| `page` | page date, `precise_released_at` true | 1 (highest) |
| `curated` | our cited month | 2 |
| `page-estimated` | page date, flagged imprecise | 3 |
| `listing` | the release-year supplement | 4 |
| `null` | nothing anywhere | — |

**A curated month outranks RunRepeat's listing year and its own estimate.**
This inverts the usual posture that `data/` is authoritative, and is justified
only by the one-directional error above. It does **not** outrank a `page` date:
where RunRepeat states a precise date, that wins.

### Rendering

Everything renders at month precision — `March 2024` — except `listing`, which
renders as the bare year, and null, which renders as an em dash. The day is not
shown even for `page`-sourced dates: only 24 of 450 shoes could ever supply one,
and a column that is day-precise for 5% of rows implies a precision the dataset
does not have. The day survives where it is useful — `releasedAt` still holds
it, so sorting stays exact and the CSV still exports full precision, consistent
with docs/app.md §Number display.

### What counts as the release month

**The earliest month in which any colourway of the exact model was *widely
available* at retail** — general sale through the brand's own site or mainstream
running retailers. Explicitly excluded: athlete-only or elite-only drops,
single-region limited releases, pre-orders, trade-show samples, and
one-colourway early-access drops ahead of general launch.

The definition has teeth because racing shoes routinely break it. The FuelCell
Rebel v5 had an "Urgent Red" colourway out by mid-May 2025 against an official
1 July launch; the Endorphin Elite 2 had a limited Olympics drop in August 2024
against a March 2025 retail release. Under an earliest-anything rule both shoes
would land two months and seven months early respectively, and the recency
filter would rank them against shoes that were genuinely buyable.

Where an early limited drop exists it is recorded in `notes` rather than
discarded — the definition may be revisited, and the observation is expensive to
recover.

**A month either side is acceptable.** Availability is not a step function, and
the consumer of this data is a year-scale recency filter, so ±1 month changes
nothing about what the filter shows. Accuracy is still the goal — but a
`suspect` entry whose month may be off by one is far more useful than
`YYYY-01-01`, and should not be withheld on those grounds. What must never
happen is a wrong *year*.

### Tie-breakers when sources disagree

Apply in order. These exist because the wide-availability rule alone was abused:
an agent invented an athlete-only drop to override a four-source majority.

1. An explicit release statement ("Release Date: X", "releases X", "available
   X") is the default answer.
2. Move **earlier** only if a page shows unqualified general availability
   sooner — "available now" at a mainstream retailer, no restriction mentioned.
3. Move **later** only on *positive textual evidence* that the earlier date was
   limited: a page must actually say limited / athlete only / exclusive / select
   retailers / pre-order. **Never infer a limitation no page states.** Absence of
   evidence of limitation is not evidence of limitation.
4. Still disagreeing: take the **majority** month and name the outlier.

Two things are **not** evidence of a release month:

- **A retailer price link.** "Price: $140 at Running Warehouse" shows the shoe
  was buyable when that page was published, nothing more.
- **A review's publication date.** Reviewers receive pre-release samples
  routinely — RoadTrailRun published an Adios Pro 4 review in October 2024 for a
  shoe that was "broadly available January 2025". Inferring a month from when a
  review appeared is the single largest residual error source, and it is banned:
  with no release statement and no unqualified availability, return null.

### Retries are where the ban breaks

Retrying nulls yields roughly a third of the total, but it is also the point of
maximum pressure to manufacture an answer. Observed directly: a first agent hit a
dead end on the Brooks Hyperion 2 and correctly returned null; a second agent,
given the same dead end, produced a month from a byline date plus a retailer
price line — two of the three things named above as non-evidence, stacked into
one citation — and justified it with "reviewers do not typically cover unreleased
shoes", the exact premise the Adios Pro 4 case disproves.

So a retry prompt must state that the previous attempt returned null **and that
the null was accepted as correct**. Otherwise the retry reads a null as failure
and fills the vacuum.

A null that has survived two full attempts should be marked `unresolved` rather
than `unresolved-budget`, so it stops advertising itself for a third pass that
will re-derive the same wrong answer from the same pages. Escalate the *source
set* — a brand newsroom, a press release — not the number of attempts.

### Declared evidence strength

Every entry carries `evidenceType`, set by the agent and checked by the session:

- `explicit-release` — a page states a release or launch date
- `availability-bound` — only evidence the shoe was purchasable by some date
- `inferred` — reasoned from publication dates alone; **treat as unusable**

This makes weakness sortable rather than buried in prose. In the batch where it
was introduced, every `inferred` entry was also a `suspect` entry and every
`suspect` entry was `inferred` — the field predicts the failure exactly.

### Released-after becomes month-granular

The sidebar's released-after control is a `date` input plus 1y/2y/3y chips, so it
offers day precision over data that will be month precision at best. Once
curated months land, the control should take a **month** (`YYYY-MM`), because a
day picker invites a bound the data cannot honour — asking for "after 14 March
2024" over a fleet of `YYYY-MM-01` values is answering a question we never had
the resolution for.

One trap when implementing: `releasedAfter` is compared as a raw string against
`releasedAt`, and a bare `YYYY-MM` bound sorts *before* every day in that month
(`'2024-03' < '2024-03-01'`), so a March bound would silently include the whole
of March rather than excluding it, or vice versa depending on the operator.
Normalise the bound to `YYYY-MM-01` at the edge and keep the comparison over
full ISO strings — the same trick the dataset already uses for the date itself.

The chips keep working unchanged: `isoYearsAgo` already yields a full ISO date,
which stays a valid bound.

### CSV

`releaseDateSource` becomes a column in both `shoes.csv` and the in-app export.
This is what the BACKLOG's `preciseReleaseDate` boolean should have been: a
boolean cannot distinguish *RunRepeat was unsure* from *we fabricated this from
a listing* from *we researched it and here is the citation*, and that
distinction is the whole point for anyone doing their own analysis.

## The curated store

`curated/release-dates.jsonl`, outside `data/` because `data/` is
machine-generated and must not be hand-edited
(docs/decisions.md §Git is the database).
One object per line, sorted by slug. JSONL rather than a TypeScript
override module because the file will hold hundreds of entries with prose
quotes: appends are safe, diffs are one line per shoe, and a malformed quote is
a validation error rather than a syntax error that breaks the build.

```json
{"slug":"topo-athletic-cyclone-2","month":"2023-02","confidence":"high",
 "reliability":"ok","sources":[{"url":"…","quote":"…","pagePublished":"2023-01-01"}],
 "notes":"…","method":"haiku-explore-2src"}
```

`month: null` entries are kept, not omitted: they record that a shoe was looked
at and record what was searched, so the next pass does not re-litigate it.

### Reliability taxonomy

`reliability` is set by the orchestrating session, not the agent, because
agents' self-rated confidence proved uncalibrated — one rated a Dutch regional
retail blog "high".

- `ok` — cited, quote is genuine page text, no unresolved conflict
- `suspect` — usable but flawed; the note says why (sources disagree, the month
  rests only on a publication date, the quote is a paraphrase, an instruction
  was not followed)
- `unresolved` — no date found and the search looked complete
- `unresolved-budget` — no date found, but the attempt was degraded by blocked
  fetches or an exhausted search budget; **retry is worthwhile**
- `unresolved-naming` — the shoe could not be identified under that name at all;
  a data-quality problem, not a missing date

Nothing marked `suspect` should reach the app without a second look.

## Gathering approach

Three tiers, cheapest first.

**Calendars propose.** Two release calendars were parsed
(`solereview.com` year lists, saved by hand because Cloudflare blocks automated
access even in a real browser; `runnerscove.com`, renderable with Playwright).
Between them they cover 169 of 332 undated shoes. Where both agree within a
month they agree 94% of the time, and only 5 pairs conflict by more than two
months. **But neither is citable evidence**: both label their dates estimates,
and runnerscove states its are AI-generated. Calendars produce candidates.

**Agents confirm.** One `Explore` subagent per shoe on Haiku, told to find up to
two independent sources and return `{month, sources[{url, quote, pagePublished}],
generationCheck, confidence, notes}`.

**Manual.** Whatever survives both.

### Sitemap-first discovery replaces most searching

Web search is the scarce resource, not fetching. Publishers declare sitemaps in
their own robots.txt, and those sitemaps are a free, deterministic index of
every review they have published — `believeintherun.com/shoe-sitemap.xml` alone
lists 1,001 shoe reviews. So the discovery step needs no search at all:

1. fetch each publisher's sitemap once — a handful of requests total
2. match shoe to review URL **offline**, zero requests and zero search calls
3. fetch the matched article — one request — for its byline date and any
   explicit release sentence

This found `hoka-clifton-9-gtx-review` immediately, a shoe an agent had
abandoned after 18 tool calls, and the article carries a visible byline date
("OCTOBER 11, 2023"). It also fixes the wrong-generation risk: matching against
a URL list makes `clifton-9` versus `clifton-9-gtx` an explicit choice rather
than something a search engine blurs.

**The publisher roster.** All probed with an honest User-Agent; all returned 200
and none disallow `/`. Sitemap paths are as declared in their own robots.txt:

| publisher | sitemap | notes |
|---|---|---|
| believeintherun.com | `/shoe-sitemap.xml` | dedicated shoe sitemap, 1001 reviews |
| weartesters.com | `/sitemap_index.xml` | also `/news-sitemap.xml`; **release row** — see below |
| doctorsofrunning.com | `/sitemap_index.xml` | **year in the URL slug** — see below |
| irunfar.com | `/sitemap.xml` | indexed, **zero yield** — see below |
| meta-endurance.com | `/sitemap_index.xml` | **release row**, inconsistently — see below |
| shoeography.com | `/sitemap.xml` | launch announcements, light on review depth |
| weartested.org | `/sitemap.xml` | |
| trailrunnermag.com | `/sitemap_index.xml` | indexed, **zero yield** — see below |
| runningshoesguru.com, longermiles.com, marathonhandbook.com, runningmagazine.ca | none declared | reachable, but need site search |

### Only two publishers state a release date, and that decides everything

The single largest determinant of whether a shoe resolves is not the model, the
year, or the agent — it is **which publisher reviewed it**. WearTesters prints a
literal `Release Date:` row in the specs table at the top of every review.
meta-endurance prints one too, but in capitals (`RELEASE DATE:`) and only
sometimes. Doctors of Running and BelieveInTheRun **never** print one; their
reviews carry a byline, a price link and prose, all three of which the rules
above exclude as evidence.

Measured over fifty shoes:

| candidate publisher | resolved | outcome |
|---|---|---|
| WearTesters | 21 / 22 | the release row is there and is unambiguous |
| meta-endurance | 3 / 9 | row present on 3, absent on 6 |
| Doctors of Running or BelieveInTheRun only | 1 / 19 | no release row exists to find |

So **order candidate URLs by publisher before dispatching**: WearTesters first,
then meta-endurance, then the rest. On a WearTesters candidate the answer is one
fetch away — agents averaged 3.9 tool calls and 11.3k tokens. Without one they
averaged 14.5 calls and 20.5k tokens to arrive at a null, because there was never
anything on the page to find. Same prompt, same model: **twice the cost for a
twentieth of the yield.**

The operational consequence is stronger than reordering. A shoe whose only
candidates are Doctors of Running or BelieveInTheRun should be told so in its
prompt, with a null named as the expected outcome and a hard six-call budget.
Better still, resolve WearTesters and meta-endurance candidates by **rendering
the page directly and reading the row** — no subagent at all. One render both
locates the release line and verifies it, which is strictly cheaper than an agent
plus a separate verification fetch, and it is how half the fifty were done.

Doctors of Running's slug year and the byline date remain useful for the
generation check and as a coarse year sanity check. They are not months, and no
amount of retrying will make them months.

### Two shapes of citable-but-unusable release row

Both publishers sometimes print a release row at a precision coarser than a
month. These are not nulls of the usual kind — there is a genuine, quotable
release statement — but neither can become a `YYYY-MM`:

- **Year only.** WearTesters printed `Release Date: 2024` for the Diadora
  Nucleo 2.
- **Season only.** meta-endurance printed `RELEASE DATE: Spring 2025` for the
  Brooks Launch 11.

Record these as `month: null` with the source retained. Materialising them as
`2024-01` or as the midpoint of spring would fabricate a point estimate from a
range — the exact defect this curation exists to remove, and a fabrication that
would then outrank RunRepeat's own date by the precedence table above. The
retained source is still worth having: it pins the year against the listing
year, and it saves the next pass a fetch.

Three of these (believeintherun, weartesters, doctorsofrunning) indexed in about
eight requests give 2,603 URLs and directly locate 6 of 14 shoes that agent
search had failed on, including `hoka-clifton-9-gtx` and
`topo-athletic-specter-2`. doctorsofrunning encodes the review year in the slug
(`…-review-2022`), which is both a free coarse date and a generation check.

**Adding the two trail publishers was a dead end, and the negative result is
worth keeping.** irunfar and trailrunnermag were the last two roster entries
with a declared sitemap and no index coverage, and 108 of 231 remaining shoes
had no candidate URL, so they looked like the obvious next lever. Indexing both
grew the index from 11,716 to 17,739 URLs and produced **one** newly matched
shoe. irunfar contributed 5,973 URLs and zero matches: its sitemap is a flat
post archive back to 2006 of race reports and news, whose slugs never name a
shoe model. trailrunnermag returned only 47 URLs through the sub-sitemap filter,
and the sample is editorial rather than per-shoe reviews. The lesson generalises
past these two — **a publisher only helps this index if it publishes one page
per shoe model with the model in the slug**, which is a property of shoe-review
sites, not of running sites. The remaining unmatched shoes need a different
lever (brand newsrooms, site search), not another sitemap.

Misses are informative too: searching the index for `hyperboost` returns only
*Edge*, never *Run*, which corroborates the naming doubt over
`adidas-hyperboost-run`; `vongo` returns v4, v5 and the original but no v6.

**Brand newsrooms are the best article source and the worst index.** The two
cleanest results in the whole exercise came from `corp.asics.com/en/press/…` and
`about.underarmour.com/en/stories/…`. But as indexes they mostly fail:
`news.adidas.com` answers HTTP 202 with an empty body (bot mitigation),
`www.newbalance.com/robots.txt` 403s, `press.on.com` redirects to
`press.on-running.com` whose 1,055-URL sitemap is category pages in every
language with no individual releases, and Brooks/Hoka/Saucony/Altra publish only
retail product sitemaps. So: try the brand newsroom **first for a shoe less than
about two years old**, where the release is still up and is the highest-tier
source available; fall back to the publisher index for anything older, where the
brand page is gone anyway.

**`lastmod` is not the publication date.** Many entries cluster on bulk re-save
dates, so the sitemap locates the article; the article dates it. Coverage is
per-publisher and partial — `forever-run-nitro` has no BelieveInTheRun review —
so union several sitemaps.

**Do not drive a search engine directly.** `duckduckgo.com/robots.txt` disallows
`/html`, `/lite` and `/*?`, which are exactly the scrape endpoints, and scripted
SERP querying is against the terms of every major engine. That fails the same
test as working around a Cloudflare challenge
(docs/decisions.md §Be a good citizen toward RunRepeat). Use the sanctioned
search tool, and lean on sitemaps to need it less.

### The index-first loop, as it actually runs

This is the procedure that produced the best results, and it uses **no web
search at all**:

1. Build the publisher index once from sitemaps (cached; ~30 polite requests for
   ~11,700 URLs across seven publishers).
2. Match each undated shoe to review URLs **offline** by exact canonical token
   equality — normalise both sides, drop publisher boilerplate words
   (review/performance/multi/tester/initial/quick) and brand filler
   (gel/fresh/foam/one/athletic), fold `v5` to `5`, then require set equality.
   Loose token-containment matching is **not** good enough: it matched "Brooks
   Hyperion" to `hyperion-elite-3`.
3. Hand each agent its shoe *and its candidate URLs*, and forbid WebSearch.
4. The session records results, correcting the agent where needed, and never
   discards a value.

Per-shoe cost lands around 12–16k tokens for a clean result, against 19–27k when
agents had to search. Ten-for-ten resolution is normal.

The session must expect to **adjudicate, not just accept**. Across thirty shoes
it was necessary to override one month, downgrade one self-assessed
`evidenceType`, and strip non-probative "sources" — price lines, byline dates,
one null quote — from five entries. Agents also frequently leave
`generationCheck` empty or fill it with a description of the evidence rather
than a generation confirmation.

### What the trials established

Haiku matched Sonnet's exact citation on every easy lookup at 78% of the cost;
Sonnet only wins on the hard tail, where it costs 2× and still often fails. Use
Haiku, retry nulls, and escalate model only as a last resort.

Configuration matters more than model. Moving from `general-purpose` with a
broken fetch helper to `Explore` with a working one, a two-source requirement
and a ban on reading the repo took the same ten shoes from 4/10 resolved at
276.8k tokens to 6/10 at 189.3k — 50% more yield for 32% fewer tokens.

Run-to-run variance is high: across two runs on identical shoes, the **union**
resolved 7 of 10 while neither run alone exceeded 6. Where both runs answered
they agreed every time. Retrying nulls is where roughly a third of the yield
comes from, not optional polish.

### The residue: 108 shoes the publisher index will never reach

With 201 shoes curated, 131 still need a month. Only 23 of those still have an
index match; the other **108 have no indexed review at all**, and they are not a
random remainder. Composition by brand: adidas 24, ASICS 15, Nike 15,
New Balance 10, then a long tail. Composition by kind is what matters:

- **Budget and entry-level models**, the bulk of it — Nike Downshifter,
  Revolution, Winflo, Quest, Flex Experience; ASICS Jolt, Gel Contend, Gel
  Excite, GT 1000; adidas Galaxy, Duramo, Runfalcon, Questar, Ultrabounce;
  Under Armour Charged Assert and Surge; New Balance Arishi and Evoz.
- **Variants of a model that _is_ covered** — GTX, waterproof, GTS, EasyOn and
  wide versions. Nike Pegasus 41 GTX, Brooks Ghost 17 GTX and Glycerin GTS 22,
  On Cloudrunner 2 Waterproof.
- **Brands with no English review coverage** — ALLSWIFIT, Ardiles, Darimati,
  Ortuseight, KURU.

Probing the 17,739-URL index for 25 representative residue models: 16 returned
**nothing anywhere**, 7 appeared only on publishers that print no release row,
and 2 were matcher misses. Every budget-tier model probed returned zero.

This sharpens the earlier lesson about irunfar and trailrunnermag. It is not
enough that a publisher publishes one page per shoe model with the model in the
slug — **it must also review that tier of shoe at all**, and shoe-review sites
review what runners buy in running specialty stores. No further sitemap will
move this. The residue is uncovered for an editorial reason, not an indexing one.

Nor is it an age problem. The earlier observation that undated shoes skew old
does not hold here: RunRepeat lists these at 2023 (15), 2024 (40), 2025 (35) and
2026 (18), and the residue's quality scores are indistinguishable from the rest
of the fleet still needing dates (median 78 either way). These are current,
ordinary shoes that nobody writes about.

**The matcher misses, worth ~2-5 shoes, not 108.** Exact canonical token
equality fails on three patterns, all seen live: an abbreviated brand
(`weartesters.com/ua-velociti-elite-2-…` against dataset name *Under Armour
Velociti Elite 2*, which cost a real month until recovered by hand); trailing
editorial words in a slug (`…-deviate-nitro-elite-3-review-getting-thick`); and
a **sub-brand token the publisher drops** — *adidas Adizero Boston 13* is slugged
`adidas-boston-13`, *adidas Adizero Adios 9* is `adidas-adios-9`. The third is
the tractable one: folding `adizero` and its peers into the drop-word set would
recover a handful. Do not loosen matching further than that — containment
matching already proved it merges distinct models.

**The lead worth pursuing is the Wayback CDX API, and it is measured, not
guessed.** `web.archive.org/cdx/search/cdx` is a public, deterministic,
free JSON/CSV index over archived URLs, reachable with an honest User-Agent and
no bot mitigation. A domain query filtered on the model slug finds brand product
pages for exactly the shoes the review sites ignore — `adidas Galaxy 6` resolves
to `adidas.com/…/galaxy-6-shoes/GW3848.html` captured 2023-05, `ASICS Jolt 4` to
`asics.com/…/jolt-4-gs/p/1014A300-601.html` captured 2024-04, both matching
RunRepeat's listing year. Two properties make it a good fit: the product URL
usually carries the **style code**, which the generation guard already treats as
the strongest evidence available; and the answer is a date, not prose, so no
model is needed to extract it.

Three constraints must be built in before it is used:

1. It yields an **availability bound, never an explicit release** — every entry
   from it is `evidenceType: availability-bound`, and it can only ever move a
   date *earlier* under tie-breaker 2.
2. First capture is an **upper bound that lags**, because a crawler reaches a
   page when it reaches it. Take the minimum timestamp across all captures of
   all regional URLs for a model; do not use `collapse` with a small `limit`,
   which returns arbitrary rows rather than the earliest.
3. Captures are regional — the Galaxy 6 hit is a Bahrain storefront, the Jolt 4
   a Belgian one — and a single-region page is explicitly **not** wide
   availability. A month is only defensible when captures cluster across several
   regions; a lone regional capture is a bound to record in `notes`, not a month.

### Rules the agents get, and why

- **No `runrepeat.com`, and no reading the local repo.** Agents given
  filesystem access read `data/shoes.json` and `.corpus/` and fed RunRepeat's
  own numbers back as evidence. `Explore` plus an explicit ban fixes this.
- **Generation guard.** The dominant wrong-answer risk is citing a neighbouring
  model — Novablast vs Novablast 2, Glycerin 21 vs Glycerin StealthFit 21,
  Clifton 9 vs Clifton 9 GTX. Each prompt names the confusable neighbours and
  each result must carry a `generationCheck` saying how the page was confirmed.
  Style codes are the best evidence (`MROAVSK2`, `F36199`, `KH7678`).
- **Verbatim quotes, with `pagePublished` as a separate field.** Banning
  publication-date reasoning outright turned a correct answer into a null;
  allowing it inside the quote produced a fabricated bracketed date. Splitting
  the fields legitimises the inference and keeps the quote checkable.
- **Age-aware source ladder.** Brand press release > running publication >
  specialist blog > retailer/resale. For pre-2023 shoes the first three are
  usually gone: no confirmed lookup of an old shoe came from a brand page. A
  strict ladder would reject exactly the shoes that need fixing.

### Known limits

- **Quote discipline is roughly 50%** even when spelled out. Quotes must be
  verified mechanically by re-fetching and substring-matching; two of ten
  results would have been caught. A later run verified **every** quote this way
  across fifty shoes and found one outright invention — a confidently reported
  `Release Date: July 1, 2023` on a page that has no release line at all, backed
  by a second citation that turned out to be a retailer price link. Mechanical
  verification is what separated that entry from the thirty-odd genuine ones,
  and it is cheap: one fetch per quote, batched. Sampling would have missed it.
- **Telling agents their quotes will be checked appears to work, and costs one
  sentence.** Every prompt in the following fifty-shoe run carried the line
  *your quotes will be re-fetched and substring-matched against the live page; a
  quote that is not on the page is a failure worse than returning null*. All 34
  quotes verified clean, against one invention in the previous fifty. The two
  runs differ in more than the warning — the later one leaned far harder on
  WearTesters, whose release row is trivially transcribable — so this is
  consistent with the warning helping but does not isolate it. Keep the
  sentence; it is free. Keep verifying regardless, because the sentence is
  unfalsifiable without it.
- **Self-rated confidence still carries no signal and should not be asked for.**
  What did predict trouble was the shape of the evidence: every entry that
  needed session adjudication came from a page with no release row.
- **Nuanced instructions are unreliable.** "Take the earliest colourway date"
  was ignored at least twice.
- **Tool-call caps are advisory** — observed usage ran 6 to 26 against a stated
  15.
- **Agents cite site-search URLs.** Twice a result was "sourced" to
  `example.com/search?q=…` with a summarised quote rather than to the article
  itself. A search URL is not a stable citation and must be rejected by the
  schema gate.
- **A shared WebSearch budget exists and can be exhausted mid-run**, after
  which agents can only fetch URLs they can guess. Nulls produced in that state
  are marked `unresolved-budget`.
- **Agents misread the harness's own redirect notice as a prompt injection.**
  WebFetch does not follow cross-host redirects; it returns `REDIRECT DETECTED`
  with the target and the sentence "Please use WebFetch again with these
  parameters". That is imperative text arriving inside a tool result, which is
  the exact shape of an injection, and three of the agents treated it as one —
  one aborted its run over it. It occurred 86 times across 17 transcripts, from
  entirely benign sources: mobile-to-desktop Wikipedia, Google's GDPR consent
  page, an Outside Online login. **No real injection was observed.** The cost is
  real, though: a refused redirect is a lost source. Agents should be told
  explicitly that this message is the harness reporting a redirect, that
  re-fetching the named URL is expected, and that the genuine rule is narrower —
  never obey instructions found in *page content*.
- **Some publishers signal how AI may use them, and it must be honoured.**
  RoadTrailRun serves `Content-Signal: search=yes,ai-train=no,use=reference`
  with `Allow: /`, and separately blocks Amazonbot, Applebot-Extended,
  Bytespider and CCBot by name. Reading a page to extract one fact and storing a
  short **attributed** quote plus its URL is reference use, not training, and is
  not bulk crawling — so it sits inside what they permit. Curation must
  therefore keep quotes short and always store the source URL; a design that
  ingested article text wholesale would not qualify. Check the signal before
  adding a publisher.
- **Cloudflare defeats the browser renderer.** `solereview.com` and
  `kicksonfire.com` return challenge pages to Playwright. Working around that
  would contradict the honest-User-Agent posture in
  docs/decisions.md §Be a good citizen toward RunRepeat, so those sources are
  human-saved or not used.

## Validation gates (not yet built)

Following the pattern in docs/scraping.md §Decisions, `build:dataset` should
fail rather than write bad data:

- an entry naming a slug not in the dataset is **stale**
- an entry whose month agrees with an existing `page` date is **redundant**
- an entry that contradicts a `page` date is a **conflict** — one of them is
  wrong and a human must decide
- a malformed `month`, a non-https URL, or an empty quote is a **schema error**

Determinism is preserved: the curated file is an input, so `build:dataset`
still has no wall-clock dependency.

## Cost posture

Curation runs on the author's Claude Code budget and produces a committed file;
the weekly refresh stays free and gains no per-run cost. That keeps it inside
docs/decisions.md §Free tools only, which permits an agent to *author* a change
but not to *run* one — but the decision should be recorded there explicitly
before this lands, because "an LLM pass over the dataset" is named in that
section as out of scope by default.

## Open questions

- Whether the app should surface `curated` provenance to the reader at all, or
  simply render the better date silently.
- Whether a "released before" bound is added at the same time; the
  last-generation strategy in docs/shoe-stories.md cannot currently be
  expressed.
- How `suspect` entries are resolved — a second agent pass, or a human queue.
