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

## 4. Strike preference, and how a side pair renders

The app currently encodes a preference silently: every default column and every story
bound reads the heel half, because someone picked heel. A forefoot striker is given a
heel-shaped view and no way to say otherwise. **Strike stops being an assumption and
becomes a stated input.**

### 4.0 Three layers, and what each one answers

The view is produced by two inputs, not one, and they change on different timescales:

| layer | answers | survives |
|---|---|---|
| **Runner** — `strike` | who is looking | every clear and every filter change; set only by the runner or by a link |
| **Story** — Easy / Tempo / Race | what they are shopping for | until another story or a clear |
| **Filters** | this particular search | until cleared |

The mapping is `(story, strike) → { filters, sort, columns }`, and the runner layer
applies **whether or not a story is chosen** — a forefoot striker browsing with no story
still gets forefoot columns. That is the whole point: heel-by-default was the bug.

### 4.1 The baseline moves with the runner

`defaultView` takes the strike. The baseline for a forefoot striker is a forefoot
baseline, so:

- the entry band shows while the view equals `defaultView(view.strike)` — flipping strike
  keeps the band open, because the view is still that runner's default. No exception
  carved into the comparison, and no control that deletes itself when used.
- **Clear** returns to `defaultView(currentStrike)`, keeping who you are and dropping
  what you searched for.
- `applyPreset(story, strike)` is the mapping in §4.0, with nothing special-cased.

Strike serialises like everything else, so a shared link shows the recipient what the
sender saw, and persists so a returning runner is not asked twice. It survives a Clear
and every filter change; only the runner sets it, or a link that carries one.

The toggle lives in the **toolbar**, as a peer of the story chips, so it is present
whether the band is open or collapsed. Beside the story cards alone would put it inside a
surface that disappears the moment a filter is touched — a runner who typed a search term
could no longer state their strike, which inverts the premise of this section. It is a
peer of the story, not a filter, and never lives in the filter sidebar.

### 4.1.1 What flipping it does to the rest of the view

Setting `strike` alone is not enough: the columns would stay heel-shaped, the view would
stop equalling its own baseline, and the band would collapse on the very control §4.1
exists to protect. Flipping strike **re-derives** the view:

| from | becomes |
|---|---|
| the default view | `defaultView(next)` |
| a view equal to a story | `applyPreset(story, …, next)` |
| a hand-edited view | side-keyed **columns and the sort key** swap to the other side; **bounds are left alone** |

The last row is the careful one, and the line falls where a *number* does. A bound carries
one — 36 mm is the median heel stack and the 98th percentile of forefoot stack — so
rewriting a hand-set bound onto the other side would hand the runner a filter they never
chose. A column and a sort key carry no number: "sorted by energy return" means the same
thing on either side, so both swap. Leaving the sort behind would strand the view sorted
by a key with no column, and the sort control lives in the column header.

Swapping columns must **dedupe, preserving order**: a hand-edited view can already hold
both halves of a pair as columns, and mapping both onto one slug would duplicate a key
that `ShoeTable` uses to key its `each` block.

Flipping twice returns the original view for the first two rows, which is the property
worth testing.

### 4.2 A side-swappable bound must be relative

**The two halves are not on the same scale**, so a threshold cannot simply move between
them. Easy bounds heel stack at 36 mm, which is the 49th percentile and keeps about half
the fleet; the same 36 on forefoot stack is the **98th** and keeps eleven shoes. Shock
absorption is as bad — a heel median of 131.6 against a forefoot median of 108.8.

So **every bound that can swap sides is a percentile of that side's own distribution**,
never a number. "As much stack as most of the fleet" transfers between sides; "36 mm"
does not. It is the same
rule docs/shoe-stories.md already states — a bound is market-relative where the claim is
relative, and "well cushioned" plainly is.

A bound that cannot swap sides — Race's weight ceiling, say — may stay absolute, because
weight has no sides. Every bound that *can* swap must convert, and that is more than one:
Race's energy-return floor of 70 sits at the 85th percentile on heel and the 80th on
forefoot, so it moves too.

### 4.3 Both halves always show

**A side pair is never mutually exclusive.** Both halves render, always, as two labelled
rows under one heading:

> **Energy return**
> Forefoot · [histogram]
> Heel · [histogram]

The heading is the shared name; each row is labelled by its side alone, not by the full
test name. Order is fixed — forefoot, then heel — and does **not** follow the strike
toggle, so flipping strike never rearranges the sidebar.

The strike toggle marks which half is **in use** — the one presets bound, sort by and
show as a column. It does not hide or disable the other, which stays filterable on its
own at any time.

This is deliberately unlike the method switch on a superseded pair, which *is* mutually
exclusive because readings are not comparable across a supersession
(docs/scraping.md §Test lineage). Two controls that look alike but behave differently
would be worse than either; a side pair reads as one metric measured in two places, a
method pair as one measurement taken two ways.

Note this is orthogonal to §4.1: the strike toggle decides which half a *story* uses;
both halves stay independently filterable by hand regardless.

### 4.4 Four pairs, two sources

The catalogue links only half of them. `energy-return` and `shock-absorption` carry
`primaryTestId` / `secondaryTestIds` and a shared `chartLabel`. **Stack**
(`forefoot-stack`, `heel-stack`) and **midsole width**
(`midsole-width-in-the-forefoot`, `midsole-width-in-the-heel`) are unlinked upstream
despite being the same kind of pair.

Catalogue links stay the primary source. A small **declared supplement** in app source
covers the pairs upstream does not link, giving each its heading and the side of each
half. It is validated: a declared id that is absent from the catalogue, or that the
catalogue already links, fails rather than silently duplicating a metric or dropping
one.

Do not infer pairs from slug or name patterns. `heel-padding-durability` and
`heel-counter-stiffness` have no forefoot counterpart, `forefoot-traction`'s secondary
is not published at all, and a rename upstream would silently regroup the sidebar.

## 5. The entry band shows what is selected

- **Cards lose their description line.** Name and count only.
- **The selected story is highlighted.**
- **A Clear control** returns to `defaultView(strike)`. It lives in the **toolbar**
  beside the strike toggle, not in the band — a control that resets a hand-edited view
  must be reachable *from* a hand-edited view, and the band is gone by then.

### 5.1 The band stays open while the view is clean

The band cannot both collapse on selection and display which story is selected. So its
visibility rule widens: **the band shows while the view is a clean state** — equal to
`defaultView(strike)`, or equal to `applyPreset(story, …, strike)` for some story. It
collapses to the chip row only once the view is hand-edited into something no story
describes.

That is a better rule than the old one, not a concession. The band's three counts are
what make the stories comparable, and comparing them is exactly what someone is doing at
the moment they pick one. Collapsing on selection threw that away at the instant it
became useful, and left nowhere to show the selection or offer a Clear.

Once a filter is touched, the view is the runner's own and the compact chip row is
right — the stories are then a way back, not a way in.

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

Because both halves of a side pair always render (§4.3), group 7 is fixed under the
strike toggle too: flipping strike changes which row is in use, never which rows exist.

## 7. Every filter clears, and added filters can leave

- **Each range gets a clear control**, which empties both bounds in one action rather
  than two.
- **Each hand-added range gets a remove control**, which deletes the key outright.
- **Released after gets an Any chip**, which is how it is unset.

That splits two things today's code conflates: clearing a *value* and removing a *row*.
The current rule — a cleared curated row drops its key, a cleared added row keeps an
empty entry so the row survives — exists only because removal had no control of its
own. With one, clear always means clear and remove always means remove, for every row.

### 7.1 Which rows are shown is its own state

A row can be on screen for four reasons: it is curated, it is a half of a side pair, it
holds an active bound, or it is in the hand-added row list. **Clearing a row that is only
on screen because it is active must add it to the row list**, or clear silently means
remove for exactly the rows that arrived by link. Equivalently, seed the row list from
every active non-curated key at parse time — which is safe, because every key a story
binds is curated, so a story still round-trips unchanged.


Splitting the two actions needs somewhere to record that a hand-added row is *shown*,
independently of whether it currently holds a bound. Deriving the row list from the bound
keys — which is what today's code does — makes clearing and removing the same action
however they are labelled.

So `ViewState` carries the hand-added row list. It serialises, because a shared link
should show the recipient the same controls, and it is the last encoding change before
the storage key is bumped.

An empty bound is then just an empty bound: `isDefaultView` keeps treating a stray range
key as non-default (it is), and a cleared row survives because it is in the row list, not
because a hollow key was left behind to prop it up.

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
4. `disc=only` returns exactly the discontinued shoes.
5. Applying a story highlights it; editing any bound afterwards removes the highlight;
   Clear returns to the default view and re-opens the band.
6. The strike toggle changes which half of a side pair a story bounds, sorts by and
   shows as a column, and changes nothing about which rows the sidebar renders. It also
   applies with no story chosen, and does not collapse the entry band.
7. Clearing preserves the strike and drops everything else. No side-swappable bound is
   an absolute number.
8. All four side pairs — energy return, shock absorption, stack, midsole width — render
   as one heading with a forefoot row and a heel row, in that order.
9. The sidebar's filter order is identical whichever story is selected, and whichever
   strike is chosen.
10. Every range row clears in one action; every hand-added row can be removed; released-after
   can be unset.
11. The add-filter dialog shows coverage as a bar, and is keyboard reachable and dismissible.
