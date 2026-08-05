# Cross-cutting policies

The semantics that live *between* features — what a per-feature spec would
otherwise assume someone else decided. Every entry here binds any feature
that touches its ground; a spec written by the `designing` skill cites the
entry instead of re-deciding it. This register was written retroactively:
the first hunt's serious findings each traced to a policy below being
unowned, and the fix wave that closed them is where these answers were
settled. Each entry is the claim; the pointed-at section owns the
mechanics, measurements and edge cases.

Changing an answer here is a dated entry in the owning doc's Decisions
section — shipped behaviour depends on these. A future question with no
answer yet is written here as **UNDECIDED** rather than left implicit, and
surfaces in review of any feature touching it. There are none today.

## Identity and sharing

**The URL is the only home for view state; storage holds properties of the
runner, never of the search.** A bare link means the default view for every
recipient — a stored view answering a bare link showed two people two
different fleets. `Copy link` flushes the pending write before reading the
address, and init scrubs tokens the app does not own while treating a link
that carries only such tokens as a bare arrival
(docs/app.md §View and URL ownership,
docs/app.md §Sharing is copying the address bar).

**A shared address is faithful on one build.** The `zone=` and `story=`
shorthand names a view rather than spelling it out, so a link kept across a
change to what a story or a zone's plain table means opens on the newer
table — the promise a continuously deployed static site can keep
(docs/app.md §URL encoding).

**Back is a row-level gesture.** Only the open-row set pushes history;
filters, sort and columns stay on the `replaceState` path, and a popped
entry restores its open set while keeping the live view
(docs/app.md §View and URL ownership).

## State ownership and validation

**One owner: `Page.svelte` holds the whole view; the URL is write-only and
parsed once, as hostile input.** Unknown keys are dropped, ranges and sorts
are strict allowlists, columns are deliberately permissive — a bad column
costs one cell, a bad range hides the fleet
(docs/app.md §View and URL ownership,
docs/app.md §Columns are permissive, ranges and sorts are strict,
docs/app.md §URL encoding).

**Nothing is written for a runner that selects nothing without saying so,
and nothing bad reaches the repo.** In the app, filters that match nothing
name the filter that emptied the table; in the pipeline, validation gates
fail the run rather than write, and `build:dataset` is deterministic so an
unchanged input produces no diff (docs/app.md §Filters,
docs/scraping.md §Validation gates, docs/scraping.md §Determinism).

## Failure posture

**Old data stays live; a failure is loud and changes nothing.** A red
refresh commits nothing, the deploy follows only a commit CI has proved,
and drift is reported, never silently absorbed
(docs/operations.md §Where failures are contained,
docs/operations.md §Deploy, docs/operations.md §Contract-drift runbook).

## Compatibility floor

**360px of layout, three engines, and the floor is guarded rather than
promised.** Chromium, Firefox and WebKit all run the filters browsers
implement differently; below 360px the app degrades scrollably rather than
being served, and the bill for 320px support is recorded where the decision
is (docs/app.md §The narrowest supported width is 360px,
docs/operations.md §The e2e run needs three browsers).

## Vocabulary

**One home per name and per value's rendering, looked up, never restated.**
Metric names and their width bounds live in `labels.ts`, per-value words
like the plate field's in `PLATE_LABELS`, direction in `direction.ts`, the
announcement's sort phrasing shared with the header's — so a rename lands
everywhere or nowhere, and the two table renderings cannot drift apart
(docs/app.md §Table presentation, docs/app.md §Categorical columns,
docs/app.md §Two renderings, and only one of them mounted).

## Announcement

**A control announces what its action did, through one always-rendered
region — never what native semantics already say, never a row count.** The
count is the receipt's; the wording is derived in `announce.ts` from the
view the control produced, and the exemption list is a test
(docs/app.md §What a control says it did,
docs/app.md §The header names the catalogue, the receipt owns the count).

## Interaction chrome

**Every floating panel dismisses the same three ways — outside press,
Escape, focus leaving — and focus is moved deliberately, never dropped.**
Modal panels take focus on open and return it to their opener on close; an
anchored panel may retain focus on its trigger and treats trigger plus panel as
one boundary. The one ring rule lives once in `app.css`, every scrollport
holding a focusable pays `--ring-room` through one class, and the suite
enumerates the scrollports rather than trusting the CSS
(docs/app.md §Every floating panel dismisses the same way,
docs/app.md §Theming).

## Third parties and cost

**Minimum requests, honest identification, visible attribution, zero
standing cost.** All live traffic goes through one throttled client; no
test touches the live site; every surface links back to RunRepeat; nothing
in the project may acquire a per-run cost without a recorded user decision
(docs/scraping.md §Politeness,
docs/decisions.md §Be a good citizen toward RunRepeat,
docs/decisions.md §Testing bar: adversarial, no live network,
docs/decisions.md §Free tools only).
