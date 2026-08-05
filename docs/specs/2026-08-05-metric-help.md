# Metric help where filters are chosen and set

status: approved, in delivery

## Purpose and scope

Close BACKLOG.md item **Explain each metric where it is filtered**. Every
rangeable entry currently published by the app — RunRepeat lab measurements,
Price and RunRepeat Score — receives compact factual help in the two places
where a runner chooses or sets a range: the Add-filter dialog and the sidebar.

The help answers only three questions: what the value represents, how
RunRepeat obtains it, and how to read the direction already owned by
`direction.ts`. It does not tell a runner which value should suit them.

Table headers are out of scope. Whether the column picker should reuse the
facts is recorded as a new consideration in BACKLOG.md rather than promised by
this delivery.

## Policies

- docs/policies.md §Vocabulary: facts are looked up by metric key from one
  registry; labels and direction remain owned by their existing registries.
- docs/policies.md §Interaction chrome: the policy is corrected to distinguish
  modal focus transfer from an anchored panel that deliberately keeps focus on
  its trigger. The help obeys the shared outside-press, Escape and focus-leave
  dismissals.
- docs/policies.md §Compatibility floor: the trigger and panel are measured at
  360px in Chromium, Firefox and WebKit as well as at a permanent-sidebar
  desktop width.
- docs/policies.md §State ownership and validation: open and pinned help are
  ephemeral component state and never reach `Page.svelte`, the URL or storage.
- docs/policies.md §Announcement: `aria-expanded`, focus and the panel's own
  accessible name state the interaction; no live-region message repeats native
  semantics.
- docs/policies.md §Third parties and cost: every methodological claim is
  grounded in RunRepeat's published material, source links visibly leave the
  app, and the feature makes no runtime request or new scrape.
- docs/decisions.md §Testing bar: adversarial, no live network: sources are
  author-time evidence; tests use local data and browser fixtures only.
- docs/decisions.md §Fewer dependencies: the interaction adds no dependency.

No policy is undecided. The existing interaction policy's statement that every
panel takes focus is already contradicted by the native column picker. This
delivery records the truthful distinction as a dated decision in docs/app.md
and updates the policy register in the same behaviour commit.

## Decisions

### One small trigger, one compact anchored panel

A real `?` button is the only visual trigger. Hovering or focusing it previews
the panel; pressing it pins the panel. A pinned panel survives pointer departure
and closes when its trigger is pressed again. Opening another help panel replaces
the first. `MetricHelp.svelte` keeps one module-scoped active closer for that
handoff; it owns only ephemeral open state and is cleared when its component is
destroyed. A press outside, Escape, or focus leaving the trigger-plus-panel
boundary dismisses either state.

The panel is tooltip-sized but is not a hover-only tooltip: touch presses work,
the source link is interactive, and every `?` is a keyboard stop. It has no
scrim, focus trap or Close button. Focus stays on the trigger when help opens;
Tab may enter the source link. Escape from inside returns focus to the trigger,
while closing a panel whose trigger already holds focus moves nothing.

This shape is preferred to the About dialog, which is a modal for several
sections of prose, and to an inline disclosure, which would repeatedly reflow
range controls and the Add-filter list. A native `title` or hover-only tooltip
has no touch path and cannot carry an auditable source.

### The panel escapes clipped lists without escaping their interaction

Both target surfaces are scrollports. The Add-filter dialog's rows measure 26px
at a desktop width and wrap to about 42px at 360px before this feature, so a
panel positioned inside a row would be clipped and an inline sentence would
materially lengthen the chooser.

The implementation first probes a manual native popover in all three engines.
It must enter the top layer, escape both scrollports, remain a DOM descendant of
the Add-filter dialog for its focus trap, and accept app-owned hover, pin and
dismissal state. If any engine fails that contract, the component may portal
the panel instead, provided it preserves the same dialog membership and focus
behaviour. The mechanism is subordinate to the observable bounds.

Placement is collision-aware in both axes. It prefers the side of the trigger
with room, stays wholly within the supported viewport, and repositions when the
scrollport, window or content moves while it is open. Exact panel width, gap and
edge allowance are measured during implementation and asserted in the browser
suite rather than invented here.

### Add-filter keeps two sibling actions and one visual row

Each Add-filter row continues to offer its whole existing hit area for “add this
metric,” except for the small help target. The add action and `?` are sibling
buttons; interactive controls are never nested. The `?` sits immediately after
the metric label, while direction, coverage bar and percentage retain their
order. Keyboard order is add, then explain, for each row. The accepted cost is
one additional tab stop per explained row.

The sidebar puts one `?` beside the metric heading. A heel/forefoot family gets
one shared trigger whose fact states both measurement locations; duplicating it
beside both bounds adds no information. A superseded family follows the selected
generation, so changing method changes the help key and any method-specific
fact. A metric without a registered fact has no trigger and reserves no empty
space.

### Facts are authored, keyed and deliberately non-exhaustive

One app-owned registry beside `labels.ts` and `direction.ts` maps a metric slug
or synthetic field key to:

- a short plain-text fact describing the measurement or provenance;
- an optional RunRepeat source link with its link label.

The fact does not duplicate “higher/lower/neutral.” The panel derives one
standard interpretation line from `directionOf(key)`, so changing a metric's
declared direction cannot leave prose disagreeing with its arrow. Neutral reads
as no universally better end, not as an absent opinion.

The initial registry covers every rangeable entry in the published catalogue,
plus `msrpGbp` and `score`. Related heel/forefoot slugs may refer to one shared
fact where only location differs; superseded methods stay separate where the
procedure or scale changed. Every registry key must resolve to a current
rangeable catalogue key or one of the two synthetic fields, and every URL must
be HTTPS on `runrepeat.com`.

Coverage is intentionally not an invariant over future catalogues. An upstream
metric with no reviewed fact remains visible, rangeable and selectable without
a `?`; a refresh or deployment never waits for hand-authored help. Tests validate
registered entries and representative current coverage, but do not compare the
registry exhaustively with a changing catalogue.

### Facts stop before advice

The copy may state equipment, procedure, measurement location, scale and direct
meaning of the reading. It must not infer who should choose a high or low value,
biomechanical effects, comfort, injury outcomes or thresholds. Practical runner
guidance remains outside this feature.

Lab metrics link to RunRepeat's current testing-methodology page or a more
specific RunRepeat guide when one substantiates the fact. Price states that the
number is the GBP manufacturer's suggested retail price recorded by RunRepeat —
the release/list price before discounts — and not a current offer or a regional
quote; its source is RunRepeat's price guide. RunRepeat Score states only that it
is RunRepeat's 0–100 verdict from its review and not a Shoe Lab score. It carries
no source link because RunRepeat publishes no stable derivation for that verdict.

Copy is plain text. It never reaches the sanitised-HTML boundary or `{@html}`.
External source links follow the app's existing RunRepeat convention: new tab,
`rel="noopener"`, and the external-link mark.

## Success bounds

- Every rangeable entry in the dataset present when this feature is authored,
  plus Price and RunRepeat Score, has reviewed factual help; the RunRepeat Score
  is the sole intentional entry without a source URL.
- A future rangeable key absent from the registry renders in both target
  surfaces without a trigger, error, warning or reserved gap.
- At 360px and at a permanent-sidebar desktop width, the panel stays inside the
  viewport and above the target surface for the first, middle and last reachable
  help triggers in both surfaces. Exact geometry is measured at implementation
  and asserted in `app/e2e/cross-browser.spec.ts`.
- The Add-filter list and sidebar have no horizontal overflow at 360px after the
  trigger is added; coverage, direction and both actions remain visible. Any
  row-height change is measured rather than assumed and held in the browser
  suite where it affects layout.
- Hover preview, focus preview, click pin/toggle, replacement, outside press,
  Escape, focus departure, source-link focus and touch press behave identically
  in Chromium, Firefox and WebKit.
- Add-filter still chooses a metric from every part of its row except the help
  target; pressing help never adds a metric or closes the dialog.
- Opening, reading and closing help changes no `ViewState`, URL, history entry,
  storage value or live-region text.
- Focus rings are not clipped in either scrollport and focus is never dropped to
  `<body>` by opening, replacing or dismissing help.
- Focused unit suites, `npm run verify`, and the repository's complete
  three-engine e2e command are green without live network access.

## Failure behaviour

Missing help is an ordinary fallback: render the metric without `?`. An invalid
registered key, unsafe/non-RunRepeat source URL, empty fact or contradictory
registry shape fails the unit suite. A panel that cannot clear clipping,
viewport edges, its owning modal or the focus contract in any supported engine
fails the browser gate and does not land.

If RunRepeat removes or materially changes a linked methodology page, the
static app continues to work; the author-time fact and link are corrected in a
normal behaviour-and-doc commit. No runtime availability check or network
fallback is added.

## Non-goals

- Table-header help of any kind.
- Column-picker help in this delivery; BACKLOG.md records only that it should be
  considered against that panel's density and interaction cost.
- Explanations for search, release date, plate, brand, discontinued or
  categorical feature facets.
- Personal recommendations, runner classification, biomechanical or medical
  claims, and “ideal” ranges.
- Scraping methodology prose into the dataset, widening a crawl, or making a
  live request from the app.
- Adding methodology text to URLs, storage, CSV output or table cells.
- A completeness gate that delays a new upstream metric.
- Reopening or expanding the About panel's scope.
- Adding a dependency, landing into `main`, regenerating `data/`, or pushing.

## Registry sweep

| Registry or counted claim | Owed |
|---|---|
| `DIRECTION` / `directionOf` in `app/src/lib/direction.ts` | remains the sole direction classification; the panel derives its interpretation from it |
| `metricEntries`, `CURATED_RANGE_KEYS` and the two `FIELD_METRICS` | define the reachable range surfaces; help keys follow their resolved slug/field key without gating them |
| `columnLabel`, short labels and `DirectionLegend` | unchanged; help does not create a second metric name or direction legend |
| `dismissOnOutsidePress` / `dismissOnFocusLeave` | must treat trigger and top-layer panel as one boundary without regressing existing callers |
| docs/policies.md §Interaction chrome | corrected from universal focus transfer to modal versus anchored focus ownership |
| docs/app.md §Every floating panel dismisses the same way | its stale counted list already omits the Display panel; replace it with an uncounted complete description including Display and metric help |
| docs/app.md §Stacking order | records the top-layer help rather than inventing a comparable z-index; fallback portal ownership is documented if the probe needs it |
| the Add-filter dialog's focusable query/trap | must include an open panel's source link and both row actions |
| `.scrollport`, `--ring-room` and the browser focus-scroll guard | no new scrollport; both new button and link must retain the existing ports' reserved ring room |
| the announcement exemption table in docs/app.md §What a control says it did | help is native disclosure semantics and adds no live announcement |
| external RunRepeat link vocabulary (`↗`, `target`, `rel`) | source links reuse it rather than coin another leaving-app mark |
| BACKLOG.md item 3 | removed only after complete current content and both integrations are reviewed |
| BACKLOG.md | gains the column-picker consideration as the sole deferred aspiration from this design |

## Build sheet

### File map

| Task | File | Change |
|---|---|---|
| 1 | `app/src/lib/metric-help.ts` | Add the sparse key-to-fact/source registry and direction-derived interpretation. |
| 1 | `app/src/lib/metric-help.test.ts` | Guard registry shape, keys, sources, factual exemplars, shared families and the non-blocking unknown-key fallback. |
| 1 | `docs/app.md` | Own the factual-help content contract beside filter presentation. |
| 2 | `app/src/components/MetricHelp.svelte` | Add the reusable hover/focus/click help trigger, top-layer panel, source link, placement and focus behaviour. |
| 2 | `app/src/components/MetricHelp.test.ts` | Guard preview, pin/toggle, dismissal, replacement, source semantics and focus return. |
| 2 | `app/src/lib/dismiss.ts` | Generalise the shared dismissal boundary only as required for a separated trigger/panel. |
| 2 | `app/src/lib/dismiss.test.ts` | Hold multiple-node containment and every existing single-node behaviour. |
| 2 | `docs/policies.md` | State truthful modal versus anchored focus ownership. |
| 2 | `docs/app.md` | Add the dated focus decision; update floating-panel dismissal and stacking ownership without a stale count. |
| 3 | `app/src/components/MetricRow.svelte` | Render help beside sidebar metric headings and follow selected generations. |
| 3 | `app/src/components/MetricRow.test.ts` | Guard known, grouped, generation-switched and unknown help. |
| 3 | `app/src/components/AddFilterDialog.svelte` | Split each explained row into sibling add/help actions without changing selection, search, coverage or modal behaviour. |
| 3 | `app/src/components/AddFilterDialog.test.ts` | Guard full-row selection, help isolation, unknown help and dialog focus containment. |
| 3 | `app/src/components/FilterSidebar.svelte` | Supply resolved help keys to the two target components. |
| 3 | `app/src/components/FilterSidebar.test.ts` | Guard Price, RunRepeat Score, current methods and unknown future keys end to end. |
| 3 | `app/e2e/cross-browser.spec.ts` | Hold 360px/desktop clipping, collision placement, touch, focus, Escape and row geometry in all three engines. |
| 3 | `app/e2e/smoke.spec.ts` | Hold Add-filter/sidebar layering and no horizontal overflow against the real fleet. |
| 3 | `docs/app.md` | Update Filters, Table presentation and the browser-measured interaction contract with the behaviour commit. |
| 3 | `BACKLOG.md` | Close item 3 and add the scoped column-picker consideration. |

The file map is a hypothesis. The first task must sweep fixtures and tests that
construct Add-filter options or `ResolvedMetric` values and update only those
whose interface genuinely changes.

### Interfaces

`app/src/lib/metric-help.ts` exports:

- `interface MetricHelpFact { text: string; source?: { label: string; href: string } }`
- `metricHelpOf(key: string): MetricHelpFact | undefined`
- `metricInterpretation(key: string): string`

`MetricHelp.svelte` takes `metricKey: string` and `label: string`. It renders
nothing when `metricHelpOf(metricKey)` is undefined; callers do not branch.

`MetricRow.svelte` gains `helpKey: string`, resolved by its parent from the
single key, selected generation, or representative shared-family key.
`AddFilterOption.key` remains the help lookup key, so its public interface does
not grow another spelling of identity.

If native top-layer containment requires a separated dismissal boundary,
`dismissOnOutsidePress` and `dismissOnFocusLeave` accept a getter returning one
node or a readonly collection of nodes. Existing single-node callers and their
semantics remain source-compatible.

### Tasks

1. **Author and guard the factual registry.** Add failing shape and exemplar
   tests, then author reviewed plain-text facts and RunRepeat sources for the
   complete current rangeable set, Price and RunRepeat Score; update the owning
   app doc in the same commit. Evidence: `metric-help.test.ts`, a generated
   implementation-time coverage report over the current dataset, and
   docs/policies.md §Vocabulary and §Third parties and cost.
2. **Build the shared anchored help interaction.** Probe the native top layer in
   all three engines, add failing component/dismissal tests, implement the
   approved interaction and policy correction, and record the dated app
   decision. Evidence: focused component/lib suites plus a throwaway probe for
   clipping, dialog containment and focus; §One small trigger, one compact
   anchored panel and §The panel escapes clipped lists without escaping their
   interaction.
3. **Integrate, measure and close the aspiration.** Add the trigger to sidebar
   headings and Add-filter rows test-first, measure first/middle/last triggers at
   360px and desktop in three engines, update the owning app sections, remove
   completed backlog item 3 and add only the column-picker consideration.
   Evidence: focused suites, scoped browser cases, `npm run verify`, complete
   e2e, docs/policies.md §Compatibility floor, and every bound in §Success
   bounds.

### Global constraints

- Target surfaces: sidebar and Add-filter dialog only.
- Supported layout floor: 360px.
- Compatibility engines: Chromium, Firefox and WebKit.
- Help trigger: visible `?`, real focusable button.
- Open paths: hover, focus and press; press pins.
- Dismissal paths: trigger toggle, replacement, outside press, Escape and focus
  leaving the trigger-plus-panel boundary.
- Content: plain factual text plus direction-derived interpretation; no runner
  advice.
- Source host: HTTPS `runrepeat.com`; RunRepeat Score has no source link.
- Unknown help key: metric remains visible and no trigger renders.
- No runtime network, new scraper request, dependency, dataset regeneration,
  URL/storage state, table-header change, column-picker change or `{@html}`.
- Delivery stops on the reviewed, verified feature branch; it does not land,
  push or modify `main`.

### Sequencing notes

The current coverage report is evidence for Task 1, not an exhaustive guard
left in CI. Task 2 settles the top-layer mechanism before Task 3 puts it inside
both clipped surfaces. The policy correction rides Task 2; the backlog closes
only after Task 3's complete current content, two integrations and browser
bounds have passed review.
