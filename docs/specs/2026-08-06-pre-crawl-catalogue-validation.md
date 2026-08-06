# Pre-crawl catalogue validation

status: approved, in delivery

## Purpose and scope

Close BACKLOG.md item **Fail retired-method catalogue drift before the metrics
crawl**. The live metrics path already has the extracted next catalogue and the
previous published catalogue before it requests any per-test readings. It will
apply the complete catalogue-only gate at that point, so a known-invalid
catalogue costs the robots and seed-page requests but no lab-list requests.

The final validation after the crawl remains. It still owns reading types,
absolute and relative fleet bounds, and the last pre-write check of the same
catalogue invariants.

## Policies

- docs/policies.md §Third parties and cost: reject a known-invalid catalogue
  before avoidable RunRepeat API requests.
- docs/policies.md §Failure posture: the same error remains loud and both
  previous files remain untouched.
- docs/policies.md §State ownership and validation: validation timing changes;
  accepted inputs and written data do not.
- docs/decisions.md §Testing bar: adversarial, no live network: request counts
  use the existing fake HTTP path only.

No policy is undecided and no policy changes.

## Decisions

### One explicit catalogue-only gate

`validateCatalogue` owns every invariant knowable from `tests.json` plus the
previous catalogue: resolved method status and irreversible retirement,
curated-registry integrity, unique IDs and slugs, valid slug tokens, and unique
option values. The live path calls it immediately after reading the previous
catalogue and before constructing or entering the per-test loop.

This is deliberately broader than calling `validateMethodStatuses` directly.
Every listed fault is already fatal after the crawl, so moving all of them to
the first point where they are knowable reduces requests without widening the
accepted or rejected input set. A special retirement-only call would create a
second catalogue-validation boundary and leave other known failures spending
the same request budget.

`validateValuesAgainstCatalogue` continues to call the same catalogue gate
before checking readings. The corpus rewrite and dataset join therefore retain
their existing behavior, while the live path repeats the inexpensive catalogue
check after collecting values rather than weakening its final gate.

### The seed request remains necessary

The next catalogue comes from the seed page, so the live path must still pass
robots and fetch that page before it can reject catalogue drift. Success means
zero `/api/product/lab-test-list/` requests, not zero network requests. No
client, throttle, retry, or robots behavior changes.

### Existing errors and files are preserved

The early call uses the same validators and error messages as the final call.
On failure it emits no per-test log line and writes neither `tests.json` nor
`metrics.json`; pre-existing files remain byte-for-byte unchanged. A valid
catalogue performs the same lab-list requests and produces the same canonical
outputs as today.

## Success bounds

- A stale curated slug, a redundant curated link, a lost published retirement,
  a duplicate test ID or slug, an invalid slug token, or a duplicate option
  value fails after the seed page and before the first lab-list request.
- Live-path tests count requested URLs and assert exactly zero whose path
  contains `/api/product/lab-test-list/` for each of the three registry faults
  named by the backlog (stale curated slug, redundant curated link, and lost
  published retirement), plus a representative structural catalogue fault.
- The existing valid live fixture still reaches the lab-list endpoint and
  writes the same valid catalogue and metrics shapes.
- The existing final validation, corpus rewrite and offline join suites remain
  green without changed semantics or output fixtures.
- Focused scraper suites, `npm run verify`, and the repository e2e command are
  green with no live network access.

## Failure behavior

An early catalogue failure rejects the live scrape after robots and seed-page
fetch, before `next` gains a reading and before any write. The thrown validation
message is the one the final gate would have produced. If early validation
passes but readings or fleet bounds fail later, the existing final failure path
still leaves both files untouched.

## Non-goals

- Changing retirement classification, the curated registry, or irreversible
  status rules.
- Moving validations that require readings, shoe counts, or the previous
  metrics fleet ahead of the crawl.
- Removing the final catalogue/value validation or relying only on the early
  check.
- Changing valid-run request count, order, throttling, retries, robots checks,
  logs, timestamps, or canonical data.
- Changing corpus, join, app, URL, CSV, or dataset behavior.
- Regenerating `data/`, adding a dependency, or making a live request in tests.

## Registry sweep

| Registry or complete claim | Owed |
|---|---|
| catalogue index in `validate.ts` | one reusable catalogue-only entry point; every existing caller keeps its current strength |
| method-status registry and irreversible guard | consumed through the shared gate, never imported specially by the crawler |
| live `scrapeMetrics` request loop | gate immediately before the first lab-list request |
| corpus catalogue rewrite | unchanged use of the final catalogue-plus-values gate |
| `validateMetrics` final gate | unchanged after-crawl authority and output protection |
| dataset join and published/synthetic-subset validation | retains its direct per-test index semantics; it does not acquire full curated-registry completeness |
| docs/scraping.md §Politeness | state that a known-invalid catalogue stops after the seed request |
| docs/scraping.md §Validation gates | distinguish early catalogue-only and final values/fleet validation |
| BACKLOG.md item **Fail retired-method catalogue drift before the metrics crawl** | removed only in the final closure task |

## Build sheet

### File map

| Task | File | Change |
|---|---|---|
| 1 | `scraper/src/validate.ts` | Export the catalogue-only gate while preserving one internal catalogue index. |
| 1 | `scraper/src/scrape-metrics-main.ts` | Invoke it after the previous catalogue read and before the lab-list loop. |
| 1 | `scraper/test/validate.test.ts` | Pin the explicit gate's accepted and rejected catalogue shapes. |
| 1 | `scraper/test/scrape-metrics.test.ts` | Prove zero lab-list requests, unchanged files, and the retained valid path. |
| 1 | `docs/scraping.md` | Own the earlier failure timing and request consequence with the behavior commit. |
| 2 | `BACKLOG.md` | Remove the delivered item and renumber by title. |
| 2 | `docs/specs/2026-08-06-pre-crawl-catalogue-validation.md` | Freeze the delivered spec. |

The file map is a hypothesis. Task 1 starts by sweeping all direct callers of
the catalogue index and values gate; files outside the map change only when
that sweep proves the interface reaches them.

### Interface

`scraper/src/validate.ts` exports:

`validateCatalogue(tests: TestsFile, previousTests?: TestsFile | null): void`

It applies method-status/previous-catalogue validation and every invariant in
the existing catalogue index. `validateValuesAgainstCatalogue` consumes the
same internal validated index before iterating readings; callers never pass an
empty readings map merely to express catalogue-only intent.

`validateShoesFile` continues to use the internal per-test index directly. Its
published and synthetic catalogue subsets are not complete source catalogues,
so routing them through `validateCatalogue` would incorrectly strengthen an
unrelated boundary.

### Tasks

1. **Fail known catalogue faults before the metrics request loop.** Start with
   live-path request-count tests, add the explicit catalogue gate and call it at
   the first knowable point, retain final validation, and update
   docs/scraping.md §Politeness and docs/scraping.md §Validation gates in the
   same commit. Acceptance: focused validation and scrape-metrics suites prove
   zero lab-list requests and unchanged files for method-status and structural
   faults, while the valid path still crawls and writes.

2. **Land and close.** After implementation and whole-branch review, rebase and
   fast-forward onto clean local `main`, remove the backlog item by title,
   freeze this spec, and run the complete repository gates. Acceptance: local
   `main` is linear and clean; `npm run verify` and the project-owned e2e command
   are green; `data/` has no diff.

### Global constraints

- The early gate runs after previous-catalogue read and before the first
  `/api/product/lab-test-list/` request.
- Early and final catalogue validation have identical acceptance and errors.
- Final values, absolute and relative fleet validation remains after the crawl.
- Failure writes neither metrics file and preserves existing bytes.
- Valid-run requests and canonical outputs are unchanged.
- No live network in tests; no data regeneration or dependency.

### Sequencing notes

- The feature branch is code-and-docs only; it never regenerates `data/`.
- Task 1 owns all behavior and receives one implementation review. Task 2 is
  only the post-review backlog/spec closure and linear landing.
