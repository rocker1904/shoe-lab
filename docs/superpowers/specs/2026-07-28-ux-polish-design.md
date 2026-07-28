> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# UX polish and accessibility

**Date:** 2026-07-28
**Status:** Approved design, pending implementation plan
**Supersedes in scope:** BACKLOG.md items 3 (UX polish) and 7 (accessibility polish),
which the backlog already says to land together.

## 1. Problem, and an honest note on scope

Nothing here is a defect. The app works; it is not yet pleasant, and it is not yet
pretty. Two objectives, in that order: **make it pleasant to use**, then **make it
look designed rather than assembled**.

The scope grew during design, and the reader should know that before starting. Three
items are features rather than polish, admitted deliberately because they solve a
problem the polish item exposed and because they touch the same files:

- **Drag-to-bound on the histogram** (§7.2) — new interaction.
- **Leave-one-out relax counts** (§7.3) — new computation over `applyFilters`.
- **Metric direction as a declared property** (§5) — new data, and a correctness fix:
  the percentile tint currently points the wrong way for several columns.

Everything else is presentation. If the branch needs cutting, those three are the
seams.

## 2. What is out of scope

- **Row expansion in the URL.** Adds a field to `ViewState`, which must serialise, and
  an expanded row would then stop equalling `defaultView` and collapse the entry band.
  Belongs with BACKLOG.md item 6 (back/forward).
- **CSV schema changes** beyond a URL column. BACKLOG.md item 5 already owns
  `preciseReleaseDate`; both CSV edits should land in one visit to `csv-export.ts`.
- **Per-column user-declared direction.** The only treatment of preference metrics that
  is *right* rather than merely honest — the runner says "I want more stack" and the
  wash follows. It adds serialised view state and changes what a shared link means.
  New backlog item.
- **Method era ("this reading is being retired").** Real, and newly evidenced (§8.2),
  but needs a notion of era per test that the dataset does not carry. New backlog item.
- **Preset threshold tuning.** BACKLOG.md item 1. Untouched here, though §9 notes new
  evidence for it.

## 3. The visual system

All colour, spacing, radius, type and elevation move to tokens on `:root` in
`app.css`. Components stop choosing values.

### 3.1 The wash rule

This is the load-bearing decision of the whole pass, and it replaces
`--tint-strength`.

> **The row surface sits at the end of the lightness axis in each theme — white in
> light, near-black in dark — and both washes travel inward from it, separated only by
> hue. Grey means "more". Blue means "better". Neither theme has a ramp pointing the
> other way, because there is no other way left to point.**

|  | surface | "more" → grey | "better" → blue |
|---|---|---|---|
| light | `#ffffff` | `#b0b6bf` | `#4a86f0` |
| dark | `#0e1014` | `#454b54` | `#2b6cb0` |

- Grey is **linear** in percentile; blue is **squared**. A squared ramp makes only the
  leaders read as tinted, which is right for a ranking and wrong for a scale — a
  neutral column must read as a gradient, not a podium.
- **The endpoint is the cap.** Each endpoint is chosen so cell text clears 4.5:1
  against it, and the endpoint is the worst case of the ramp, so checking the endpoint
  is sufficient. `--tint-strength` disappears as a tunable.
- The dark surface is flat: page and table share `#0e1014`. There is no elevated or
  recessed data surface.

### 3.2 The 3:1 rule needs splitting

`docs/app.md §Theming` currently requires data marks to clear 3:1 against the surface.
That is correct for the **flat** marks it was written about — the inactive histogram
bars in `MetricRow.svelte` are a single fill, drawn or not drawn. It is
**unsatisfiable by any gradient**: every intermediate value of a ramp is closer to the
surface than the endpoint, tending to 1:1 as p→0, so most of a ramp fails it by
construction.

The doc must state which obligation governs which kind of mark:

- **Flat mark** (histogram bar, coverage rule): ≥3:1 against the surface.
- **Gradient wash**: text over the endpoint clears 4.5:1. No surface-contrast floor,
  because the wash never carries the value alone — the number is in the cell.

### 3.3 Other tokens

| group | tokens |
|---|---|
| spacing | `--s1` 0.25rem, `--s2` 0.5rem, `--s3` 0.75rem, `--s4` 1rem, `--s5` 1.5rem, `--s6` 2rem |
| radius | `--r-sm` 4px (inputs, small buttons), `--r-md` 8px (panels, cards), `--r-full` 999px (pills, segmented controls) |
| type | `--t-xs` 0.7rem (units, sub-labels), `--t-sm` 0.78rem (secondary), `--t-md` 0.85rem (cells, controls), `--t-lg` 1.05rem (card titles), `--t-xl` 1.25rem (h1) |
| elevation | `--shadow-sticky` (pinned chrome only), `--shadow-dialog` |

Today the app uses radii of 3/4/6/8/10/999px and nine distinct font sizes between
0.7 and 1.15rem, each chosen per component. Every component's `<style>` is rewritten
against these tokens — which is why the visual pass has to follow the structural work
in the same branch rather than after it, or every file is edited twice.

Elevation is deliberately thin: with a flat table surface there is nothing to raise
except the pinned chrome and the Add-filter dialog.

## 4. The table

### 4.1 Presentation

- **Numeric cells right-aligned with `font-variant-numeric: tabular-nums`.** Currently
  left-aligned proportional digits across the seven numeric columns of the default
  view; this is the single
  largest legibility gain available and it makes the wash read as columns rather than
  confetti.
- **Stacked headers.** Name on the first line; units and direction on a second, smaller,
  dimmer line — `Price` over `£ · lower ↓`, `Heel stack` over `mm`. Vertical is the axis
  we have spare, especially on mobile.
- **Units are derived**, not authored: `float` → `test.units` (31 of 49 tests carry one),
  `score` → `/5`, `percent` → `%`, `rating` → `/5`, plus `/100` for the `score` field
  and `£` for `msrpGbp`.
- **Sticky `thead`**, offset below the sticky header and toolbar (§6.2), carrying
  `--shadow-sticky`.
- **Sticky first column** (shoe name). Ten columns already overflow on a laptop; scroll
  right today and the row loses its identity. Same mechanism as the header, used twice.
- **Chevron affordance** in the name cell. Expandability is signalled by `cursor:
  pointer` alone today.
- **Multiple rows expand at once.** `expanded` becomes a `Set<string>`.
- **Row expansion transitions**, and the panel scrolls into view when it opens below
  the fold.
- **`class:discontinued` is deleted.** It is styled by nothing today. The `disc-tag`
  chip already carries the message in text, and dimming the row would argue against the
  `discontinued=only` filter, which exists because those shoes are worth finding.

### 4.2 Detail panel

`DetailPanel.svelte`'s image is `width: 220px` with no height, so it shifts layout on
load. It gets an `aspect-ratio`. **The row image is to be verified in a browser before
being written down as a defect** — it carries fixed `width` and `height` already, so
the usability review's claim that it shifts is unconfirmed.

## 5. Direction as a declared property

The percentile tint asserts a direction for **every** numeric column, driven by
`LOWER_IS_BETTER` in `stats.ts` — a hand-written set of six keys. Everything outside it
is tinted "higher is better" whether or not that is true. Two columns are actively
wrong today:

- **`outsole-durability`** is Dremel dent depth in mm (values 0.16–16.3, correlating
  −0.22 with outsole hardness). Lower is more durable. The tint currently marks the
  **least** durable shoes as column leaders.
- **`size-rating`** is a 2.1–3.9 runs-small/true-to-size/runs-large scale where 3 is
  correct. The tint currently rewards shoes that run large.

Direction moves out of `stats.ts` and becomes a declared map in
`app/src/lib/direction.ts`, following the `SIDE_PAIRS` precedent in `lineage.ts`:
declared in the app because it is a judgement, never inferred from a slug or a name,
and asserted against the catalogue by a test so an upstream addition fails the build
rather than silently defaulting (docs/operations.md §Contract-drift runbook).

Three values: `higher`, `lower`, `neutral`. Neutral columns get the grey wash and no
arrow; `higher`/`lower` get the blue wash and an arrow.

**Higher is better (11 tests + the `score` field):** `breathability`,
`breathability-25`, `drying-potential`, `sweat-evaporated`, `toebox-durability`,
`heel-padding-durability`, `energy-return-heel`, `energy-return-forefoot`,
`shock-absorption-heel`, `shock-absorption-forefoot`, `forefoot-traction`.

**Lower is better (7 tests + the `msrpGbp` field):** `weight`, `price`,
`outsole-durability`, `difference-in-midsole-softness-in-cold`,
`difference-in-stiffness-in-cold`, `sweat-on-skin`, `sweat-in-shoe`.

**Neutral (28 tests + `releasedAt`):** all stack and `drop`; all softness variants
(`midsole-softness`, `-in-cold`, `-22`, `-in-cold-22`, `secondary-foam-softness`,
`-22`); all stiffness and rigidity (`stiffness`, `stiffness-in-cold`,
`flexibility-stiffness`, `torsional-rigidity`, `torsional-rigidity-23`,
`heel-counter-stiffness`); both midsole widths; every toebox measurement and
`toebox-height`; `internal-length`; `size-rating`; `insole-thickness`;
`tongue-padding`; `outsole-thickness`; `outsole-hardness`.

**Non-numeric, no direction and no wash (3):** `plate`, `removable-insole`,
`reflective-elements`.

This flips three of the six current `LOWER_IS_BETTER` members — `drop`, `stiffness`,
`stiffness-in-cold` — to neutral. All three are fit and feel preferences, and today a
low-drop shoe is tinted as a leader over a high-drop one for no defensible reason.

`docs/shoe-stories.md` supports the neutral bucket in two places: stability "matters to
some runners a great deal and to others not at all, and there is no fleet-wide answer"
(§Race), and softness is deliberately unbounded (§How a story becomes a threshold).
Stack is the borderline call — Easy floors it, so it is directional *inside a story* —
and is classified neutral because it is not directional outside one.

## 6. Toolbar and entry band

### 6.1 Two radiogroups, one language

```
[ Heel | Forefoot ]  │  [ All | Easy | Tempo | Race ]        …        [Filters] [Columns]
```

- Both are segmented pills with an `--accent-dim` fill on the selected item — which is
  what `StrikeToggle.svelte` already does. No ledes on either; the divider separates
  them.
- **`Clear` is deleted, replaced by `All`** as a fourth peer of the stories. It is the
  same state (`defaultView(strike)`) named for what you get rather than what you
  destroy, and it dissolves the ambiguity between the toolbar's "Clear" and the
  sidebar's "Clear filters". `All` leads the group so it reads as everything → narrow
  to a story.
- Selection stays **derived**, never stored: a hand-edited view matches no story and
  nothing is highlighted. Unchanged behaviour, now with a fourth cell.
- The sidebar's **Clear filters** is unchanged and keeps its name.

### 6.2 Pinned chrome

Header + toolbar + `thead` all stay pinned; the receipt scrolls. Filtering is a tuning
loop, and every control that changes the view has to be reachable from anywhere in a
25,000px table.

### 6.3 Entry band

- Preset cards gain a visible one-line description, replacing the `title` tooltip that
  does not exist on mobile. Copy, deliberately cheap because BACKLOG.md item 1 may
  change the presets and therefore the text:
  - Easy — *Cushioned, no carbon, affordable*
  - Tempo — *Light, fast, affordable*
  - Race — *Lightest, fastest, price no object*
- **The "Browse all N shoes" card is removed.** `All` in the toolbar now owns that
  affordance, and two similarly-named controls with different behaviours (one resets,
  one only scrolls) is worse than one.
- `TABLE_ANCHOR_ID` survives with a new owner: the skip link (§10).

## 7. The sidebar

### 7.1 Tidier rows

A metric section is four stacked elements today — heading, coverage bar + percentage,
histogram, bounds row — and ten of those is most of the sidebar's height.

- Coverage moves **onto the heading line**, right-aligned (§8).
- The coverage bar becomes a 2px underline beneath the heading.
- `Clear` on a bounded row becomes an ✕ icon button, keeping its
  `aria-label="Clear {name}"`.
- Net: the row is **shorter than today while carrying more information**.

### 7.2 Drag-to-bound

`docs/app.md §Filters` justifies "histogram plus number fields" as *not* a dual-thumb
slider, on keyboard-accessibility grounds. **That rationale is replaced**: the two
inputs exist because they serve different needs — the number field is **precise**, the
histogram is **intuitive**. Accessibility is a property of how each is built, not the
reason either exists.

- **Edge handles**, dragged inward from either side. A one-sided bound — which is most
  real filters here — is one gesture from the correct side.
- A handle at its extreme means **no bound on that side**, so the row still serialises
  open-ended.
- **Handles appear on hover or focus**, anywhere over the row rather than only at the
  edges, so the target is generous. At rest the sidebar is charts and numbers.
- **A set bound is always drawn** — an edge is state, a grip is affordance, and they
  have different visibility rules.
- **`@media (hover: none)`: handles are permanently visible.** Hover never fires on
  touch, and the sidebar is a drawer on small screens where resting tidiness matters
  less.
- **Dragged bounds snap** to a readable step derived from the range (£5, 1 g, 0.5%), so
  the number field and the shared URL carry something a human would have typed.
- The number fields remain authoritative and independently editable.

### 7.3 Relax counts

Every active range row shows **`+N`**: the shoes that would return if *this one bound*
were removed and everything else kept.

- Leave-one-out, so it is order-independent and conditioned on the rest of the filter
  set. With a £60 ceiling set, each other filter's count is "of the shoes under £60,
  how many did this cost me".
- **No ranking and no recommendation.** An earlier design singled out the most
  restrictive bound; that imposes a priority we cannot know, and a budget is usually
  the *least* relaxable thing in the set. The number goes next to the control that acts
  on it and the runner chooses.
- **The counts do not sum.** Dropping two bounds returns more than the sum of dropping
  each. Copy is per-filter and must never present a total.
- Cost: N+1 passes of `applyFilters` over 450 shoes, recomputed as filters change. Cheap,
  but it is the first thing in the app whose cost grows with filter count, and it should
  be stated rather than discovered.

### 7.4 Brands

- **Counts respect the other filters.** `brandCounts` currently reduces over
  `data.shoes`; it moves to `population` (`filtered.considered`), which is the
  denominator every coverage number beside it already uses. It is the one number in the
  sidebar that promises something it does not keep.
- A brand at zero **stays in the list, greyed, showing (0), and clickable**. The list
  does not reflow under the cursor, and a 0 is an answer.
- **A search box**, for ~50 brands in a 14rem scroll box.

### 7.5 Empty state

One short honest line, unchanged in spirit. The relax counts in §7.3 do the explaining,
where the controls are.

## 8. Coverage

### 8.1 What it says

`measured on 378 / 450` on the heading line, **shown only below complete coverage**.

- **Counts, not a percentage.** "84%" of an unstated pool is the complaint; both numbers
  on screen states the denominator instead of assuming it. Filter to last year and it
  reads `120 / 180`, where both numbers visibly moved.
- The denominator stays `considered` — the non-range population. This is not a free
  choice: with the **visible** set as denominator, any metric carrying a bound reads
  100% every time, because a bound already excludes every shoe lacking a reading. The
  number would become a tautology exactly when it is being used.
- Silent at complete coverage. On a default view most rows fall silent.

### 8.2 The sparse warning is deleted

`MetricRow.svelte`'s warning — "Only 30% of these shoes have this reading — the method
is new / it is rarely run" — is removed, and **the classifier behind it is wrong**, not
merely verbose.

Coverage by release year shows every sparse metric is **era-shaped**, not sporadic:

| test | '21 | '22 | '23 | '24 | '25 | '26 |
|---|---|---|---|---|---|---|
| `torsional-rigidity` | 85% | 97% | 100% | 100% | 98% | 51% |
| `torsional-rigidity-23` | 0 | 0 | 0 | 1% | 47% | 100% |
| `stiffness` | 85% | 100% | 98% | 99% | 23% | 0 |
| `outsole-hardness` | 85% | 100% | 98% | 99% | 47% | 1% |
| `toebox-width-widest-part` | 8% | 14% | 47% | 76% | 100% | 99% |
| `breathability-25` | 0 | 0 | 0 | 1% | 11% | 36% |
| `sweat-in-shoe` | 0 | 0 | 0 | 0 | 10% | 17% |

Metrics are **arriving** (a clean adoption ramp) or **retiring** (near-total coverage
then a cliff). Not one is uniformly thin; the closest is the `sweat-*` family, which is
both new and incompletely adopted.

The warning has two labels, derived from `oldestReading` + `ageMonths`. `stiffness` has
readings going back years, so it is labelled *rarely run* — but it is **retired**, with
better historical coverage than most of the fleet. The case that matters — this reading
will keep thinning — is not expressible in the vocabulary the warning has.

And because coverage is era-shaped, the live `378 / 450` count **demonstrates** the
answer as the runner filters: narrow to recent shoes and an arriving metric fills in, a
retiring one empties out. The number is a truer signal than the label, and it updates
rather than asserting.

**Deleted:** `oldestReading`, `ageMonths`, `YOUNG_METHOD_MONTHS`, and their tests.

**Retained:** `isSparse` and `SPARSE_BELOW`. `presets.test.ts` asserts in both
directions that no preset bounds a metric below that threshold, and
`docs/app.md §Presets` calls that assertion load-bearing. It stops being a *warning*
threshold and becomes a *preset-safety* threshold; the doc's wording must follow, since
it currently defines it by the UI element being removed.

## 9. Incidental finding

Applying the current presets to the live fleet returns Easy 150, Tempo 54, Race 39 of
450. `docs/shoe-stories.md` describes Tempo as the widest of the three by intent — "it
is where most weeks' hard running happens" — and it is the narrowest but one. This is
BACKLOG.md item 1's open question, now measured rather than suspected. **Not addressed
here**; recorded so item 1 starts from a number.

## 10. Accessibility

Folded in per BACKLOG.md item 7, because these touch the same components.

- **Roving tabindex** on every `role="radiogroup"` — strike, discontinued, generation
  pickers, and the new story segment. Each currently makes every radio its own tab stop
  and ignores arrow keys, which is the interaction the role promises. One fix serves all
  four.
- **Skip link** to `TABLE_ANCHOR_ID`. It is 49 tab stops from the top of the page to the
  first table row.
- **Focus trap and Escape** in the mobile filter drawer. The drawer also gains a
  transition — it toggles `display` today, which cannot animate, so it needs a transform.
- **`aria-controls`** on expanders.
- **Range inputs named by their metric**, not "min"/"max".
- **`StrikeToggle` needs an `aria-label`.** Removing the "I land on my" lede (§6.1)
  removes the target of its `aria-labelledby`, so the group would otherwise lose its
  accessible name. The lede's own comment justifies it as protection against being
  misread beside the Clear button — and Clear is being deleted, so the rationale expires
  with it.

## 11. Also included

- **Copy-link button.** Shareable URLs are a stated project goal with no affordance at
  all today.
- **CSV gains a RunRepeat URL column**, consistent with `docs/app.md §Number display`
  calling the export "a data export, not a rendering". Visible-columns behaviour is
  unchanged.
- **Delayed loading skeleton.** A skeleton that flashes for a 200ms fetch is worse than
  the text it replaced.
- **Favicon and page `<title>`.** Shared links currently preview as nothing. Open
  Graph tags are not included — that needs an image and a decision.

## 12. Documentation

Behaviour-changing commits carry their doc (CLAUDE.md §Conventions). Sections that must
change:

| doc | change |
|---|---|
| `docs/app.md §Theming` | the wash rule (§3.1); split the 3:1 obligation by mark type (§3.2); drop `--tint-strength` |
| `docs/app.md §Coverage` | rewrite around counts and the era finding; delete the `oldestReading` paragraph; redefine `SPARSE_BELOW` as a preset-safety threshold |
| `docs/app.md §Filters` | replace the accessibility rationale for two inputs with precision-vs-intuition; document drag, snapping, and handle visibility |
| `docs/app.md §Presets` | delete the "Browse all" paragraph; `Clear` → `All` |
| `docs/app.md §Columns and sorting` | direction as a declared property; where it lives and why it is declared |
| `docs/operations.md` | direction-map drift joins the contract-drift runbook |
| `BACKLOG.md` | items 3 and 7 closed; new items for user-declared direction, method era, OG tags |

## 13. Testing

TDD throughout, per CLAUDE.md.

- **`direction.test.ts`** — every numeric test in the catalogue has a classification;
  an unclassified one fails. Both known-wrong cases (`outsole-durability`,
  `size-rating`) pinned explicitly.
- **`stats.test.ts`** — the wash reads direction from the map; neutral yields no blue.
- **Relax counts** — leave-one-out is order-independent; counts do not sum; a bound
  returning zero still renders.
- **Coverage** — silent at complete; counts track `considered` as non-range filters
  change.
- **Drag** — pointer maths and snapping are pure functions, tested directly rather than
  through the DOM. Bound-at-extreme serialises as absent.
- **Accessibility** — roving tabindex moves selection on arrow keys within each
  radiogroup; drawer traps focus and closes on Escape.
- **e2e** — one pass over the sticky chrome and the story segment, since neither is
  observable in jsdom.

No live network, ever (CLAUDE.md).

## 14. Sequencing

Tokens first, then structure, then the rest — because every component's `<style>` is
rewritten against the tokens, and doing it in the other order edits each file twice.

1. Tokens and the wash rule (§3) — invisible except for colour, lands everywhere.
2. Direction map and the tint fix (§5) — correctness, independently verifiable.
3. Table presentation (§4).
4. Toolbar and entry band (§6).
5. Sidebar: rows, coverage, brands (§7.1, §7.4, §8).
6. Relax counts (§7.3).
7. Drag-to-bound (§7.2).
8. Accessibility (§10).
9. Incidentals (§11).

Regenerate `data/` once in the primary checkout **after** landing, never on the branch
(CLAUDE.md). Nothing here changes the dataset, so this is a formality — but the branch
must stay code-only for the rebase to work.
