# Visual polish design

A whole-app visual pass: a real typeface, a surface and elevation language, a
retuned accent and wash, and a rebuilt phone rendering. **Behaviour is out of
scope.** Everything the app does — colour-graded cells, histogram range rows,
roving radiogroups, the sanitised-HTML boundary, URL-as-view, frozen scores,
leave-one-out exclusion counts — survives unchanged. Three exceptions are
called out below and each is a deliberate decision, not a side effect: the
white-numeral wash is illegal and goes, the header stops counting the visible
fleet, and the phone column minimum drops.

Every number here was measured, in Firefox and Chromium, against the live app
or a rendered rig. Where a figure decided something, the measurement is given
so it can be re-run rather than trusted.

## Chassis

The direction is **instrument**: high density, hairline separation, one soft
shadow, figures on a true grid. Rank is read from position and number; colour
confirms it rather than carrying it. Two directions were built and rejected —
an editorial one (serif wordmark and shoe names, warm paper, rank carried by
type weight) and a sport one (wide grotesque, cobalt, full-strength wash) —
and the accent and ramp below are where the sport direction's energy was
absorbed.

## Type

| role | face |
|---|---|
| UI, body, headings, labels | Inter Tight |
| every figure, unit line, badge, count | JetBrains Mono |

Self-hosted woff2 in `app/public/`, not a CDN link: the app has no runtime
dependency and a third-party font request is one. Both faces are subset to
Latin. Weights: Inter Tight 400/500/600/700, JetBrains Mono 400/500.

New tokens carry both stacks. `app/src/lib/tokens.test.ts` already fails the
build on a component writing its own rem font size or px radius, so both
families and every size stay in `app.css`.

### Inter Tight is ~10% narrower than system-ui, and that is load-bearing

Measured at the phone header spec (12px, weight 600, letter-spacing -0.02em),
widest word per catalogue test name, over all 43 tests:

- `Shock absorption` 100.3px → 91.2px
- mean change **-10.1%**, worst case -0.6px — nothing gets wider
- against today's 53px text budget: **13 names need a short label under
  system-ui, 6 under Inter Tight**

Two consequences.

**`labels.ts` must be re-measured, and `SHORT_LABELS` shrinks.** Seven entries
come back inside the bound: `Toebox durability`, `Heel padding durability`,
`Outsole durability`, `Outsole thickness`, `Insole thickness`,
`Flexibility / Stiffness`, `Reflective elements`. Six of them can be deleted.
**`outsole-durability` keeps `Outsole wear`** — that entry was never a length
fix; the test is Dremel dent depth in mm, so "durability" contradicts its own
units, and that divergence from RunRepeat's name is deliberate.

**The bound becomes deterministic.** `system-ui` resolves to a different face
per OS, so the widths `labels.ts` validates against are only true on the
machine that measured them. A self-hosted face makes the assertion mean the
same thing everywhere, which is what makes the phone geometry a contract
rather than an observation.

## Colour

Neutral surfaces are warm-grey. The page sits behind the chrome and two behind
the row surface, preserving the existing ordering.

| token | light | dark |
|---|---|---|
| `--bg` | `#f5f5f4` | `#0f1113` |
| `--chrome` | `#fbfbfa` | `#15181b` |
| `--surface` | `#ffffff` | `#1a1d21` |
| `--border` | `#e5e5e3` | `#282c31` |
| `--border-soft` | `#eeeeec` | `#22262a` |
| `--text` | `#16181b` | `#eceef1` |
| `--text-dim` | `#6a7280` | `#98a0ab` |

Dark lifts off near-black: `#0f1113` page against a `#1a1d21` surface, where
today's `#08090c`/`#0e1014` is nearly pure black and drives the wash to mud.

### Accent

**Azure.** `hsl(211 84% 46%)` light, `hsl(211 70% 54%)` dark. It carries the
selected segment pill, in-range histogram bars, links, and focus rings — small
marks only.

### The wash

The **fill is not the accent**, because large translucent areas need less
chroma than small solid marks:

| | light | dark |
|---|---|---|
| ranked (blue) fill | `hsl(211 84% 50%)` | `hsl(211 70% 44%)` |

Dark is **darker** than light, not lighter. On a near-black surface the wash
must stay dark enough for light text to sit on it; a lighter dark-mode wash
fails contrast at the top of the ramp.

Alpha as a function of percentile `p`:

```
a(p) = max(0, (p - 0.15) / 0.85) ^ 1.8 * 0.94
```

`0.15` is the floor — below it a cell is bare. `1.8` is the curve. `0.94` is
the peak. Cells below `a = 0.015` paint nothing rather than a near-invisible
tint.

**The neutral grey ramp stays linear** (`a = p * 0.34`). A metric with no
better end is a scale and must read as a gradient; only a ranked metric may
read as a podium. This distinction is the whole reason there are two ramps and
must survive any retune.

### One ink, always — no white-numeral flip

Cell text is the theme's own colour at every step of the ramp. **A ramp that
switches ink cannot satisfy 4.5:1 anywhere near the switch**, and this is
arithmetic rather than a tuning problem: such a ramp must pass through a
crossover luminance where both inks are equally bad, and the best contrast
obtainable there is

| dark ink | best possible at the crossover |
|---|---|
| `#16181b` (the theme's) | **4.22:1** |
| `#0f1113` | 4.35:1 |
| pure black | 4.58:1 |

No hue, saturation, lightness or curve rescues it. A design that flipped to
white above `a = 0.66` measured a **worst point of 2.68:1 at p = 0.85** in
light and 4.02:1 in dark.

With one ink, contrast falls monotonically as the wash strengthens, so the
endpoint genuinely is the ramp's worst case — which is exactly the reasoning
docs/app.md §Theming already gives. That rule was correct; the flip broke its
premise. **Do not reintroduce a second ink without redoing this arithmetic.**

Measured worst point across the whole ramp under this design:

| | worst | at |
|---|---|---|
| light | **4.73:1** | p = 1 |
| dark | **4.80:1** | p = 1 |

The light fill has headroom: `hsl(211 84% 50%)` tolerates a peak up to 0.973.
Keeping the fill at `46%` would have capped the peak at 0.890.

## Elevation

Three planes, and the rule is **elevation follows what is pinned**:

```
page  <  table surface  <  pinned header
```

Today this is inverted on the phone — shoe cards sit on `--surface` while the
sticky column header sits on `--bg`, so the thing that scrolls is painted
above the thing that does not. Two shadows: `--shadow-panel`
(`0 1px 2px rgb(0 0 0 / .05)`, none in dark, where the surface step carries
it) and `--shadow-sticky` (`0 4px 10px -6px`), which the pinned header casts
onto rows sliding under it.

## Header

**Attribution is a masthead credit**, right-aligned: a 9px uppercase
`LAB DATA BY` over `RunRepeat ↗` at normal text weight, with an outbound
arrow. The micro-label does the explaining, so the name is set in plain text
and no link colour competes with the wash.

This stays a permanent, visible, immediately-clickable link, because
docs/decisions.md §Be a good citizen toward RunRepeat makes it structural
rather than decorative and forbids removing or defer-loading it. Moving it to
a footer, a menu or a tooltip is out of bounds.

The date renders as `27 Jul 2026`, not `2026-07-27`.

### The header stops counting the visible fleet

The header currently says `378 of 450 shoes` a centimetre above the receipt's
`Showing 378 of the 378 shoes left by your other filters`. Both are correct
and they answer different questions, but nothing on screen says so, so it
reads as the app contradicting itself.

**The header's number becomes a fact about the catalogue** — `450 shoes` —
which does not move under filtering. The **receipt keeps its wording
unchanged** and remains the only thing that counts what a filter did.
`Header.svelte` drops its `visible` prop.

`Header.svelte` and `Receipt.svelte` are each mounted once in `Page.svelte`,
outside the `{#if phone}` switch, so this is one edit and both renderings
change together.

## Desktop table

The table sits in a rounded `--surface` container with a hairline and
`--shadow-panel`. Figures are JetBrains Mono with `tabular-nums`, right-aligned
as today. Header names are Inter Tight 600; the units-and-direction line is
JetBrains Mono at `--t-xs`.

**Row thumbnails are removed.** At 40×27 with `object-fit: cover` every shoe
crops to an indistinguishable grey strip; they cost a column of width and
carry no information at that size. `imageUrl` stays in the dataset and in the
detail panel.

### The direction arrow leaves the header

`headerUnits` stops appending `directionOf`'s `↑`/`↓`. The units line becomes
units alone; the sorted column carries a single accent caret beside its name,
revealed on hover for any other sortable header.

Two arrows in one header is the visible problem — a descending caret directly
above an "up is better" arrow is worse than either alone. The reason it is
safe to drop is that **the wash already encodes direction**: `percentileMap`
inverts for a `lower` metric, so on price and weight the strongest blue sits on
the *lowest* numbers. Which end of a column is tinted is the same fact the
arrow was stating, and blue-versus-grey still separates "has a better end" from
"neutral scale".

The cost is that direction becomes a colour-only signal in the table, so the
fact moves rather than disappears: **the column picker and the add-filter
dialog carry it**, which is where a metric is chosen and the better end is
most useful. Those lists have no sort control, so there is no second arrow to
collide with.

Mechanically this is small and it removes a coupling. `headerUnits` has exactly
two consumers, both table renderings; nothing else reads it and the CSV export
does not. The `ARROW` map and the `directionOf` import leave `units.ts` for
`direction.ts`, so units are units and direction is direction.
`directionOf`'s other consumers — the percentile inversion in `stats.ts` and
`washOf` — are untouched. docs/app.md §Table presentation must be updated: it
currently states the arrow is `directionOf`'s.

The `discontinued` chip becomes a neutral uppercase micro-label in
`--text-dim` with a hairline border. Red is error semantics and this is
metadata — and dimming or alarming the row argues against the
`discontinued=only` filter, which exists because those shoes are worth
finding.

## Phone rendering

**A list, not cards.** The per-shoe card is dropped: the name sits on the page
with the chip row beneath it and a hairline between shoes. Proximity does the
grouping — there is more space above a name than between it and its own chips
— and this recovers roughly one shoe per screen against the card layout, which
is the direct cost docs/app.md flags for the two-row geometry.

**Values stay centred.** Right-alignment was built and compared; with mono
digits it aligns decimal points, but centred reads better at this density
where the wash is doing most of the parsing work.

**The whole list sits in one panel** — a single inset, rounded, hairline
`--surface` container with the sticky header at its top. One card for the
table, not one per shoe: it supplies the missing depth without spending any of
the density, and it matches the desktop chassis.

### The column minimum drops to 53px

Six 57px columns need 356px of a 360px screen, which is why the table
currently bleeds edge-to-edge — there is no margin for an inset panel. Inter
Tight pays for it:

| text budget | column | names needing a short label, system-ui | Inter Tight |
|---|---|---|---|
| 53px | 57px | 13 (today) | 6 |
| 49px | **53px** | 20 | **9** |
| 47px | 51px | 27 | 15 |

At a 53px column Inter Tight still needs fewer short labels than today's 57px
column does under system-ui. Six columns then need **332px**, leaving 28px
spare at 360px — enough for a 12px inset each side. Past six columns the
minimum holds and the page scrolls, as today.

### The lid belongs to the pinned header

The panel's top border and its two top corner radii go on the **sticky header
row**, not on the panel. Otherwise the panel's lid scrolls up and out from
under the pinned header and the box stays visibly open at the top for the rest
of the session.

### Two overflow constraints, both measured

The header cell itself is **square** — no `border-radius`. A rounded opaque
cell over scrolling content leaves its corner arcs transparent, and a coloured
chip passing behind shows through as a sliver. The panel does the rounding and
clips the square cell.

Which clip is not a free choice:

| on the panel | sticky header | columns past the sixth |
|---|---|---|
| `overflow: hidden` | **breaks** — lands 19px out of place | **unreachable** |
| `overflow: clip` | works | **unreachable** (`maxScrollLeft` 0) |
| `overflow-x: visible; overflow-y: clip` | works | reachable (`maxScrollLeft` 243) |

`overflow: hidden` makes the panel a scroll container, which is the same
failure mode docs/app.md records for `.content` and `overflow-x`. Plain
`overflow: clip` is the trap: it looks correct on a default six-column view
and silently swallows every column past the sixth.

**Use `overflow-x: visible; overflow-y: clip`.** Identical in both engines, at
rest and scrolled.

## The webfont makes `--thead-top` time-varying

docs/app.md §Columns and sorting already requires `--thead-top` to be measured
rather than assumed, on the grounds that the chrome's height varies with
*width*. A webfont makes it vary with *time* as well: the face swaps in after
first paint, the chrome reflows, and a header pinned against a value measured
before the swap leaves a strip of page that rows visibly scroll through.
Measured here: 75px before the swap, 69px after — a **6px** gap.

The current implementation survives this because `bind:clientHeight` is
ResizeObserver-backed and re-measures on the reflow. That property is now
load-bearing in a way it was not, so it must be stated rather than relied on
by luck, and asserted: **the e2e run checks the pinned header sits flush
against the chrome after `document.fonts.ready`.** A future refactor to a
one-shot `clientHeight` read reintroduces this, and only on a cold cache.

`font-display` and whether to preload the woff2 are implementation choices
that narrow the window in which the swap is visible; they do not remove the
requirement.

## The filter sidebar

**Unbounded, not panelled.** The table sits in a panel; the sidebar does not.
It is a control surface rather than content, and two panels side by side read
as a settings dialog.

A set bound is drawn as **two accent edge lines**, not a shaded band, and the
**drag grips stay hover-revealed** — fading in on row hover or focus-within,
and permanently visible under `@media (hover: none)`, where hover never fires.

Also settled: the number fields are **mono and right-aligned**, so a typed
bound lines up against its placeholder; the clear control is an **SVG ✕ in a
bordered button** rather than a text glyph; and `N excluded` and
`378 / 450 measured` are both mono, so every figure in the sidebar shares the
grid with every figure in the table.

### Two defects this pass fixes

**An unbounded row painted every bar in the accent.** "In range" is trivially
true when there is no bound, so a sidebar with no filters set was a solid wall
of blue — which was most of what made it noisy. Accent now means *your bound
selects this*: an unbounded row draws its distribution in the neutral
histogram colour and colour appears only once a bound exists. Scanning the
sidebar then answers "what is constraining this shortlist?" in colour as well
as in the existing bold heading.

**The number placeholders were unrounded floats.** They are `String(extent.min)`,
so shock absorption offered `24.884597678267` and overflowed its own field.
Round at the view, like every other figure (docs/app.md §Number display).

## The setup strip

Structure is unchanged — six equal cards, two groups divided in the gutter, a
`?` per label, and a fixed-height name line that puts every description on a
common baseline.

A chosen card is **tinted with a hairline accent border**, not filled. Two
cards are lit at once here, a side and a story, and a filled pair would put two
loud blocks on the one screen the strip exists to own — even though the toolbar
it hands over to does fill its selected pill.

The side cards carry no description, so their name must **centre vertically**
in a box whose height is set by the story cards beside it.

## Controls

**The Columns control stops being a bare `<details>` marker.** A button with a
chevron icon and the count in a neutral badge, so the label stops changing
width as columns are ticked. Quiet styling — surface fill, hairline border,
no accent.

Segmented radiogroups keep their structure and roving-focus behaviour
(`lib/roving.ts`, four groups, arrow keys, one tab stop). Visually: a
`--bg`-filled track with a 2px pad, and the selected pill filled in the accent
with white text.

Histograms keep their form. In-range bars take the accent **only while a bound
exists**; every other bar keeps `--hist-dim`, which must continue to clear
**3:1 against the surface** — that is a flat mark, governed by a different rule
from the gradient wash (docs/app.md §Theming).

**The theme toggle becomes an icon button** with an SVG per state. It keeps
cycling auto → light → dark rather than becoming a two-way switch, because
there are three states; a three-way segmented control was rejected on header
width.

### One focus ring, everywhere

A **2px surface-coloured ring inside a 2px accent ring**, drawn with
`box-shadow` rather than `outline` so both rings are painted rather than
transparent.

The reason is the hard case: a chip sitting on a strong wash, and the selected
segment pill, which is itself filled with the accent. A plain
`outline: 2px solid var(--accent); outline-offset: 2px` leaves the 2px gap
showing *whatever is behind*, so on a 0.93-alpha chip the ring sits
accent-on-accent and nearly disappears. Painting the gap in the surface colour
guarantees separation on any background — the same trick the phone's sticky
header already uses on its own `border-spacing` gaps.

This replaces today's inconsistent mix of `outline-offset: -2px` and `+2px`.
It is one rule for every focusable thing: buttons, pills, inputs, chips, table
rows, strip cards.

## Not specified here

The detail panel, help popover, column picker panel, add-filter dialog, the
sub-800px drawer and the loading, empty and error states are **not yet
designed**. They inherit the tokens — surfaces, radii, type scale, focus ring,
accent — and keep their current layouts until they get their own pass.

Two of them carry known work already:

- The **column picker and add-filter dialog** gain the direction marker the
  table header gives up (§The direction arrow leaves the header). A bare
  `↑` with no units beside it is ambiguous, so those lists need a legend line
  or a worded tag rather than the glyph alone.
- The **loading skeleton** is shaped like the chrome and the rows that are
  coming, so the layout does not jump when data arrives. Row height, the
  dropped thumbnails and the new panel all change that shape, and a skeleton
  that no longer matches *causes* the jump it exists to prevent. This is a
  correctness follow-on, not a taste call.

## Verification

- `tokens.test.ts` — extend to the new type tokens; no component names a font
  family or size directly.
- `labels.ts` / `labels.test.ts` — re-measure the width bound against Inter
  Tight; delete the six short labels that no longer earn their place; keep
  `Outsole wear`.
- A contrast test over the ramp: sample `p` across `[0, 1]`, composite the
  fill over the surface at `a(p)`, assert the theme ink clears 4.5:1 at every
  step in both themes. This is the guard that makes the single-ink rule
  enforceable rather than remembered.
- e2e at 360px and 390px: six columns fit, nothing clips, the page does not
  scroll sideways at six columns, and columns past the sixth remain reachable.
- e2e: the pinned header sits flush against the chrome after
  `document.fonts.ready`.
- `units.test.ts` — `headerUnits` no longer emits a direction arrow for any
  key, including the `lower` and `higher` ones that carried it.
- A sidebar test that an unbounded row paints no accent bar, and that a bounded
  one paints accent only within its bound.
- Both engines. The e2e run already covers chromium, firefox and webkit
  (docs/operations.md §The e2e run needs three browsers).
