> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Non-carbon plate detection

**Date:** 2026-07-27
**Status:** Approved design, pending implementation plan
**Supersedes:** BACKLOG.md item 1, and the premise still recorded in docs/scraping.md §Data quirks — "extracting the per-shoe Plate fact" — which is disproven below.

## 1. Problem

`derivePlate` reads RunRepeat's features vocabulary, which flags carbon plates
and nothing else, so the fleet reads `none: 393, carbon: 70, plated-other: 1`.
Nylon and PEBA shoes — Endorphin Speed 4 and 5, Hyperion Max 2 and 4, Mach X 2,
Cloudmonster 2 — are indistinguishable from unplated trainers. The `plated`
filter is therefore a synonym for `carbon`, and the `plated-other` sort rank has
one member.

## 2. Evidence

Established against a local corpus of all 464 shoe pages (one polite pass,
0 failures). This section is the expensive part to re-derive; treat it as the
justification for every rule below.

- **The structured `plate` fact takes exactly three values fleet-wide:**
  `false` (380), `carbon-plate` (70), absent (14). There is no `nylon-plate`
  option. RunRepeat's structured vocabulary is carbon-only, permanently.
- **`features` carbon and fact carbon are the same 70 shoes**, exactly, with
  zero difference in either direction. Switching signals would gain nothing;
  `features` stays the carbon source.
- **No shoe carries a `plate` feature string other than "Carbon plate"** —
  0 of 464. Today's rule has a `/plate/i` fallback to `plated-other` for any
  other plate word; it is unreachable on real data, so §3 drops it along with
  test 69.
- **A per-shoe "Plate" review section (`section_id === 'plate'`) is the missing
  signal.** Cross-tabulated against the fact:

  | section | fact | shoes | reading |
  |---|---|---|---|
  | no | `false` | 343 | unplated |
  | yes | `carbon-plate` | 52 | carbon |
  | yes | `false` | **37** | **plated, non-carbon** |
  | no | `carbon-plate` | 18 | carbon, no review section |
  | no | absent | 14 | hiking boots, no plate fact in their template |

- **Section presence alone is not the rule.** 18 carbon shoes have no plate
  section, so section-absence does not imply unplated. The rule must read the
  carbon signal first.
- **Prose cannot be parsed for material.** Of 12 plated-non-carbon shoes whose
  section mentions carbon, 8 are negations — "rather than carbon fibre", "not
  made of carbon", "don't expect a carbon-like feel". Any regex catching the
  real mentions also catches those. Negation handling is out of scope
  (docs/decisions.md §Free tools only).
- **Lab test 69 is populated on one shoe**, `mizuno-wave-rebellion-flash-3`,
  which the section signal already classifies `plated-other`. The input is
  redundant.

## 3. The rule

In order, first match wins:

1. an override names the slug → its value
2. `features` contains `carbon plate` → `carbon`
3. `hasPlateSection` → `plated-other`
4. → `none`

Rules 2–4 alone give `none: 357, carbon: 70, plated-other: 37`. The three
overrides in §3.1 then move two shoes to `carbon` and one to `none`, for a final
fleet of **`none: 358, carbon: 72, plated-other: 34`**.

Against today's `none: 393, carbon: 70, plated-other: 1`, **35 shoes change**:
33 from `none` to `plated-other`, 2 from `none` to `carbon`.

### 3.1 Corrections to RunRepeat's tagging

Three in 464, each confirmed by reading the review:

- `salomon-s-lab-spectur` — "the plate is made of carbon fibre... energyBLADE
  Carbon", tagged `false`. Override to `carbon`.
- `skechers-aero-tempo` — "a carbon-infused, H-shaped plate", tagged `false`.
  Override to `carbon`.
- `anta-zone-2-90` — has a Plate review section but **no plate**, confirmed by
  the author's own research; the section discusses the absence ("ANTA skipped
  the carbon plate"). Override to `none`. This is the one case where a section
  is present and the shoe is genuinely unplated, so it is the standing example
  of why rule 3 needs an override escape hatch at all.

## 4. Extraction

`extract-details.ts` adds one field to `DetailRecord`:

```ts
hasPlateSection: boolean   // a lab content section with section_id === 'plate'
```

The lab content tree is walked for the first section whose `section_id` is
`plate`. Nothing else about the record changes.

## 5. Derivation

`derivePlate` stays in `build-dataset.ts`, so a rule change costs a
`build:dataset` run and never a crawl (docs/scraping.md §Determinism). Its
signature becomes `derivePlate(features, hasPlateSection)` with overrides
applied inside. `PLATE_TEST_ID`, the `plateTestValue` parameter and the
`/plate/i` features fallback are all deleted per §2.

A details record that is a tombstone, or absent, yields `hasPlateSection: false`
and therefore `none` — unchanged from today's behaviour for those shoes.

## 6. Overrides

`scraper/src/plate-overrides.ts` — **source, not `data/`**. `data/` is
machine-generated and must not be hand-edited
(docs/decisions.md §Git is the database); a hand-maintained map in source gets
review, typechecking and tests.

```ts
export const PLATE_OVERRIDES: Record<string, { plate: Plate; note: string }>
```

`note` cites the review sentence justifying the entry, so a later reader can
audit it without refetching the page. Seeded with the three cases in §3.1.

**Maintenance:** the list is corrected by hand when the author reviews newly
released shoes, not on a schedule. It is expected to stay small; the validation
gate below is what stops it rotting.

## 7. Validation

`validate.ts`, run before anything is written
(docs/scraping.md §Validation gates):

- an override naming a slug absent from the dataset **fails the build** — the
  shoe was renamed or dropped and the entry is stale.
- an override whose value equals what rules 2–4 already derive **fails the
  build** — RunRepeat fixed their tagging and the entry is now noise.

Both are fatal rather than warnings, because a silent stale override is exactly
the failure this design is trying to avoid.

## 8. Backfill

Every existing details record lacks `hasPlateSection`. `scrape:details` gains
`--from-corpus <dir>`: read `<dir>/<slug>.html` from disk instead of fetching,
run the identical extractor, write the identical record shape.

- **Zero live requests.** The flag must not construct a `PoliteHttp` at all, so
  it cannot silently hit the network (docs/scraping.md §Politeness).
- A slug with no file in the corpus is skipped, not failed — the corpus is a
  convenience, not a source of truth. A missing corpus *directory* is the
  opposite: it aborts, because skipping all 464 shoes and exiting 0 is
  indistinguishable from a successful backfill.
- **Re-extraction preserves each record's `scrapedAt`**, falling back to the
  clock only for a slug with no prior record. The field dates the fetch, and
  reading disk is not a fetch; because it is the only input to `builtAt`, and
  `builtAt` is what the app shows as "updated", stamping the clock here would
  advertise a stale corpus as fresh — mildly today, badly the next time the
  flag is used against an older corpus.
- Documented in CLAUDE.md's command list and docs/scraping.md as a non-network
  path, so the "live requests happen only in the four CLIs" rule stays true and
  precise.

This also makes every future extractor change a seconds-long local re-run.

## 9. Tests and fixtures

Committed fixtures are **trimmed payload JSON**, a few KB each, not full pages —
`azura.html` is 842 KB and the repo should not carry more of that. Each fixture
is the minimal `pageData` subset the extractor reads.

| fixture | case |
|---|---|
| unplated | no section, fact `false` → `none` |
| carbon | features carbon, no section → `carbon` |
| plated-other | section present, fact `false` → `plated-other` |
| override | in the override map → overridden value |

Required tests, failing first:

- `extract-details` sets `hasPlateSection` true and false from the trimmed
  payloads, and false when the lab content is missing entirely.
- `derivePlate` covers all four rule branches plus precedence: an override beats
  carbon, carbon beats a section.
- `validate` rejects a stale override and a redundant override.
- `--from-corpus` writes the same record as the network path for the same page,
  and makes no HTTP call (asserted via an injected fetch that throws).

## 10. Docs

- docs/scraping.md §Data quirks — replace the plate bullet with the real
  ceiling: structured vocabulary is carbon-only, section presence is the
  non-carbon signal, prose is unparseable because of negation, ~3 in 464
  residual handled by overrides.
- docs/scraping.md §Decisions — new entry for why overrides exist, why they
  live in source, and that they are hand-maintained.
- **CLAUDE.md** — `--from-corpus` in the command list.
- **BACKLOG.md** — item 1 removed on completion.
- **No app or schema change.** The `Plate` enum is unchanged, so filters, the
  sort ordinal, URL state and CSV are untouched.

## 11. Acceptance criteria

1. `npm run verify` green; new tests fail before the implementation.
2. After backfill, `data/shoes.json` reads `none: 358, carbon: 72,
   plated-other: 34`, a net change of 35 shoes.
3. `saucony-endorphin-speed-5`, `hoka-mach-x-2` and `brooks-hyperion-max-4` read
   `plated-other`; `saucony-endorphin-azura` and `nike-pegasus-41` read `none`;
   `nike-alphafly-3` and `asics-metaspeed-sky-paris` read `carbon`.
4. `salomon-s-lab-spectur` and `skechers-aero-tempo` read `carbon` via override;
   `anta-zone-2-90` reads `none` via override despite having a plate section.
5. Backfill makes zero live requests.
6. `build:dataset` remains deterministic — re-running over unchanged inputs
   produces no diff.

## 12. Out of scope

- Material-level plates (nylon vs PEBA vs TPU). Needs negation handling.
- **14 hiking boots in a running-shoe dataset** — Danner, Keen, Scarpa,
  Zamberlan, Salomon X Ultra, Teva, and others have no plate fact because their
  product template has none. They are correctly `none`, but they are not running
  shoes and should not be in the fleet at all. New backlog item, not this one.
