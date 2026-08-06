# Metric guide in the column picker

status: approved, in delivery

## Purpose and scope

Close BACKLOG.md item **Consider metric help in the column picker** without
turning every compact checkbox row into a two-action row. The Columns panel
gains one entry point that replaces its checklist with a read-only metric guide
inside the same panel. The guide reuses the factual range-metric registry from
docs/app.md §Filters; it authors no second explanation and adds no per-row help
control to column-selection mode.

The explicit method-retirement feature is a delivery dependency. Its lifecycle
modifiers and compact retired labels are the checklist baseline this feature
must preserve at 360px.

## Policies

- docs/policies.md §Vocabulary: visible metric names, lifecycle modifiers,
  explanation facts, source links and direction sentences keep their existing
  owners; the guide only looks them up.
- docs/policies.md §Interaction chrome: the guide remains inside the existing
  native Columns disclosure, so outside press, Escape and focus-leave continue
  to dismiss one panel and deliberately restore focus.
- docs/policies.md §Compatibility floor: the checklist and guide are guarded at
  360px in Chromium, Firefox and WebKit; below that the existing scrollable
  degradation remains the contract.
- docs/policies.md §State ownership and validation: guide mode, query and open
  explanation are ephemeral component state. They never enter `ViewState`, the
  URL, history or storage.
- docs/policies.md §Announcement: guide controls rely on their native names,
  focus and expanded state. They change no view and add nothing to the live
  announcement region.
- docs/policies.md §Identity and sharing: switching picker mode cannot change
  the address or the table a recipient sees.
- docs/policies.md §Third parties and cost: the guide uses the fetched catalogue
  and the committed help registry only; it adds no request, crawl, dependency
  or standing cost.
- docs/decisions.md §Testing bar: adversarial, no live network: browser and unit
  evidence use the local app fixtures only.

No policy is undecided and no policy changes.

## Decisions

### One panel, two mutually exclusive modes

Columns remains one native `<details>` and one floating panel. Its normal mode
is the existing checklist. One guide entry point, outside the checklist
scrollport, switches the panel body to a guide; a Back control switches it to
the checklist again. No dialog, popover, scrim or top-layer node is introduced.

The two lists are not mounted together. Entering the guide records the
checklist's scroll position before replacing it; Back remounts the checklist at
that position. Column selections are held by `Page.svelte` and therefore remain
unchanged regardless. Any dismissal or native summary close resets the next
open to checklist mode rather than reopening a secondary surface behind a
control still named Columns.

The guide is read-only. It contains no checkbox and cannot add, remove, sort or
filter a column. A runner returns to the checklist to change the view.

### The existing registry decides what earns a guide row

A guide row exists exactly when `metricHelpOf(key)` returns a fact for the
column offer's selected key. That includes the existing RunRepeat Score and
price facts and the published numeric range metrics the registry covers. It
excludes release date, plate, categorical tests, Shoe Lab's derived story
scores and an unknown future metric until a fact is authored in the registry.
Absence removes the whole guide row and leaves no disabled control or gap, the
same permissive failure posture as `MetricHelp`.

The guide receives the exact column-offer key and visible label. A superseded
pair therefore follows the generation selected in `view.generations`, including
the lifecycle-explicit modifier delivered by the method-retirement feature, and
looks up that generation's own method fact. A colocated family keeps its
separately offered parts.

The expanded body renders the registry's factual text, the sentence returned by
`metricInterpretation(key)`, and the registry's source link when it has one. It
does not instantiate `MetricHelp`: that component owns an anchored popover and
another trigger, neither of which belongs inside the guide.

### Browse first, search second

With an empty query, guide sections preserve the checklist's rendered order and
group headings. Fixed explained fields keep their position before the
catalogue groups. `Other` remains the fallback for an absent or unknown group.

Search is a case-insensitive substring over the visible guide label, including
its selected lifecycle modifier. Matches remain in their original order but
render as one flat result list, because headings around isolated matches add
distance without helping location. Whitespace-only input is the empty query. A
non-empty query with no match gets the same explicit empty-result treatment as
the Add-filter search.

Opening the guide does not focus the search input. Focus moves to a programmatic
heading that is not part of sequential navigation, so assistive technology is
told that the context changed without a phone opening its software keyboard.
Forward Tab reaches search; reverse Tab reaches Back. Back returns focus to the
remounted guide entry point.

### One explanation opens at a time

Every guide row is one disclosure button with its visible metric label and
native expanded state. All start collapsed. Opening one closes the previous
one; closing the open row leaves none expanded. Search also closes an expanded
row that is no longer among the matches.

This is the one place explanatory prose may make a row tall. Collapsed guide
rows remain compact, and the checklist receives no new grid track, icon,
explanation, accessible description or per-row focus stop.

### The current panel footprint is the bound

At 360px the current Columns panel measures 346px wide by 402px tall in
Chromium, with a 320px checklist row and 182.8px available to its name track.
The guide entry point sits outside the scrollport but does not grow that outer
402px height: its measured block size is deducted from the checklist viewport.
This trades roughly two visible checklist rows for a stable floating panel and
leaves every checklist row's horizontal geometry untouched.

Guide mode uses the same scrollport slot and `.scrollport` reservation. Its
collapsed rows and search must not introduce horizontal overflow; source links
and explanatory prose wrap inside the expanded row. The panel retains the
existing on-screen horizontal geometry at every supported width and the
existing below-360 degradation.

## Success bounds

- Column-selection mode adds exactly one sequential focus stop: the shared
  guide entry point. Each column row keeps its checkbox as its only stop and its
  accessible name, checked state, direction and coverage unchanged.
- At 360px, the checklist's row width and name-track width are unchanged from
  the method-retirement baseline. Standalone retired offers stay on one 16px
  line, lifecycle-modified offers stay within two 16px lines, and the checklist
  has no horizontal overflow.
- At 360px the outer panel remains no taller than 402px in either mode. At every
  width in the existing on-screen sweep, both modes stay fully inside the
  viewport wherever the current picker does.
- The guide lists every and only rendered column offer whose selected key has a
  `METRIC_HELP` fact, in checklist order and grouping. Switching a generation
  switches its label and fact together.
- Empty-query browsing is grouped; a query matches visible labels
  case-insensitively, preserves order, flattens headings and states when it
  matches nothing.
- Opening the guide focuses its non-sequential heading, never its search input.
  Back focuses the restored guide entry and restores the checklist's previous
  scroll position. Closing and reopening starts in checklist mode.
- At most one guide disclosure has `aria-expanded="true"`. Its body contains
  the registry fact, owned direction sentence and optional owned source link;
  expanding it changes no checkbox, view state, URL or announcement.
- Escape, outside press, forward focus exit and backward focus exit dismiss the
  picker from either mode and return focus according to the existing Columns
  contract in all three supported engines.
- Both mode scrollports reserve the global focus ring and scrollbar room, and a
  keyboard walk can reach every guide control without clipping or horizontal
  page overflow.
- Focused suites, `npm run verify`, and the complete three-engine e2e command
  are green without live network access.

## Failure behaviour

An absent help fact omits that offer from the guide while leaving its checkbox
fully usable. A fact without a source renders its explanation and direction
without an empty link. Unknown groups continue under `Other`.

A query with no result leaves the search and Back controls usable and states
that nothing matched. Clearing it restores the complete grouped guide in its
original order. If search removes the expanded entry, no stale body or focus
target remains.

Closing the picker from guide mode discards its query and expansion. It does not
discard checklist scroll or any column selection; reopening always presents the
checklist.

## Non-goals

- A `?`, tooltip, accessible description or second focus stop on every Columns
  row, or metric help in a table header.
- Help for categorical fields, release date, plate, story scores or any key the
  existing registry does not explain.
- Adding or removing columns, changing sort, or filtering from guide mode.
- New methodology prose, source URLs, direction vocabulary or retirement
  classification.
- Changes to the sidebar and Add-filter `MetricHelp` triggers or their anchored
  popover behaviour.
- A modal dialog, top-layer popover, focus trap, new dismissal boundary or new
  stacking level.
- URL tokens, `ViewState`, history, storage, announcements, datasets, scraping,
  network traffic or dependencies.
- Regenerating `data/` or changing the table's own columns and headers.

## Registry sweep

| Registry or counted claim | Owed |
|---|---|
| `METRIC_HELP`, `metricHelpOf` and `metricInterpretation` | sole inclusion, prose, source and direction source; no guide-local allowlist or copied fact |
| ColumnPicker `FIXED`, score entries, `metricEntries`, `categoricalEntries` and its method-era `Offer` | derive guide rows from the selected rendered offers while excluding unregistered shapes by lookup rather than by a second list |
| catalogue `groups` plus the `Other` fallback | preserve normal-mode headings and order; searched results flatten without reordering |
| `view.generations` and the lifecycle-aware generation formatter | selected key, visible modifier and help fact move together; delivery waits for method retirement |
| `MetricHelp`'s active anchored-popover singleton | unchanged and not instantiated by the inline guide |
| ColumnPicker's native-details state and `dismiss.ts` boundary | both modes share summary toggle, outside press, focus leave and Escape; every close resets mode |
| global focus ring plus `.scrollport` | reuse one scrollport slot in both modes; the enumerating browser guards must discover and measure the guide controls |
| ColumnPicker coverage's open-only population passes | checklist unmounts in guide mode, so hidden coverage bars do not keep fleet-wide work alive |
| `cross-browser.spec.ts` native-details registry | extend the existing Columns path through guide focus, Back and every dismissal; add no second panel entry |
| `smoke.spec.ts` picker geometry, ring and scrollbar enumerations | exercise both modes at 360px and the existing width sweep without hard-coded exemptions |
| method-retirement 360px label bounds | preserve its standalone and lifecycle row-height assertions after the guide lands |
| announcement exemption table and `announce.test.ts` | unchanged: guide actions mutate no view, and disclosure state is native on the focused control |
| URL token grammar, arrival registry and `ViewState` equality | unchanged: all guide state is ephemeral component state |
| docs/app.md §Filters and §Columns and sorting | own registry reuse, mode semantics, focus, ordering and measured geometry with the behaviour commits |
| BACKLOG.md item 3 | remove only after delivery is complete |

## Build sheet

### File map

| Task | File | Change |
|---|---|---|
| 1 | `app/src/components/MetricGuide.svelte` | Add the read-only grouped/searchable single-disclosure guide and deliberate heading focus. |
| 1 | `app/src/components/MetricGuide.test.ts` | Guard registry rendering, order, search, empty result, one-open rule, source omission and read-only behaviour. |
| 2 | `app/src/components/ColumnPicker.svelte` | Derive guide sections from rendered offers, add the mutually exclusive mode, restore scroll/focus and preserve coverage laziness. |
| 2 | `app/src/components/ColumnPicker.test.ts` | Guard one added stop, generation/fact alignment, mode reset, Back restoration, unchanged selection and unknown-fact omission. |
| 2 | `docs/app.md` | Own the guide's registry boundary, read-only mode, browse/search ordering, focus and checklist preservation beside Columns and metric help. |
| 3 | `app/e2e/fixtures/shoes.json` | Use the method-retirement fixture metadata already landed; change only if the browser path lacks one current/retired pair. |
| 3 | `app/e2e/smoke.spec.ts` | Hold the 360px panel, row geometry, mode overflow, scroll restoration and enumerated ring/scrollbar bounds. |
| 3 | `app/e2e/cross-browser.spec.ts` | Hold heading-not-search focus, Back, single expansion and every existing picker dismissal in all engines. |
| 3 | `docs/app.md` | Record the measured panel and scrollport result with the browser-guard commit. |
| 4 | `BACKLOG.md` | Remove the delivered item after the branch is verified and landed. |
| 4 | `docs/specs/2026-08-06-metric-guide.md` | Freeze the delivered spec through the delivery skill's finish step. |

The file map is a hypothesis. Task 1 begins by checking whether the guide can
consume the method-retirement `Offer` without exporting a component-private
type; Task 3 changes the fixture only if the landed retirement branch has not
already supplied the lifecycle cases.

### Interfaces

`MetricGuide.svelte` exports:

- `MetricGuideEntry { key: string; label: string }`;
- `MetricGuideSection { group: string | null; entries: MetricGuideEntry[] }`.

Its props are `sections: MetricGuideSection[]` and `onback: () => void`.
Sections contain only entries for which `metricHelpOf(key)` succeeded; the
component owns query and expanded-key state and renders facts by key.

ColumnPicker retains its public props. Its guide-section derivation uses the
same selected offers that feed the checklist, with fixed explained fields in a
null-heading section followed by the existing grouped offers. Mode, saved list
scroll and guide-entry focus are private component state.

No shared app interface, `ViewState` field, dataset type or URL signature
changes.

### Tasks

1. **Build the read-only guide in isolation.** Start with failing component
   tests for grouped order, search flattening, explicit empty results,
   non-search autofocus, a single expanded fact and optional source. Consume
   `metric-help.ts` directly and prove no selection callback exists. Evidence:
   `npm -w app run test -- MetricGuide`.

2. **Replace the picker body without changing its checklist.** Start with
   failing ColumnPicker tests, then derive registry-backed sections from the
   selected method-era offers, switch modes, restore checklist scroll and focus,
   reset on every close, and keep coverage work unmounted in guide mode. Update
   docs/app.md §Filters and §Columns and sorting in the same commit. Evidence:
   `npm -w app run test -- ColumnPicker MetricGuide` and `npm -w app run typecheck`.

3. **Hold the real geometry and keyboard path.** Measure both modes at 360px
   and the existing picker-width sweep in Chromium, Firefox and WebKit; tune the
   shared panel/scrollport so the 402px outer height and post-retirement row
   bounds stand. Extend the existing enumerating and native-details browser
   guards rather than adding exemptions, and record the resulting measurement
   in docs/app.md with the change. Evidence: `npm -w app run e2e`, then
   `npm run verify`.

4. **Close the artifact and land the branch.** After branch verification,
   remove BACKLOG.md item 3 and freeze this spec in the final branch commit;
   rebase onto the main that already contains method retirement, rerun both
   gates, fast-forward local main, then remove the worktree and branch. No data
   regeneration is required because the feature consumes existing metadata.
   Evidence: clean `npm run verify` plus the complete app e2e run on the rebased
   branch and local main.

### Global constraints

- Delivery starts from the reviewed method-era app contracts and its current
  lifecycle-aware labels and fixture metadata; it rebases onto main again after
  method retirement lands.
- The guide is read-only and registry-backed; no new fact or per-row Columns
  help trigger is authored.
- The 360px Columns panel stays within 346px by 402px, with checklist name
  geometry and method-retirement line bounds unchanged.
- Opening the guide never focuses search; at most one explanation is open.
- Checklist and guide are never mounted together; dismissal reopens Columns in
  checklist mode and Back restores checklist scroll and focus.
- No live network access, dependency, dataset regeneration, URL field, storage
  key or announcement.

### Sequencing notes

The method-retirement branch changes the `LabTest`, resolved-metric and
ColumnPicker offer interfaces this work consumes. Its data and app-contract
tasks are complete and independently reviewed through `0d9cb6c`; delivery may
therefore base on the branch tip before its remaining browser review and final
landing. Once method retirement lands, this branch rebases onto main and reruns
every gate before its own landing.

BACKLOG.md is changed only after the feature branch is complete and verified,
in the commit that freezes this spec before landing. Unlike scraper work, this
feature has no post-landing `data/` regeneration.
