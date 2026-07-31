# Back closes the shoe: history is row-based

Frozen build-time artifact. Where this disagrees with docs/, docs/ wins.

## The problem, stated correctly

BACKLOG item 4 reads "`popstate` is unhandled", which sounds like a missing
listener. It is not. `history.replaceState` is called in exactly one place
(`Page.svelte:208`) and `pushState` in none; `SkipLink.svelte` even
`preventDefault`s its own fragment navigation so nothing else writes the address
bar. **The app creates zero history entries.** A `popstate` handler added today
would be dead code — there is nothing to pop back to.

The work is deciding what a history entry *is*.

## Back is navigation, not undo

Back returns you to a place you were. Ctrl+Z undoes an edit. Conflating them is
the Google Maps failure: every pan becomes an entry, Back eight times leaves you
still in the map, and the gesture that meant "leave" now means nothing.

This tool has **one screen, plus N shoe panels**. Filters, sort, columns and the
story buttons are not a sequence of places — they are the one place being tuned,
which is why `replaceState`-only was right for them and stays. An open detail
panel *is* somewhere you went.

**Back closes the shoe you opened. Nothing else pushes.**

The motivating case is the phone, where Back is the system gesture: a runner
opens a row, reads it, swipes Back to close it, and today leaves the site,
losing the whole session.

## What pushes, and what the debounce does

Only a change to the open set pushes. The debounced write path
(`VIEW_WRITE_MS`, 200ms, trailing) is **untouched and still replace-only**,
because the only thing that pushes is a discrete click on a row and a click
cannot fire sixty times a second.

The push path is immediate and **flushes the pending view write first**. Without
that flush: drag a filter, then open a row inside 200ms, and the pending replace
lands on the *new* entry 200ms later, closing the row in the URL while it is
open on screen.

Closing a row by clicking it is also a push — a new entry with that slug
removed. `history.back()` is wrong here: once two rows are open there is no
reason to think the one being closed is the top entry.

`debounce.ts` gains `cancel()` beside `flush()`. `popstate` needs it: the
pending write belongs to the entry just left, which can no longer be reached, so
flushing it would write the wrong view to the wrong entry. Cancelling loses
nothing — the state assignment in `setView` is immediate, so the live view
already holds the change, and the reconciling `replaceState` below writes it out.

## The rule

**A history entry records which rows are open. Every other dimension is always
the live view.**

On `popstate`: cancel the pending write, take **only** the open set from the
popped entry, keep the live view, then `replaceState` the merge so the address
bar is honest. Forward is symmetric.

The merge is not tidiness. Adopting the popped URL wholesale loses work:

```
?plate=carbon                          E1
open vomero → push                     E2  ?plate=carbon&open=nike-vomero-18
add brands=nike → replace on E2        E2  ?plate=carbon&brands=nike&open=…
Back                                   E1  ?plate=carbon        ← brands lost
```

Merging keeps `brands=nike`, takes the empty open set from E1, and replaces
`?plate=carbon&brands=nike` onto E1.

## Where the open set lives: beside `ViewState`, not in it

The four toolbar marks are never stored. Each is recomputed by rebuilding what
the story would produce now and comparing it to the live view
(`Page.svelte:190`, `:196`), and `sameValue` compares **the whole `ViewState`,
every field, by value** (`urlstate.ts:64`).

So an `open` field inside `ViewState` produces this: click Easy, Easy lights,
tap a row to read it, **Easy goes dark** — the search has not changed by one
bound, and the mark is the only thing telling the runner what they are looking
at. `applyPreset` builds from `defaultView()` (`presets.ts:41`), so its `open`
is `[]` and yours is not.

That is fixable by carrying `open` through the way `stability` already is — the
comment at `presets.ts:43` states the pattern — but it is **a convention nothing
enforces**, across the three sites that build a view for comparison
(`applyPreset`, `allView`, `projectZone`), with a fourth story pending
(BACKLOG item 10) that would silently unmark itself by dropping the argument.

`ViewState` therefore does not gain a field. `open` is Page-level state with its
own parse/serialise pair, and `sameValue` **cannot see it**. The mark bug is
unreachable rather than handled, and `presets.ts` and `zone.ts` do not appear in
the diff.

The test applied: `ViewState` is filters, sort, columns, generations, rows,
stability — every field answers *which shoes, shown how*. An open panel answers
neither. It is what you are reading, not what you searched. That is the same
claim that makes history row-based.

## Encoding

`open=<slug>,<slug>` — a free key, and deliberately not named `rows`, which
already means the runner's filter rows (docs/app.md §Filters).

Two new functions in `urlstate.ts`, both additive:

```ts
export function serializeOpen(open: string[]): string
export function parseOpen(qs: string, slugs: ReadonlySet<string>): string[]
```

`parseView` needs no change: its body is a chain of `else if`s on known keys, so
`open=` already falls through untouched. `serializeView` builds a fresh
`URLSearchParams` from `ViewState` alone, so it never emits the key. The write
path composes them:

```ts
[serializeView(v), serializeOpen(open)].filter(Boolean).join('&')
```

`parseOpen` **validates slugs against the catalogue** — possible precisely
because it is a new function with a free signature, where `parseView` is locked
to a `TestIndex` by 75 call sites. An unknown slug is dropped rather than
carried inert, which is the hostile-input contract the rest of the encoding
already keeps (docs/app.md §URL encoding), and an all-separator value stays
empty, the same rule `brands`, `plate` and `rows` follow.

Init is unchanged in shape: the query string is parsed once and written back
with `replaceState`, so a link carrying `open=` arrives with those rows open and
spends no history entry doing it.

Order is insertion order, as the `SvelteSet` gives today. Two runners opening
the same pair in opposite orders produce different strings that render
identically; canonicalising would need a table order, and the table's order
moves with the sort.

## Storage keeps the view and not the reading

`writeStoredView` receives `serializeView(v)` — the view only. So
"`persist.ts` stores **the exact output of `serializeView`** and nothing else"
(docs/app.md §View and URL ownership) becomes literally true again, and a
returning visitor does not find last week's panel hanging open mid-table. Both
for free, out of the same decision. The stored format is unchanged, so
`VIEW_STORAGE_KEY` stays at `v4`.

## The set moves up out of the two tables

`ShoeTable.svelte:33` and `ShoeTableMobile.svelte:32` each own a `SvelteSet`,
and only one of them is ever mounted (docs/app.md §Two renderings, and only one
of them mounted). **Crossing 700px today silently drops every open row.**

`Page.svelte` owns the set; both tables take `open` and an `ontoggle`. The
rotation loss is fixed as a consequence, not as a second feature. The
`tick()`-then-`scrollIntoView` on open stays in the components, which know their
own rows.

A link-borne open row does **not** scroll. Its position depends on the sort and
the filters, and a runner arriving at a table they have not read should not be
dropped into the middle of it past the receipt and the toolbar.

## What does not change

`ViewState`, `serializeView`, `parseView`, `presets.ts`, `zone.ts`, the 200ms
interval and the debounced path itself, `persist.ts` and its `v4` key.

`stripOpen` stays ephemeral: Back to the first view does not reopen the setup
strip. That is an acceptance, not an oversight — docs/app.md §Presets rules out
a stored dismissal and this does not reintroduce one.

## Bounds to assert

- `parseOpen` drops a slug absent from the catalogue; `",,"` stays empty.
- `parseOpen(serializeOpen(open))` round-trips losslessly.
- `serializeView` emits no `open` key; `parseView` ignores one.
- Opening a row calls `pushState`; **a filter change never does** — the bound
  that keeps the debounce safe.
- A pending write is flushed before a push: drag, then open inside 200ms, and
  the row is still open in the URL 200ms later.
- `popstate` keeps live filters and takes only the open set — the E1/E2 trace
  above, asserted.
- `popstate` cancels the pending write rather than flushing it.
- **With Easy applied and a row open, `storyMark` is still `'easy'`.** The
  regression test for the whole reason `open` sits outside `ViewState`.
- Crossing 700px keeps rows open.
- e2e: open a row, press Back — the row closes, the filters survive, the page
  is still the app.

## Rejected

**Pushing on filter changes.** Back is navigation, not undo. A drag with pauses
clears the 200ms debounce repeatedly, so one gesture is several entries, and
Safari throttles `pushState` at ~100 per 30s exactly as it does `replaceState` —
the reason the debounce exists is the reason this sits near the platform limit.
The in-page recovery is better anyway: the receipt says what each bound excludes
and `All` restores a sane table in one click (docs/app.md §What All does). On
desktop, Back after a long filtering session means *leave*.

**`open` as a `ViewState` field carried through the preset builders.** Works,
and has precedent in `stability` — but see above: a convention across three
sites with a fourth story pending.

**`history.back()` to close a row by click.** Assumes the row being closed owns
the top entry, which two open rows disprove.

**Persisting open rows across visits.**
