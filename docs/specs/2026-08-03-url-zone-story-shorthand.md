# A `zone=` and `story=` shorthand in the URL

*2026-08-03 · from BACKLOG's "A `zone=` shorthand in the URL", widened to carry
the story too · status: **delivered 2026-08-04 and frozen** — history rather
than reference, and where it disagrees with docs/, docs/ wins. The build sheet
below records what was done and is not a list to run again.*

*Two amendments were made during delivery and are recorded here because the
sheet below still reads as written. Task 7 (the arrival registry) was folded
into task 4, so `zone=`/`story=` could never parse while unowned by
`isBareArrival`. Task 9 (documentation) was dissolved: each behaviour commit
carries its own owning-doc edit, per CLAUDE.md §Conventions, and its residue —
the dated §Decisions entry, the docs/policies.md sentence, closing BACKLOG's
item — landed inside the tasks. One §Bounds row was corrected rather than met
as written; it says so in place. WebKit could not be launched in the delivery
environment, so the three-engine e2e run first happened in CI.*

Give the address bar a short spelling for the two things a shared link is most
often about — which half of the shoe the table measures, and which story it is
built for. Today both ride entirely in `cols` (and, for a story, in `plate` and
`sort` as well), so the plainest possible link is the longest thing this app
emits. Measured on the current `serializeView`, percent-encoded as
`URLSearchParams` writes it:

| view | today | shorthand |
|---|---|---|
| the plain forefoot table | 119 chars | `zone=forefoot` — 13 |
| Easy, heel | 161 chars | `story=easy` — 10 |
| Easy, forefoot | 177 chars | `zone=forefoot&story=easy` — 24 |

Nothing about what a zone or a story *is* changes. This is an encoding, and it
adds no view state: `ViewState` still carries no zone and no preset field, both
still being derived (docs/app.md §The zone is a preset too, docs/app.md §Presets).
One existing token changes with it — `cols` learns to carry an empty list, a view
the whole app already supports and only the URL could not spell — and that is an
encoding change too.

## Decisions

**The shorthand is a baseline, and every other token layers over it.**
`zone=` and `story=` are read in a pre-pass and choose the view that `parseView`
starts from, in place of `defaultView()`. The existing token loop then runs
unchanged and every longhand token wins where the two overlap, so
`?story=easy&sort=-weight` is Easy's table sorted by weight and
`?zone=forefoot&cols=score,weight` is two columns. With neither token present
the baseline *is* `defaultView()` — `defaultColumns(DEFAULT_ZONE)` is what
`defaultView` already holds — so an address carrying no shorthand parses exactly
as it does today, down to the byte.

**`story=` means the whole preset, not just its columns.** `applyPreset` sets a
plate gate, a sort key and a set of columns, and a `story=easy` that reproduced
only the columns would be a link claiming Easy while showing carbon plates. The
baseline is `applyPreset(story, zone, false)` — see the stability note below.

**A view is written short when a *baseline* explains it more cheaply, and the
comparison is length.** `serializeView` enumerates the admissible baselines,
encodes the view against each — emitting each field that differs from *that*
baseline rather than from the default — and emits the shortest result. The
default baseline is always in the running, so:

> **`serializeView` never emits a longer string than the same view would have
> produced without this feature.** A tie goes to the longhand, which is the
> spelling that does not drift across versions.

That single rule replaces every heuristic about when a shorthand "applies".
There is no column diff, no `zoneOf` call and no second definition of what makes
a view Easy — a stray `race-score-heel` column on an otherwise unrelated view
simply loses on length and is written longhand.

**The candidate baselines are three kinds, all cheap:**

- `defaultView()`, always, with no token.
- `defaultColumns(z)` for the zone that is not `DEFAULT_ZONE`, with `zone=z`.
- one per **score column key present in `v.columns`**: the key resolves through
  `defForKey` to the story and through `zoneOfKey` to the zone, with
  `story=<id>` and `zone=` when the zone is not the default. This is the half of
  the rule that matters — a score column is the thing that says which story a
  table is, and docs/app.md §The story scores already establishes that it names
  its own zone rather than taking the derived one. Two score keys give two
  candidates rather than an ambiguity.

**`cols` leaves the all-separator family, so an empty column list round-trips.**
Today `cols=` is skipped by `parseView` and the link opens on the default eight
columns — probed directly against the current code. That is a defect rather than
a posture, and it is the only place in the app that does not support the
zero-column view: it is reachable from `ColumnPicker` (`toggle` has no floor),
both tables render it (`ShoeTableMobile` carries an explicit
`Math.max(cols.length, 1)` guard for a value row holding nothing), and
`desktopMinWidth`, `toCsv` and the detail panel all reduce over the list and are
zero-safe. It is a table of shoes with no measurements — a real view, and a
sendable one.

So **`cols` names the column list literally: what survives the member rules *is*
the list, empty or not.** This takes it out of the rule
docs/app.md §URL encoding states for every list-valued token, and the boundary is
the point rather than an exception grudgingly carved. That rule exists because an
empty `brands`, `plate`, `rows` or `c.` selection means exactly what an absent
one means — filters nothing — so `[]` would be a second spelling of the default
that `sameValue` could never equal, leaving `All` unlit forever. For `columns`,
empty and absent name **different tables**. The rationale never applied; `cols`
was swept into a family it does not belong to.

Two consequences beyond the blank value, both deliberate: `cols=,,,` and
`cols=name` (every member refused — `name` and `brand` sort but can never be
columns) now also mean the empty list, where today each rebuilds the default
eight. That is the permissive-columns doctrine read straight —
docs/app.md §Columns are permissive, ranges and sorts are strict names
*"silently rebuilt a two-column link as the default eight"* as the harm it
exists to prevent, and eight columns nobody asked for is a worse answer than the
zero they did.

**With that, exactly one field makes a baseline inadmissible: a plate gate the
view does not hold.** Every other field a baseline sets can now be overridden by
a later token — `cols` spells any column list including the empty one, `sort`
spells the default sort (`-score`) as readily as any other. `plate` cannot: it is
a default-omitting token with no spelling for *absent*, so a link could not say
"Easy's table, but showing carbon too... and no gate at all". A baseline that
sets a gate the view lacks is therefore dropped from the running. A baseline
whose gate the view merely *differs* on is fine — `plate=carbon` overrides it.

**The stability preference stays its own token.** The parse-side baseline is
built with `stability: false` and `stab=1` layers over it exactly as today, which
is correct only because `applyPreset` uses its `stability` argument for nothing
but the field it assigns. That is currently true and is easy to break with a
fourth story, so it becomes an assertion rather than a reading
(docs/app.md §The story scores).

**An old link is resolved against the build that opens it — the documented
exception.** `zone=forefoot` means whatever `defaultColumns('forefoot')` returns
*now*, and `story=easy` means whatever `applyPreset('easy', …)` builds *now*.
So the promise docs/app.md §Sharing is copying the address bar makes is narrowed
by one clause: sender and recipient see the same table **on the same build of
the app**, which is the promise a continuously deployed static site can actually
keep. A link kept across a change to a story's columns, gate or sort — or to the
default columns — shows the newer table, with nothing saying so. This is accepted
deliberately, and it is why the tie-break above favours longhand: a link that
spells its columns out literally is unaffected, and every link the app has
already emitted is longhand.

**Two spellings, and the app canonicalises to one on arrival.** A longhand link
still parses; `Page.svelte` already rewrites the address bar once at init from
`addressOf(initial.view, …)` (docs/app.md §View and URL ownership), so a
recipient's bar shows the short form whichever they were sent. Nothing else in
the app compares query strings — `isDefaultView`, `All`'s mark and
`upToColumnOrder` all compare view objects — so the two spellings meet nowhere.

**`zone=heel` is accepted and never written.** It parses to the default view, and
like `cols=<the default eight>` it is an owned token, so it is not a bare arrival
even though the table it produces is the default one. That is the posture already
settled for `?plate=xyz` (docs/app.md §View and URL ownership).

**No `story=all`.** `All` at zone *z* is that zone's plain table, which is
already `zone=z`. A second spelling of one view is the thing this encoding
avoids.

### Why `urlstate.ts` has to be split first

The encoder now needs `applyPreset`, and `presets.ts` imports `defaultView` from
`urlstate.ts` — so the import would be the app's first module cycle. The fix is
the layering the cycle is pointing at: **what a view is** moves to a new
`lib/view.ts`, leaving `urlstate.ts` as the encoding alone, giving
`view.ts → presets.ts → urlstate.ts`. Five names move verbatim, and the ~20 call
sites are a path change that `npm run typecheck` proves. `sameValue`,
`upToColumnOrder` and `PLATES` stay put: nothing needs them moved, and moving
them would churn call sites for tidiness rather than for a cycle.

## Bounds

Each is a number with a home, and none is invented — the three lengths are
measured off the current `serializeView`.

| bound | home |
|---|---|
| `serializeView(applyPreset('easy','heel',false)) === 'story=easy'` | `urlstate.test.ts` |
| `serializeView(applyPreset('easy','forefoot',false)) === 'zone=forefoot&story=easy'` | `urlstate.test.ts` |
| `serializeView({...defaultView(), columns: defaultColumns('forefoot')}) === 'zone=forefoot'` | `urlstate.test.ts` |
| the shorthand never lengthens: over a corpus of views, `serializeView(v).length` is `<=` the length the default baseline alone would produce | `urlstate.test.ts` |
| round-trip for every story × zone × stability, and for each zone's plain table, each also carrying a search, a range bound, a brand set, `disc` and a feature selection | `urlstate.test.ts` |
| a view carrying no shorthand serialises byte-identically to today | `urlstate.test.ts`, as literal expected strings |
| `parseView('cols=').columns` is `[]`, and so is it for `cols=,,,` and `cols=name` | `urlstate.test.ts` |
| the zero-column view round-trips bare; alongside a shorthand token it is asserted **parse-side**, `?story=easy&cols=` being that story with an empty column list — a round trip cannot reach the pair, because a story candidate is derived from the columns a view holds and this view has none | `urlstate.test.ts` |
| `applyPreset(id, z, true)` differs from `applyPreset(id, z, false)` in `stability` and nothing else, for every id and zone | `presets.test.ts` |
| `zone=` and `story=` are not bare arrivals | `arrival.test.ts` |
| `/?zone=forefoot&story=easy` opens with Easy and Forefoot marked, and the address bar canonicalised to that same string | `Page.test.ts` |

## Non-goals

No shortening of filters, brands, feature selections or `gen.` pairs. No
`story=all`. No new view state. No change to what any story or zone means, to the
marks, or to `applyPreset`'s signature. No floor on `ColumnPicker` — unticking
the last column stays allowed, and is now shareable, which is what the round-trip
fix buys; whether the picker *should* have a floor is a separate question this
does not open.

## Policies cited

docs/policies.md §Identity and sharing — the URL is the only home for view
state; this adds a token, not a store, and narrows the fidelity promise to one
build, which is recorded there.
docs/policies.md §State ownership and validation — the shorthand is parsed
once, as hostile input: an unknown `zone`
or `story` value is dropped and the baseline falls back, the strict posture,
because a bad baseline would rewrite the whole table rather than one cell.
docs/policies.md §Vocabulary — the story ids come from `SCORE_DEFS` via
`defForKey` and the zone from `zoneOfKey`, so no list of story names is
restated here.

---

# Build sheet

## File map

**Create**
- `app/src/lib/view.ts` — `ViewState`, `DEFAULT_SORT`, `DEFAULT_ZONE`,
  `defaultColumns`, `defaultView`, moved verbatim from `urlstate.ts` with their
  comments.

**Modify**
- `app/src/lib/urlstate.ts` — re-import the five moved names; baseline pre-pass
  in `parseView`; candidate enumeration in `serializeView`.
- `app/src/lib/arrival.ts` — `OWNED` gains `zone|story`.
- `app/src/lib/presets.ts`, `zone.ts`, `ordering.ts`, `announce.ts` — import path.
- `app/src/App.svelte`, `Page.svelte`, `components/ShoeTable.svelte`,
  `ShoeTableMobile.svelte`, `FilterSidebar.svelte`, `PlateFilter.svelte` — import path.
- Tests taking a moved name: `App.test.ts`, `Page.test.ts`, `zone.test.ts`,
  `ordering.test.ts`, `announce.test.ts`, `presets.test.ts`, `urlstate.test.ts`,
  `components/ShoeTable.test.ts`, `ShoeTableMobile.test.ts`, `FilterSidebar.test.ts`.
- `app/src/lib/urlstate.test.ts`, `presets.test.ts`, `arrival.test.ts`,
  `Page.test.ts` — the new assertions.
- `docs/app.md` §URL encoding (the grammar, the baseline rule, the drift
  exception, and `cols` leaving the all-separator rule — that rule's own sentence
  says it binds "every such token including one added later", so it is amended
  where it is stated rather than contradicted from elsewhere),
  §View and URL ownership (one line: baseline tokens parse first),
  §Decisions (a dated entry for the version-relative link).
- `docs/policies.md` §Identity and sharing — one sentence narrowing the fidelity
  promise to one build.
- `BACKLOG.md` — close item 8.

## Interfaces

Module-private to `urlstate.ts` unless marked exported.

```
// The view a link's shorthand names, before any longhand token layers over it.
// Last occurrence of a duplicated key wins, matching every other token.
baselineFrom(p: URLSearchParams): ViewState

// One way of writing a view: the baseline it is encoded against and the tokens
// that name that baseline, written before every other token.
interface Candidate { view: ViewState; tokens: [string, string][] }
candidatesFor(v: ViewState): Candidate[]   // default first; ties therefore go to longhand
```

`serializeView(v: ViewState): string` and
`parseView(qs: string, idx: TestIndex): ViewState` keep their exported
signatures. `applyPreset` keeps `(id, zone, stability)`.

## Tasks

1. **Split `lib/view.ts` out of `urlstate.ts`.** Move the five names verbatim,
   update every import. No behaviour change. *Evidence:* `npm run verify` green
   with no test edited beyond an import path. *Pointers:* spec §Why `urlstate.ts`
   has to be split first.
2. **Make `cols` name its list literally.** What survives the member rules is
   the column list, empty or not — independent of every other task here, and
   landable on its own. *Evidence:* failing-first cases in `urlstate.test.ts`
   for `cols=`, `cols=,,,` and `cols=name`, plus the zero-column round trip.
   *Pointers:* docs/app.md §URL encoding (the all-separator rule this amends),
   §Columns are permissive, ranges and sorts are strict; spec §Decisions.
3. **Assert the stability invariant.** `applyPreset(id, z, true)` differs from
   `applyPreset(id, z, false)` only in `stability`, for every id and zone.
   *Evidence:* new failing-first case in `presets.test.ts`.
   *Pointers:* docs/app.md §The story scores; spec §Decisions.
4. **Parse the baseline.** `zone=`/`story=` pre-pass feeding the existing loop;
   unknown values dropped. *Evidence:* `urlstate.test.ts` — `?story=easy`
   equals `applyPreset('easy','heel',false)`; `?zone=forefoot&sort=-weight`
   layers; `?story=banana` is the default view.
   *Pointers:* docs/app.md §URL encoding;
   docs/policies.md §State ownership and validation.
5. **Serialize against candidates.** Enumerate, encode against each, emit the
   shortest; drop a baseline that sets a plate gate the view lacks.
   *Evidence:* the three exact strings, the never-lengthens bound, and the
   byte-identical-when-no-shorthand corpus, in `urlstate.test.ts`.
   *Pointers:* spec §Decisions.
6. **Round-trip.** Every story × zone × stability and each zone's plain table,
   bare and each carrying a search, a range bound, a brand set, `disc` and a
   feature selection. *Evidence:* `urlstate.test.ts`. *Pointers:* docs/app.md
   §View and URL ownership (every field serialises).
7. **Join the arrival registry.** `OWNED` gains `zone|story`; the enumerated
   owned-token list in `arrival.test.ts` gains both. *Evidence:*
   `arrival.test.ts`. *Pointers:* `arrival.ts`'s own note that this is the URL
   grammar's second home.
8. **Prove the whole chain.** `/?zone=forefoot&story=easy` opens with Easy and
   Forefoot marked and the address bar canonicalised to that string.
   *Evidence:* `Page.test.ts`. *Pointers:* docs/app.md §View and URL ownership.
9. **Docs ride the change.** The four doc edits in the file map, in the commits
   that change the behaviour they describe. *Evidence:* `npm run check:docs`.

## Global constraints

- Never a longer string than the default baseline would have produced; ties go
  to longhand.
- An address carrying neither token parses and serialises byte-identically to
  today — with the single intended exception of task 2's `cols` correction.
- `ViewState` gains no field.
- No live network; no wall-clock; failing test first for every behaviour change.
- Feature work in a worktree at `~/dev/shoe-lab-<branch>`, landed by rebase and
  fast-forward, `data/` untouched (CLAUDE.md §Conventions).

## Sequencing notes

Task 1 lands alone and green before anything else — every later task imports
across the new boundary. Task 2 is independent of the rest and could land in
either order, but comes early so the `cols` correction is not tangled with the
shorthand in review or in a bisect. Task 3 before task 4, because the parse-side
`stability: false` baseline is only correct if task 3's assertion holds.
