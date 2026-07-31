# Mobile chrome design

The chrome below 800px is rebuilt as three bands, the toolbar above 800px
loses its second row, and the app gains one **About this table** panel that
owns every word of explanation the chrome used to scatter across three `?`
popovers. Nothing else moves: no URL encoding, no score constant, no filter
semantics, no dataset shape.

This supersedes the composition in
docs/superpowers/plans/2026-07-31-mobile-chrome-handoff.md. That handoff chose
"option C" — a single control rail with the story pills on a row of their own.
C survives as the identity line and the halved chrome; its rail is replaced,
because splitting the rail by *what the controls do* rather than by *what fits*
hands back the words C had to give up (§Two rows, not one rail).

Every figure below was measured — in the app on `main` for what is, in a
rendered rig carrying the app's tokens and webfonts for what is proposed. The
rig is not the components, so **the implementation re-measures rather than
trusting these**; they are here to be re-run and to say what the design was
sized against.

## The problem this fixes

`main` leaves the header ragged across the whole sub-800px band, not just on
phones. Trailing air in the header's widest row, against its own padding edge:

| width | 390 | 480 | 560 | 640 | 700 | 760 | 800 | 820 |
|---|---|---|---|---|---|---|---|---|
| air | 59 | 75 | 155 | 188 | **248** | 56 | 96 | 0 |

`@media (max-width: 800px)` deletes the header's spacer, so from 800 down
nothing pushes the credit right and every item packs left and wraps at its
natural width. At 700px the header spends a whole second row on three buttons
while 248px of row one sits empty. Chrome totals 198px at 360px with the story
pills up, and 130px at 900px.

## Two rows, not one rail

Below 800px the chrome is three bands:

1. **Identity.** Wordmark at the left margin. Opposite it, right-aligned, a
   provenance block: the catalogue count over the RunRepeat credit, the credit
   on one line. 303px of content at 360px, 41px spare.
2. **Control row** — everything that *acts on* the table: `About`, Filters and
   Columns as icons, then the trailing edge holds copy, export and theme as
   icons. 254px of content against 344px, so 90px of slack sits in the middle
   and the utilities stay flush right at every width.
3. **Setup row** — what the table *is*: the zone group, the story group, the
   stability pill, in that order.

The split is what buys the words back. A single rail carrying the preference
*and* the utilities *and* Filters *and* Columns needs 350px of the 344px a
360px screen has, which is why the handoff's C reduced Filters and Columns to
icons **and** shortened the preference. Moving the preference down to band 3
leaves band 2 with room to spare — and band 3 is then the row that carries all
the colour and all the words, which is the row that says what you are looking
at.

Chrome measures **118px** at 360, 390 and 430 — the same as C with its pill
row, and down from 198px on `main`.

### Band 3 fills its row, and stops

At 360px the three groups need 353px at the pills' 6px inline padding against
344px available — 9px over. The padding steps to 4px at or below 374.98px,
where they measure 323px.

| width | 430 | 500 | 560 | 629 |
|---|---|---|---|---|
| `space-between` | 36px gaps | 71 | 101 | 135 |
| **capped at 414px, centred** | 36px, flush | 37, centred | 37 | 37 |

Up to 429.98px the row is `space-between` and flush to both edges. From 430px
it stops widening — `max-width: 414px; margin-inline: auto` — holding the
spacing it has at 430 and centring in whatever room is left. 414px is band 3's
content width at a 430px viewport, so the rule is "keep the 430 look and never
get looser than it". `space-around` was measured and rejected: it never touches
the padding edge again at any width, including 430, where it would tighten the
gaps to 26px and inset the row 10px from both sides.

### 700px merges bands 2 and 3

One line needs 613px of content, so it fits from 629px. The boundary is set at
**700px** rather than 629 to leave the merged line air rather than starting it
at its own minimum. Above it there is no slack to distribute and the question
of how to fill the row stops existing: what the table is on the left, what you
do to it on the right, one band. Chrome drops to **83px**.

### Above 800px the masthead is untouched

The masthead keeps exactly the form the visual-polish pass settled — worded
`Copy link`, `Export CSV`, the theme cycle, the stacked credit. Only the
toolbar changes, and only by losing its second row:

`zone · story · stability` — spacer — `About` `Columns`

Filters is absent here because the sidebar is permanent above 800px and the
drawer toggle has nothing to toggle. Losing the second row is worth roughly
**40px** at 900px — 130px measured on `main` against 92px in the rig.

### Boundaries

`800px` is the existing sidebar boundary and is reused unchanged, so exactly
800 stays "mobile" as it is today. The three new ones take the repo's
`.98` convention so no width matches two tiers at once
(docs/app.md §Presets has the reason).

| query | what changes |
|---|---|
| `max-width: 800px` | the new banner replaces the masthead; toolbar becomes one merged line |
| `max-width: 699.98px` | the toolbar splits into control row and setup row |
| `max-width: 429.98px` | band 3 drops the cap and goes flush `space-between` |
| `max-width: 374.98px` | pill inline padding 6px → 4px |

`609.98px` and `879.98px` go: the first sized pill padding, the second ordered
the actions and hid the group divider, and neither survives the rebuild.

## The stability preference becomes a pill

A single segmented pill labelled `Stability`, in the same family as the two
groups it now stands with, accent-filled when on, carrying `aria-pressed`.

The checkbox goes, its `?` goes, and its caption goes. That is 21px of row
returned by the `?` alone, and a whole toolbar row returned by the caption.

`Stability matters to me` is a statement about the runner rather than about the
search. Renaming it to a verb phrase was considered and is unnecessary: as a
pill answering a question the way `Heel` and `Easy` do beside it, the bare noun
is neither a statement about the runner nor about the search.

## The About panel

One modal at every width, reusing `AddFilterDialog`'s pattern rather than
`HelpPopover`'s: appended to `<body>`, scrim, centred, `min(28rem, 92vw)` wide,
`max-height: 80vh`, the body scrolling inside a frame that keeps the title and
`Close` fixed, dismissed by `Close`, Escape or an outside press, focus trapped
and returned to the opener.

Opened from two places: the `About` button on the control row, and a line under
the setup strip's cards (§The setup strip).

**Title:** About this table
**Lede:** Shoe Lab compares running shoes on RunRepeat's lab tests.

**Measured at** — Stack, energy return, shock absorption and midsole width are
measured at the heel and at the forefoot. Pick which end the table and scoring
use — usually the one you land on.

**Easy, Tempo and Race**

- Each score transforms and weights the lab metrics that matter for that kind
  of run, and sets the columns to match. All clears them.
- Price and release date are not factored in.
- Expand a row for the breakdown. A shoe missing a metric is unscored, and
  sorts last.
- The RunRepeat Score column is their verdict, not ours.

**Stability** — Adds midsole width and heel counter stiffness to the Easy and
Tempo scores. Not Race: race shoes are all tall and narrow.

**Foot:** Lab data by RunRepeat ↗ (link), and `Close`.

120 words, against 196 across the three popovers it replaces. The three
sections map one-to-one onto the three controls on band 3, so the panel reads
as a key to the row it explains.

Two claims were cut for being false rather than long. "Every number here was
measured rather than given by a reviewer" is contradicted twice on the same
screen — the `RunRepeat Score` column is precisely a reviewer's verdict, and
the Easy, Tempo and Race columns are computed by us. The word *story* never
appears: it is this project's word for a preset, not a runner's.

Bounds: the body must not scroll at **390×844** (most phones) or **900×740**.
At **390×667** (iPhone SE) it overflows by 2px at `max-height: 80vh`, which is
a rounding artefact rather than hidden content and is accepted.

## The setup strip

The strip's two `?` popovers are deleted. In their place, one line under the
cards, spanning the grid:

> New here? **Read about this table ↗**

It opens the About panel. One body of explanation to keep true, and the offer
is made in words on the screen where a first arrival is standing, rather than
in a punctuation mark.

`HelpPopover.svelte` has no consumer left and is deleted with its test. The
per-metric help that BACKLOG.md contemplates would reintroduce it from git
history; it is not kept alive on that basis.

### The pill is not on screen while the strip is up

While the strip is up there are no story pills, so band 3 would hold the
stability pill and nothing else. It holds nothing instead: the control row
carries `About`, Filters, Columns and the utilities, and band 3 appears with
the zone and story groups when the strip hands over.

This is not a compromise for layout. With `All` selected there is no score
column on screen, and the preference only ever changes a score — so it is
currently offered at the one moment it provably cannot do anything. The cost is
one extra press for a runner who lands knowing they want it, on the first visit
only.

## Where the utilities live

Copy link, Export CSV and the theme cycle are worded in the masthead above
800px and icons on the control row below it — two different parents, so one
node cannot serve both. The markup is written **once**, as a snippet, and
instantiated in both hosts with CSS hiding the wrong one; `display: none`
keeps the hidden instance out of the accessibility tree, so no control has two
accessible names. The copy confirmation stays an always-rendered `role="status"`
riding with the button, empty until it has something to say.

If the implementation finds a structure that renders them once — one chrome
container laying every band out from a single DOM order — that is better and
should be taken; the e2e row counter walks `header` and toolbar children
separately and would need rewriting either way.

Every icon-only control keeps the accessible name its worded form had: `Copy
link`, `Export CSV`, `Toggle theme (currently <theme>)`, `Filters` with its
`aria-expanded`/`aria-controls`, and Columns naming its count.

## What must stay true

- The RunRepeat attribution stays a permanent, visible, immediately-clickable
  link (docs/decisions.md §Be a good citizen toward RunRepeat). It moves within
  the chrome and is never hidden, deferred, or reduced to an icon.
- `--thead-top` stays measured and ResizeObserver-backed, and the pinned table
  header stays flush **after `document.fonts.ready`**.
- The chrome never adds a row that a narrower window hands back. The new bands
  go three rows below 700px and two above it, so the ladder is monotone as
  width grows; the existing e2e guard walks it and must stay green across the
  new boundaries as well as the old.
- Everything the visual-polish spec settles stays: Inter Tight and JetBrains
  Mono, the accent pair, the wash constants, one focus ring.

Two existing e2e tests are written against structure this removes and are
rewritten rather than patched: the one asserting the preference never sits
below the actions (the preference is no longer on that row), and the one
walking the toolbar's tiers (the tiers are new).

New bounds worth asserting, each a number rather than a look: band 2 fits at
360px; band 3 is flush at 430px and centred above it; the merged line is one
row at 700px; the chrome never exceeds 118px below 700px; every icon control
has an accessible name; the About panel opens from both entry points and
returns focus to whichever opened it.

## Decisions

### The group divider goes

`main` draws a hairline between the zone and story groups above 880px. With the
stability pill joining that run, a divider between the first and second of
three reads as arbitrary, and no band below 800px has one — so the same row
would look different either side of that boundary. It is deleted at every
width. Reversible: if it should stay, it belongs between the story group and
the pill, which is where the grouping actually breaks.

### The merge boundary is 700px, not 629px

The merged line fits from 629px. Starting it there would open it at its own
minimum, with every element hard against its neighbour on the first width that
allows it. 700px gives the line air on the day it appears, and leaves the
capped band a clean 430–700 range.

### `space-between` below 430px, capped above it

Flush to both edges is the property the whole rebuild exists to restore, and
below 430px there is no slack worth distributing anyway. Above it, growing
gaps stop meaning anything: at 700px `space-between` opens 171px between
groups and strands the pill alone at the far edge. Capping keeps the spacing
that was signed off at 430 and centres the surplus, at the cost of a band whose
row is inset while the two above it are flush.

### The panel is a dialog, not a popover

`HelpPopover` lands as a bottom sheet below 700px and a small anchored panel
above it, sized for two sentences. This content is four sections and is read
whole, so it takes the modal pattern instead — and taking `AddFilterDialog`'s
means the focus trap, the scrim, the stacking order and the `<body>` mount are
already solved and already tested (docs/app.md §Stacking order).
