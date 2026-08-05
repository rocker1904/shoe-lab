# One home for categorical disclosures

Status: approved, in delivery

## Purpose

Brand and Features are the same kind of filter disclosure, but each currently
owns a copy of the native `<details>` shell, its summary, its chevron and its
option-row styling. Extract that shared rendering into one small component so
the two categorical filters cannot drift, while preserving their current
appearance, semantics and filter behaviour.

This closes the `BACKLOG.md` item **One home for the categorical disclosures**.

## Policy fit

- `docs/policies.md` §Compatibility floor: the result must continue to work at
  360 CSS px and in current Chromium, Firefox and WebKit.
- `docs/policies.md` §Vocabulary: the shared disclosure gets one component and
  one rendering rather than two locally named copies.
- `docs/decisions.md` §Testing bar: the extraction is guarded at the component
  boundary and in the real app across the three browser engines; no test makes
  a live network request.
- `docs/decisions.md` §Fewer dependencies: this is a local Svelte extraction
  and adds no package or runtime dependency.

No policy decision remains open.

## Design

### A semantic shell with a body slot

Add `CategoricalDisclosure.svelte`. It owns:

- `details[aria-label]` and its native open/closed behaviour;
- the `summary` text;
- the existing 10 × 10 SVG chevron and native-marker suppression;
- the shared summary typography, colour, gap and pointer treatment; and
- the shared categorical option-row typography and block padding, including
  the empty-row colour.

The component accepts the accessible label, the already-derived summary text
and a Svelte `Snippet` for the body. Brand still owns its search field and
flat option list. Features still owns its grouped feature hierarchy and facet
counts. The shared component adds no wrapper around that body; its scoped
styles reach the descendant option rows with Svelte's `:global(...)` selector.
This retains the existing DOM shape and lets both consumers keep their own
data and event logic.

The public interface is exactly:

```ts
type CategoricalDisclosureProps = {
  label: string;
  summary: string;
  children: Snippet;
};
```

Both consumers retain the selector shape
`details[aria-label="…"] > summary`, including the accessible names `Brand`
and `Features`. The native disclosure remains uncontrolled and closed on first
render. Opening it does not change application state or the URL.

### Appearance is a preservation target

This is not a visual redesign. Before extraction, the real built app establishes
the following baseline at 360 px and 1200 px, in light and dark themes, across
Chromium, Firefox and WebKit:

- summary height: 16 px;
- chevron: 10 × 10 px;
- first option-row height: 21.19–21.20 px depending on engine;
- summary display: `inline-flex`, with an 8 px gap and 13.28 px text; and
- option-row text: 13.28 px with 1.6 px block padding on each edge.

Delivery accepts at most 1 CSS px of geometry drift from those baseline boxes.
The chevron dimensions, shared computed styles, colours and native-marker
suppression should remain unchanged. Minor rasterisation differences between
screenshots are acceptable when the DOM geometry and computed-style checks
pass. Neither the page nor the filter sidebar may gain horizontal overflow.

If sharing the shell would require a new wrapper or a visible change beyond
that tolerance, delivery stops for design review instead of compensating in
one consumer.

## Behaviour and failure cases

- Clicking either summary toggles only its own native disclosure.
- Brand and Features keep their current summary wording (`Any …` or the
  selected count), option labels, controls, counts, disabled states and event
  behaviour.
- Empty rows retain their subdued colour.
- A missing or invalid consumer body is a compile-time TypeScript/Svelte error;
  the shared component has no runtime fallback UI.
- Existing focus, keyboard and screen-reader behaviour comes from the same
  native `<details>`/`<summary>` structure.

## Non-goals

- Generalising `ColumnPicker` or any other disclosure/panel.
- Changing filter state, URL ownership, facet calculations or dataset content.
- Restructuring Brand search, Brand options or the Features hierarchy.
- Controlling or persisting disclosure open state.
- Introducing new animation, interaction chrome or dismissal behaviour.
- Requiring byte-identical screenshots across browser engines.

## Registry sweep

The implementation must account for these existing consumers and guards:

- `BrandFilter.svelte` and `BrandFilter.test.ts`;
- `FeaturesFilter.svelte` and `FeaturesFilter.test.ts`;
- `FilterSidebar.test.ts`, including its heading/group registry;
- `app/e2e/features.spec.ts`, including its all-three-engine disclosure test;
- `app/e2e/cross-browser.spec.ts`, whose selectors open Features;
- `app/e2e/smoke.spec.ts`, which opens every disclosure and enumerates filter
  scrollports;
- `app/src/lib/tokens.test.ts`, which automatically scans new Svelte files; and
- `docs/app.md` §Filters, which owns the categorical-filter rendering contract.

No URL-token, data-schema or score registry changes.

## Build sheet

### Task 1: Extract the shared disclosure without changing behaviour

Files:

- Create `app/src/components/CategoricalDisclosure.svelte`.
- Create `app/src/components/CategoricalDisclosure.test.ts`.
- Modify `app/src/components/BrandFilter.svelte`.
- Modify `app/src/components/FeaturesFilter.svelte`.
- Modify `docs/app.md` §Filters.

Steps:

1. Add a failing component test that renders the proposed interface and checks
   the named native disclosure, direct summary child, summary text, 10 × 10
   chevron, closed initial state, native toggle and rendered body.
2. Implement the shared component with the exact interface above and move only
   the duplicated shell and shared styles into it.
3. Replace each consumer's duplicated shell with the shared component. Keep
   each filter's existing reactive summary expression and body markup intact.
4. Remove the now-duplicated summary, marker and option-row CSS from both
   consumers.
5. Update `docs/app.md` so the shared categorical disclosure, rather than either
   consumer, owns this rendering contract.
6. Run the component suites for the new component, Brand, Features and the
   filter sidebar, then typecheck and lint.

Acceptance:

- Both filters use the shared component and retain their existing accessible
  names and direct-summary selector shape.
- Their existing unit tests pass without weakening behavioural assertions.
- There is one implementation of the summary, chevron, marker suppression and
  common option-row styles.
- No new wrapper, dependency, state owner or URL write is introduced.

### Task 2: Guard visual and browser parity

Files:

- Modify `app/e2e/features.spec.ts`.

Steps:

1. Add a real-app assertion that opens Brand and Features at 360 px and 1200 px,
   in light and dark themes, and records the summary, chevron and first
   option-row geometry and the shared computed styles.
2. Exercise that assertion in Chromium, Firefox and WebKit. Assert the numeric
   preservation bounds above, no horizontal overflow and successful independent
   toggling of both disclosures.
3. Prove the new guard can fail by temporarily changing a shared geometry value
   (for example the chevron width or summary gap), run the focused assertion to
   observe the failure, then revert the mutation and rerun it green.
4. Update the existing test commentary that describes Brand and Features as
   copied implementations.
5. Run the focused three-engine e2e coverage plus the existing cross-browser
   and smoke cases that enumerate disclosures and scrollports.

Acceptance:

- The measured boxes remain within 1 CSS px of the recorded baseline at both
  widths and in both themes in every supported engine.
- Shared computed styles and colours remain unchanged, the chevron stays
  10 × 10 px, and the native marker remains suppressed.
- The page and filter sidebar have no new horizontal overflow.
- The guard has demonstrated a red result under a deliberate mutation and is
  green after the mutation is reverted.

### Task 3: Close the backlog item and verify the repository

Files:

- Modify `BACKLOG.md`.

Steps:

1. Remove the completed categorical-disclosure item from `BACKLOG.md` without
   disturbing the remaining priority order.
2. Run `npm run verify`.
3. Run the full app e2e suite in Chromium, Firefox and WebKit.
4. Review the final diff for unrelated changes and for duplicated disclosure
   styling.

Acceptance:

- The backlog no longer advertises completed work.
- Documentation parity, typecheck, lint, unit coverage and all three browser
  engines are green.
- The final diff contains no dataset regeneration or unrelated refactor.

## Delivery sequence

1. Work only in the `categorical-disclosure` feature worktree.
2. Commit each green task with its owning documentation.
3. Rebase the completed branch onto the then-current local `main` so concurrent
   metrics and release-date work is included.
4. Rerun `npm run verify` and the full three-engine e2e suite after the rebase.
5. Fast-forward local `main`, then remove the worktree and branch.
6. Do not regenerate `data/`: this refactor changes no scraper or dataset code.
