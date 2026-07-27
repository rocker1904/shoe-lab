> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Metric legibility and coverage

**Date:** 2026-07-27
**Status:** Approved design, pending implementation plan
**Scope note:** This is the first of two specs from the UX review. It covers making
the metric surface honest. The entry flow — use-case cards, the browse-everything
escape, repeat-visit restore — is a second spec that is blocked on preset thresholds
(BACKLOG.md item 1).

## 1. Problem

The app presents every metric as an equal, when they differ enormously in how much of
the fleet they describe. Three symptoms:

- A user cannot tell, before choosing a filter, whether it will narrow their search or
  gut it. The only signal is `hiddenMissing`, which appears after the damage.
- Eight metrics appear **twice** in the filter menu and column picker under identical
  display names, because RunRepeat revises a test method and renames rather than
  backfilling (docs/scraping.md §Test lineage). Slugs disambiguate; the UI shows names.
- Energy return and shock absorption each appear as two unrelated columns.

The founding motivation for this tool was not filtering — it was **confidence that
nothing was missed**. Every decision below serves that.

## 2. Evidence

Measured on the 450-shoe fleet at `70a19eb`. Expensive to re-derive; treat as given.

### 2.1 Coverage is a function of the filter set, not a property of the metric

Filtering to shoes released since 2024-07-27 (202 of 450) moves coverage in both
directions — `flexibility-stiffness` 83% → 100%, `torsional-rigidity` 91% → 81%,
`breathability-25` 9% → 20%. A coverage figure computed over the whole fleet would be
most wrong exactly when a user has filtered by date, which every preset does.

### 2.2 The retired generation often has better coverage

| pair | retired | current | either |
|---|---|---|---|
| Breathability | **96%** | 9% | 97% |
| Torsional rigidity | **91%** | 30% | 99% |
| Midsole softness in cold | **83%** | 15% | 97% |
| Midsole softness | **83%** | 51% | 97% |
| Flexibility / Stiffness | 61% | **83%** | 100% |
| Width / Fit | 55% | **73%** | 100% |
| Toebox width | 45% | **73%** | 90% |
| Secondary foam softness | 21% | 22% | 29% |

Four of eight retired methods cover more of the fleet than their replacement.

### 2.3 Generations cannot be merged, only paired

Units change on most pairs (HA→AC, ""→Nm, ""→BR) and same-unit pairs shift
systematically. Never coalesce, average, or fall back between generations
(docs/scraping.md §Test lineage).

### 2.4 Time depth explains sparseness but does not measure it

Oldest shoe carrying a reading, current generation: `midsole-softness-in-cold-22`
2025-11-03, `torsional-rigidity-23` 2024-10-01, `breathability-25` 2024-01-01,
`flexibility-stiffness` 2017-11-01.

A pure "less than two years deep" rule would flag the first two but **miss
`breathability-25`**, which is 2.6 years deep yet covers 9% of the fleet and 20% of
recent shoes — the worst metric of the eight. Time depth is the *explanation*;
coverage against the current results is the *measure*.

## 3. The coverage model

**Definition.** A metric's coverage is the share of shoes that carry a reading, among
the shoes passing every **non-range** filter currently active — the same population
`hiddenMissing` already walks (docs/app.md §Filters).

Non-range is deliberate and load-bearing: if range filters counted, a metric's own
bound would change its own denominator, and the number would move as the user dragged
it. The denominator answers "of the shoes I am considering", not "of the shoes I can
still see".

Coverage is displayed as a bar plus a percentage wherever a metric can be chosen: the
filter sidebar, the add-filter menu, and the column picker.

## 4. Superseded pairs

A pair renders as **one entry with two selectable generations**, never as two
independent rows.

- **The current generation is selected by default**, regardless of coverage. Newest is
  the right default because the fleet keeps moving and the retired method will not be
  run again.
- Selecting one generation **releases the other**. They can never both be active. Only
  ~40% of shoes carry both readings, so ANDing them collapses the fleet for no visible
  reason.
- Each generation shows its own coverage bar, units, and a generation label derived
  from the slug suffix — "2022 method", "2025 method", "original". Units alone do not
  disambiguate: two pairs share units on both sides.
- Which generation is active is part of the view state and serialises into the URL, so
  a shared link cannot show different numbers to whoever opens it.

### 4.1 The sparse-metric warning

When the selected generation covers **fewer than half** the shoes currently in view, a
warning appears at the point of use: using it hides more shoes than it shows.

The threshold is deliberately relative, which resolves the tension the author raised:
`torsional-rigidity-23` covers 30% of the whole fleet but 66% of shoes released in the
last two years. Someone browsing everything is warned; someone who has already filtered
to recent shoes is not — because for them the metric is fine.

The warning text names the cause using time depth from §2.4: a metric that is sparse
because it is new reads differently from one that is sparse because it is rarely run,
even though both are unusable at that moment.

## 5. Colocated halves, never merged

`primaryTestId` / `secondaryTestIds` mark two live pairs — energy return (#65/#66) and
shock absorption (#67/#68) — which RunRepeat charts as one measurement.

They are **colocated under their shared `chartLabel`** in the sidebar and column picker,
and **remain independently filterable and sortable**. This is not a compromise: a
forefoot striker cares about the forefoot figure and much less about the heel, so
collapsing the two would destroy the distinction that makes the metric useful. The
dataset now carries `strike-pattern` as a fact on 449 shoes, which is exactly the axis
that decides which half matters.

`forefoot-traction` (#60) carries a secondary but no `chartLabel`; it colocates under
its own name.

## 6. Facts stay in the expanded row

`pace`, `arch-support`, `strike-pattern` and `width` render as tag rows in the expanded
panel only (docs/scraping.md §Editorial facts). None becomes a filter, a column, or a
sort key.

- **`width` is the set of SKU widths sold**, not a measurement. Median measured toebox
  width is flat across every value of it. Placing it near the toebox columns would read
  as a width metric and mislead.
- **`pace` is one editor's label**, not a lab reading. It is useful privately, to
  sanity-check a proposed preset threshold set against, and is explicitly not a filter.

## 7. Column picker

The **Other** group is retained. It now holds 7 of 49 tests rather than 32 of 64, so it
is no longer a dumping ground, but those 7 still need somewhere to live and removing the
group would hide them.

Groups list superseded pairs as one entry per §4 and colocated halves per §5.

## 8. The coverage receipt

A persistent line accounts for every shoe not on screen:

> Showing **38** of 450 · 291 outside your bounds · **21 hidden because they have no
> midsole-softness reading** — *show them anyway*

- The missing-data count is the existing `hiddenMissing`, which already over-counts
  against "would otherwise be visible" and whose copy must keep matching that
  (docs/app.md §Filters).
- **Show them anyway** relaxes every active range filter to admit missing readings for
  one render. It is a view-state flag, serialised like any other.
- The receipt is always present, not only when something is hidden, so its absence never
  has to be interpreted.

## 9. Deliberately unchanged

- **The default column set keeps `midsole-softness-22`** at 51% coverage, consistent
  with §4 defaulting to the current generation. The coverage bar and the receipt explain
  the blanks rather than the default hiding them.
- The URL stays write-only and the Page keeps owning view state
  (docs/app.md §View and URL ownership).
- Number formatting is unchanged (docs/app.md §Number display).

## 10. Non-goals

- Use-case entry cards, the browse-everything escape, and repeat-visit restore — second
  spec, blocked on preset thresholds.
- Preset threshold definitions (BACKLOG.md item 1).
- The value / last-generation axis. `previousVersion` and `latestVersion` exist, but
  street price does not, and MSRP does not express it. Nothing here should block it.
- Per-user state: owned shoes, shoes of interest, a release calendar.

## 11. Acceptance criteria

1. `npm run verify` green; `npm -w app run e2e` green.
2. No metric appears twice under the same name anywhere in the UI.
3. Selecting one generation of a pair releases the other; no view state can have both
   active.
4. Coverage shown against the non-range-filtered population, and it changes when a
   non-range filter changes.
5. A metric covering under half the current results warns at the point of use.
6. Energy-return heel and forefoot are colocated yet independently sortable and
   filterable.
7. `width` and `pace` appear nowhere but the expanded row.
8. The receipt reconciles: shown + outside-bounds + missing-data equals the
   non-range-filtered population.
