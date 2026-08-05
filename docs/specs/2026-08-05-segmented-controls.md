# Segmented controls

*2026-08-05 · BACKLOG items 7 (segmented-control half) and 8 · status:
**approved, in delivery** — approved explicitly for execution on 2026-08-05.*

The app has one visual language for a small set of mutually exclusive choices:
a recessed track, a filled selected segment and one focus stop. It currently has
several implementations of that language, target heights from 19px to 38px, and
one browser-owned font size that makes the release shortcuts 26px in Chromium
and Firefox but 30px in WebKit. This gives that language one component and one
measured size contract without changing what any choice means.

## Decisions

### One face and one interaction contract

`SegmentedControl.svelte` owns the recessed track, segment geometry, selected
fill, selected-weight reservation, focus-ring room and the radio/toggle
semantics. Zone, story, Stability, release shortcuts, Discontinued, boolean
features and theme use it. Context may choose toolbar or compact type and
natural or filled width; neither changes the track, selected state or target
floor.

The release shortcuts join the recessed track rather than remaining separate
round chips. They are one exclusive set subordinate to the month picker, so the
segmented face says what their `radiogroup` already says. `Discontinued` keeps
its group name while its visible options become `Any`, `Hide`, `Only`; the two
action options retain the accessible names `Hide discontinued` and
`Only discontinued`. Repeating the heading in both long options was the only
reason that control stood taller than its peers.

The generation picker remains a stacked choice list. Its options carry a method,
units and a coverage figure, so forcing them into short filled segments would
discard information to buy resemblance. It shares `use:roving`, the selected
accent vocabulary and the target-size floor, not the segmented track.

### Button radios are deliberate, but for measured reasons

The exclusive segments remain real buttons carrying `role="radio"` and
`aria-checked`, with `use:roving`. The existing explanation about two mounted
sidebars is false and is removed everywhere.

A native-radio probe in the Playwright image found that Chromium, Firefox and
WebKit all provide arrow selection, one effective Tab stop and disabled-option
skipping. It also found three regressions from the current contract: Home and
End do nothing, Enter does not activate, and reverse Tab into a group with no
checked option lands on the first option in Chromium and Firefox but the last
in WebKit. Nullable groups are reachable today: a hand-edited view can match no
zone or story, and a month-picker value can match no release shortcut.

Keeping the button-radio implementation preserves Home/End, Enter and the same
nullable entry point in all three engines. Using the same interaction component
for visually identical always-selected groups avoids a second keyboard contract
for controls that look interchangeable. `lib/roving.ts` remains the one owner
of the radio keyboard behaviour; the component owns when it applies.

### Target size is a floor, not a density accident

Every segment and every stacked generation choice is at least **24×24px**.
Under `@media (hover: none)`, the height floor is **32px** while the width floor
remains 24px. Content may make a target taller or wider; no context may make it
smaller. The desktop and touch bounds are asserted in
`app/e2e/cross-browser.spec.ts` after opening each surface that can hold one.

The 32px touch height preserves the current one-row phone toolbar without
changing its words or layout. A throwaway sketch
of the real app at 360px produced a 38px toolbar whose three groups shared one
row, with zero toolbar and document overflow in Chromium, Firefox and WebKit.
The same sketch at 360px and 1440px, light and dark, held the target floors and
zero overflow in all three engines. The 44×44px enhanced target was declined:
the seven toolbar targets at that minimum, plus their three tracks and gaps,
exceed the 344px row and require a different phone-toolbar layout.

### State, vocabulary and announcements do not move

The component is controlled. It holds no view or preference state and emits the
chosen value or pressed state to its caller; callers keep the existing mapping
to `ViewState`, display preferences and the URL
(docs/app.md §View and URL ownership).

A radio value not present in its options marks nothing and leaves the first
option as the group's entry point. This is the existing nullable story, zone and
release behaviour, not an error to coerce away. The component never invents an
`Any` value: callers whose domain has one provide the option and map it to their
existing absent state.

Visible and accessible words continue to come from their present owners
(docs/policies.md §Vocabulary). The only wording delta is Discontinued's visible
shortening above. Radio and pressed semantics remain on the focused controls, so
the announcement exemptions remain exactly those in
docs/app.md §What a control says it did.

## Bounds and acceptance homes

| Bound | Home |
|---|---|
| Every segment and generation choice is at least 24×24px at 1440px | `app/e2e/cross-browser.spec.ts`, three engines |
| Every segment and generation choice is at least 24px wide and 32px high at 360px in a touch context | `app/e2e/cross-browser.spec.ts`, three engines |
| Zone, story and Stability remain one row with no toolbar or document overflow at 360px | `app/e2e/cross-browser.spec.ts`, three engines |
| Selecting a segment never changes any segment's width | `app/e2e/cross-browser.spec.ts`, both component scales |
| Radio groups keep one tab stop, arrows, Home/End, Enter and disabled-option skipping | `app/src/lib/roving.test.ts`; a mounted representative in `app/e2e/features.spec.ts` |
| A mounted nullable group has the same first entry point in all three engines | the unmatched release-shortcut state in `app/e2e/cross-browser.spec.ts` |
| Group and option names resolve from the visible heading or explicit accessible name | component tests plus `app/e2e/features.spec.ts` accessibility snapshot |
| Light and dark use the same track/selected grammar and the existing contrast-guarded token pair | structural component ownership; `app/src/lib/tokens.test.ts` and `app/src/lib/wash.test.ts` |

## Failure behaviour

- A radio value outside the option list marks none and leaves a deterministic
  first entry point; it is never silently rewritten.
- An option list is non-empty by interface. Duplicate values are a programmer
  error and fail the keyed render rather than producing two controls for one
  state.
- The selected fill continues to use `--accent-solid` with `--on-accent`; the
  shared track keeps `overflow: visible`, so neither theme nor extraction may
  clip the global focus ring (docs/policies.md §Interaction chrome).
- A catalogue bool still emits only `undefined`, `['true']` or `['false']`;
  moving its rendering cannot create the two-value state rejected by the URL
  parser (docs/app.md §URL encoding).

## Non-goals

- Native radio inputs or a second radio keyboard contract.
- A 44×44px target floor or a second phone-toolbar row.
- Turning the rich generation rows into segments.
- The Brand/Features disclosure extraction. BACKLOG item 7 narrows to that
  independent primitive when its segmented half is delivered.
- The month picker grid, setup cards, checklists, range controls or secondary
  buttons; their interactions are not segmented choices.
- Changes to view state, URL tokens, persistence, filter meaning, counts,
  announcements or the setup-strip hand-off.

## Policies cited

- docs/policies.md §Compatibility floor — 360px and all three engines own the
  size and no-overflow bounds.
- docs/policies.md §Interaction chrome — the shared track preserves the one
  ring and its room; keyboard entry remains deliberate.
- docs/policies.md §Vocabulary — visible and accessible names remain looked up,
  with Discontinued's two explicit accessible expansions owned once.
- docs/policies.md §Announcement — radio/pressed semantics stay on the control,
  so no new status sentence is introduced.
- docs/policies.md §State ownership and validation — the component is controlled
  and adds no state or parsing path.

## Registry sweep

| Registry or counted claim | Owed change |
|---|---|
| Every `use:roving` / `role="radiogroup"` site | segmented sites move behind the component; `MetricRow` remains the intentional stacked caller |
| docs/app.md's “all four” radiogroup claim | replace the stale count and false duplicate-render rationale with the shared behaviour contract |
| docs/app.md's `--accent-solid` carrier list | stop enumerating component files; point to the component and the token guards |
| `cross-browser.spec.ts`'s “every segmented pill” selector | enumerate the component contract rather than only `.setup button, .chips button`; open Display, Filters and Features before measuring |
| `features.spec.ts` and `playwright.config.ts` browser-coverage rationale | retain three-engine coverage, replace the false native-group explanation with disclosure plus shared-control behaviour |
| Component/unit role queries and literal sidebar heading/group sequences | roles and group names stay; Discontinued's visible and accessible option names change deliberately |
| docs/app.md announcement exemption table and `announce.test.ts` | inspected, no semantic delta: radios remain radios and Stability remains pressed |
| BACKLOG items 7 and 8 | remove item 8; narrow item 7 to the disclosure primitive only |

---

## Build sheet

### File map

| Task | Create | Modify |
|---|---|---|
| 1 Shared control and chrome | `app/src/components/SegmentedControl.svelte`, `SegmentedControl.test.ts` | `Toolbar.svelte`, `Toolbar.test.ts`, `ZoneToggle.svelte`, `DisplayMenu.svelte`, `DisplayMenu.test.ts`, `app/src/lib/roving.ts`, `roving.test.ts`, `docs/app.md` |
| 2 Filters, target registry and closure | — | `FilterSidebar.svelte`, `FilterSidebar.test.ts`, `DiscontinuedFilter.svelte`, `FeaturesFilter.svelte`, `FeaturesFilter.test.ts`, `MetricRow.svelte`, `MetricRow.test.ts`, `app/e2e/features.spec.ts`, `app/e2e/cross-browser.spec.ts`, `app/playwright.config.ts`, `docs/app.md`, `BACKLOG.md` |

### Interfaces

- `SegmentOption = Readonly<{ value: string; label: string; accessibleLabel?: string; disabled?: boolean }>`;
  radio options are keyed by `value`.
- Radio mode props:
  `{ mode: 'radio'; options: readonly [SegmentOption, ...SegmentOption[]]; value: string | null; onchange: (value: string) => void; scale?: 'compact' | 'toolbar'; fill?: boolean }`
  plus exactly one of `{ ariaLabel: string }` or
  `{ ariaLabelledby: string }`.
- Toggle mode props:
  `{ mode: 'toggle'; label: string; accessibleLabel?: string; pressed: boolean; onchange: (pressed: boolean) => void; scale?: 'compact' | 'toolbar' }`.
- Radio mode renders `data-segmented-control` on the track and `data-segment`
  on each option; toggle mode uses the same two markers. The browser suite's
  target and width registries quantify over those markers rather than a list of
  component-local classes.
- `scale` changes typography only. `fill` distributes radio options equally
  across the available width; neither changes semantics or the size floor.
- `use:roving` remains
  `(node: HTMLElement) => { destroy(): void }`; the shared component is its
  segmented caller and `MetricRow` its rich-row caller.

### Tasks

1. **Create the shared control and migrate chrome/display.** Start with failing
   component and toolbar tests for radio/toggle semantics, nullable entry,
   naming and width reservation; migrate zone, story, Stability and theme, and
   update their owning docs in the same commit. Acceptance:
   `npm -w app run test -- SegmentedControl Toolbar DisplayMenu roving` and
   `npm -w app run typecheck`; pointers: §One face, §Button radios,
   docs/app.md §The toolbar, docs/app.md §Theming.
2. **Migrate filters and install the measured browser guard.** Start with
   failing filter tests for the shared release track, `Any / Hide / Only`, bool
   tri-states and target markers; give the generation rows the same floor,
   replace every stale rationale/registry, and close/narrow the two backlog
   entries with the owning docs in the commit. Acceptance:
   `npm -w app run test`, `npm -w app run e2e:docker`, and `npm run verify`;
   pointers: §Target size, §Registry sweep, docs/app.md §Filters,
   docs/policies.md §Compatibility floor.

### Global constraints

- Minimum target: **24×24px**.
- Touch target under `@media (hover: none)`: **at least 24px wide and 32px high**.
- Supported layout floor: **360px**.
- Browser floor: **Chromium, Firefox and WebKit**.
- Selected fill/ink: **`--accent-solid` / `--on-accent`**.
- Focus-ring containment: **`overflow: visible`** on the segmented track.

### Sequencing notes

Task 1 lands the component before any caller in task 2 can use it. The whole
three-engine target registry lands only after every segmented caller has moved;
until then the old width assertion remains in place rather than claiming a
partial enumeration is complete.
