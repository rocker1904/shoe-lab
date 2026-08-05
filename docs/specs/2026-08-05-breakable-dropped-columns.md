# Breakable dropped columns

status: approved, in delivery

## Purpose and scope

Close the two table-width follow-ups recorded in BACKLOG.md as **Delete the
phone table's column-count floor, once WebKit has been read** and **Render a
dropped slug's header breakable, and model it that way**. They share one
compatibility surface: the zero-figure phone table and the permissive raw-slug
column are both degraded but reachable views, and both are governed by the
three-engine layout floor. Both changes land on one feature worktree branch,
which is fully reviewed and verified but left unmerged for the user.

The first change removes an unobservable compatibility floor only after WebKit
has reproduced the Chromium and Firefox result at 360px and 375px. The second
makes an unknown column slug break consistently at its hyphens and brings the
width model into agreement with that rendering.

## Policies

- docs/policies.md §Compatibility floor: both claims are read in Chromium,
  Firefox and WebKit, with WebKit run through Docker as required by
  docs/operations.md §The e2e run needs three browsers.
- docs/policies.md §State ownership and validation: an accepted column slug
  remains permissive when the current catalogue does not contain it.
- docs/policies.md §Identity and sharing: the URL grammar and its 64-character
  slug ceiling do not change.
- docs/policies.md §Vocabulary: `columnLabel` remains the one source of the
  rendered column name, and `wordsOf` remains the one source of modelled break
  opportunities.
- docs/decisions.md §Testing bar: adversarial, no live network: the maximum
  accepted dropped slug and engine disagreement remain guarded, not sampled.

No policy is undecided.

## Decisions

### The zero-column floor is deleted only after the third-engine reading

The zero-figure phone view remains a table of named shoe rows and no value
cells. A throwaway WebKit probe compares the base and edited renderings at
360px and 375px and records the bleed, panel, table and identity-cell boxes,
row count, document scroll width, the `colspan` attribute and reflected
`colSpan`, and the table's computed minimum width. Deletion proceeds only if
the rendered geometry and scroll width are unchanged and WebKit reflects the
zero attribute as a span of one.

The floor and its explanatory comment then leave together. No permanent test
asserts the inert attribute: `ShoeTableMobile.test.ts` continues to guard the
observable zero-column result.

### A dropped slug carries an invisible break after each visible hyphen

When `columnLabel` falls through to a key for which there is no catalogue test,
it inserts U+200B ZERO WIDTH SPACE after every hyphen. The visible label stays
the exact lowercase hyphenated slug the URL named. Catalogue labels, synthetic
shoe-field and score labels, and shoe names do not gain break markers.

This is preferred over replacing hyphens with visible spaces, which stops
showing the identifier the link carried, and over component-level `<wbr>`
markup, which would give rendering and width arithmetic separate homes for the
same break rule. A Docker probe established that U+200B gives all three engines
the break after a hyphen; unlike U+00AD SOFT HYPHEN, it adds no glyph when the
line breaks.

`wordsOf` treats U+200B as a separator it splits at and drops. The preceding
visible hyphen therefore stays in the modelled fragment, matching the rendered
line. Natural hyphens in every string without that marker remain deliberately
unbreakable to the model, preserving the conservative rule for upstream test
names and shoe names in docs/app.md §Table presentation.

### Every width table knows that the marker has zero advance

The phone header table and the three proportional desktop tables carry a zero
advance for U+200B, and the measurement rig retains that character on future
regeneration. This prevents the shared text arithmetic from charging its
fallback width for an invisible marker. Monospaced figure and unit tables never
receive the marker and are unchanged.

### The dropped-slug guard becomes agreement, not deliberate over-reservation

The dropped-column browser guard changes from a one-sided floor to the same
absolute model/render agreement used by ordinary column sets, while retaining
the declared-column overflow check. It runs in all three engines. The maximum
64-character slug remains reachable through the URL parser; its former 691px
surplus is re-measured during implementation and replaced with a new explicit
pin in `fit.test.ts`, rather than deleted or predicted here.

## Success bounds

- At 360px and 375px in Docker WebKit, removing the zero-column floor changes
  no measured rendered box and changes document scroll width by 0px;
  `colspan="0"` reflects as `colSpan === 1`.
- In Chromium, Firefox and WebKit, every dropped-column set's modelled
  min-content differs from the engine's rendered min-content by no more than
  `FIT_TOLERANCE_PX` (4px), and no header exceeds its declared column by more
  than the existing overflow allowance.
- The maximum slug admitted by the unchanged 64-character grammar has a
  measured, explicit unit-test pin for its new modelled width and residual;
  the values are established during implementation.
- The visible dropped header is byte-for-byte the original slug once U+200B is
  ignored, including every hyphen.
- The existing observable zero-column component test, focused unit suites,
  `npm run verify`, and the repository's complete Docker e2e command are green.

## Failure behaviour

If WebKit gives the zero-column floor observable geometry, scroll, or span
semantics, that deletion stops and the evidence is reported as a discovery.
If a break marker changes visible text, has non-zero advance, leaves one engine
outside the existing tolerance, or lets a header escape its declared column,
the dropped-slug change fails its unit or browser guard and does not land.
Unknown columns otherwise keep their existing permissive behaviour: an empty
column with the slug as its heading.

## Non-goals

- Changing URL parsing, the 64-character slug ceiling, sorting semantics, or
  how stale links are canonicalised.
- Teaching the model to break ordinary hyphenated catalogue labels or shoe
  names.
- Changing phone column widths, the 360px support floor, table mounting, or the
  zero-column view a runner sees.
- Adding a regression assertion for an inert `colspan` attribute or computed
  minimum width.
- Adding dependencies or changing datasets.
- Landing the branch into `main` or pushing it.

## Build sheet

### File map

| Task | File | Change |
|---|---|---|
| 1 | `app/src/components/ShoeTableMobile.svelte` | Remove the zero-column span floor and the comment whose compatibility claim has been discharged. |
| 1 | `app/src/components/ShoeTableMobile.test.ts` | Keep the observable zero-column guard green; change only prose made false by the deletion. |
| 2 | `app/src/lib/labels.ts` | Mark raw dropped slugs, teach the shared break registry the marker, and price it at zero on the phone. |
| 2 | `app/src/lib/labels.test.ts` | Guard visible/fallback labelling, marker scope, and break-token behaviour. |
| 2 | `app/src/lib/fit.ts` | Price the marker at zero in all proportional desktop tables and align width-model prose. |
| 2 | `app/src/lib/fit.test.ts` | Replace the no-hyphen dropped-slug assumptions and re-price the maximum accepted slug. |
| 2 | `app/scripts/measure-label-widths.mjs` | Preserve the zero-advance marker when proportional tables are regenerated. |
| 2 | `app/e2e/fit-support.ts` | Retain the adversarial dropped-column set and own its newly measured bound and arithmetic. |
| 2 | `app/e2e/smoke.spec.ts` | Turn Chromium's dropped-column floor into model/render agreement. |
| 2 | `app/e2e/cross-browser.spec.ts` | Turn Firefox and WebKit's dropped-column floor into model/render agreement. |
| 2 | `docs/app.md` | Replace the raw-slug over-reservation decision with the marker-backed rendering/model contract. |
| 3 | `BACKLOG.md` | Remove both completed entries without renumber-sensitive references. |

The file map is a hypothesis. Implementation must sweep all comments and docs
that state the old natural-hyphen or span-floor behaviour.

### Interfaces

Public signatures remain unchanged:

- `columnLabel(key: string, test: LabTest | undefined): string`
- `wordsOf(s: string): string[]`
- `headerMinPx(key: string, test: LabTest | undefined): number`
- `headerMaxPx(key: string, test: LabTest | undefined): number`

U+200B is an internal representation shared by `columnLabel`, `wordsOf`, the
proportional font tables and their measurement rig. It is not a URL token or a
new exported view-state concept.

### Tasks

1. **Discharge and remove the zero-column floor.** Measure the base and edited
   zero-figure phone table in Docker WebKit at 360px and 375px against §The
   zero-column floor is deleted only after the third-engine reading; remove the
   floor and stale prose only when every success bound holds. Evidence: the
   before/after probe record and the focused `ShoeTableMobile` suite.
2. **Render and model breakable dropped slugs.** Add failing label/model tests,
   implement the approved marker rule across every registry in the file map,
   re-measure and pin the maximum accepted slug, and update docs/app.md in the
   same commit. Evidence: focused unit suites, Chromium's scoped browser guard,
   and the Docker cross-browser guard; docs/policies.md §Compatibility floor,
   §State ownership and validation, §Vocabulary; §A dropped slug carries an
   invisible break after each visible hyphen.
3. **Close the two aspirations.** Remove the two completed backlog entries only
   after Tasks 1 and 2 are reviewed. Evidence: `npm run check:docs` and a diff
   showing both titles absent from live backlog prose.

### Global constraints

- Supported layout floor: 360px.
- Zero-column comparison widths: 360px and 375px.
- Compatibility engines: Chromium, Firefox and WebKit.
- Browser/model tolerance: `FIT_TOLERANCE_PX` = 4px.
- Maximum accepted unknown column slug: 64 characters.
- Visible separator: `-`; inserted break marker: U+200B ZERO WIDTH SPACE.
- WebKit checks run through Docker.
- No live network in any test or probe.
- Delivery stops with one reviewed, verified branch ready for a linear landing;
  it does not modify `main`.

### Sequencing notes

Task 1 measures the base before editing it. Task 2's model and rendering land
together; no commit may expose a marker the model prices as fallback width or a
modelled break the header does not render. Task 3 follows both task reviews so
the backlog never claims unfinished work is complete.
