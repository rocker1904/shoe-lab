# Released after: a month picker that exists in every browser

Frozen build-time artifact. Where this disagrees with docs/, docs/ wins.

## The problem, measured

`Released after` is an `<input type="month">`. Chromium renders a spinner with
a calendar button. **Firefox and WebKit implement neither**: both reflect the
type back as `text`, so the control is a bare box with no picker, no format
hint and no validation. Measured in Firefox 153:

```
monthSupported: false   renderedType: 'text'   size: 180x24
```

The failure is worse than cosmetic. `oninput` runs
`startOfMonth(e.currentTarget.value)`, which is `iso.slice(0, 7) + '-01'`, so
typing `July 2024` yields the bound `"July 20-01"` — a filter that silently
compares wrong. Only someone who knows to type `2024-07` gets a correct answer.

A Chromium-only e2e suite reported this working for as long as it has existed.

## The control

A trigger button plus a popover, replacing the input. The chips
(`Any` `1y` `2y` `3y`) are untouched.

**Trigger** — reads `July 2024`, or `Any month` when unset. Carries
`aria-expanded` and `aria-haspopup="dialog"`. The month name comes from a
`monthLabel` helper extracted from `displayReleaseDate` in
`lib/release-date.ts`, so one `MONTHS` array serves both.

**Panel** — `position: absolute` under the trigger, `z-index: 20` inside the
sidebar's own stacking context, sized `width: 100%` with `border-box` so it
matches the column — the sidebar's `overflow-y` makes `overflow-x` compute to
`auto`, and a fixed 15rem panel was measured losing its fourth column. A year
stepper `‹ 2024 ›` over a month grid of twelve buttons.

Built first as a `role="radiogroup"` driven by the existing `lib/roving.ts`, and
changed after review: that action activates whatever it moves to, so one arrow
press committed a bound and closed the panel. It is now a `role="grid"` with its
own key handler — arrows move focus, Enter and Space commit through the buttons'
own semantics (docs/app.md §Released after is month-granular).

Both stepper arrows disable at the ends of the fleet's real range, and months
outside it are disabled. Empty months *inside* the range stay enabled: for an
"after" bound an empty month is still a meaningful cut, and the fleet has 8
shoes across 2015–2020, so disabling by coverage would grey out most of the
list and read as broken.

**Closing** — selecting a month, Escape, or toggling the trigger; focus returns
to the trigger every time. Escape calls `stopPropagation`, because below 800px
the sidebar is itself a drawer and one Escape must not dismiss both — the same
reason `HelpPopover` and `AddFilterDialog` do it. A `focusout` guard closes the
panel when focus leaves it.

## What does not change

`filters.releasedAfter`, `startOfMonth`, and the `after=YYYY-MM` URL token are
all untouched. This is a control swap, and
docs/app.md §Released after is month-granular stays true as written.
Nothing about view state, the URL, or `applyFilters` moves.

## Why not a portal

`AddFilterDialog` had to move to `<body>` because it is a centred modal wider
than the sidebar (docs/app.md §Stacking order). This panel is neither. Measured:
the section sits near the top of the sidebar's scroll content, so the 150px
panel below it is never clipped at any viewport height the layout supports, and
at the column's own width it never reaches the table. It needs no portal and no entry on the
stacking scale beyond outranking its siblings.

## Why not two selects

Considered and rejected by the human: a year and a month `<select>` would work
identically everywhere for far less code, but reads as a form control rather
than a picker.

## Range

Derived from the fleet's `releasedAt` values, not frozen: 2015-02 to 2026-08
today, 445 of 450 shoes dated. This is a UI affordance, not a score constant,
so docs/decisions.md §Frozen scores and live thresholds does not apply — the
sidebar already derives its brand list and every histogram from the loaded
fleet.

## Testing

Unit, in jsdom:

- the trigger reads the bound's month, and `Any month` when there is none
- opening seeds the year from the current bound, and from the fleet's latest
  year when there is none
- the stepper moves the year and disables at both ends of the fleet range
- picking a month emits `YYYY-MM-01`
- Escape closes and returns focus to the trigger
- months outside the fleet range are disabled

Cross-browser, in `e2e/cross-browser.spec.ts`, running in Firefox and WebKit:
setting a bound through the picker reaches the URL as `after=YYYY-MM`. This is
the assertion the old control could not have passed as a picker, and the reason
those two engines are in CI at all
(docs/operations.md §The e2e run needs three browsers).
