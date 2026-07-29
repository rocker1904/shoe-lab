> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Strike becomes a preset

**Date:** 2026-07-29
**Status:** Approved design, pending an implementation plan
**Size:** Medium — `ViewState` loses a field, so it reaches `urlstate`, `presets`, `persist`,
`Page` and both selection surfaces. Nine files reference `strike`; `urlstate.ts` alone has 21.

## 1. What is actually wrong

The app has two selections above the table. They look like peers — two segmented groups
side by side — and behave nothing alike.

| | pace (All / Easy / Tempo / Race) | strike (Heel / Forefoot) |
|---|---|---|
| stored | **no** — derived by matching the view against each story | **yes** — `ViewState.strike`, a required field |
| serialised | no | `strike=forefoot` |
| survives Clear | no | **yes** — "who you are survives, what you searched for does not" |
| deselects on a hand edit | **yes** | no — it is a field, so it always has a value |

So one of them is a lens over the view and the other is part of it, and the interface gives
no clue which is which. The asymmetry also forces machinery nothing else needs:
`defaultView(strike)` and `defaultColumns(strike)` take a parameter, `isDefaultView` compares
against `defaultView(v.strike)` rather than a constant, and `swapStrike` exists solely to
move a hand-edited view across sides.

**Strike is a preset.** It maps to filters and columns exactly as a story does, and it should
be derived and deselectable exactly as a story is.

## 2. What is *not* wrong, and must not be "fixed"

The instinct that prompted this was that the app restricts filtering to one side. **It does
not.** Verified against the running build:

```
?r.heel-stack=36~&r.shock-absorption-forefoot=100~&cols=score,heel-stack,shock-absorption-forefoot
```

round-trips intact, holds both bounds, and renders both columns. Every side pair already
renders a range row per half, and both halves are separately checkable in the column picker.

So this change **must not** give side pairs the superseded pair's switch. That would remove
capability in the name of consistency. Generations are mutually exclusive by nature — the
same measurement by a superseded method, not comparable across the change, carried together
by only ~40% of shoes. Sides are two measurements of two parts of a shoe. They differ
because the data differs (docs/app.md §Coverage records the same asymmetry for coverage
figures).

What strike actually constrains is narrower: it decides, globally, which half the **presets
bound**, which half `defaultColumns` **shows**, and — until 2026-07-29 — which half was
marked "in use".

## 3. The model

```
(strike, story) → view          the mapping, unchanged in spirit
view → (strike?, story?)        both marks derived, both able to be nothing
```

- `ViewState` loses `strike`. The URL loses `strike=`.
- **`defaultView()` loses its parameter; `defaultColumns(side)` keeps its.** The guard the
  parameter provided is preserved rather than deleted — no call site can drift to a side by
  accident, because `defaultColumns` still demands one. Exactly one place, `defaultView()`,
  names **heel** as the arbitrary half, and `isDefaultView` finally gets the constant it
  always wanted.

  The comment on the current parameter warns that a default "would reinstate the silent heel
  assumption". It is already there: `parseView` (`urlstate.ts:146`) defaults to heel when a
  query string carries no `strike=`, so every first arrival is heel today. This change
  relocates that default rather than introducing it — and makes it visible, since the
  toolbar renders **Heel** as selected on that view.

  A genuinely side-free default — dropping stack and energy return from `defaultColumns` so
  neither side is favoured — was considered and rejected. It is the fairer option and it
  would dissolve the URL cost below, but stack is the best-covered cushioning proxy in the
  fleet and energy return is the speed metric. Gutting the default table to avoid choosing a
  side is a large usability cost for a small fairness gain.
- `applyPreset(story, shoes, idx, side)` keeps its side argument — it is now a plain input to
  the mapping rather than a field being carried around.
- Marks are derived by matching, as `selectedPreset` already does: eight combinations of
  (side, story) instead of three stories. Cheap, and it deletes `swapStrike` entirely.

**Deriving the strike mark.** A view is heel-marked when every side-paired key it uses —
columns, bounds, sort — is the heel half; forefoot-marked when they are all forefoot; and
**unmarked when it mixes**, which is exactly the behaviour that makes mixed-side filtering
legible rather than impossible. A view using no side-paired metric at all keeps whichever
mark its columns imply.

## 4. What `All` does, and what happens to old links

**`All` is the pace axis reading "all paces", not a reset of everything.** It is in the
story group, so it speaks for the story group:

| the view's derived side | `All` produces |
|---|---|
| Heel or Forefoot | filters cleared, `sort` back to `DEFAULT_SORT`, `columns` = `defaultColumns(thatSide)` |
| none — the view mixes sides | **filters cleared, and nothing else touched** |

The mixed case is the interesting one and the rule is deliberately timid: with no derived
side there is no defensible column set to impose, so imposing one would throw away a
deliberately mixed view to answer a question about pace. Clearing the filters is the whole
of what the user asked for; the shape of their table is none of `All`'s business.

**`All` clears every filter, not only the ones a preset contributed.** Undoing just the
preset's share would mean knowing which bounds came from the preset and which the user
typed — which means storing the preset alongside the view, and that stored `preset` field
is precisely the modelling error this design removes (docs/app.md §Presets: a stored field
"would keep claiming Easy"). So a search term typed before choosing Easy is cleared by
`All`, as it is today. This is unchanged behaviour, recorded because it is the case someone
will read as a bug.

**Links carrying `strike=forefoot` are not translated.** `parseView` drops what it cannot
vouch for, so such a link opens heel-shaped. Accepted: the tool has not been shared, so
there are no such links in anyone's hands, and a compatibility branch for a population of
zero is a branch that can never be removed. Links carrying explicit `cols=` are unaffected
either way.

## 4a. The cost: a forefoot default view gets a verbose URL

`serializeView` writes `cols` only when the columns differ from **that strike's** default
(`urlstate.ts:134`), so today a forefoot runner's untouched view serialises to
`?strike=forefoot` — nine characters. With `strike` gone, their columns no longer match the
heel default and serialise in full:

```
?cols=releasedAt,score,msrpGbp,forefoot-stack,plate,energy-return-forefoot,toebox-width-widest-part,weight
```

~110 characters for a *default* view, working against the compact, default-omitting property
`docs/app.md §URL encoding` is built on. Half the possible audience gets an ugly link for
having a different landing.

**Accepted, not fixed.** The remedy if it turns out to matter is a `side=forefoot` token that
is pure shorthand for "that side's default columns" — emitted only when the columns match a
side default exactly, expanded on read, with `ViewState` still carrying no strike. It is a
serialisation optimisation rather than the field returning. It is not built now because it
adds a second way to express one column set, in a parser whose stated job is to treat input
as hostile, and that is not worth paying speculatively.

## 5. What changes, file by file

| file | change |
|---|---|
| `lib/urlstate.ts` | `strike` off `ViewState`; `defaultView()`/`defaultColumns()` lose the parameter; `strike=` out of `serializeView` and `parseView`, with no compatibility branch (§4); `swapStrike` deleted; `isDefaultView` compares against a constant |
| `lib/presets.ts` | unchanged in shape — `applyPreset` keeps taking a side |
| `lib/persist.ts` | storage key bumped: the encoding changes |
| `Page.svelte` | `onStrike` re-derives from `(side, story)` rather than mutating a field; `selectedPreset` becomes a `(side, story)` match; a derived `strikeMark` |
| `components/Toolbar.svelte`, `SetupStrip.svelte` | take a derived mark that can be `null`, exactly as the story group already does |
| `components/FilterSidebar.svelte` | drops its `strike` prop — nothing in the sidebar depends on it since `· in use` was deleted |
| `docs/app.md` | §Presets, §View and URL ownership, §URL encoding |
| `docs/shoe-stories.md` | §Which half a story uses — the *story* still bounds one side; what changes is that the side is a selection rather than an identity |

## 6. What this is worth

- One fewer concept in `ViewState`, and the URL describes only filters, columns and sort.
- `defaultView()` becomes a constant, which is what `isDefaultView` always wanted.
- `swapStrike` — a function that exists only to paper over strike being a field — disappears.
- The two selection groups finally behave alike, which is the thing a user actually notices.

It also removes an inconsistency the previous pass introduced without meaning to: the setup
strip asks both questions as equals, and then one of the answers is permanent and the other
is not.

## 7. Testing

- A view is heel-marked, forefoot-marked or unmarked, and a mixed-side view is unmarked.
- Choosing a side re-derives columns and preset bounds without touching unrelated filters.
- Hand-editing a bound drops the side mark, exactly as it drops the story mark.
- `serializeView` never emits `strike=`; a round trip through `parseView` is lossless without it.
- `All` on a heel-marked view clears the filters and restores the heel columns; on a
  forefoot-marked view, the forefoot columns.
- **`All` on a mixed view clears the filters and leaves columns and sort exactly as they
  were.** This is the case a reader will get wrong, and the one a careless implementation
  will "tidy" into a full reset.
- `All` clears a filter the user set by hand, not only the preset's own — asserted, because
  it looks like a bug and is not.
- `serializeView` never emits `strike=`, and a legacy `?strike=forefoot` is simply ignored.
