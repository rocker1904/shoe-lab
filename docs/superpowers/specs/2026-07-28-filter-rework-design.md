> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Filter surface rework

**Date:** 2026-07-28
**Status:** Approved design, pending implementation plan

## 1. Problem

The filter surface grew a feature at a time and now shows it. Plate is filtered
through a token vocabulary with two inexact members invented to work around the
absence of multi-select. Discontinued is a boolean that can only ever hide. A range
filter can be added but not removed, and cleared only by emptying two number fields.
"Released after" can be set from a chip but never unset. The curated order buries price
below eight metrics nobody asked for first. Nothing shows which story is selected.

None of it is broken. All of it reads as accreted, and the fixes interact — so they
land together, as though this had been the shape from the start.

## 2. Plate becomes a multi-select over real values

**Delete the token vocabulary.** `plate` stops being
`'none' | 'plated' | 'carbon' | 'not-carbon'` and becomes a set of the actual `Plate`
values a shoe can have: `none`, `plated-other`, `carbon`. Empty means no constraint.

This is a deletion, not an addition. `plated` and `not-carbon` existed only because a
single-valued filter could not express "either of these" — with a multi-select, "not
carbon" is `none` + `plated-other`, chosen directly. The asymmetry documented in
docs/app.md §Columns and sorting ("plate has two different token sets, on purpose")
disappears with them; the *sort* stays ordinal, which is a separate thing.

The UI is three checkboxes: **None**, **Non-carbon plate**, **Carbon**.
`plated-other` renders as "Non-carbon plate" everywhere a human sees it.

URL: `plate=none,plated-other` — comma-joined like `brands`, with the same
all-separator handling.

## 3. Discontinued becomes three-valued

`hideDiscontinued?: boolean` cannot express "show me only the old models", which is
half of the value strategy in docs/shoe-stories.md. It becomes
`discontinued?: 'hide' | 'only'`, absent meaning both.

URL key `disc=hide|only`, replacing `nodisc=1`.

## 4. Strike preference

A **heel / forefoot** toggle, defaulting to heel, recorded as `strike` in the view and
serialised. It decides which half of a colocated pair a preset bounds and sorts by, and
which half appears in that preset's columns — `energy-return-heel` against
`energy-return-forefoot`, and the same for shock absorption.

This is the axis docs/app.md §Columns and sorting already names: a forefoot striker
cares about the forefoot figure, which is why the halves are colocated rather than
merged. The toggle turns that from a fact about the data into a control.

It appears in the entry band beneath the story cards, and in the chip row that replaces
the band, so it stays reachable after a story is chosen.

## 5. The entry band shows what is selected

- **Cards lose their description line.** Name and count only.
- **The selected story is highlighted**, in the band and in the chip row.
- **A Clear control** returns to the default view.

Selection is **derived, not stored**: a story reads as selected when the current view
equals what `applyPreset` would build for it right now. Presets resolve their
thresholds from the live fleet, so recomputing is cheap and the answer is honest — edit
a bound afterwards and the highlight drops, because the view genuinely is not that
story any more. A stored `preset` field would keep claiming Easy after the user had
filtered it into something else.

## 6. Filter order

Fixed, and the same whichever story is selected — the sidebar must not rearrange itself
underneath someone comparing two stories:

1. Search
2. Released after
3. Plate
4. Brand
5. Discontinued
6. **Price**
7. **The metrics the stories bound** — stack, energy return, weight
8. Everything else curated
9. Anything added by hand

Price moves up because it is the one bound every story shares and the one most people
reach for. Group 7 is the union of what Easy, Tempo and Race bound, so the controls a
story just set are the ones nearest to hand — without the set changing per story.

## 7. Every filter clears, and added filters can leave

- **Each range gets a clear control**, which empties both bounds in one action rather
  than two.
- **Each hand-added range gets a remove control**, which deletes the key outright.
- **Released after gets an Any chip**, which is how it is unset.

That splits two things today's code conflates: clearing a *value* and removing a *row*.
The current rule — a cleared curated row drops its key, a cleared added row keeps an
empty entry so the row survives — exists only because removal had no control of its
own. With one, clear always means clear and remove always means remove, for every row.

## 8. Where the filters live

**The sidebar stays.** Filtering here is a tuning loop: set a bound, watch the fleet
shrink, adjust. A modal that covers the table breaks the feedback that makes the loop
work, and the receipt is part of that feedback.

**The add-a-filter catalogue becomes a dialog.** Choosing among forty-odd metrics is a
different task from tuning three — it wants room for coverage bars, grouping and search,
it is not part of the loop, and it is currently a bare `select` that cannot show a
coverage bar at all (docs/app.md §Coverage). A dialog is where that constraint goes
away.

So: persistent sidebar for the filters you are using, dialog for choosing which filters
those are.

## 9. Non-goals

- Preset threshold tuning — BACKLOG.md item 1.
- The value / last-generation axis. Item 3 makes "discontinued only" reachable, which
  is a step toward it, but nothing here surfaces price history.
- Mobile layout beyond keeping what works today.

## 10. Acceptance criteria

1. `npm run verify` green; `npm -w app run e2e` green.
2. No `plated` or `not-carbon` token survives anywhere — code, URL, tests or docs.
3. Plate multi-select round-trips through the URL, and selecting none of the boxes is
   the same as not filtering.
4. `discontinued=only` returns exactly the discontinued shoes.
5. Applying a story highlights it; editing any bound afterwards removes the highlight;
   Clear returns to the default view and re-opens the band.
6. The strike toggle changes which half of a colocated pair a story bounds, sorts by and
   shows as a column.
7. The sidebar's filter order is identical whichever story is selected.
8. Every range row clears in one action; every hand-added row can be removed; released-after
   can be unset.
9. The add-filter dialog shows coverage as a bar, and is keyboard reachable and dismissible.
