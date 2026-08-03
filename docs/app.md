# App

Svelte 5 SPA, no router, no store, no runtime dependency beyond Svelte. It
fetches one file — `shoes.json`, copied into `app/public/` by `sync-data` at
dev/build time — and everything else is pure functions in `app/src/lib`
(filters, sort, stats, presets, URL state, CSV export) driving dumb
components. Dataset shape and field semantics are docs/scraping.md.

## View and URL ownership

**The URL is the only home for view state.** Storage holds *preferences* — the
theme, and whatever else is a property of the runner rather than of the search —
and it holds no view. A runner who wants to keep a table state **bookmarks the
address**, which is the mechanism this app already had and already tested by
sharing links.

The reason is link fidelity. A stored view answered a bare link: the sender
copied the empty address of the default view, and the recipient's own last
session filled it in, so the same URL showed two people two fleets and rewrote
the recipient's address bar into a link they could forward believing it was the
one they were sent. The cost accepted in exchange is that a bare link now means
**the default view for every recipient**, including the sender on their next
visit — and that is the property a link has to have.

`Page.svelte` holds the whole view — filters, sort, columns — as one local
`$state` object. The URL is **write-only**: `parseView` runs exactly once, at
init, inside `untrack`, over the query string and nothing else; every change goes
through `setView`, which sets the state and `history.replaceState`s the
serialised form.

The state assignment is immediate — the table filters live, which is the whole
point of filtering — but the URL write is **trailing-debounced at 200ms**
(`lib/debounce.ts`), because a dragged histogram handle emits about sixty view
updates a second: a two-second gesture would otherwise make 120 `replaceState`
calls, past Safari's ~100-per-30-seconds throttle inside a single drag. The
search box had the same latent problem on every keystroke. It is still **one**
write path, now asynchronous, and it flushes on `pagehide` so a page being torn
down never loses the pending write.

**Two callers flush it, and each is a moment the address bar has to be
current**: `pagehide`, and `Copy link` before it reads `location.href`
(§Sharing is copying the address bar). The interval is the drag's and is not also
a promise about copying — that promise was made here once and measured false at
52ms.

`ViewState` carries **no zone**. Which half of each zone pair a view is about is
read back out of it by `zoneOf` (§The zone is a preset too), so the baseline is a
constant: `defaultView()` takes no argument and `DEFAULT_ZONE` is the one place
`'heel'` is written. `defaultColumns` still *requires* a zone, which is what
stops a second call site defaulting by accident. `parseView` has nothing to
resolve before it builds that baseline — the columns a link carries are the
zone it carries.

Init takes a query string or the defaults, and nothing else can speak. **An
address that carries nothing this app owns is a fresh start**, whoever is arriving
and whatever they did last week; `isBareArrival()` in `lib/arrival.ts` is that
predicate, and the setup strip and the loading placeholder both read it so the
room reserved and the room used are one answer (§The setup strip, §Decisions).

**Init also writes the address bar once, and that write is a scrub.** `parseView`
drops what it cannot vouch for (§URL encoding) — but only from the *view*, so a
link shared through a newsletter or a chat app kept its `utm_source` and `fbclid`
in the bar for the whole session, and the runner's own `Copy link` then forwarded
someone else's analytics along with their filters. The first `replaceState`
therefore writes the parsed, composed address, so what is on screen and what is in
the bar agree from the first frame. It is the same composition every later write
uses, so there is no second spelling of "the address of this view".

**A token this app does not own changes nothing at all.** A link wearing only
`utm_source` and its kin is a **bare arrival**: same table, same setup strip, same
rendered page as the bare address — asserted as the whole page, not as a
resemblance — with the junk gone from the bar. The predicate is therefore asked of
the **canonical** address rather than the one the runner arrived on, and the two
callers ask one rule of two addresses: `Page.svelte` passes the address it has
just composed, where it reduces to "is it empty", and `App.svelte`'s placeholder
has no catalogue yet and passes the raw one, where it is the same question asked
of what the address *carries*. The residue between them is exactly an owned key
whose value parsing then drops — `?plate=xyz` — which costs one layout shift on a
hand-mangled link; making it exact would need the catalogue the placeholder is
waiting for. A link that carried a real token, junk beside it or not, is not bare.

**Stability rides in `ViewState` and therefore in the URL alone.** It resets on a
bare arrival like every other field, and any bookmark or shared link of a
stability-on view already carries `stab=1` (§URL encoding), so links stay
faithful. Persisting it was considered and declined: it changes what a score
means, and a preference that silently re-ranked a link's table would be the
same defect this section just removed, wearing a different name.

The view is never re-derived from the URL. Not a shortcut — a correctness
requirement: state that does not serialise would be silently dropped on the
round trip. Every field of `ViewState` therefore serialises, `rows` included.

"Serialises to nothing" and "is the default" are still different questions, and
`sameValue(v, defaultView())` answers the second: a range key holding no bound
at all is real view state that `serializeView` omits, so
`serializeView(v) === ''` would call such a view default. `sameValue` compares
the whole `ViewState` **by value**, never by key presence — `structuredClone`
keeps own properties whose value is `undefined`, so every cleared field leaves
its key behind and a key count would never let a derived control re-open. Every
derived mark in the app is one such comparison (docs/app.md §Presets).

The one thing left of the old arrangement is **a single `removeItem` at boot**,
in `main.ts`: every browser that ever ran an older build is carrying a view under
a key nothing reads any more, and leaving dead data in a runner's storage is not
a thing to do on purpose. It names the one key that build wrote — enumerating
older ones would outlive the sessions carrying them — and it is the only storage
call outside the theme's (§Theming).

**Back closes the shoe you opened, and nothing else pushes.** Back is a navigation
gesture rather than an undo, and this tool has one screen plus N shoe panels: filters,
sort, columns and the story buttons are the one place being tuned, so they keep the
`replaceState`-only path. A change to the open-row set is the only thing that calls
`pushState`, and it flushes the pending view write first — left pending, that write
lands on the new entry 200ms later and closes in the URL a row that is open on screen.
Closing a row is a push too: `history.back()` would assume the row being closed owns the
top entry, which two open rows disprove.

**A history entry records which rows are open; every other dimension is always the live
view.** `popstate` therefore takes only the open set from the entry it lands on, keeps
the view as it stands, and `replaceState`s the merge. Adopting the popped address
wholesale would discard any filter changed while the row was open. The pending write is
`cancel`led rather than flushed — it belongs to the entry just left, which can no longer
be reached — and nothing is lost, because the state assignment was immediate and the
reconciling write carries it.

**A popstate that opens a row scrolls to it; one that only closes does not, and neither
does a link.** Opening is opening: the same row, reached by Forward instead of by a press,
gets the same landing — the row target, below both pinned bands, reduced-motion aware —
because the alternative was one behaviour deciding itself on how the runner got there.
Measured on the real fleet at a scroll depth of about 4,100px on the desktop rendering and
7,400px on the phone's, Forward lands the row **flush under the bands, on the same pixel
the click did**, in Chromium and Firefox alike. Where several rows open at once it is the
**first in document order** — the sorted row order rather than the order the address lists
them in, so it is whichever the runner meets first coming down the table — and a slug the
filters have hidden has no row to land on and is skipped. `Page.svelte` decides *which*
row; each rendering owns *how* it scrolls, which is why the two tables export the reveal
rather than sharing one.

The two halves that still do not scroll are the ones that reasoning was actually about. A
**close** does not, because a click-close does not either, and Back is the one gesture
whose point is to leave where you were. A **cold link-borne `open=`** does not, because
where a row sits depends on the sort and the filters, and a runner arriving at a table
they have not read must not be dropped into the middle of it.

**Back announces nothing**, and that is unchanged. The silence is the same call `expanding
a row` already makes: the row carries `aria-expanded` itself, so the fact is spoken by the
element rather than by the status region (§What a control says it did), and announcing it
only when history moved it would make one fact audible or silent depending on how it was
reached.

The open set is held **beside** `ViewState`, not in it. Every toolbar mark is a
`sameValue` comparison of whole views (§Presets), so an `open` field would unmark the
story the moment a row was tapped. Keeping it out makes that unreachable rather than
handled, and leaves `applyPreset`, `allView` and `projectZone` with nothing to carry.
It is also why `serializeView` never emits the token: the address bar is composed from
`serializeView` and `serializeOpen` together, so every other comparison of a whole view —
the toolbar's marks, `isDefaultView` — is spared a field that is about reading rather
than searching.

### What a drag may recompute

`setView` replaces the **whole** `ViewState` object, so every `$derived` that
reads the view re-runs — sixty times a second while a grip is held, whether or
not the field it reads moved. That is the frame budget's one structural hazard,
and three rules keep it affordable. `recompute-budget.test.ts` is the rig: it
counts fleet-wide passes per bound change, and the counts it asserts are
independent of fleet size.

**Read a view field through a `$derived` of its own when fleet-wide work hangs
off it.** A derived propagates only when *its own value* changes, so
`const stability = $derived(view.stability)` is what stops a replaced view
object from rebuilding all three stories' score maps over both zones. Reading
`view.stability` directly at the point of use puts them back on every frame.

**Nothing invisible pays for itself.** A closed `<details>` still renders its
children, so `ColumnPicker` resolves its coverage bars only while open, and
`FilterSidebar` resolves the add-filter options' coverage where the dialog is
mounted rather than in the derived that feeds it. Each figure is a full pass
over the population, and there are forty-odd of them.

**A grip that lands on the bound it already holds says nothing.** Snapping to
values that exist puts most frames of a slow drag back on the same reading, so
`RangeFilter` compares before calling `onchange` — an identical bound would
otherwise cost a whole view rebuild for no change on screen.

**A population the change cannot move keeps its identity.** `considered` is the
same shoes before and after a bound moves — that is what §Coverage rests on —
but `applyFilters` builds a new array each time, and a `$derived` propagates on
`!==`, so a fresh array per frame restarts every pass hanging off it. Everything
that reads the population reads it through `population.ts`, which keys its
answer on the filters *without* their ranges and hands back the array it already
built: the sidebar's dozen coverage headings, the brand facet's figure per brand
and each feature checklist's figure per value then cost nothing while a grip is
held. Measured on the 450-shoe fleet at 1440px, before the feature checklists
existed, a drag step went from about 20,600 shoe-visits to about 1,200, and the
main thread from about 9.4ms to about 6.9ms of the frame. Each call site holds
its own reader — the sidebar's population and the brand facet's differ by one
filter, and a facet's counts are one reader *per facet*, since each is taken over
the population with its own facet lifted — so a shared entry would evict on every
call and hold nothing.

What remains per update is what genuinely moved: one filter pass, two more per
**bounded** row for its `excluded` count — a leave-one-out is conditioned on the
rest of the set, so moving any bound moves every other row's figure — one sort,
one ranking per rendered column (`percentileMap` defers to `rankMap`, one walk
of the sorted run rather than one per shoe), and the table's DOM. The DOM is now
the larger half by far, which is a row-count problem rather than a reactivity
one — BACKLOG.md holds it.

## Sanitised-HTML boundary

`{@html}` appears in exactly two places, both in `DetailPanel.svelte`:
`details.whoShouldBuy` and `details.whoShouldNotBuy`. Those two fields are the
only ones sanitised at build time, by the allowlist in
`scraper/src/sanitize.ts`, which is regression-tested against breakout
attempts. Every other field — name, brand, intro, pros, cons, features — is
raw scrape text and must stay plain interpolation.

Adding an `{@html}` sink is a security decision, not a formatting one: it
requires the field to be sanitised in the scraper first, and tests on both
sides. Removing the sanitiser and "escaping in the component" is not
equivalent — these fields are meant to render as markup.

Two mechanisms enforce this, and they fail on different mistakes.
`svelte/no-at-html-tags` errors on a careless sink but is silenced by an inline
disable, so it cannot see a deliberate one added with a disable attached;
`app/src/html-boundary.test.ts` pins the exact two expressions and catches that.
Neither is redundant — a change satisfying only one of them is a change to this
boundary, and needs the decision above.

## URL encoding

Compact and default-omitting, so a shared link carries only what was changed:
`r.<key>=<min>~<max>` per range (either side may be empty for open-ended),
`plate` and `brands` (comma-joined), `after`, `q`, `disc=hide|only`,
`c.<slug>=<comma-joined values>` per feature selection, `missing=1`,
`stab=1`, `rows` (comma-joined), `open` (comma-joined shoe slugs),
`sort` (`-` prefix means descending), `cols` (comma-joined), and
`gen.<currentSlug>=<chosenSlug>` per superseded pair. A value equal to the
default is not written at all — a generation choice naming its own key is the
default and never appears.

`stab=1` is written only when the stability preference is on
(docs/app.md §The story scores), so a shared link carries the sender's own
preference alongside their filters. That is accepted rather than overlooked: the
preference changes what the score means, so a link that dropped it would show
the recipient a different ranking under the same URL.

`open` names the shoes whose detail panels are showing, and is the one token that is not
view state: it is what the runner is reading rather than what they searched, and it is
the only thing a history entry records (§View and URL ownership). It is parsed by its own
`parseOpen` rather than by `parseView`, which is what lets it be checked against the
fleet — `parseView` only ever receives a `TestIndex` and could never vouch for a shoe
slug. A slug that has left the fleet is dropped, and an all-separator value stays absent,
the same rule `brands`, `plate` and `rows` follow. The two encodings compose into one
address and neither writes the other's token, so `serializeView` stays free of the
reading (§View and URL ownership).

**There is no zone token.** The zone rides in `cols`, which is the only thing
that records it (§The zone is a preset too), so a plain forefoot table is a verbose
link: eight column slugs where `zone=forefoot` would be one. That is the
accepted cost of having one encoding of the zone rather than two that can
disagree. A `zone=` shorthand expanding to `defaultColumns(zone)` is the remedy
if the length ever becomes annoying in practice (BACKLOG.md).

`parseView` treats the query string as hostile input and drops anything it
cannot vouch for, always falling back to the default rather than throwing:
range and sort keys must name a numeric test or a numeric shoe field, a
malformed bound voids that whole range (dropping one side would silently widen
it), `after` and `disc` are pattern-checked, a `q` of nothing but whitespace is
the empty query (§Filters), `plate` keeps only allowlisted members and is
deduped into declared order, **a list-valued token left holding nothing — an
all-separator value, or one whose every member was refused — stays absent rather
than becoming an empty array**, which is the rule for every such token including
one added later, because an empty array would keep `isDefaultView` false forever
and never let `All` light again. A `c.` key survives only when its slug names a
**categorical** test in the current catalogue — a numeric test and the slug the
`plate` field owns are refused there as they are refused *as categoricals*
everywhere else, the numeric one being exactly what `r.`, `sort` and `cols` do
accept — its values are deduped and kept in arrival order, and every occurrence
of one slug is merged before any rule is applied, so a selection means the same
thing spelled as one key or as two. `rows` keeps only rangeable non-curated keys,
and `cols` is deduped and kept unless it is a sort-only field or could never be a
slug — the one permissive key, and §Columns are permissive, ranges and sorts are
strict owns why. A `gen.` choice survives only when its key names
the current generation of a resolved pair and its value names that pair's
retired generation. Bound serialisation accepts everything `String(number)`
emits, exponent form included, so round-trips are lossless.

**`brands` is the deliberate exception, and it is not an oversight.** The names
are kept verbatim rather than filtered against the current catalogue, because
`data/` is regenerated on a schedule and dropping a name here would change what
a shared link shows without saying so — the recipient would see a wider fleet
than the sender sent and nothing would report the difference. The cost is paid
in the sidebar instead, where a selected brand the fleet does not hold gets a
row of its own so it can be seen and unticked (§Filters).

**A `c.` enum value is kept verbatim for that same reason**, and its checklist
pays the same cost: a selected value the catalogue has since renamed keeps a
zero-count row rather than disappearing from a shared link. The **bool** tests
are the exception inside the exception — `true` and `false` are this app's
words rather than the catalogue's, so no refresh can rename them and they are
allowlisted. A `c.` bool carrying both values collapses that key to absent: the
tri-state has no state that shows both, and a state no control can display is
what `parseView` exists to refuse.

The two generations of a pair are mutually exclusive, and `parseView` is where
that is enforced for URLs — the one place both can arrive together. When a
range or a column names both, the current generation is kept and the other is
dropped. Only about 40% of shoes carry both readings, so ANDing them collapses
the fleet for no visible reason. The click path enforces the same invariant
itself (docs/app.md §Columns and sorting).

## Filters

Range filters and the Add-filter dialog offer **numeric-typed tests only**
(`float`, `score`, `percent`, `rating`, plus the `score`/`msrpGbp` shoe
fields). A range over an `option`, `bool` or `text` test reads as missing for
every shoe and would empty the whole fleet in one click, so both the UI and
`parseView` refuse them. Each row is titled by its `MetricRow` rather than by
the fieldset legend, so the name is stated once — but the fieldset's accessible
name carries heading **and** zone, because two rows both called "Forefoot"
would be indistinguishable to anyone not looking at the screen.

The order is fixed: search, released after, plate, brand, discontinued, features,
then metrics — the range rows, which come from one declared list, `CURATED_RANGE_KEYS` —
price, then the measurements a runner narrows on most, then the rest curated,
then anything added by hand. Price leads because it is the bound almost every
search has.

**Features is one collapsed section, and its contents are the catalogue's.**
`FeaturesFilter` draws every categorical test — the same rule that decides which
of them can become a column (§Categorical columns) — so an upstream addition
arrives with a control the way it already arrives with a cell, rather than as a
code change. An `option` test is a flat checklist in catalogue order with the
absence last, each row carrying the count of shoes that would match it, taken
over the population with **that one facet removed** and everything else still
filtering, which is the brand facet's rule and the same zero-row rule with it.
**Its rows are not only the declared choices**: they are the declared options,
plus every value the whole fleet's readings carry for that test, plus whatever
the selection holds — the brand facet's three seeds, each earning its place. The
declared ones so a choice nothing matches still shows its zero; the fleet's so a
value the catalogue does not declare gets a row that stays put rather than one
appearing and vanishing as another filter moves the pool; the selection's so a
link carrying a value the catalogue has since dropped keeps a control to untick
it with. **Those rows are keyed by the option value**: a keyed `{#each}` over a
value that appears twice throws `each_key_duplicate`, which blanks the whole
page rather than drawing one wrong row. The extras the fleet and the selection
contribute are screened against the declared values before a row is drawn, so the
only way two rows can carry one value is a catalogue that declares it twice —
refused upstream rather than defended here
(docs/scraping.md §A duplicate option value fails the run).
A `bool` test is an Any/Yes/No tri-state built the way
Discontinued is, and carries no counts: ticking both boxes would be a near-no-op
whose only effect is excluding the handful of unread shoes, which is not a state
a runner means. A selection is set membership on the population side, so it moves
the coverage denominator exactly as a brand tick does (§Coverage), and a shoe
with no reading fails an active selection as a brandless shoe fails a brand one.
`showMissing` does not reach a facet: it admits shoes with no reading for an
active **range**, and a shoe with no reading for a selected feature stays hidden
whatever it is set to — the flag widens a bound, and a facet is not one. The
Add-filter dialog stays numeric-only for the same division: it adds *range* rows,
and a range over a categorical test empties the fleet in one click. The accepted
cost of that is a real dead end — typing "gusset" into Add filter answers
`No metrics match`, the same answer `stack` already gets for being on screen
already, except that here the control is one section up rather than in the list
below.

**The search box matches a case-insensitive substring of the name *or* the
brand.** The brand half is not redundant: almost every name already begins with
its brand (§Table presentation), and the handful that shorten it — Topo, Hylo,
On — were exactly where the box and the brand facet one control below it
disagreed. `On` returned 29 shoes in the facet and 124 in the box, because "on"
sits inside Cushion, Wilson and Carbon; `Topo Athletic` returned 7 and 0. Two
controls a row apart cannot answer the same brand name with different fleets
with nothing on screen saying why. The substring stays a substring — `Nike
Pegasus` still matches by name, and no tokenising is implied.

A query with no non-whitespace character in it is **the empty query**, and it is
settled at both
doors into the view rather than at the point of use: the input keeps a value
whose `.trim()` is empty out of the view entirely, and `parseView` drops a `q`
of the same shape. Both are needed, because a link replays through `parseView` — a
stray space in the box used to reach the URL through the one write path
(§View and URL ownership), and the recipient of that link opened on an empty table
whose only stated cause was two invisible characters. What is kept
is **untrimmed**: the space between two words is part of the query, and trimming
as it is typed deletes it under the cursor.

**Every search surface answers a zero match in words**, in the same form and the
same place: `No brands match “…”.` in the brand list, `No metrics match “…”.` in
the Add-filter dialog, and the empty state below the table. A list that simply
renders nothing reads as a control that has stopped responding — and in the
dialog that was the *commonest* result, because it offers only the metrics not
already in the sidebar, so `stack`, `width` and `cushion` all match nothing while
being metrics the app plainly holds. None of the three is a live region; what
announces what is one question for the whole app rather than a decision each box
makes for itself.

**The empty state names what is actually narrowing.** `narrowingNames` in
`lib/filters.ts` reads the live filter state and returns the classes that are
set — the search, the release-date bound, the plate selection, the brand
selection, the discontinued filter, the feature selection, the bounds — in the
order the sidebar draws them, so the sentence reads down the column it is sending
the reader to. The paragraph is `Clear <a, b or c> to see shoes`, with
`a filter` when nothing is named, plus the clause *each bound says how many shoes
it is excluding* only when a bound is one of them.

It used to be one unconditional sentence written for a range bound: a link
emptied by a brand, a search or a date advised clearing a bound directly under a
receipt reading "0 outside your bounds", on a screen with no number field
holding a value. Two statements a line apart, only one of which could be acted
on. `showMissing` is deliberately not in the list — it widens.

**The curated list is not the set of terms the story scores read**, and it is
not meant to become one: a filter row narrows a search, a term ranks one. Heel
counter stiffness is a term with no row, because nobody searches in five-point
heel-counter buckets; drop and the toebox measurements are rows no score reads,
because fit is exactly the thing a runner filters on and no score can speak to.
Where the two coincide the row still has to earn its place on its own footing —
**outsole durability** is listed because "I want a shoe that lasts" is an
ordinary search, not because Easy weights it. **Midsole softness is not listed**:
it is redundant with shock absorption, which is one row above it and measures the
outcome rather than the material cause (docs/shoe-stories.md). It stays
reachable from the Add-filter dialog like any other metric.

The order does not rearrange itself under the story or the zone — someone
comparing two stories must not have the controls move underneath them. Both halves of every zone pair
are curated for that reason, and **every part of a zone pair renders always**;
a single renders when it is curated, active, or listed.

**Accent in a range row means "your bound selects this."** An unbounded row
draws its whole distribution in `--hist-dim` and shows no accent at all: "in
range" is trivially true with no bound, so painting it would make a sidebar with
nothing set a solid wall of blue. Colour appears only once a bound exists, so
scanning the sidebar answers "what is constraining this shortlist?" in colour as
well as in the bold heading.

**The number placeholders are rounded at the view**, like every other figure
(docs/app.md §Number display): a raw `String(extent.min)` offers
`24.884597678267` for shock absorption and overflows its own field. The fields
are mono and right-aligned, so a typed bound lines up against its placeholder,
and they step back up to **16px under `@media (hover: none)`** — iOS Safari
zooms the whole viewport for a focused input smaller than that, with no way out
but a pinch, and the drawer is exactly where it bites.

**That rule is the whole drawer's, not the number fields'.** It reached the two
`RangeFilter` bounds and none of the three search boxes — including the one
`openFilters()` hands focus to, which is the exact trigger: tapping **Filters**
programmatically focused a 13.33px field. All four step to 16px on the touch tier
now, each in its own block, because no specificity lets one rule in `app.css`
beat four scoped ones. The guard is what stops a fifth forgetting it:
`cross-browser.spec.ts` › *sets every drawer text input at or above the iOS zoom
threshold* opens the drawer, the brand list and the Add-filter dialog in a **touch
context** and enumerates every visible input, so a box added later fails the build
rather than the phone.

Two of those boxes also needed an explicit size at rest. `input[type=search]`
declares no `font-size` here and the UA sheets disagree — **16px in WebKit against
13.33px in Blink and Gecko** — so the shoe search and the Add-filter search set a
fifth larger in Safari than the fields beside them, and were safe there by
accident rather than by rule. Both state `--t-sm` now, which is what makes the
touch step mean the same thing in three engines.

**Clearing a value and removing a row are different actions.** Clearing empties
both bounds in one click and deletes the key outright — leaving `{}` behind
would mean `isDefaultView` never returned true again and the toolbar could
never mark `All` again. Its control is an **✕** icon rather than the word
"Clear": one row per range key spelling it out is most of the sidebar's width, and the
`aria-label="Clear {name}"` still says which row it belongs to. Removing drops
the row and its bound together, and is offered on **any row that is not
curated**, not only on a hand-added one: a row can also be on screen as one half
of a zone pair, and gating Remove on the hand-added list would leave such a row
with clearing as its only exit — which is clear-means-remove, the conflation
this surface deleted. That still needs somewhere to record which rows are
*shown*, so `ViewState.rows` carries the hand-added list; deriving it from the
bound keys is exactly what made clearing and removing the same action. A row
that arrived by link holding a non-curated bound is seeded into the list by
`parseView`, or clearing it would silently remove it. Released after is unset
from an **Any** chip: a chip that sets a date cannot also clear it.

**The sidebar is a drawer everywhere the table cannot be seen beside it, and
that is a fit decision rather than a width.** `sidebarPermanentAt` in `lib/fit.ts`
is the boundary and owns its own derivation: the larger of the
`SIDEBAR_PERMANENT_PX` floor and the width at which *the columns on screen* still
clear the 260px track by the fit rule's own slack.

**The `max` is what makes the two boundaries one decision.** Taking the track
costs the table 260px at a single pixel of window, so a boundary that cannot see
the column set stands the sidebar up at a width where the fit rule then refuses
the table, and the rendering reads desktop → list → desktop as a window is
dragged *wider*. Consulting the model closes that for every set at once, and buys
the property the sidebar was always described as having: **it never stands beside
the stacked list**, because it waits for the table it exists to tune. No constant
can have it, because no constant answers a question about a set the runner picks
(§Two renderings, and only one of them mounted).

**It is a LAYOUT width — `documentElement.clientWidth` — asked in script, not in
a `@media` rule.** Those are two different widths: a media query answers about the
window, which includes a classic scrollbar the layout never receives, so the
sidebar claimed its column a scrollbar's width of window before the mount decision
could know it had and a table well over a hundred pixels too wide went up in the
gap. `Page.svelte` derives `drawer` from the fit model and writes it as a class,
which the layout, the scrim, the drawer's focus trap and the `Filters` trigger all
read; nothing about the sidebar is stated as a number in CSS. In a browser drawing
classic scrollbars the sidebar therefore arrives that much further out in window
terms, which is the same boundary seen from outside the layout.

`hunt/fit-boundary.mjs` asserts all of it against the real fleet across three
column sets and both scrollbar regimes, and it is what to read first if a boundary
is ever moved by hand.

The price is stated rather than hidden: a set wide enough to push its boundary
past the window keeps its drawer at widths where a narrower set would have a
column. That is the drawer standing in for a sidebar there is no room for, not a
column withheld — and the list it stands beside is a coherent screen.

**A viewport constant is what not to go back to.** It was 800px, and at 801px the
sidebar claimed its column while the table's own width did not move: the runner
paid a column of filters for a table pushed off the right edge, and widening the
window shrank the overrun without closing it for hundreds of pixels. The
tuning-loop argument below is the whole case for a permanent sidebar, and it only
holds where the table is on screen beside it. The two halves of that claim are
guarded separately, because the fixture cannot see one of them:
`keeps the sidebar a drawer until the table can be seen beside it` measures the
displacement in the suite, and `hunt/fit-boundary.mjs` measures the overflow
against the real fleet, which is the only place it exists (§Table presentation).

**The chrome's 800px did not move with it**, and the two are now separate
boundaries with separate homes (§The chrome bands). Between them — from 801px to
wherever the sidebar's boundary falls for the columns on screen — the bar is one
row and `Filters` sits on it **carrying its word**.

**Wherever the sidebar is a drawer it carries a scrim**, and clicking it closes — the same
affordance Escape gives. The drawer already traps focus; the scrim states in the
interface what the trap enforces, and nothing else in the new elevation language
floats above content without one. It never renders where the sidebar is
permanent, because the `drawer` rune forces `showFilters` false there.

**The empty state's hint follows the same rune.** `They are behind Filters.` is
appended only where the sidebar is a closed drawer; standing open beside the
paragraph, that sentence sends the reader hunting for a button that is not on
screen. It used to read `On a phone they are behind Filters` unconditionally,
which was true while the drawer stopped at 800px and is not at 1000px.

The sidebar stays for the filters in use — filtering is a tuning loop, and a
modal over the table breaks the feedback that makes it work. **Choosing which
filters those are is a dialog**, because picking among forty-odd metrics is a
different task and wants room for grouping, search and coverage bars. It is
built from a positioned element rather than `<dialog>`: jsdom implements
neither `showModal` nor the top layer, and the focus handling is the part that
has to be right anyway — focus enters on the search box and returns to whatever
held it. The node itself is moved to `<body>` on mount; §Stacking order says
why. That is also why this dialog, alone among the panels here, does **not**
stop Escape from propagating: living outside the drawer, it is not on a bubble
path that reaches the drawer's key handler, so there is no second dismissal to
suppress. The month picker still does stop it, because its panel is a real
descendant of the drawer.

**The dialog carries a scrim of its own, and a click on it dismisses.** The
scrim is a **sibling** moved to `<body>` beside the dialog rather than a child
of it — a child could only ever paint above the box it is meant to sit under —
and its click runs the same `onclose` Escape does, so there is one dismissal
path and not two. It renders at **every** width, unlike the drawer's, because
this dialog is modal on the desktop too: it declares `aria-modal` and traps Tab,
and without a scrim it floated over live content with nothing saying the page
behind it was inert. **The dimming stays**, and it is the only dim a runner meets
at a desktop width: dimming is this app's one elevation language, and nothing
that declares itself modal floats over live content without it — the drawer's
scrim is the same statement wherever the sidebar is a drawer. The outside-press
dismissal it carries is the affordance every floating panel gives
(§Every floating panel dismisses the same way).

The sidebar's **two whole-surface actions sit as a pair** at its foot — Add
filter, then Clear filters, in one wrapping row. Add leads because it grows the
surface and Clear empties it, and a column of two lone buttons reads as two
unrelated afterthoughts rather than as the surface's own controls.

Discontinued is three-valued — `hide`, `only`, or absent meaning both. A
boolean could only ever hide, and "only the last-generation models" is half
the value strategy in docs/shoe-stories.md.

**Brand counts respect the other filters, and a facet must not filter itself.**
`brandCounts` counts over the population with the *brand* filter removed —
neither over `population` nor over the whole fleet. `applyFilters` applies
brands before pushing to `considered`, so counting over what the sidebar is
handed would read `(0)` beside every unticked brand the moment one is ticked,
and clicking one of those still returns shoes, because brands are OR'd. The key
set is seeded from the whole fleet, so a brand matching nothing keeps its row:
it stays in the list, greyed, showing `(0)` and clickable — the list does not
reflow under the cursor, and a 0 is an answer.

**It is seeded from the selection too**, which is the case a shared link makes.
`parseView` keeps `brands` verbatim on purpose (§URL encoding), so a link naming
a brand the catalogue has since dropped — or spelling one differently, the
catalogue says `HOKA` — applied a filter with no control anywhere on screen:
`?brands=Nonesuch` read **1 selected** with none of the listed brands ticked
and the word nowhere in the document, on a phone as much as on the desktop. The
only recovery was `Clear filters`, which discards every other filter the link
carried. A selected brand the fleet does not hold now gets a row like any other
zero — greyed, `(0)`, ticked, clickable to untick — so the summary count never
exceeds the number of controls that can act on it. Both seeds land in one map at
zero, so a selected brand the catalogue *does* hold gets one row rather than two
and the counting is a walk of the population rather than one per brand.

A search box narrows the
brand list in a 14rem scroll box. Its `<summary>` **suppresses the UA
marker and draws an SVG chevron**, which is the rule for **every** `<details>`
this app draws rather than a trait of this one: a disclosure wearing the
browser's triangle beside one that does not reads as an oversight rather than a
choice, so each one added obeys it too.

The sidebar carries **two heading styles on purpose**. `h3` names a *section* —
Search, Brand, Plate — and is an uppercase micro-label at the same size and
tracking as the setup strip's group labels, which do the same job. `h4` names one
*control* under a section and is sentence case, because uppercasing "Toebox width
— widest part" makes a data label shout and costs the reading of the units in
brackets after it. **The range rows are a section too, `Metrics`**, and that
heading is what keeps the outline honest: without it every row's `h4` follows
`Features` with no `h3` between, so an outline reads every measurement as a facet
of that section. The noun is not decided here — the Add-filter dialog, which is
how a row arrives, already calls them metrics to the runner's face, and one home
per name is docs/policies.md §Vocabulary. The section holds the rows and the
direction legend over them, and stops there: the two foot buttons act on the
whole surface rather than on the measurements, so they sit outside it. Two
components draw an `h4` and they are not the same face:
`MetricRow`'s measurement leads its row and takes the row's own emphasis, while a
facet noun inside Features is smaller and dim, because the `Features` heading
above it has to keep leading.

Besides the section labels above them, those two are the **only headings the
column carries**, so heading navigation reaches the sections, the metric rows and
the facets and nothing else in it — a range row is named by its fieldset, and the
search box, the month picker and the foot buttons by their own labels. A facet's
group takes its accessible name from its heading by id rather than repeating the
noun in an `aria-label`, which is `DisplayMenu`'s
pattern; the id is keyed by the test's slug. What makes a key safe to build an id
from is that **the sidebar mounts once** — the drawer is that same element moved
off-canvas by a class, never a second copy, which is the opposite of the table's
arrangement (§Two renderings, and only one of them mounted). Mounting it twice
would duplicate every id in the column, and each facet group's name would resolve
to the first copy's heading with nothing failing.

**Every bounded row states what it is costing**: `N excluded`, from
`lib/relax.ts`, is the number of shoes that would return if *that one bound*
were cleared and everything else kept. Leave-one-out, so it is order-independent
and conditioned on the rest of the set. There is no ranking and no
recommendation — singling out the most restrictive bound imposes a priority we
cannot know, and a budget is usually the *least* relaxable thing in the set —
so the number simply sits beside the control that acts on it. An unbounded row
shows nothing, because there is nothing to relax; **`0 excluded` does show**,
because "this bound is doing no work" is worth knowing and its absence would be
ambiguous against the unbounded case.

The count is computed over the whole fleet under the **live `showMissing`**,
never over `population`: `population` has already had the other bounds applied,
and a range bound also excludes shoes with no reading for its metric, so with
the flag off those come back when it is cleared and with it on they were never
hidden. Run it under the wrong setting and the number is simply wrong wherever
coverage is incomplete. The counts **overlap** — a shoe failing two bounds is
counted by both — so they must never be totalled, and this is deliberately not
the receipt's "outside your bounds", whose word is not reused here for that
reason. It is the first thing in the app whose cost grows with filter count,
which is worth stating: six passes over 450 shoes is well inside a frame.

`applyFilters` accounts for every shoe it drops: `considered` is the
population surviving the non-range filters alone, and
`visible + outsideBounds + hiddenMissing === considered.length` holds for any
filter state. Each excluded shoe is counted exactly once, missing-ness first.

`undatedHidden` is the same idea one filter earlier: shoes an active
released-after bound drops because they have **no release date at all**, rather
than because they are too old. An undated shoe cannot be shown to qualify, so it
stays hidden — but folding it into the population line would report it as
excluded by a bound it was never measured against, which is the silence this
count exists to break. It sits outside the `considered` reconciliation above,
because those shoes never reach `considered`. There is deliberately no
show-them-anyway escape: `showMissing` answers "I accept shoes with unknown
readings inside my bounds", where this is "I asked for shoes released after a
date, and these have no date" — a different question, and clearing the date
filter already answers it.

`hiddenMissing` is a deterministic count of shoes that pass every non-range
filter but have **no data** for at least one active range filter. Missingness
is settled across all active ranges before any bound is applied, so the count
does not depend on key iteration order. It deliberately over-counts against
"would otherwise be visible" — a shoe with no midsole reading might have
failed the weight bound anyway — and the copy is written to match: "N shoes
have no data for the active filters", never "N would otherwise match".

`showMissing` is the escape from that: a missing reading stops excluding the
shoe and stops being counted, while a shoe that *has* a reading and fails the
bound is still dropped. It is one flag over the whole filter set rather than
per range — the receipt offers one control, so one flag is what the user can
actually address.

**A range row has two input modes because they serve different needs**, not for
accessibility: the number field is *precise*, the plot is *intuitive*.
Accessibility is a property of how each is built, not the reason either exists.
The plot carries an edge handle per side, dragged inward; a handle left at its
extreme means **no bound on that side**, so the row still serialises open-ended.
The number fields stay authoritative and independently editable.

The drawn axis is **trimmed to p2–p98** (`lib/axis.ts`), with the excluded
readings drawn as hatched overflow bins at each end rather than dropped. A
linear axis over the full range is unusable for dragging and price says why:
79% of it is empty pixels, the densest single pixel holds 64 shoes, and the
middle half of the fleet gets 23px of a 222px control. Trimming roughly doubles
that. p2–p98 is symmetric, needs no per-metric tuning, and is deliberately
conservative — a wider trim buys travel but starts discarding real spread.

**Snapping is to values that exist, not to round numbers.** £5 and 1g detents
are arbitrary; a boundary between two shoes is not, and the rule self-adjusts
across the two regimes the fleet contains — price repeats itself so heavily that
most shoes share a value with several others, energy return barely repeats at
all — with no constants. Both axis ends are readings too,
because `quantile` is floor-of-rank.

**Bounds may cross, and a crossed range honestly matches zero shoes.** Dragging
clamps each handle against the other, but the number fields do not, and a value
outside the axis **clamps only where it is drawn** — `clampPct` moves the
position, never the stored number. Clamping on input is actively broken: with
max at 180, typing "200" into min would rewrite the field at the third keystroke
and further typing would append to what it rewrote.

Two details the plot has to get right. **It is not a tab stop**: giving it
`tabindex` so `:focus-within` could reveal the grips would add an empty stop in
an app that already spends dozens before the first shoe
(docs/app.md §Table presentation), so the reveal hangs off the **row** — hover or
focus-within on the fieldset — which also means tabbing into either number
field reveals them. And **the touch hit areas are gap-aware**: 44px on a 222px
plot is a fifth of the width each way, so each shrinks to half the gap once the
handles are within 88px. Under `@media (hover: none)` the grips are permanently
visible, because hover never fires there. A *set* bound is drawn either way — an
edge is state, a grip is affordance, and they have different visibility rules.

**The grip's half-width is one number and it answers two questions.** The control
is 10px of fill inside a 2px ring at `box-sizing: content-box`, so it paints
14px — and the offset pulling it back onto its own position was half of *ten*,
which drew every grip **2px to the right of the bound it marks** and 2px below
the plot's centre line. Measured at 19.22px against the 17.22px the bound sits
at; the two ends of a row read 8.7px and 4.7px clear where they should have been
equal, which is what made it look like an overhang at one end. The same `7px`
is the room the row keeps clear at each end, taken as `padding-inline` and given
straight back as a negative margin — the technique the scrollports use for their
bars (§Theming) — so the plot, the legend and the number fields do not move by a
pixel and only the grip does. What the gutter buys is an axis with **no
outliers** at one end: the plot reserves 6% for an overflow bin only where there
is one, and without it a grip at the extreme reached past the row into the
sidebar's own 4px of padding. Every axis the shipped fleet draws reserves both
ends, so that was one filtered population away rather than a thing on screen.
`cross-browser.spec.ts` holds the grip to the *edge* marker's position rather
than to a number, because the edge is the same bound drawn by the rule that was
already right.

**Each number field is named for the metric it bounds** — `Weight (g) minimum`,
not `min`. The default sidebar puts two of these on screen for every key in
`CURATED_RANGE_KEYS` (`lib/lineage.ts`), and a fieldset's accessible name is not
announced with the field inside it, so the metric is the only thing that tells
them apart.

**Every `role="radiogroup"` is one tab stop and answers the arrow keys**, from
one action, `lib/roving.ts`, applied to all four of them — the zone, the story
segment, discontinued, and the generation picker. The role promises exactly
that, and each group made every radio its own stop and ignored the keys. The
radios are buttons rather than native inputs — two rendered copies of a group
must not join one document-wide radio group by sharing a `name` — so the
browser does none of it for us, and moving focus must also *activate*, which
`click()` is. Both axes move, because the generation picker is a column. The
tab stop is whatever is checked, tracked through a `MutationObserver` on
`aria-checked` so a selection made with the mouse, or re-derived from a link,
carries it too; a group with nothing checked still admits focus at its first
radio.

**Wherever the sidebar is a drawer it traps focus.** It slides
on a transform rather than toggling `display`, which cannot be animated;
`visibility` is what keeps a closed drawer out of the tab order, switched
immediately on the way in — the panel is handed focus the moment it opens, and
a hidden element cannot take it — and 200ms late on the way out, so the slide
is seen first. Escape closes it and returns focus to the control that opened
it, found by its `aria-controls`.

**What takes that focus is the panel, never its first control.** The first
control is the search box, and focusing a text input on a phone raises the
keyboard over the filters the runner has just asked to see — so every tap of
`Filters` cost a dismissal before anything could be read. The panel carries
`tabindex="-1"` for it, because `.focus()` on a plain container is a silent
no-op (the same lesson the table anchor and the skip link already carry). The
trap grows one case with it: the container is not a tab stop and *precedes*
every stop in the drawer, so a forward Tab reaches the first control by itself
while a backwards one would walk straight out of a panel that is covering the
page, and is sent to the last stop instead. **The Add-filter dialog keeps its
autofocus**: it is a search-centric dialog opened by a runner whose next action
is typing, and it is not what a tap of `Filters` produces. **A drawer left open across a resize past the
sidebar's boundary closes itself**: above it the panel is simply part of the
page, and its trap would hold the keyboard inside something that is no longer
modal. A resize
that only crosses 800px must NOT close it — that is the chrome's boundary, and
the drawer is still a drawer on the other side of it (§Filters).
`keeps the drawer open above the chrome boundary, where the sidebar is still a
drawer` is the assertion; before the two boundaries were separated, dragging a
window from a phone width to a laptop one dismissed the open drawer at 800px.

### Every floating panel dismisses the same way

Four surfaces float over the page — the column picker, the month picker, the
add-filter dialog and the About panel — and all four answer **a press outside**,
**Escape**, and **focus leaving them**. `app/src/lib/dismiss.ts` owns the pointer half for the two
anchored to a trigger of their own; each dialog's scrim is the same affordance
drawn rather than a second mechanism. It is a **captured `pointerdown`, not a
`click`**: `pointerdown` fires before focus moves, so a press on a panel's own
trigger is still recognised as *inside* and is left to that trigger's toggle,
where on `click` the order is focusout → close → click → reopen and a trigger
stops being able to shut what it opened. Capture, because the press must be seen
whether or not something between the target and the document stops it bubbling.
The listener is added by an `$effect` gated on `open` and returned as that
effect's teardown, so it exists only while a panel is on screen and never
outlives one.

**A press inside is not a dismissal**, at any depth — ticking a column,
stepping the month picker's year, selecting the About panel's prose — and
that is the same fact as the trigger case, since every trigger sits inside the
box its own panel is guarded by.

**Focus leaving a panel is the keyboard's outside press**, and it was the way
out that none of these had. Escape only ever arrives while focus is *inside*,
because each panel's handler is bound to the panel, so a runner who Tabbed out
left the panel hanging over the controls they tabbed to next **with Escape inert
from that point on**. The month picker survived a backwards exit — its own
trigger is a landing pad *outside* the panel, so the next Shift+Tab fired a
focusout the panel never saw — and the column picker, which has no focus guard of
its own and hangs `position: absolute` over the table, survived an exit in either
direction. `dismissOnFocusLeave` is the mirror of the press listener: captured on
`document` for the same reason, guarded on the whole anchor so that stepping back
onto the trigger is not leaving, and it closes only when a move **starts** inside
and **ends** outside.

**A press deafens the focus listener for the length of that press**, and that is
the boundary between the two halves rather than a special case: a focus move a
pointer caused is never the keyboard exit, and the press listener has already
answered it — outside dismisses, inside belongs to the trigger. Asking
`relatedTarget` instead handed the answer to the engine, and the engines
disagree. **macOS does not focus a button that is pressed**, so where the other
platforms report the trigger — inside the anchor, not a departure — WebKit on
macOS reported a node outside it: the month picker closed on the `focusout` and
its own `click` reopened it, which is precisely the `click` failure mode
`pointerdown` was chosen to avoid, reaching the same panel by another door. Green
in all three engines on Linux and red on the macOS job alone, which is what makes
the platform rather than the engine the variable. The column picker was never
exposed: its trigger is a `<summary>`, which macOS does focus on a press.

**A null `relatedTarget` is judged by where focus settles, one task later.**
Focus going nowhere identifiable is what the month picker's year stepper produces
when it disables itself at the ends of the fleet (§Released after is
month-granular), and equally what an engine declining to name a genuine exit
produces. The two are indistinguishable at the event and plain a task
afterwards: the stepper catches the runner back into the grid on the microtask
its own `await tick()` resolves on, so the check finds focus inside and closes
nothing, where a real exit has left `document.activeElement` outside. Treating
null as *staying* was the older rule, and it made a panel's keyboard exit depend
on the engine naming its destination. The two `<body>`-mounted dialogs need none
of this: they trap Tab, so focus cannot leave them in the first place.

**Escape is stopped exactly where a second handler would hear it.** The month
picker stops it, and is now the only one that does, because its panel is a real
descendant of the focus-trapping drawer. The other three do not, and their
reasons are not the same: the column picker lives in the pinned chrome, and both
dialogs render into `<body>` (§Stacking order), so none of the three has an
ancestor listening. One press, one dismissal, wherever it is mounted.

The column picker is the one **native control** of the four, and it gets neither
behaviour free: a `<details>` stays open until its own summary is clicked again
in every engine, so `open` is bound rather than driven and both dismissals are
the app's. Two consequences. The binding is fed by the `toggle` event, which the
browser queues as a **task** — so for one task after the summary is pressed the
mirror still reads closed while the panel is on screen, and a dismissal that
assigns only the mirror is not a state change and is dropped in silence; closing
writes the element as well. And the assertion belongs in
`cross-browser.spec.ts` rather than the unit suite, because whether a given
engine queues that `toggle`, and whether it has already taken Escape for
something of its own, are engine questions.

## Columns and sorting

`cols` accepts the four shoe fields that have cells (`releasedAt`, `score`,
`msrpGbp`, `plate`), the six synthetic score keys — two per story
(docs/app.md §The story scores) — and any test slug, including one the catalogue
no longer holds, which renders as a header of that slug over a column of em
dashes (§Columns are permissive, ranges and sorts are strict); `name` and
`brand` are rendered by the table itself and have no cell, so they are sortable
but never columns.

**Sortable but never a column is not the same as sortable with no control.** The
desktop's `Shoe` header is a real sort button — the same button, the same
`SortCaret`, the same `aria-sort` on the `th` as every figure header — because
`name` is a sort key the parser accepts and for a while nothing on screen or in
the accessibility tree could say so: `?sort=name` reordered 450 rows
alphabetically, the table carried **zero** `aria-sort` attributes (the score
header having lost the one it holds on every other view), and there was no
control anywhere that could reverse it. That is the untrue-claim species rather
than an accessibility nicety, and §Columns are permissive, ranges and sorts are
strict already states the invariant from the other side. `brand` is the half
that stays link-only: it has no header on either rendering, and giving the one
name column two sorts would need a second control in the row a runner reads
shoes off. What states a brand-sorted link instead is
§The ordering is stated when no header can carry it.

**A first press sorts descending, except on `name` and `brand`, which open A to
Z.** On a figure the interesting end is the big number; on the shoe's own name
it is the alphabet, and a first press landing on `Xero Shoes Speed Force II`
answers a question nobody asked. `nextSort` in `app/src/lib/sort.ts` is the one
home for both halves of that rule and both renderings call it, so a header press
cannot come to mean two things. The pair is **declared** rather than inferred
from the value's type: a categorical column sorts alphabetically too, but it
sits in the value grid where every neighbour opens descending, so it keeps the
grid's rule.

The **phone offers no name header at all** — its header row is the figure
columns and only those, which is what keeps every chip the same box
(§Two renderings, and only one of them mounted) — so a name sort is set there by
a link or by the desktop's control, and stated by
§The ordering is stated when no header can carry it.

**The default view holds six numeric columns**, plus `releasedAt` and `plate`,
which carry words and dates rather than figures. Six is the bound: it is the
widest numeric set that fits the narrowest common phone without horizontal
scrolling. **That reasoning survives the fit switch unchanged**, and the 700px
floor is what makes it survive: below the floor the stacked list is what renders
whatever the arithmetic says, so a 360px phone still gets the six columns the
bound was measured for (§Two renderings, and only one of them mounted). What the
switch changed is which rendering a *laptop* gets, not how many columns the
default holds anywhere. `midsole-softness-22` is the column the default gives up — the
sparsest of the seven it used to carry, and the only one no story reads,
because docs/shoe-stories.md argues softness should not drive a shortlist.
This is a product change rather than a phone workaround, because **columns
never vary by viewport**: `cols` serialises into the URL, so a
viewport-dependent default would mean a link shared from a phone carried fewer
columns than the sender saw and the URL would stop describing the view
(docs/app.md §View and URL ownership). Shared links carry explicit `cols` and are
unaffected: a link written before the change still names the seven columns its
sender saw.

The picker is a `<details>`, and it closes on an outside press and on Escape
like every other floating panel — neither of which a native disclosure gives
(docs/app.md §Every floating panel dismisses the same way).

The picker and the sidebar both offer `metricEntries` (`app/src/lib/lineage.ts`)
rather than the raw catalogue, so a superseded pair is one entry and a
heel/forefoot split is one entry. The picker groups by the dataset's test
groups, with the tests carrying no `groupId` collected under **Other** — that
gap is upstream's shape, not a bug here (docs/scraping.md §Data quirks). A
colocated entry takes its **primary's** group, which is what moves the forefoot
halves beside their heel counterparts. Both halves stay separately checkable
and separately sortable: a forefoot striker wants the forefoot number, and
merging them would destroy the distinction.

The four heel/forefoot pairs — stack, energy return, shock absorption, midsole
width — are **declared** in `ZONE_PAIRS`, because the catalogue links only two
of them and carries no notion of zone at all. The declaration is authoritative
where it applies: it names the heading, orders the halves forefoot-first, and
puts `zone` on each part. `parts[].label` stays the full test name, so the
column picker can still tell "Forefoot stack" from "Heel stack". A declared
pair takes its group from the **heel** half. Pairs are never inferred from a
slug or a name pattern — `heel-padding-durability` has no forefoot
counterpart, `forefoot-traction`'s secondary is unpublished, and an upstream
rename would silently regroup the sidebar.

Agreement with the catalogue is asserted by `lineage.test.ts`, **not** thrown
at runtime: a pair whose slugs are absent is skipped silently, because
`metricEntries` is called on partial catalogues throughout the suite — including
single-half cases it must degrade rather than reject — and a throwing validator
would take the app down with them. When that assertion fires, read
docs/operations.md §Contract-drift runbook.

A pair offers exactly one generation — the chosen one, current by default. The
click path enforces that: choosing a generation drops the sibling's range and
its column in the same `setView` call, matching what `parseView` does to a URL
(docs/app.md §URL encoding). `metricEntries` takes `LabTest[]`, so the sidebar
constructs `score` and `msrpGbp` as entries itself; they are shoe fields, and
without that the price filter would disappear.

Sorting reads numbers, with missing values always last and score as the
tie-break, so a sort never silently reorders the tail. `releasedAt` sorts as
an ISO string; year-derived dates therefore sit at 1 January, and the table
prints the year alone unless `preciseReleaseDate` is set. `sortShoes` takes the
resolved score lookup as an optional fourth argument and consults it **by column
key**, because the score keys are the ones `numericValue` cannot answer for.

**Easy shows the score and most of the terms behind it.** Six numeric columns is the
phone bound above, and Easy spends them on the score, shock absorption, energy
return, price, weight and the RunRepeat score. Two of those are not Easy terms at
all and are there anyway: price, because the value call is the runner's, and
weight, because it is the number a runner compares trainers by whatever the story.
**Outsole durability is the term that pays for weight** — a deliberate swap, not a
shortage of slots, since Easy has three terms and three free columns. What every
story gives up is toebox width, because fit is the runner's own last filter and no
score speaks to it, and stack, because the score reads shock absorption rather than
the millimetres behind it, so a shown stack invites a hand ranking the story argues
against.

### The ordering is stated when no header can carry it

A sort key that is not a rendered column has no header to be marked on, so the
table reorders with **no `aria-sort` anywhere and no lit caret** — and the app
produces exactly such keys. On a phone that is four of them: `releasedAt`,
`plate`, `name` and `brand`, because `ShoeTableMobile` renders a header only for
the figure columns and `releasedAt` and `plate` become metadata after the name
(§Two renderings, and only one of them mounted). On the desktop it is `brand`,
plus any figure whose column has been unticked while its sort stands. Opened
from a link, that is a fleet reordered with nothing on screen or in the
accessibility tree saying so — and `?sort=-releasedAt` is among the most likely
links anyone sends, `releasedAt` being in `defaultColumns`.

So one line under the receipt says it: **`Sorted by release date, newest
first`**, present exactly when the sort is non-default **and** no rendered header
carries the key. `orderingNote` in `app/src/lib/ordering.ts` is that predicate,
and it takes the rendering as an argument rather than reading a media query, so
the two renderings answer through one function.

Three things it is not. It is **not state**: nothing about it reaches
`ViewState` or `serializeView`, so a recipient forwards the link they
were sent, byte for byte. It is **not the receipt's**: the receipt reports what
the filters did and moves when a bound does, and ordering is neither
(§The header names the catalogue, the receipt owns the count) — hence its own
element under it, in the receipt's size and colour so the two read as one band of
small print rather than as a warning. And it is **not a live region**: a sort a
runner presses is announced where every other action is, and a sort that arrived
in a link changed nothing while they were reading.

**It is silent on the default sort even when the score column is unticked.** A
link to the default order carries no `sort` at all, so there is nothing a
recipient can be surprised by; the line exists for the orders a URL can impose.

The words are `sortPhrase`'s, one home shared with the announcement a header
press makes. Common nouns where the app has one — `release date`, `price`,
`shoe name`, `plate` — because "Sorted by Released" is a column heading talking;
everything else falls through to `columnLabel`, so a metric is called the same
thing here as in its header. The order half is worded for what is being ordered
rather than for the comparator: `newest first`, `A to Z`, `most plate first`,
`highest first`.

### Table presentation

Every header is a **name box over a units line**. The name box reserves `2lh`
whether or not the name fills it, so the pinned header's height is a function of
width alone and not of which columns are ticked; it is a floor, not a cap, and a
name still takes a third line where its column is short enough. The units line
reserves `1lh` — the mono line box, not `1em`, which is 4px shorter at `--t-xs`
and drops the names of the columns that carry no unit below their neighbours'.
Both reservations are load-bearing beyond the header: the loading placeholder
reserves the same band and `smoke.spec.ts` measures the two against each other
(§Decisions). Units come from `headerUnits` in `app/src/lib/units.ts` and are
**derived, never authored** —
`float` carries its own, `percent` is `%`, `score` and `rating` are `/5`, the
`score` field is `/100` and `msrpGbp` is `£`. There is **no direction arrow
here**: the sorted column carries a caret, and two arrows in one header
collided. Direction is shown in **three** places instead — the column picker,
the add-filter dialog and the sidebar's metric rows — and in the table it is
carried by the wash: `percentileMap` inverts for a `lower` metric, so the
strongest tint sits on the best value whichever numeric end that is
(docs/app.md §Theming). The two pickers mark **both** of their row loops, so the
shoe fields carry it too and price keeps its `↓`; the sidebar marks the metric
row's heading, glued to the name rather than pushed to the far end of a
`space-between` row, and one key answers for the whole row because both halves
of a declared zone pair are one test run and a superseded pair is one
measurement remethoded. **The sidebar was the surface that carried none**, which
is the same defect as the plate cell wearing a different number: `Outsole
durability` is Dremel dent depth in mm, so the phone header renames it `Outsole
wear` to say lower is better while the row a runner types the bound on said
nothing at all (§Two renderings, and only one of them mounted). Each list opens
with one legend line — `↑ higher is better · ↓ lower is better · no mark —
neutral`, separators included, because without them three clauses read as three
headings — because a bare glyph with no units beside it is ambiguous; a screen
reader is given nothing per row, deliberately, since restating it there would
make every row twice as long to hear. The words are `DirectionLegend.svelte`'s,
one home for three renders. The two pickers' legends sit **outside** their
list's scrollport and carry the same margin: inside one, the legend scrolls away
with the first few rows and every glyph under it stops meaning anything. **The
sidebar's cannot** — the sidebar *is* the scrollport — so it stands at the head
of the run of rows it explains, below the sections that carry no mark and would
otherwise read as claims about Search and Brand. What makes that
survivable is the one thing these rows have that a picker's do not: each states
its own units beside the glyph, which is the ambiguity the legend was written
for. `size-rating` is
the one units override: it reads `3=TTS`, because `/5` would present a
runs-small / true / runs-large scale as a mediocre mark. The abbreviation is a
measurement, not a house style — `3 = true` is eight monospaced characters
against the seven the line holds before it wraps, so it wrapped and stood the
unit line at 32px where every neighbour stood at 16, and in any view whose names
all fit one line that was the whole pinned header: 58px against 42.
`MAX_UNITS_PX` in `labels.ts` is that wrap bound and owns its arithmetic; the
units line is the one header line with no short form and no third line to grow
into (§Two renderings, and only one of them mounted).

**Wrapping is not what bites first.** The phone's caret is out of flow in the
cell's bottom-right corner, on this line rather than beside it, and its painted
ink starts 8.33px inside the 49.33px text box's right edge — so a centred string
gets **five** characters before its last glyph sits under the stroke, where the
wrap admits seven. `MAX_UNITS_CLEAR_PX` is that tighter bound and is the one
every unit string is held to; `3=TTS` spends it exactly, touching the mark's
outermost antialiased pixel and no more. The mark's ink is measured, never
derived: `app/scripts/measure-label-widths.mjs` reads it off the pixels, because
the caret's box is a third air and the path's own bounding rect is reported
differently by each engine and about 0.35px right of what either paints.

**The table sits in a `--surface` panel** — hairline, `--r-md`, `--shadow-panel`
— and that wrapper carries **no `overflow`**, deliberately: an `overflow` there
makes it a scrollport and detaches the sticky `thead`, which is the failure
`.content` already documents. It is therefore **square-topped, with no top border
and the lid on the sticky header row** — the same shape and the same technique as
the phone panel, which owns the explanation
(docs/app.md §Two renderings, and only one of them mounted). Only the cheap half
differs: this table's `border-spacing` is 0, so the header row is already a
continuous band and a plain `border-top` on the `th` reaches the panel's side
borders, where the phone's 2px spacing forces its lid into a shadow stack.

**The sorted column carries an accent caret** beside its name, and any other
sortable header reveals a dim one on hover. `aria-sort` on the `th` remains the
accessible contract; the caret is decoration, which is why it is an SVG carrying
no text. `SortCaret.svelte` owns it and **both** renderings mount it, so one
header cannot mean the same thing two ways; only its placement differs, and the
component argues that difference where it makes it.

Its footprint is `--caret-w`, and **which line pays it is the column's kind**.
The mark is drawn in every sortable column, sorted or not, so wherever it sits
it sits permanently.

- A **phrase** column is left-aligned, so the mark stays inline after the name,
  which is where a trailing mark belongs and costs that column's edge nothing.
- A **figure** column is right-aligned to the edge its numbers keep, and an
  inline mark ends the header text a `--caret-w` short of them. So it goes out
  of flow into the *leading* corner — `corner-start` — and the reserve moves to
  the **left of the unit line**, which is the line that grows towards it.

The reserve is in flow rather than bounded by a constant: the browser then sizes
the column to keep it, so a long unit string widens its column instead of
sliding under the mark. `headerMinPx` in `lib/fit.ts` states the same 12px, on
whichever term carries it. The width is a token rather than a number in each
file precisely because three files now measure against it.

**Right-aligning a header is not `text-align` alone.** `th button` is
`display: flex`, which blockifies it — but a `<button>`'s auto width still
resolves to fit-content, so it is a block-level box narrower than its cell, and
`text-align` moves inline-level content only and cannot touch it. Without
`width: 100%` the button sits at the cell's inline start with all the slack piled
to its right, and a figure column's right-aligned header renders **left-aligned**:
measured 8px from the left edge in every column at 1700px and up, against figures
128px away at 2560px. Below ~1500px the default columns sit at their minimum, the
button fills the cell exactly, and the defect has nowhere to appear — which is
why it survived a test that measured one width. `smoke.spec.ts` now sweeps 1440,
1920 and 2560 and holds every figure header's name **and** unit line to its own
column's right edge, which is the edge a runner reads down; the older test beside
it keeps the two header lines honest against each other.

**Row thumbnails are gone.** At 40×27 with `object-fit: cover` every shoe
cropped to an indistinguishable grey strip, so they cost a column of width and
carried nothing. `imageUrl` stays in the dataset and in the expanded row, where
it renders at a size worth having.

The `discontinued` chip is a **neutral uppercase micro-label** in `--text-dim`
with a hairline border. Red is error semantics and this is metadata — and
dimming or alarming the row would argue against the `discontinued=only` filter,
which exists because those shoes are worth finding. It lives in
`DiscontinuedTag.svelte` and both renderings mount that, which is the only
arrangement in which "the two chips match" is a fact rather than a claim.

A focused row keeps an **inset ring** rather than taking §Theming's one focus
ring: that ring is a `box-shadow`, drawn outside the box, and a row spans the
whole table and abuts its neighbours with no gap. It is the single exemption, and
`app.css` states it as `:not(tr)` so the two can never both draw. The desktop
draws it as one `outline` on the row — plus three inset edges on `td.name`,
because that cell is sticky and opaque and paints over the row's own outline for
the width of the name column. Three, not four: an `outline` on the cell adds a
side at the column's right boundary and lands an accent bar down the middle of
the row.

Figures are right-aligned in `--font-mono` with `tabular-nums`. The cells that
are not are exactly the ones `isFigure` excludes, and there are **three** kinds:
`plate`, `releasedAt`, and every categorical column, which holds an upstream
phrase. Those are the cells `white-space: nowrap` applies to — the selector is
`td.num:not(.fig)`, so it tracks `isFigure` rather than naming columns. A phrase
allowed to wrap in an auto-sized column makes the row heights ragged. The rule
goes on the **cell**, never the header: `nowrap` on a `th` makes each column's
minimum its longest header, which pushes the document sideways.

**The plate cell reads "Non-carbon", not "Non-carbon plate".** The dropped word
is the one the column heading already carries, and it is 35px in the only place
the table cannot afford them. Measured with the real fleet at 1200px, where the
content track is 908px: the plate column asks 128px with the trailing word and
93px without, taking the table's min-content from 935px to **900px** — the
difference between a document that overruns the viewport by 12px and one that
fits with 8px in hand. (27px is the *other* subtraction — min-content against
the track. The overrun a runner sees is `scrollWidth` against the viewport, and
this section uses that measure throughout.) This is the one home for that
figure; the rule in `ShoeTable.svelte` states only why it stays.

Letting the cell wrap instead is measured and rejected: it takes the column to
68px, but the plated rows then stand 71px against every other row's 36px, which
is the raggedness `nowrap` exists to prevent.

**This table never scrolls sideways any more, because it is only mounted where it
fits** (§Two renderings, and only one of them mounted). The default view's
document is **917px** wide once the sidebar is a drawer and the content track
takes the full window, and that number is now a threshold rather than an
overflow: below it the stacked list takes over. The band that ran 700px to 916px
at up to 217px over is gone, measured on the real fleet at twenty-three widths in
both engines, and the ladder that says so is `hunt/fit-boundary.mjs`.

A second band ran from 800px to 1176px, at up to 376px over, while the sidebar
took its column at 801px whether or not the table had room left beside it. That
one is the sidebar's own, and it is closed by the sidebar's own rule rather than
by anything here (§Filters).

The e2e assertion is `toBeLessThanOrEqual(1200)` rather than `toBe(1200)`.
Equality tested more than the claim: a document *narrower* than the viewport
scrolls sideways just as little, and `scrollWidth` falls below the viewport
whenever the runner draws a classic scrollbar. The two forms agree in headless
Chromium, where a fitting document reports exactly 1200 — this is a statement
of the claim, not a bug fix.

**The overflow above was measured, not guarded, for as long as it existed.** The
e2e fixture is five shoes with one-word names, and its `scrollWidth` is 1200 with
the long plate label or the short one, so no test in the suite ever reproduced
the 12px the real fleet overran by. What guards it now is not a wider fixture but
the model: the fixture is enough to check that the model agrees with the engine,
and the real fleet's ladder lives in `hunt/`.

The name cell is a
plain `table-cell` with an inner flex row, because `display: flex` on a `td`
takes it out of the table-cell box, so it stops stretching to the row and
leaves a gap the numeric cells show through under the sticky column.

Any number of rows expand at once — comparing two shoes means having both
panels open — and opening one scrolls, under a `prefers-reduced-motion` guard.

**What is scrolled to depends on whether the panel fits.** A panel that fits in
the window is scrolled with `block: 'nearest'`, which moves the least and leaves
the row where the runner left it. A panel **taller than the window** cannot be
scrolled to at all without harm: aligning its top with the top of the scrollport
puts the row above it, and the row is the element that still holds focus and
carries `aria-expanded`. Measured at six places, six of six landed entirely above
the chrome's lower edge with focus still on them, and `elementFromPoint` at the
row's own corner returned the header — pressing Enter on a shoe made that shoe
disappear, a WCAG 2.4.11 focus-obscured failure. So the **row** is the target in
that case, with `block: 'start'` and a `scroll-margin-top` of
`--thead-top` **plus** `--head-h`. The first is the chrome's measured height, the
same token the pinned header row and the skip link's anchor read
(§Columns and sorting); the second is the pinned header's own measured height,
bound the same way and for the same reason — the headers wrap, so it is a
function of the width and of the face that has loaded. Both are needed: the
header pins *under* the chrome and paints over the rows sliding beneath it, so a
row aligned to `--thead-top` alone lands behind it, which is what
`elementFromPoint` at the row's corner said when only the chrome was counted.
The row lands flush under both and the panel takes the screen below it.
`smoke.spec.ts` opens rows by keyboard at three depths in a window shorter than
the panel, measures the row's top against the pinned header's bottom, and hit
tests the row's own corner.

**The phone follows the same rule with its own two heights, and computes the
scroll rather than asking for one.** Both are needed there too and neither is the
desktop's number: `--thead-top` is 76–78px at 390px and the stacked list's own
sticky header another 72, so `block: 'nearest'` parked **150px** of a 1600px panel
behind them — image and all — with `tr.shoe`, the row carrying the shoe's *name*,
above the viewport. Nothing on the resulting screen said which shoe had been
opened. `ShoeTableMobile` binds its `thead`'s height as `--head-h` for the same
reason the desktop does, and both renderings state the room once, in CSS, as a
`scroll-margin-top` on the row.

The scroll itself is a `window.scrollTo` carrying **only a `top`**, reading that
room back off the row. `scrollIntoView` has no axis restriction and every row in
the stacked list carries `colspan`, so past six columns opening a shoe also
dragged the page **94px sideways** and cut the first 77px off every line of the
review prose. This is the second place the app computes a scroll rather than
requesting one; `lib/focus-scroll.ts` is the first, and the reasoning is the same
(§Theming). `smoke.spec.ts` opens a shoe at three scroll depths at 390px with nine
columns and asserts the name row clear of both bands, the panel on screen, and
`scrollX` still 0.

An expandable row carries `aria-controls` as
well as `aria-expanded`, in both renderings, **while it is open**: the panel is
a *sibling* row rather than a child of the control, so nothing else says what
the row expands, and it exists only while the row does — an IDREF naming a node
that is not in the document resolves to nothing.

**A skip link is the first element in the page.** Tabbing from the top to the
first table row costs dozens of stops once the strip has handed over, and more
again while the strip is still up; the sidebar's rows move both, so it is a
scale rather than a constant and no figure is quoted. `SkipLink.svelte` moves focus to
`TABLE_ANCHOR_ID` (`lib/anchor.ts`) itself rather than letting the `href`
navigate: the query string is the view and nothing else may write to the
address bar, so a `#shoe-table` left behind would ride along in every copied
link. The anchor carries `tabindex="-1"`, because `.focus()` on a plain
container is a silent no-op, and `scroll-margin-top: var(--thead-top)`, because
the top of the scrollport is behind the pinned chrome: without it the jump
lands the anchor at y=0 and the runner arrives looking at the third row.

**No brand line under the name.** 442 of 450 names already begin with their
brand and the remaining 8 shorten it ("Topo", "Hylo") rather than drop it, so
the line was duplication on every row. `brand` stays in the data: it is still
filtered and sorted on. There is no dimming of discontinued rows either — the
`disc-tag` chip says it in text, for the reason the chip's own treatment is
neutral (above).

The `thead` pins at `--thead-top`, and the first column pins left.

`--thead-top` is **measured, never assumed**. `Page.svelte` wraps the header
and the toolbar in one `.chrome` box, pins that box at `top: 0`, and binds its
`clientHeight`; the same number gives the sidebar its `top` and its
`max-height`. There is no fallback value, because there is no width at which a
constant is right: measured with the real fleet, once the strip has handed over,
the chrome is 91px at 1200px (a one-row banner over a one-row bar), 111px at
700px and 109px at 375px, where the bar takes its second row (§The chrome
bands). A hard-coded `3.2rem` is 51px, so it pinned the header row about 60px
behind the chrome at 700px — the row was not merely partly invisible, it was off
the screen, and before the chrome rebuild it was 147px off at 375px. This is the
one home for these figures; `ShoeTable.svelte` and `smoke.spec.ts` point here
rather than restating them.

It varies with **time** as well as width, now that the app self-hosts its faces:
the face swaps in after first paint, the chrome reflows by about 6px, and a
header pinned against a value measured before the swap leaves a strip of page
that rows visibly scroll through. `bind:clientHeight` is ResizeObserver-backed
and re-measures on that reflow, so this holds — but it is now load-bearing
rather than incidental, and a refactor to a one-shot `clientHeight` read
reintroduces the gap, only on a cold cache. `smoke.spec.ts` asserts the pinned
phone header sits flush against the chrome once the faces have loaded — which is
`fit-support.ts`'s `awaitFacesLoaded` and no longer `document.fonts.ready`: that
promise settles against the loads pending when it is asked, and this SPA asks
before the table that requests the faces has mounted, so under load it resolved
with both faces in `error` and left every measurement behind it reading a
fallback face. `awaitFacesLoaded`'s own docblock owns the rest of that
derivation, including why `document.fonts.check()` cannot stand in for it.
`cross-browser.spec.ts` carries the panel's two overflow claims, which are
scroll-extent facts rather than font-metric ones and therefore belong in the
suite Firefox and WebKit run (§Two renderings, and only one of them mounted).

The `.layout` grid is `var(--sidebar-w) minmax(0, 1fr)`. The token is the one
home for that width — the loading placeholder reserves the same track (§Decisions)
— and the `minmax` is load-bearing: a bare `1fr` track takes an automatic minimum
of `min-content`, which the table's 14rem name column and its headers' own
longest words inflate past the viewport, taking the whole document sideways with
them. The headers themselves **wrap** — `nowrap` on a `th` was what made every
column's minimum its longest header, and it is gone.

Both sticky rules also depend on `Page.svelte`'s `.content` having **no
`overflow-x`**: setting
it forces `overflow-y` to compute to `auto`, which makes `.content` a
scrollport, and a sticky header inside a box that never scrolls vertically
rides off with the page. Measured in Chromium at 1200×700 scrolling 800px: with
`overflow-x: auto` the header goes from y 266 to −534; without it, it pins at
51 and stays. Horizontal overflow therefore falls to the page. Do not "fix"
the horizontal scrollbar by putting `overflow-x` back — that trades a working
pinned header for it.

### The expanded row

Three zones: **identity** (the image, the feature chips and facts), **opinion** (RunRepeat's
summary, pros and cons, and the who-should-(not)-buy prose), and **our working** (the score
breakdown). All three live inside **one capped box**, and there is **one boundary** left.

| container width | layout |
|---|---|
| ≥ 700px | image beside facts; pros/cons beside the prose; breakdown at the foot |
| < 700px | one column, breakdown last |

**The cap: `--panel-cap`, 800px, and nothing in the row is wider than the summary.** The
summary is the first prose a runner reads and it sets the row's measure, so the row is
that wide and no wider — every zone sits in `.grid`, and `.grid` is capped. `box-sizing`
is `content-box` here (this repo borders-boxes `.scrollport` alone), so the cap is the
content measure exactly and the panel's padding is an inset around it, with no arithmetic
between the two. Above the cap the container stops varying with the window entirely: at
1000px of window and at 1920px the content box is 800px and every measurement in the panel
is identical.

**It hangs LEFT, under the shoe name.** There is no `margin-inline: auto` and that absence
is the decision: a runner reads the row's numbers and then clicks its name, so the panel's
content belongs under the name rather than centred in a panel whose name column is at the
left. All the slack falls to the right, inside the recessed well — 118px at 1000px of
window, 298px at 1440px, 778px at 1920px, measured on the real fleet.

**The summary is a documented lede exemption from the 45–75 character measure.** Everything
else in the panel sits in that band — the prose 69, the pros and cons 47 — and the summary
renders **5 lines at a median of 126 characters** (Chromium max 127, Firefox 126) at every
width from 1000px up, because it is the box's full width by design. It is a lede: five lines
of scene-setting read once before the runner drops into the columns, not the body copy they
read for two minutes. The exemption is why the number is stated here rather than fixed.

**The summary and the two columns beneath it are one box**, capped at `--panel-cap` and 430px
when stacked. Capping the prose column alone made the summary overshoot it on a wide panel;
capping nothing pushed the prose back to 95 characters at 1440px and 195 at 1920px. Sizing one
shared box satisfies both, and the prose measure falls out of the box rather than being set
separately. At the cap that box **is** the container, so the summary is co-extensive with the
row and the prose columns share its edges — asserted in `cross-browser.spec.ts`.

**The trailing links are the row's own last line, not the foot of a column.**
`Replaced: {shoe}` and `Full review on RunRepeat →` used to sit at the bottom of
the prose column, which put them under the right-hand half of a row whose every
other left-anchored thing — the summary, the photo, the facts — begins at the
capped box's left edge, and left the *taller* column deciding where they landed.
They now span both tracks and start on the summary's axis. **This changes the
two-column tier only.** In the single-column tier — which is the phone's expanded
row too, `DetailPanel.svelte` being shared — `1 / -1` is the one column, so they
are exactly where they were: measured at 700px and 390px in both engines, the
lineage line, the review link and the breakdown all land on the same pixel before
and after, and the panel screenshots are byte-identical. That cost a compensation
worth stating, because it is easy to undo by accident: the distance that must not
change is the one to the prose's last *paragraph*, the two used to be siblings in
one block and their margins collapsed to `--s3`, and across a grid row nothing
collapses while `.a-prose`'s box already carries that paragraph's `--s2`. So the
row gap is cancelled and the remainder added; uncompensated, the whole trailing
line dropped 24px on the phone.

The review link is **repositioned and never demoted**. Its visibility and
immediacy are the attribution this project owes RunRepeat
(docs/decisions.md §Be a good citizen toward RunRepeat), so where it sits is a
layout question and whether it is prominent is not one — the e2e asserts it has a
box, sits inside the row and stays above the breakdown at every tier.

Inside that opinion column **pros and cons stack, one under the other**, at every tier.
`.a-lists` sits in the 20rem track, so splitting it in two left each list about 18
characters a line — narrower than the phone shows them, on the widest screen there is.

**The breakdown takes its natural width, and where it sits is a question of the
tier.** `justify-self` sizes a grid item to fit-content whichever value it takes, and that
is the part that never varies: its table used to stretch to whatever track it was in and
open a gulf between the Term column and the Reading beside it — **12px now, against
47–125px before** across the widths sampled, and at 1440px the old widest tier squeezed it
the other way, to 418px against a 449px natural width, wrapping the term names. With several
score columns on screen every card is the same width (475px in Chromium, 481px in Firefox,
six of them measured) so they align down the page.

**Left in the single-column tier, centred in the two-column one.** Below 700px of container
every zone above the card — the photo, the facts, the prose — is one left-anchored column,
so a centred card is the only thing in the row that does not begin on that axis; above it
the row is two columns and the card sits under the pair, where there is no single axis to
join and centring reads as belonging to both. That tier is also the **phone** rendering's
expanded row, because `DetailPanel.svelte` is shared — one question, one answer, in both
renderings. Measured on the real fleet: the card's left gap is **0px** from 390px to 740px
of window and its two gaps are equal from 750px up, reaching **167px either side** at the
cap and staying there to 1920px. The rule lives **inside the existing container query**
rather than at a boundary of its own: what it needs to know is how many columns are above
the card, which is exactly what that query already asks. Either way it is placed inside the
**capped box**, never inside the panel — the panel is as wide as the table, and centring
there would put the card under whichever column happened to be in the middle.

`max-width: 100%` beside it is not belt and braces. `.scroll` is a scrollport whose
min-content size is its table's rather than zero, so on a phone fit-content resolves *above*
the width available and the card overflowed the panel by 47px, taking the page sideways with
it. The clamp hands the width back to the scrollport, which is the block that exists to
handle it.

**The photo has a column of its own, 280px wide, so it is 280px at every width.** Stating the
size once beats deriving it: the image used to take a share of a twelve-track grid and its
rendered size was an arithmetic result that had to be checked against 280 at every width, and
was not always 280 — 223px at 750px of container, 263px the moment the sidebar took its
column. Below 700px of container the panel is one column and the photo is
that column's width capped at 280, which reaches 280 as well. `cross-browser.spec.ts` walks
820px to 1600px straight through the sidebar boundary and asserts 280 at every rung.

`min(its box, 280px)` is still what the `max-width` computes, and it is what holds the photo
on the stacked tier. Every source image is 720×480, so 280 CSS is well inside the sharp limit
on a 2× display, where 360 is the ceiling, while leaving the facts beside it room — 496px at
the cap, 364px at the narrowest container that has two columns. `aspect-ratio: 3 / 2` and
`object-fit: contain` both stay, because the ratio is what gives the box its height *before*
the image loads and without it an already-open row reflows the rows beneath it mid-read.

**The breakdown block is absent, not empty, when no score column is on screen** — the default
`All` view, and therefore the desktop landing state. Nothing in the panel is placed by
explicit grid area any more, so a missing breakdown costs the grid a row rather than leaving
an area with nothing in it, and no marker class has to be kept in step with the CSS.

**Container queries, not media queries**, because the panel's width is the **table's**,
not the viewport's: the sidebar takes `--sidebar-w` and past six columns the table is wider
than the screen. A viewport query is wrong on both counts, and wrong in exactly the
half-a-window case — and there is **no viewport query in this component at all**, which is
the only form in which that rule is checkable. `.a-bd` is **last in the DOM** and stays there:
with no explicit placement anywhere it falls to the foot by document order, with no `order`
juggling.

**The panel's padding sits on an inner box, and that placement is load-bearing.**
`container-type: inline-size` resolves against the declaring element's *content* box, so
padding on the container would make every query below measure the panel's width minus an
inset rather than the panel. The container is the panel; the padding is inside it, on the
capped box.

**The panel is a recessed `--well`, not another raised surface.** An open row belongs to
the row above it rather than floating over the table, and **both** renderings follow that:
the phone's expanded row is on `--well` too, or the same question would have two answers on
two screens.

**And nothing is drawn around it.** The desktop cell took the figures' own `--s2` and painted
nothing itself, so the recessed panel sat inside an **8px frame of the table's raised
`--surface`** on every side — measured 8/8/8/9px in Chromium and Firefox in both themes, the
dark one subtler at `#1a1d21` against the panel's `#16191d` and the same defect. A raised
border around the one thing whose whole point is to sit *below* the row is the paragraph above
contradicting itself in paint. The cell now zeroes its padding: the panel owns every pixel of
its own spacing, so the cell has nothing to add, and the row's divider reaches its full width
instead of stopping 8px short. The phone answers the same question the other way round — its
cell takes the `--well` — because there the panel does not span it. Both answers are legal, so
what `cross-browser.spec.ts` asserts is the **result**: either the panel fills its cell, or the
cell paints the panel's own colour into the gap, at every tier.

Empty space beside prose is margin; empty space beside a bordered card is a hole — which is
why the breakdown sits at the foot with the full width of the capped box to place it in, and
never in a rail beside the review. Nothing stands beside it at either tier, which is what
lets the placement be a question of alignment rather than of columns. Balancing column
heights is the wrong goal. Left-aligning in the stacked tier makes **one** bigger hole where
centring made two smaller ones, and that is the trade: the card's left edge lands on the same
axis as the prose, the photo and the capped box's own anchor, and a card that begins where
everything above it begins reads as part of the row rather than as an inset.

### Two renderings, and only one of them mounted

The same columns render as `ShoeTableMobile.svelte` wherever the desktop table
would not fit: the shoe name takes its own full-width row with the chevron, and
the numbers get the whole viewport beneath it in true columns under one shared
sticky header. A pinned name column with the numbers scrolling behind it is not
a design at 375px — it spends 40% of the width on the name and shows about two
numbers.

**Which one renders is decided by fit, not by a viewport constant** — and in
script, not by a media query. `Page.svelte` mounts only the winner, because a
`display: none` table is still in the DOM: it would answer "what are the
columns?" twice, for assistive tech and for the suite alike.

A constant could only ever answer for one column set, and the runner picks the
set. Under the old 699px rule the desktop table took a window it needed 917px
for, so the default view scrolled sideways from 700px to 916px — 217px of it at
the low end — and a nine-column view scrolled at every width there is.
`rendersPhone` in `app/src/lib/fit.ts` is the rule instead: **the phone list
below a 700px floor whatever the arithmetic says, and above the floor exactly
when the desktop table's min-content plus a 12px slack does not fit the width the
table would be laid out in.** The floor is why a two-column view still gets the
list on a phone; the fit half is why a nine-column view gets it on a laptop.

**The model is arithmetic, never a measurement of the mounted table.** Measuring
what is on screen can only answer for the rendering already up, and switching on
that answer is a feedback loop — mount the table, measure it too wide, mount the
list, measure nothing, mount the table. `fit.ts` computes the width instead, from
three kinds of input it keeps apart: the tokens (the 14rem name column, the
`--s2` cell padding, `--caret-w`, the panel's own borders), committed
per-character font tables generated by `app/scripts/measure-label-widths.mjs`,
and the loaded fleet — the widest string each phrase column renders is upstream's
and no constant can state it, so it is computed once per dataset and memoised.
Each number's reasoning lives at the constant it belongs to, and is not restated
here.

**What the fit is measured against is the window less the page's leading gutter,
less the sidebar's 260px track wherever the sidebar has one** (§Filters). The
trailing gutter is deliberately not counted: a block's trailing padding is not
part of its scrollable overflow, so requiring it would reject widths at which
nothing scrolls at all. The slack is what keeps that gutter's air instead.

**The model must not be able to rot, so CI mounts the real table and asks the
engine.** `smoke.spec.ts` compares the model's width against the rendered
`min-content` in Chromium — the engine the font tables were measured in — and
`cross-browser.spec.ts` makes the same comparison in Firefox and WebKit, over
four column sets, to a stated 4px tolerance. The measured disagreement is at most
2.0px, which is also why the tables are one engine's rather than a per-character
maximum over three: the maximum sums disagreements that never co-occur in one
engine and measured 8–15px wide. `cross-browser.spec.ts` then walks a width
ladder across the threshold the model computes for the fixture, asserting which
rendering mounts on each side and that the mounted one does not scroll sideways;
`hunt/fit-boundary.mjs` walks the same ladder against the real 450-shoe fleet,
which is the only place the overflow ever existed.

**The list can still page-scroll sideways past six columns**, which is the
absence of a third state rather than the presence of one: it holds every column
at 53px and the page scrolls to reach the seventh, exactly as it always did.

**The stacked list under the desktop chrome is a real screen, not an edge case.**
The chrome's boundary is 800px and the table's is wherever it fits — 931px on
today's default view — so between the two the runner gets a phone rendering under
a bar carrying its words. That is the two boundaries being independent, working
as intended (§The chrome bands), and it is the one regime the e2e fixture's own
table is too narrow to wander into: `mounts the stacked list under the desktop
chrome, and holds it to the measured band` computes the width from the model,
refuses to run below the chrome's boundary, and holds the list's sticky header to
the band `Page.svelte` measures for it.

jsdom lays nothing out and vitest applies no component CSS, so the suite cannot
see the difference at all: `documentElement.clientWidth` is 0 there and the
decision falls back to `innerWidth`, which is what lets `Page.test.ts` plant a
window and assert which table mounts. The phone rendering is checked directly in
`ShoeTableMobile.test.ts` and at real widths by Playwright.

**The width available to the table steps down by 260px when the sidebar takes
its column**, so that boundary is not a second decision — it is this one asked
about a layout that has the track in it. `sidebarPermanentAt` is the larger of
the `SIDEBAR_PERMANENT_PX` floor and the width at which the columns on screen
still clear the track by the same slack (§Filters), so **the step down at the
boundary can never cross the requirement** and the rendering is monotone in the
width by construction: mounted once, it survives every wider window. Chosen any
other way it opens a band where the rendering reads desktop → list → desktop as
the window is dragged wider — two have shipped, 1180–1190px on the default view
and 1191–1361px on a ten-column view, because a constant answers for one column
set and the runner picks the set. `fit.test.ts` walks every width from
the floor to 2400px for five column sets and asserts the sequence never goes
back; `hunt/fit-boundary.mjs` walks the real fleet in two engines and both
scrollbar regimes.

**The width the decision reads is the LAYOUT width**, `documentElement.clientWidth`,
which excludes a classic scrollbar. With 450 shoes there is always one, and
counting its 12–15px as room for the table is how a model comes to mount a table
that then overflows. This is also why the sidebar's boundary is no longer a media
query: a media query answers about the window, so the two differed by exactly a
scrollbar and the sidebar arrived before the table's share of the width had been
recomputed (§Filters).

**And it is observed rather than inferred**, by a `ResizeObserver` on
`documentElement` — `lib/layout-width.ts`, the one home for both the read and the
subscription. A `resize` event says the *window* moved; the layout width also
moves when it did not, because clearing a filter or opening a row makes the
document tall enough for a classic scrollbar and that takes its 12–15px with no
event of any kind. Read off window events the width went stale exactly there:
measured headed at a 931px window on the real fleet, a search cleared back to 450
rows left the desktop table up and the document scrolling sideways by 1px until
something moved the window. Observing the element the width is *about* answers
both causes with one subscription, and it cannot oscillate — the taller rendering
is the one chosen at the narrower width, so a scrollbar the swap brings in never
argues for swapping back. `hunt/fit-boundary.mjs` walks the band a fresh page at a
time, never resizing.

**Because only one is mounted, neither may own the open-row set.** A set held in the
component is dropped whole the moment the rendering changes, so a phone rotated
mid-read closed every panel — and now a ticked column can change the rendering at a
width that never moved, which is a thing a runner does *while reading a row*.
`Page.svelte` owns it and passes it to whichever table is up, mutated in place rather
than replaced — both renderings hold the same object. The resolved wash is a prop for
the same reason (§The display preferences). `smoke.spec.ts` ticks a column that flips
the rendering with a row open and a tuned wash, and asserts all three survive. Each
table keeps the `tick()`-then-scroll it does on open, because what a newly opened row
has to clear is a property of the rendering and the two answer it differently
(§Table presentation).

**The stretched list is left uncapped, judged at 850–950px against two
prototypes.** Its equal columns reach 143px at 900px, so the wash chips are
wider than the phone's 53px ones by nearly three times. A 96px chip cap read
best and is rejected: it also narrows the chip at 700px, which is inside the
geometry contract below. A 112px cap clears that floor and buys a change most
would not notice, at the price of a second home for the chip's width and a
header that spans a wider box than the value under it — which is the detachment
`table-layout: fixed` was chosen to prevent. The chip stays inset in its cell at
every width, so the full-bleed band of colour the inset exists to avoid does not
appear either way.

The geometry is the contract, and these numbers are measured rather than
chosen:

- `table-layout: fixed`, `border-collapse: separate`, `border-spacing: 2px 0`.
  Content-sized columns made every chip a different width and detached each
  header from the values it labels. The spacing-derived gap is what makes
  every chip one box.
- **A list, not cards.** The name sits on the panel with its chip row beneath it
  and a hairline between shoes; proximity does the grouping, because there is
  more space above a name than between it and its own chips. It recovers roughly
  one shoe per screen against the card layout, which is the direct cost this
  section flags below for the two-row geometry. The hairline is emitted by its
  own row **between** shoes rather than after each one, so it spans the
  `border-spacing` gaps.
- **The whole list sits in one panel** — a single inset, rounded, hairline
  `--surface` box. One card for the table, not one per shoe: it supplies the
  missing depth without spending any of the density, and it matches the desktop
  chassis, and it takes §Theming's elevation order with it.
- **The panel takes the table's own width arithmetic**, so it is the table's
  container at every column count. It used to be sized by the viewport, which is
  the six-column table's width and nothing else's: at seven columns the table
  painted **52px** out through the panel's right edge and at ten **217px**, so the
  card's right hairline and its bottom-right radius were drawn across live rows,
  and scrolled right the box visibly ended in the middle of the data. Reachable
  and contained are different claims and only the first had been measured. The
  fix touches neither the overflow pair below nor the 53px column: `--table-w` —
  `53px` a column plus the border-spacing either side of each — is declared once
  on `.bleed`, the table takes it as its `min-width` and the panel takes it plus
  its own two side borders under `box-sizing: border-box`. Measured at 320, 360
  and 390px in both engines at 6, 7 and 10 columns: the table inside the panel at
  every one, the narrowest column exactly 53px, the header still pinned flush to
  the chrome, and `maxScrollLeft` still non-zero past six columns.
  `cross-browser.spec.ts` asserts the containment and the 53px floor beside the
  reachability it already asserted.
- **53px minimum column**, so six columns need 332px and fit any phone from
  360px up. The self-hosted Inter Tight is what makes 53px enough — `system-ui`
  needs 57px — and the 24px that buys is what pays for the panel's inset. The
  labels are validated against the 53px column, so a face change is a relabelling
  (`MAX_LABEL_PX` in `labels.ts`). The table bleeds most of the
  way out of `.content`'s inline padding to get there. Past six columns the
  minimum holds and the page scrolls, so every column always has the geometry
  the labels were validated against.
- **The 360px slack is 2px, measured.** 360 viewport, less 32px of `.content`
  padding, plus 8px of `.bleed` negative margin, less the panel's two 1px side
  borders, leaves **334px** to a table whose six-column minimum is 332px.
  Measured at 360px in **Firefox and WebKit**: panel inner 334px, table 334px,
  `scrollWidth` 360 against a `clientWidth` of 360 — no overflow and no classic
  scrollbar in either engine. If the inset ever has to grow, `--s3` → `--s2` on
  `.bleed` buys 8px; **do not narrow the column below 53px**, because the whole
  label bound is measured against it.
- **2px of horizontal header padding, deliberately not the nearest token.**
  `--s1` is 4px and would take 4px off a 53px column, which is the difference
  between a name fitting its header and clipping. It is the one place the
  token scale is overridden.
- **Which clip the panel takes is not a free choice.** `overflow: hidden` makes
  the panel a scroll container and the sticky header lands 19px out of place —
  the same failure this doc records for `.content` and `overflow-x`. Plain
  `overflow: clip` fixes that and silently makes every column past the sixth
  unreachable, which is the trap: it looks perfect on a default six-column view.
  Only **`overflow-x: visible; overflow-y: clip`** does both, and
  `cross-browser.spec.ts` asserts it at 360px and 390px in Firefox and WebKit —
  six columns fit, the page does not go sideways, and a seventh column leaves a
  non-zero `maxScrollLeft`.
- **The panel is square-topped and the lid belongs to the pinned header.** That
  follows from `overflow-x: visible` rather than being a taste call: a box that
  cannot clip horizontally cannot clip a square header cell out of a rounded top
  corner, and a panel lid would scroll up and out from under the pinned row
  anyway, leaving the box visibly open for the rest of the session. The panel's
  top sits flush under the full-bleed chrome, where a rounded corner rounds
  against nothing.
- **The lid is drawn by the header's shadow stack, not by `border-top` alone.**
  `border-spacing: 2px 0` means the header row is not a continuous band — there
  is a 2px gap between every pair of cells and another between the outermost
  cells and the table's edge — so a plain border draws the lid as dashes that
  stop short of the panel's side borders. Four layers, and the order is the
  trick, because an earlier shadow paints over a later one: two `--border`
  copies offset by exactly the border-spacing carry both hairlines across each
  gap and out to the table's edge, and two `--surface` copies on top, offset one
  pixel further out and inset one pixel top and bottom, cover everything between
  them. The same mechanism carries the cell background across those gaps, which
  is what stops scrolled rows showing through in 2px slits. Being one pixel
  wide, it is verified by rendering at 4× zoom rather than by an assertion.
- **The expanded row sits on `--well`** here as it does on the desktop. A panel
  that is raised on the phone and recessed on the desktop is two answers to one
  question.
- That leaves **49px of header text** inside the 53px column at 360px, which is
  what `app/src/lib/labels.ts` validates every catalogue name against. The bound
  itself, the face and size its width table was measured for, and when to
  regenerate that table, are documented at `MAX_LABEL_PX` and `CHAR_PX` — they
  guard one code site, so they are stated there and not restated here. Because
  the app **ships** its header face, the assertion means the same thing on every
  OS; under `system-ui` the widths were only ever true on the machine that
  measured them.
- **The unit line under it is bounded separately**, because nothing about the
  name bound can see it: the width table above is Inter Tight and this line is
  JetBrains Mono, and `MAX_LABEL_PX` is applied to `columnLabel`/`shortLabel`,
  so a units string of any length shipped silently until `MAX_UNITS_PX` and
  `unitsPx` existed. Same 49px of text, its own table from the same script, and
  a whole-string bound rather than a per-word one — a unit line that wraps at
  all is the failure, and it is the header line with no `SHORT_LABELS` to fall
  back on. It is bounded **twice**, because the sort caret lands on this line
  and runs out of room two characters before the wrap does; `MAX_UNITS_CLEAR_PX`
  is the tighter of the two and therefore the one the catalogue is held to. The
  one string either has ever caught is `size-rating`'s (§Table presentation).
- **`SHORT_LABELS` is a measurement rather than a list**: a narrower face brings
  names back inside the bound, and which entries survive is whatever the
  catalogue says when it is re-run. A short label is only
  deleted when the real name fits in **two** lines — `MAX_LABEL_LINES` stays 3
  because names with no short label still need somewhere to go, but a deletion
  may not spend the third line, which is paid by every screen for as long as
  the column is on it.
- **Two entries are exempt from that measurement entirely**, because neither was
  ever a length fix. `outsole-durability` keeps `Outsole wear`: the test is
  Dremel dent depth in mm, so "durability" contradicts its own units, and the
  divergence from RunRepeat's name is deliberate. `forefoot-traction-stop` keeps
  `Forefoot stop`: `forefoot-traction` carries the **same** upstream name and
  the two are not a superseded pair, so this label is the only thing separating
  two columns that can be on screen at once.
- The `score` field reads **RunRepeat Score** everywhere a human sees it — the
  header, the column picker and the filter row — because our own score sits
  beside it and "Score" alone no longer says whose it is. It is one of the
  entries that then needs a short label as well: `RunRepeat` alone is 56.8px
  against the 48px bound, so the phone reads `RR score`. The CSV writes raw
  column keys and is unaffected.
- **Up to three lines**, which `labels.ts` validates as well: the width bound
  alone lets a name of short words grow without limit, and the header is
  sticky, so a fourth line is paid once by every screen. Every label is at or
  inside the bound today, several exactly on it, so the guard is what an
  upstream name one word longer runs into.
- Values stay **centred**, not right-aligned: with fixed equal columns that is
  the more composed object and leaves no dead colour. The cost is that `73`,
  `74.3` and `80.38` centre on different axes, judged acceptable at real
  density. If it is ever revisited, right-alignment is the rigorous choice and
  column-sized widths are its necessary partner.
- The wash is **inset as a rounded chip** rather than filling the cell. At this
  density full-bleed cells read as a solid band of colour, far louder than the
  desktop table where borders and wider cells break the wash up. The chip and
  the unit line are both `--font-mono`, so a column heading reads the same on
  the two renderings.
- `releasedAt` and `plate` render as dim metadata after the name and **wrap
  rather than truncate**. Neither fits a ~49px cell and neither is a thing you
  scan down a column; moving them is what keeps the value row uniformly
  numeric. The `discontinued` chip beside them is `DiscontinuedTag.svelte`, the
  same component the desktop mounts, which is what makes "one chip does not mean
  two different things on two screens" a fact rather than a comment. The `·` that
  separates the metadata run stops before it: the run is prose and the chip is a
  bordered box carrying its own margin.
- **The sort mark is `SortCaret.svelte`, the desktop's**, and only which corner
  it takes differs. It is out of flow in **both** renderings now, and each puts it
  in the corner its own header text is not aligned to: `corner-end`, the
  bottom-right, here, where the names are centred; `corner-start` in a desktop
  figure column, where they are right-aligned to the figures. What each rendering
  cannot afford differs too. Here it is the WIDTH — the mark is rendered in every
  column whether or not that column is the sorted one, so inline it would spend
  its whole `--caret-w` of the 49px text budget permanently, enough to put
  `Weight` on a second line and grow a header that is pinned and therefore paid by
  every screen. Any inline mark costs the same, a text glyph joined by a space
  most of all, because the space is a wrap opportunity. On the desktop it is the
  EDGE, argued above.

Rows are double height in this rendering, so roughly half as many shoes fit a
screen. That is the direct price of keeping the numbers in columns, and it is
worth paying: columns are what make this a comparison tool rather than a list.

Plate filters as a **set of the real values** a shoe can carry — `none`,
`plated-other`, `carbon` — with empty meaning no constraint, so "not carbon"
is chosen directly as the first two rather than named by a token. The set is
always ordered as `PLATES` declares it, in the UI and in `parseView` alike,
because a selection is compared to a story's by value. As a **sort**, plate
is ordinal: `none` 0, `plated-other` 1, `carbon` 2, so descending reads "most
plate first" like every other column. `plated-other` reads **Non-carbon**
everywhere a human sees it — the desktop cell, the mobile name line and the
filter box; §Table presentation owns what the shorter string buys.

**All three words have one home**, `PLATE_LABELS` in `lib/categorical.ts`. They
were spelled in three files and drifted: the filter said `None` while the
desktop cell printed an em dash for the same value, on 344 of 450 rows. `none`
is a reading the scraper derives deliberately (docs/scraping.md §Data quirks),
so the cell names it — the em dash is reserved for an absent reading, and
spending it on a value made one glyph mean two things one click apart (plate
ascending sent its em dashes to the top as a value, width ascending sends its to
the bottom as absences). The phone's name line still drops `none`, which is a
rule about prose rather than about the vocabulary (§Categorical columns).

## Categorical columns

`option` and `bool` readings name a choice rather than measure a quantity.
`lib/categorical.ts` owns them: `categoricalValue` renders one through the
catalogue's declared labels, falling back to the raw slug so an upstream
addition reads as an unfamiliar word rather than as no reading at all.

They are **choosable as columns but never rangeable**, which is why the picker
reads them from `categoricalEntries` rather than `metricEntries` — the
Add-filter dialog reads `metricEntries` too, and a range over a categorical test
would empty the fleet in one click (docs/app.md §Filters). They also carry no
units and no direction mark in the pickers: there is no better end to point at.

Four readings were already in the dataset and unreachable before this existed —
the two option tests plus `removable-insole` and `reflective-elements`, which
are `bool`. Sorting orders them alphabetically by the label a reader sees, not
by the stored slug, so the order matches the column; that sort is a URL-legal
one, because a header that offers a sort a link cannot carry would make
`Copy link` hand back a different view (§Columns are permissive, ranges and
sorts are strict). On a phone they join the name line rather than the value row,
for the same reason plate and the release date do: the value row stays uniformly
numeric (§Columns and sorting).

**`plate` is the shoe field's, not the catalogue's.** The catalogue also has a
`bool` test slugged `plate`, read on two shoes of 450, and one column cannot
have two sources. `isCategorical` excludes the slug, so the derived field —
which reads the whole page and says None / Non-carbon / Carbon — answers for the
cell, the picker offers the column once, and the test's own reading is simply
never shown. Any future field/test slug collision belongs in the same set. The
field's three labels live in `PLATE_LABELS` here, next to the vocabulary rule
they have to obey (§Columns and sorting).

**The phone's name line is prose, and says only what a shoe has.** A cell sits
under a header that asks the question, so it prints `None`, `No`, or an em dash
for no reading, and all three are legible. The name line has no header, so it
does two things a cell does not. It **drops an absence** — `isNegativeReading`:
a `false` bool, or the `none` choice both option tests spell that way — because
"None · None · No" tells a reader nothing they came for. And it **names the
column**: an option reads `Gusset: Both sides (semi)`, because the value alone
answers a question nothing on that line asked, while a true `bool` reads as the
feature alone (`Removable insole`), since naming it is the whole reading. The
noun comes from `chipLabel`: the catalogue name for most tests, overridden for
the two whose name already carries a colon, since "Tongue: gusset type" would
put a second one on the line. Not `SHORT_LABELS` — those are bounded to the
49px of text in a 53px header, and "Remv. insole" reads as an abbreviation in a
sentence.

**That line keys each entry by its column, never by its text.** A keyed
`{#each}` over the text itself throws `each_key_duplicate`, which blanks the
whole page rather than the row. Today's labels happen to keep any two chips
apart, so the regression test builds a catalogue where they collide rather than
resting on that: the invariant is the key, not the label rules that currently
protect it.

**These readings are filterable as well as readable.** The sidebar's Features
section is set membership over the same values this section renders, drawn from
the same catalogue rule, and §Filters owns it — including why a bool is a
tri-state and why the counts leave their own facet out. Filtering and columns
stay independent: ticking a value does not add its column, exactly as bounding a
metric does not.

## Number display

`displayNumber` rounds to two decimals at the cell. The dataset stores every
reading exactly as RunRepeat computed it — the two shock-absorption tests
arrive with twelve significant figures (docs/scraping.md §Data quirks) — and
trimming belongs to the view, not the record. The in-app CSV export therefore
writes full precision: it is a data export, not a rendering.

The export's columns are the visible ones, plus four that are always there:
`slug`, `name`, `brand` and **`url`**. The link is emitted whatever the view
holds, for the same reason the numbers are unrounded — a row that has left the
app has no other way back to the page its readings came from. `reviewUrl` in
`lib/dataset.ts` is the single spelling of that URL, shared with the detail
panel. Release-date precision travels with the date rather than being dropped:
where a `releasedAt` column is shown, `releaseDateSource` is emitted beside it
(docs/app.md §Release-date provenance).

## Release-date provenance

The table renders every release date at **month precision** — `March 2024` —
except a `listing`-sourced one, which renders as the bare year because only the
year was ever real (docs/scraping.md §Release-date provenance). `displayReleaseDate`
in `lib/release-date.ts` is the single spelling of that rule, shared by the
table and the mobile strip.

The day is never shown, even where RunRepeat flagged the date precise: a column
that is day-precise on a small minority of rows implies a resolution the dataset
does not have. The day is not lost — `releasedAt` keeps it, so sorting stays exact and
the CSV exports it in full, for the same reason the numbers are unrounded
(docs/app.md §Number display).

The in-app export emits `releaseDateSource` **beside the date column it
qualifies**, not among the always-present identity columns: a provenance column
with no date column beside it is noise. `shoes.csv` carries it unconditionally,
because that export has a fixed header.

## Released after is month-granular

Every bound is stored as the first of a month. The dataset is month-precision
at best — only a `page` or `page-estimated` shoe can carry a real day at all,
and most of the fleet is neither (docs/scraping.md §Release-date provenance) —
so a day picker would offer a bound the data cannot honour.

**The control is `MonthPicker.svelte`, not `input type="month"`.** Firefox and
WebKit implement none of that type: both reflect it back as `text`, so what
Chromium drew as a picker was a bare box in the other two, with no picker, no
format hint and no validation. Worse than cosmetic — `startOfMonth` is
`iso.slice(0, 7) + '-01'`, so a typed "July 2024" became the bound
`"July 20-01"` and filtered wrongly in silence. Only someone who knew to type
`2024-07` got a correct answer, and a Chromium-only e2e suite reported it
working throughout.

The replacement is a trigger reading `July 2024` — or `Any month` — over a
popover holding a `‹ 2024 ›` year stepper and a `role="grid"` of twelve months.
**A grid, not a radiogroup, and not `lib/roving.ts`.** That action activates
whatever it moves to, which is exactly right where the role promises selection
follows focus — and exactly wrong here, where activating writes a filter and
shuts the panel. As a radiogroup the first arrow press committed a neighbouring
month the runner never chose and dismissed the picker on them, so the grid was
un-browsable by keyboard. Now the arrows only move: left and right by one, up
and down by four, Home and End to either end of the year, clamped rather than
wrapped and stepping over any month the fleet never reached. Enter and Space
need no handler at all, because these are real buttons and the browser turns
both into the click that commits.

The grid owns its own `tabindex`, and the one tab stop is the bound's month
when the year on screen holds it and the first offered month otherwise —
never nothing, and never a disabled month, either of which takes all twelve
buttons out of the tab order. The stepper and the grid are both bounded by the fleet's own first and last
release dates, derived from the loaded shoes: this is an affordance rather than
a score constant, so docs/decisions.md §Frozen scores and live thresholds does
not apply, and the brand list beside it is derived the same way. Months with no
shoes *inside* that span stay enabled — for an "after" bound an empty month is
still a meaningful cut, and a handful of shoes span 2015–2020, so disabling by
coverage would grey out most of the list and read as broken.

The panel is `position: absolute` in the sidebar rather than portalled to
`<body>` like the Add-filter dialog (§Stacking order): it is the width of the
column, so it never reaches the table, and the section hangs near the top of
the sidebar's scroll content, so it is never clipped vertically. It is sized
`width: 100%` with `border-box` because the sidebar's `overflow-y` makes
`overflow-x` compute to `auto` — a fixed 15rem panel lost its fourth column and
half the next-year control to that clip, measured rather than reasoned.

Two behaviours are load-bearing and easy to break. The displayed year is state
of its own, not the bound's year, so stepping can leave the bound and return
without emitting. And the year is **clamped in the step handler**, not only by
the buttons' `disabled`: a guard living in markup is one a stray click walks
past, and disabling a focused stepper drops focus to `<body>`, which arrives at
`focusout` as a null `relatedTarget` — closing on that would make the last year
unreachable. What saves it is the **recovery**, not the null: the handler awaits
its own `tick` and catches focus back into the grid, so `dismissOnFocusLeave`'s
settle check — one task later, after that microtask — finds focus inside and
closes nothing. That is why the recovery is load-bearing rather than a courtesy,
and why the shared rule can afford to treat a null as a possible departure
(§Every floating panel dismisses the same way). This is the case that put the
rule there.

Firefox and WebKit run this filter in CI for exactly this reason
(docs/operations.md §The e2e run needs three browsers).

`startOfMonth` in `lib/release-date.ts` is the one normalisation, applied at
three edges: the input, the 1y/2y/3y chips, and `parseView`. It exists because
bounds compare against full ISO dates and a bare `YYYY-MM` sorts *before* every
day in that month, so an unnormalised bound would silently shift the window by a
month. `applyFilters` is untouched by this and still compares whole ISO strings.

The chips truncate too, which **widens** the window by up to a month rather than
narrowing it. That is the deliberate direction: this filter's failure mode
should be showing a shoe that is marginally too old, not hiding one that
qualifies.

**The four chips are a radiogroup, and `Any` lights when nothing is bound.**
They are exclusive, and each names a whole state of one bound rather than a thing
to switch on — so they take the segmented family's selected state, filled
`--accent-solid` under `--on-accent` on the pill shape they already had, with the
border going to the fill so a chosen chip is one colour rather than a filled pill
wearing a grey outline (§Theming). **No bound is a state of this filter, not an
absence of one**, and `Any` is the control that names it, so `Any` is marked
exactly when `releasedAfter` is unset: a group that marked nothing on the default
view would be telling a runner their filter was in no state at all. A bound the
month picker set *between* the three offsets marks none of the four, which is
the same shape the toolbar's own groups take on a hand-edited view (§The toolbar),
and `roving` still gives a group with nothing checked one tab stop. `aria-checked`
rather than fill alone: a control that looks chosen and does not say so is
visible to one runner and invisible to the next.

Each chip's bound is resolved **once**, when the sidebar renders, rather than at
the moment it is clicked. The mark compares the view against those strings, so
two reads of the clock could have let a chip set a bound it then failed to look
selected for.

The URL carries `after=YYYY-MM`. A day-precise `after` from an older link still
parses and normalises inward, so shared links keep working and round-trip
stably thereafter.

## Resolved price

Lab test 52 and the `msrpGbp` field are the same GBP list price from two
sources. `priceOf` prefers the test, which refreshes with every weekly metrics
run, and falls back to the field, which only changes when a shoe's page is
re-crawled. `numericValue` routes the `msrpGbp` key through it, so the column,
the sort and the range filter cannot disagree with each other. Both fields stay
in the dataset; this is a view-layer resolution, not a build-time merge.

## Model lineage

The expanded row links a shoe's predecessor, its successor and — only when it
is not the successor repeated — the newest model in its line
(docs/scraping.md §Model lineage). Links go to RunRepeat: shoe-lab has no
per-shoe page of its own to point at.

## Review language

`reviewLanguage` is non-null only for the handful of reviews RunRepeat
published in the wrong language (docs/scraping.md §Review language). The panel
names the language above the prose. The text is shown, not hidden — it is
RunRepeat's copy either way, and a reader who wants it translated has the
review link.

## Presets

Preset chips are canned view states: `applyPreset` builds a complete
`ViewState` from the defaults, so applying one **replaces** the view rather
than layering on it. A preset sets its own **columns** as well as its filters
and sort, which makes it the single place a story is expressed.

**A story is a pool and a ranking, and nothing else.** No story bounds a metric:
Easy and Tempo resolve to the plate gate and a sort by their own zone's score key,
Race to a sort and **no filter at all**. `applyPreset` therefore reads nothing from
the loaded fleet — the percentile bounds were the only thing that ever needed it, so
its signature is `(story, zone, stability)` and a fleet argument reappearing would be
a threshold in disguise. One consequence worth stating because it is a safety net
rather than a line of code: **no story participates in the sparse-bound guard** below,
which only ever looks at range keys. All three have lost it by having nothing to guard,
and what replaces it is asserted over terms instead of bounds
(docs/app.md §The story scores).

**`applyPreset` carries `stability` through unchanged** rather than rebuilding it
from `defaultView()`, and so does `allView`. Both marks are `sameValue` over the
*whole* view, so a new `ViewState` field participates in the comparison whether or
not it should: reset it and turning the preference on would unmark Easy, clicking
Easy again would silently switch the preference back off, and a plain table with it
on would mark neither `All` nor any story. It is the same rule the zone follows —
who you are survives, what you searched for does not.

This section owns the mechanism only. What each preset is *for*, and why its terms
and weights are what they are, is docs/shoe-stories.md — read it before changing
a number.

`applyPreset` takes a zone as an **input**, so the mapping is
`(story, zone) → view` with nothing special-cased: a story sorts by and shows
the half of each zone pair that the zone names — why is
docs/shoe-stories.md §Which half a story uses.
Nothing carries the zone afterwards; the view it produces simply uses one
half's keys, which is what `zoneOf` then reads back.

Each story's columns are six numeric — the phone bound
(docs/app.md §Columns and sorting) — spent on its score and the terms behind it,
though not uniformly. Race has three terms and shows all of them. Tempo has four
and leaves out shock absorption, which is its floor rather than its point. Easy
has three and still leaves out outsole durability, spending the slot on weight
instead — the reasoning is docs/app.md §Columns and sorting.

A preset must never bound a metric whose coverage over its own `considered`
population falls below `SPARSE_BELOW` (docs/app.md §Coverage) — a preset that
recommends against itself is self-inflicted. The guard is still asserted, but no
story has a range key for it to look at, so today it can only fail on a
counter-example `presets.test.ts` builds for it. The equivalent claim for a ranking
is made per term, and belongs to the scores (docs/app.md §The story scores).

Selection is **derived, never stored**: a story reads as chosen while the view
equals what `applyPreset` would build for it right now — **up to column order**,
through the same `upToColumnOrder` every mark resolves by (§What All does):
untick and retick one of Easy's columns and the view is still Easy, so the mark
holds and pressing the lit pill changes nothing. Editing a bound drops the
highlight because the view genuinely is not that story any more, where a stored
`preset` field would keep claiming Easy.

### The story scores

`app/src/lib/score.ts` is a **story-agnostic engine**; each story arrives as a
`ScoreDef` in `app/src/lib/score-defs.ts` — its column keys, its term weights, its
divisors and its anchors, as data. The engine reads nothing story-specific, so a
fourth story is a fourth definition and one `DERIVED_ZONE_PAIRS` entry rather than a
fourth code path, and `SCORE_DEFS`/`defForKey`/`defForPreset` mean no consumer
enumerates the stories. Four stages, each doing one job, and the separation is the
design:

1. **Physical map** — each raw reading becomes 0–1, **linear in goodness**, with its
   true zero preserved. What the measurement *means*; reaching for a percentile by
   default is what hides it.
2. **Divide by that term's standard deviation**, without centring. Equalises spread
   across terms. Not centring is what keeps the true zero, and the differing means only
   add a constant to every shoe, which cannot change an ordering.
3. **Weight** — editorial, and only *effective* because of stage 2.
4. **Rescale the weighted mean between two frozen anchors** to give 0–100. Cosmetic;
   the ranking is settled by stage 3.

Stage 2 is not optional, and this is the part that is easy to drop. A term's influence
is otherwise set by its spread on its own mapped scale, not by its weight: measured
across the pool, outsole durability at weight 1 outweighs shock absorption at weight 2,
and heel counter stiffness — five subjective buckets — becomes the most influential term
in the function. The coarsest metric wins *because* it is coarse. Min-max does not fix
it (both are linear; influence comes from spread, not range) and rank does but discards
the magnitudes stage 1 exists to capture. `score.test.ts` asserts the effective
influence against the real dataset, so this is a regression test rather than a
measurement someone took once.

Which terms each story has, what each is for, and why the missing ones are missing is
docs/shoe-stories.md. Stage 1 is **shared by all three**: a metric means the same thing
whichever score reads it, so there is one mapping per term and one `TERM_ORDER` every
breakdown reads in — two score columns on screen would otherwise list their shared terms
differently. A per-story mapping constant is the one thing that would let two scores over
one pool disagree about one measurement, which is why `L_OK` is not one.
The mappings are ratios rather than percentiles because
each has a defensible physical form: shock absorption over a fixed reference (a fit
through the origin gives ≈3.6 SA per mm of stack and predicts the barefoot shoes, so 0
SA ≈ bare ground); energy return is already a true percentage; outsole life is
`thickness / wear`, so goodness is **reciprocal** rather than negated — half the wear
rate lasts twice as long — and **capped**, because past a few Dremel-units of life the
outsole is not what retires the shoe, the midsole packing out is, and that is
unmeasured; midsole width over stack, because stability is a lever from foot to ground
and the dimensionless ratio also stops "stability" covertly selecting heavy shoes — measured
against weight over the pool, the raw width correlates positively and the ratio slightly
negatively, and opting in barely moves the top 30's mean weight, which stays under the pool
mean on both sides; heel counter stiffness off its own five-point scale, because a
percentile would invent resolution the measurement does not have.

**No story weights a thin term.** This is the score's half of the sparse-bound guard
(§Presets), and it is the half that still has something to check: `score.test.ts` counts
every weighted term over the pool its story is scored on — the plate-filtered pool for
Easy and Tempo, the fleet for Race — and fails when one falls below `SPARSE_BELOW`
(§Coverage). The stability pair is counted too, because a runner can turn those terms on.
Counting is on the **mapped term** rather than a metric slug: outsole life and midsole
width are ratios, and a shoe missing either half is as unscoreable as one missing a
reading outright. Every term sits comfortably clear of the threshold today, so a failure
means upstream coverage has genuinely collapsed — drop the term, or the story that
weights it. Do not lower the threshold, which is owned elsewhere and shared with the
presets. The live margin is the test's to report, not this doc's to restate.

**A story's scoreable list is floored as a share of the pool it ranks, and neither share
is adjustable.** `score.test.ts` floors Tempo at 0.65 of the plate-filtered pool and Race
at 0.75 of the fleet. A count fails on growth, which is not a regression; a share fails
when a term's coverage collapses under a fleet that never changed size — which the
scraper's fleet gates cannot see, no shoe having vanished
(docs/scraping.md §Validation gates). The floors come from history rather than from
taste: replayed through today's scoring code, every `data/` commit puts Tempo between
0.7219 and 0.7520 and Race between 0.8147 and 0.8418, leaving 7.2 and 6.5 points of
headroom under the historical minimum — about 2.4x the whole range either share has
covered, and 2.7x its widest single step.
**Do not lower a floor to make a red refresh pass**: under it the story is ranking a list
that has quietly shortened, and the fix is upstream. Two limits of that evidence, both
live: the history is two scrape refreshes deep, and its widest single move came from a
**curation** edit — dropping the non-running shoes — rather than from a scrape. And the
floor is immune to *proportional* growth only. Hold the scoreable counts where they are
today and Tempo trips at a pool of 444, Race at a fleet of 511, so a catch-up batch of
untested new models trips one with no coverage regression behind it.

**Every constant is frozen** — derived once from the fleet at `data/` commit `baed23b`
and never recomputed from the loaded catalogue: the two references, the outsole cap, the
per-zone width caps, the sd divisors per zone, and the anchors. Why, and what an
agent must not "fix", is docs/decisions.md §Frozen scores and live thresholds.
Consequences, all intended: a shoe's score never
moves because the catalogue grew, and **a future score may exceed 100**, which is why
the column's header carries no `/100` — and why the suite checks the endpoints
**one-sided**, failing when the scale falls short of an anchor and never when a better
shoe runs past one. `score.test.ts` pins every constant, so an accidental recompute fails
the build rather than silently moving every score.

**A divisor belongs to a pool, never to a story.** It is a property of
`(metric, mapping, pool)`, so Easy and Tempo — which rank the same plate-filtered pool —
share **one object by reference**, and keeping two copies would be two homes for one
fact. Race ranks the whole fleet, where carbon widens every spread, so its divisors are
materially larger than the pooled ones — the values themselves live in `score-defs.ts`
and nowhere else. The frozen tables are named for their pool
(`PLATED_POOL_SD`, `WHOLE_FLEET_SD`) and must not be collapsed into one global table.
The shared table carries every term, including ones a given story ignores — `weights`
decides which are read, and that is what lets two stories share one object.

**The pool names where a definition's constants came from; it does not gate
computation.** `Page` scores every loaded shoe against every definition, so a carbon
shoe gets an Easy score and is filtered out of Easy's *view* by the plate gate. A shoe
outside a definition's pool can therefore read above 100 or below 0, which is correct
and **must not be clamped**. There is deliberately no `pool` predicate on `ScoreDef`: a
callable would invite exactly that mistake.

The anchors are frozen **per story, per zone and per stability state** — four pairs each
for Easy and Tempo, two for Race, which has no stable variant. Only the anchors are per
story, because they are the one constant that depends on the weights. The toggle changes
what the score means, so one shared scale would invite a comparison that is not
meaningful; on shared anchors the stability-on list would top out at 77.6 purely
because the best shoe overall is not the most stable. `r0` cannot be dropped in favour
of the physical zero either: preserving true zeros through stage 2 leaves every shoe
carrying a large common baseline, so an unanchored scale compresses the fleet into
44–100 with a median of 82.

**Each score is two synthetic keys** — `easy-score-heel`, `tempo-score-forefoot` and so
on, six in all — and they are the columns whose value depends on the *view* rather than
on the shoe: the stability preference decides how many terms there are.
`numericValue` therefore cannot answer for them. **A score column names its own zone rather than taking the derived
one**: resolved through `zoneOf`, unticking two measurement columns turned every score
into a heel score with nothing on screen saying so, and the panel below could then
explain a half the header did not name. There is no zone fallback in scoring at all now.

Naming its own zone does not exempt it from the zone control. The pair is declared in
`DERIVED_ZONE_PAIRS`, held apart from `ZONE_PAIRS` because `metricEntries` resolves that
list against the catalogue and a key with no `LabTest` behind it would drop out of the
column picker — but `swapZone` and `zoneOf` read both. So a score column **follows a zone
click**, like every other column that carries no number, and a table showing only the Easy
heel score **names the heel**. Without that, clicking Forefoot swapped the stack column and
left a heel score sitting beside it. `labels.ts`, `direction.ts`, `urlstate.ts` and the
column picker all **derive** from that list rather than naming a score, so a further
story reaches the header, the wash, the URL allowlist and the picker with no edit.

**The stability preference reaches Easy and Tempo only.** A definition carries a
`stable` variant exactly when it applies, so the flag is inert inside `scoreOf` for Race
rather than branched on by any caller. The About panel names Easy and Tempo **by hand**
where the toolbar caption it replaced derived them, and `AboutDialog.test.ts` carries the
derivation as a guard instead (§The About panel). Why Race is
excluded, measured rather than assumed, is docs/shoe-stories.md §Race. **One named
preference is a deliberate decision rather than an unfinished generalisation**: a general
metric picker for the score is rejected, not deferred — so BACKLOG.md deliberately
carries no item for it, and the absence is the record.

`Page.svelte` iterates `SCORE_DEFS`, resolves one map per key and hands the whole lookup
— column key to slug to score — to `sortShoes`, both tables, the CSV export and the
detail panel, each of which reads it **by column key**, so a further story is a further
entry rather than a further parameter. It is computed
**client-side at render time**, like a percentile bound and unlike anything in `data/`:
while the weights are still moving, a dataset rebuild between experiments would defeat
the point. Moving it to build time later is a performance decision, not a correctness
one, and no determinism gate applies: nothing about it enters `data/`
(docs/scraping.md §Determinism).

An unscored shoe renders an **em dash** and sorts last whichever way the column
sorts — never a 0, which would read as the worst shoe in the fleet — and the CSV
leaves its cell empty for the same reason. The column's wash ranks over the
**rendered rows** (`rankMap` in `lib/stats.ts`), like every other column's, or its
tint would mean something different from its neighbours' in the same row.

Expanding a row shows the **per-term breakdown**: the raw reading, the mapped term, the
weighted contribution and the share, per term. That is not decoration — it is what makes
a surprising rank diagnosable rather than arguable, and it is the reason the feature
ships before the weights settle. The **reading** column is what makes it work at all:
two terms cap, and most of the scoreable pool sits at exactly 1.0 on outsole durability,
so a mapped value alone cannot say what put them there. Where a term reads a derived
quantity the cell shows the division — `1.33 = 4 / 3` — because the ratio alone does
not say which reading moved. `readings` in `score.ts` owns those readings, so the
panel never re-derives them. Five columns of readings measure 417px — 424px with
stability opted in — against the 285px a 375px phone leaves the panel, so the block keeps
**its own scrollport**, on an inner `.scroll` box rather than on the section: the page must
not go sideways for it, and the e2e run asserts that at 375px with a row open. The table
declares **no `min-width`**: the term names and the nowrap readings already set a
min-content wider than any figure worth writing down, so a declaration there decides
nothing and only invites a second, staler number. The scrollport is inner so the section heading
stays put while the figures scroll — on the section itself the heading scrolled away
from the figures it names. `Share` renders as a small accent bar beside the percentage,
borrowing the coverage-bar idiom, so "shock absorption is doing most of the work here"
reads without comparing three numbers; it is accent rather than neutral because it is a
**data mark** encoding magnitude, where the pickers' coverage bars sit in a control
(docs/app.md §Theming). The number beside it is the accessible value and the bar is
decoration. `Reading` stays dim, so `3.33 = 3 / 0.9` reads as working rather than as a
value. The panel is handed the
view's **columns**, and renders one breakdown per score column on screen — labelled with
that column's own header text, keyed by the column and resolved through `defForKey` and
`zoneOfKey` — and none at all without one. Keyed by the **column** rather than the zone
because with three stories on screen a zone appears three times, and Svelte throws on a
duplicate key. Reading the columns rather than a zone is what makes panel and column
unable to disagree; `stability` still applies to all alike, and Race simply ignores it.

### The zone is a preset too

**A zone, and never a "side".** The heel and the forefoot are the two *ends* of
a shoe: a runner asked to pick a side reasonably thinks of the medial and
lateral ones, which this tool has no readings for at all. The control reads
**Measured at**, which describes where the number came from rather than how the
reader runs — naming the runner's strike would claim a self-diagnosis the tool
cannot check (docs/shoe-stories.md §Which half a story uses). The type is
`Zone`; "side" is not a synonym for it anywhere in the code, the copy or these
docs.

Both groups above the table are derived marks over one view, not a field and a
mark. `lib/zone.ts` is the whole mechanism:

- **`zoneOf(v)`** is the zone a view is *about*: the one half every zone-paired
  key it uses belongs to — columns, range keys and the sort key alike — or
  `null` when it uses both halves or neither. A mixed view is not wrong, it is
  simply neither preset, exactly as a hand-edited view is neither story. Unlike
  the story mark, this one **survives hand-editing a bound**: a zone is not a
  story, and a runner who types a heel number has not stopped being on heel.
- **`projectZone(v, zone)`** is what a click does. Columns and the sort key
  carry no number — "sorted by energy return" means the same on either half — so
  they follow; a bound on the half being left carries one that does not
  transfer, the median heel stack landing in the top few percent of forefoot
  stacks, so it is **dropped rather than translated**. Carrying the
  *percentile* across instead would silently rewrite a number the runner typed.
  Everything with no zone — price, weight, brands, search, the discontinued and
  missing-data flags — is untouched. A view that names no zone at all gains that
  zone's two default measurement columns, so the control is never a dead button
  that has just deleted a bound.

Together those give the invariant the rest depends on:
`zoneOf(projectZone(v, z)) === z` for every view and zone. A click always leaves
the view committed to the zone clicked, so the mark can honestly read
everything and the just-clicked control is never left unlit. `Page.svelte`
routes a view that *is* a story through `applyPreset` on the new zone instead,
so it re-resolves as that story's own view of the new half — its sort key, its
score column and its measurement columns all move together.

Mixed views stay reachable by hand and by link, and stay unmarked in the zone
group. They are simply not *preserved* across an explicit zone click.

### What All does

`allView(v, zone)` is both what `All` produces and what lights it: `All` is
marked exactly when `sameValue(v, allView(v, zone))`. One function rather than
an action and a matching predicate, so **marked means pressing it changes
nothing** is true by construction and cannot drift.

With a derived zone, `All` restores that zone's plain table — **up to column
order**. Column order is add-history, not intent: nothing in the app reorders
columns deliberately, so a view that differs from the plain table only in order
already is that table. `upToColumnOrder` returns it unchanged, the mark lights,
and a press changes nothing — where an order-sensitive restore unmarked `All`
the moment a default column was unticked and reticked (it comes back at the
end), and then had a lit press reorder columns the runner never chose. The rule
is the helper's, not `All`'s: the story marks resolve through the same function
(§Presets), so no mark in the group is order-sensitive. With no
derived zone `All` replaces the filters and touches nothing else — there is no
defensible column set to impose on a deliberately mixed table, and clearing a
bound is not removing its row (docs/app.md §Filters), so a hand-added row that
was on screen only because it carried a bound stays listed and empty. The zoned
branch is a wholesale restore, which by definition carries no hand-added rows,
so there they go. The two branches disagreeing is the point.

**A view with no zone covers two states**, and this branch treats them alike: one
using *both* halves, and one using *neither* — reachable by unticking Stack and
Energy return in the column picker, or by a link like `cols=score,weight`. The
second gets the timid rule too, so `All` leaves those columns alone rather than
imposing a table on someone who chose not to have one. Getting back is one
click: pick a zone and the two measurement columns are appended at the end
where `defaultColumns` interleaves them — an order-only difference, so `All`
lights on that first click.

Two consequences follow from the identity, and both are deliberate:

- **A mixed view with no filters marks `All`.** A view showing everything is an
  `All` view whether or not it commits to a zone; the alternative leaves `All`
  unlit on a view it cannot change.
- **`All` is not idempotent when clearing a filter is what gives the view a
  zone.** From `cols=score,heel-stack` with a bound on `forefoot-stack`, the
  first press clears the bound and leaves the columns alone; the view is now
  heel-derived but is not heel's plain table, so `All` stays unlit and a second
  press restores it. There really is something left for it to do.

Marking on "no filter is active" was considered and rejected: it would light
`All` on a view whose columns and sort were hand-edited, so pressing a lit
control would still change the table.

When the view names no zone, applying a story has to pick one — the stories each
bind one half — and `DEFAULT_ZONE` is that pick.

### The setup strip

`SetupStrip.svelte` asks **both** questions once and then hands over to the
toolbar for good. Six equal cards in one row, in two divided groups: *Measured
at* — Heel, Forefoot; *Built for* — All, Easy, Tempo, Race with a one-line
description each.

**Neither label makes a claim about the person.** "I land on my heel" tells a
curious browser they are being mislabelled; "Measured at" describes what the
control does to the table, and "Built for" puts the claim on the shoe. This is a
deliberate stance — do not "fix" it back to something friendlier.

No card carries a count (docs/app.md §The toolbar). The descriptions align to a
common baseline by giving the **name** line a fixed height: bottom-aligning with
`margin-top: auto` leaves them ragged, because the descriptions wrap to different
line counts. The grid is
`repeat(2, minmax(0, 1fr)) 1px repeat(4, minmax(0, 1fr))`, so the group divider
gets a track of its own in the gutter and no card is resized to make room for
it; it is drawn in `--divider`, which exists because `--border` is invisible
against `--chrome`. Below 700px each group becomes two columns at full card
size — six in a row is a desktop layout.

**A chosen card is tinted with a hairline accent border, never filled.** Two
cards are lit at once here — a zone and a story — and a filled pair would put
two loud blocks on the one screen the strip exists to own, even though the
toolbar it hands over to does fill its selected pill. Hover is **border-only**
for the same reason in reverse: filling on hover made a hovered card
indistinguishable from the chosen one, so the two states have to differ in what
they change, not only in how much. The zone cards carry no description, so their
name centres vertically in a box whose height the story cards set.

**The strip explains nothing itself; it invites the panel that does.** One line
under the cards, spanning the grid — *New here? **Read about this table*** —
opens the About panel (§The About panel), which owns every word of explanation
the chrome offers. The two `?` popovers that used to hang off the group labels
are gone, and `HelpPopover.svelte` with them: one body of explanation to keep
true, offered in words on the screen where a first arrival is standing rather
than in a punctuation mark. The invite carries **no `↗`** — that mark means
*this leaves the app* on the masthead credit, and this opens a modal. One glyph,
one meaning; the accent colour is what carries the affordance.

**Visibility is ephemeral `$state`**, initialised from "the address canonicalises
to nothing" — a bare arrival, which `Page.svelte` already knows at init, and which
a link wearing nothing but tracking tokens is (§View and URL ownership) — cleared on the first story
click, never serialised and never persisted. So the strip is offered on **every**
bare arrival rather than once per browser: view state lives in the URL alone
(§View and URL ownership), and a dismissal flag in storage is what this section
rules out. The property that flag would have protected is preserved exactly by the
address instead: a bare link opens expanded, a filtered link opens collapsed. A zone click leaves the strip up, because the zone is the
strip's other question; a story click collapses it with a height transition
under a `prefers-reduced-motion` guard. The strip's `All` card stays marked
through a zone click, because the click leaves the view equal to that zone's
plain table, which is what `allView` produces.

**The hand-over moves focus as well as the question.** A story click unmounts
the card the keyboard is standing on, and nothing else caught it: `activeElement`
became `<body>`, so no focus ring was drawn anywhere on the page and a screen
reader was left on the document rather than on the thing it had just operated.
Forward made it worse — the bar precedes the strip in the DOM, so Tab walked on
into the sidebar and the replacement pill was **4 to 10 Shift+Tabs behind**,
depending on the engine. `onStory` therefore focuses the toolbar pill for the
same story, found by `data-story` rather than by the checked mark, because a
view matching no story marks nothing and focus would fall to `<body>` again. It
runs only on the hand-over: called from the bar's own group, `lib/roving.ts`
already owns focus. A **zone** click leaves the strip up, so the card that was
pressed is still the control that answers the question and focus stays on it.

**Scrolling past the strip hands over too.** The strip is `position: static`, so
it leaves with the page while the bar that *is* pinned deliberately draws neither
group — which left a first-time runner who scrolled the table to see what was in
the catalogue with **no zone or story control on screen at all**: at 1440, 1280
and 1024px the only radiogroup in the viewport was the sidebar's Discontinued. So
an `IntersectionObserver` hands over the moment the strip's lower edge passes the
top of the screen. It is the same one-surface-at-a-time rule the section already
states, reached by scrolling rather than by clicking.

**Permanent, not reversible, and that was settled by measurement.** A
visibility-driven swap would oscillate: gaining the groups makes the bar **33px
taller at 390px**, the pinned band reserves that height, and the strip is pushed
back into view by more than the margin that hid it — hide, grow, reappear, shrink,
at frame rate. The permanent form has no such loop, and it is what this section
already says happens anyway.

**The hand-over may not move the page under the runner.** Everything below moves
twice — up by the strip's height, down by the row the bar gains — so the
compensation is measured off the table anchor's own position on screen rather than
computed from either, and applied again on the next frame, because the engines run
their own scroll anchoring over content removed above the viewport and it can land
after the handler returns. Measured on the real fleet in both engines at six
widths: **0px of drift in Firefox and at most 0.4px in Chromium**. The collapse
itself carries no transition on this path — the strip is off the top of the screen,
so an animated one is 200ms of table sliding under someone reading it.
`smoke.spec.ts` scrolls past the strip at 1440 and 390px and asserts both groups
in the viewport afterwards and the table within a pixel of where it was.

**The strip never returns**, and nothing is lost by that: the only thing the
cards hold that the bar does not is the descriptions, which are a
first-encounter need. It is also why the strip needs no card of its own for
"everything": `All` is a permanent toolbar peer, reachable long after the strip
has gone.

### The toolbar

`Toolbar.svelte` is the permanent surface: a setup group of three controls in one
visual language — the zone, then `All | Easy | Tempo | Race`, then the
`Stability` pill — and an actions group pushed right by `margin-left: auto`:
`About`, `Filters` (only where the sidebar is a drawer), `Columns`,
and below 800px the three utilities as well (§Where the utilities live). The
strip cannot hold the controls that reset it, because it is gone by the time they
are needed.

**There is no group divider.** A hairline between the zone and story groups
above 880px was measured and rejected: with the stability pill joining that run,
a line between the first and second of three reads as arbitrary, and no band below 800px had one —
so the same row looked different either side of that boundary. It is gone at
every width. If it should come back it belongs between the story group and the
pill, which is where the grouping actually breaks.

**The selected pill is filled with `--accent-solid` carrying `--on-accent`**, on
a `--bg` track with a 2px pad — §Theming owns why that pair is two tokens rather
than `--accent` and a literal white. Each track keeps `overflow: visible`,
because the focus ring is a `box-shadow` and a clipped track would swallow it.

**No pill changes width when it is picked, and that costs a reservation.** The
selected state also carries `font-weight: 600`, so every control in the family
was sized by whichever weight it happened to be wearing: `Stability` grew from
70px to 73px as it came on, `Forefoot` from 70px to 76px, and the four story
pills redistributed on every press, shifting the groups beside them. A lone
toggle is where it reads worst — the thing you pressed moves under your finger —
but it was never only that pill. Each pill therefore carries its own label a
second time, in a `data-label` the CSS draws again at the selected weight in a
**zero-height line of the same column**, so the box is sized by the wider of the
two states and neither moves. `visibility: hidden` rather than `opacity`, which
keeps the duplicate out of the accessibility tree as well as off the screen; the
zone group states the rule again because Svelte's scoping puts its two buttons
out of `Toolbar.svelte`'s reach, exactly as their padding already is. The
sidebar's released-after chips are the same family and carry the same
reservation. The bound is `holds every segmented pill to one width across its own
toggle`, in `cross-browser.spec.ts` rather than the Chromium-only suite: what the
trick is worth is a question of text metrics, which is the kind of thing one
engine rounds differently.

**`About` is the first of the actions group, at every width and in both states.**
It explains the table rather than acting on it, so it stays on the bar whether
the setup strip is up or down: the one screen where a reader knows least is the
one screen it must not be missing from. It leads Filters and Columns because it
is the control a reader might need *before* they know what those two are for.
§The About panel owns the panel itself.

**`Filters` and `Columns` are the same control twice**, so they are sized and
filled alike: the picker is a `<details>` whose `summary` inherits the document's
16px and paints nothing unless told to, which puts a 16px unfilled label beside a
13px filled button. Both carry `--t-sm` on `--surface`. The picker's count badge
sits on `--border-soft` rather than `--bg`, which the summary's own fill would
otherwise swallow.

**The bar draws only its actions while the strip is up** (`showGroups`). The
strip *hands over* rather than sharing the screen: both surfaces drawing the
same two groups put the four stories on screen twice on a first arrival, which
is the one screen the strip exists to own.

**The stability pill is absent there too, and that is not a layout compromise.**
With `All` selected there is no score column on screen, and the preference only
ever changes a score — so on the landing screen it is being offered at the one
moment it provably cannot do anything. The bar gains all three setup controls in
one move when the strip hands over. The cost is one extra press for a runner who
lands knowing they want it, on the first visit only. **Do not restore it there
for consistency**: consistency is not the property being protected, and the
reason is invisible from the markup, which is why `Toolbar.test.ts` guards it by
name.

The bar carries no marker class for that state. `.setup` is simply empty, the
actions hold the trailing edge as they do at every other width, and
`opens with the actions flush to the bar trailing edge` measures that in a
browser across the whole width ladder rather than asserting a class name in
jsdom.

**The stories carry no counts**, on the bar or on the strip. A scored story's
count is the size of its **pool** rather than of a shortlist — every non-carbon
shoe passes Easy, scored or not — so the number promised a filtering that no
longer happens. All three are scores now, and Easy and Tempo share one pool
while Race takes the whole fleet, so the three counts would distinguish nothing
anyway. The receipt's
`N of M shoes` is a different number and stays: it counts what is on screen.
Dropping them also drops three `applyPreset` passes over the whole dataset per
render.

**There is no `Clear` button.** `All` is the fourth peer of the stories and the
same state a Clear produced, `allView` (docs/app.md §What All does), named for
what you get rather than what you destroy — and it dissolves the ambiguity
between a toolbar "Clear" and the sidebar's "Clear filters". `All` leads the
group so it reads as everything → narrow to a story. It clears **hand-set
filters too**, not only a story's share: telling the two apart would need the
stored `preset` field this section rules out. The sidebar's **Clear filters** is
a different, smaller thing and keeps its name: it empties the filters and leaves
sort and columns alone.

Both marks are passed in, not held: `'all'` while the view equals what `All`
would produce, a story id while it equals that story, and `null` once it is
neither; the zone group takes `zoneOf` and marks nothing on a mixed view. Each
group is a nullable mark, so either can show nothing selected, and `roving`
still gives a group with nothing checked one tab stop.

**The stability preference is a pill, not a checkbox.** It answers a third
question about the same table as the two groups beside it — *what is this table
for?* — so it is drawn in their family rather than as a checkbox standing among
segmented groups: one `Stability` button in a track of its own, `aria-pressed`
saying which state it is in, filled with `--accent-solid` under `--on-accent`
when on. Its accessible name is exactly `Stability`; the bare noun is neither a
statement about the runner nor about the search, which is what
`Stability matters to me` was.

**Its explanation lives in the About panel** (§The About panel), and nowhere
else. The caption under the checkbox and the `?` beside its label are both gone —
21px of row for the `?` alone and a whole bar row for the caption — because two
copies of one explanation drift apart, and the panel is the copy that gets to be
complete.

`ZoneToggle` carries **no visible lede**. Two segmented groups side by side
are one language, and the words live on the setup strip, where the question is
asked once; the group keeps `aria-label="Measured at"` so it is still
named for a screen reader.

The cascade is §The chrome bands, below.

A width that has to span a row belongs on the **wrapper**, never on the segment:
on the segment, the bordered pill container stretches the full width with its
pills clustered at the left. `smoke.spec.ts` asserts the story group is
shrink-wrapped rather than stretched, at every width.

**Below 800px the chrome has a budget**, and it is a number rather than a taste:
everything above the first shoe is paid on the screen with the least of it. The
masthead and the bar measured 217px at 390×844 with the setup strip up, and 198px
at 360px with the story pills up — which with the pinned table header put 39% of
the viewport in front of the first result. The rebuild spends **109px at 360px
with all three setup controls on the bar, and 80px on a first arrival**. The
ceilings are set roughly 10px above the **taller engine** — Firefox runs about
5px above Chromium here, and the suite that asserts them runs Chromium only —
and are asserted in `smoke.spec.ts`; they
are bounds rather than pins, so a font tweak does not fail the build but a
regression does. Nothing was dropped to buy it: the explanation moved into one
panel (§The About panel), the utilities and two of the actions became icons on
one boundary (§Where the utilities live), and the bands were laid out rather than
left to wrap (§The chrome bands).

Picking a zone always leaves the view about that zone, in three states: a view
equal to a story is rebuilt as that story on the new zone; a view that names a
zone is projected onto the new one; a view that names none gains that zone's
measurement columns. In all three, the other half's bounds are **dropped rather
than translated**, and everything with no zone is untouched — the reasoning is
§The zone is a preset too. A no-op click on the marked zone returns
early, so it cannot rebuild the view.

## The chrome bands

Below 800px the chrome is **three bands** — identity, what acts on the table,
what the table is — and above it **two**.

| query | composition |
|---|---|
| (none — above the sidebar's boundary) | one row: `.setup` (zone · story · Stability) — gap — `.actions` (About, Columns). No `Filters`: the sidebar is permanent, so the toggle has nothing to toggle — and it is *absent*, not hidden, because the decision is the script's |
| (the `drawer` prop, below that boundary) | `Filters` joins `.actions`, because the sidebar is a drawer here (§Filters). Still one row, and the word is still a word |
| `max-width: 800px` | two rows: `.actions` first (`order: -1`), then `.setup`, which is `space-between`, capped at 414px and centred. Every word on the actions row but `About` becomes a glyph, `Filters` included. Pill inline padding `--s3` → `--s2` |
| `max-width: 429.98px` | `.setup` drops the cap: full width, `space-between`, flush to both padding edges. **Every** pill's inline padding `--s2` → `--s1`, the zone group's included |

There is no spacer element on this bar: `.actions { margin-left: auto }` is what
holds the trailing edge above 800px, and the "gap" in the table above is that
auto margin rather than markup.

**The band is pinned to the viewport on both axes**, and for a long time only one
of them was. `position: sticky` pins the axis its inset names; the other one
travels with the document — and the document is what scrolls sideways past six
columns, `.content` being forbidden an `overflow-x` (§Columns and sorting). The
band's box is the viewport's width, so scrolled right it **ended before the page
did**: at a 1100px window over a 1177px document `.chrome` sat at `x: -77` and
`elementFromPoint` returned `td.num` at six places inside the masthead and the
toolbar. Shoe values painted where the identity band is, above the pinned table
header, on any width where the table can scroll right — phone included.

**Widening the band to the document was measured and rejected.** It is the obvious
move and it takes the actions with it: at 1100px the utilities would sit at
document `x = 1177`, 77px off the right of the screen at rest, and at 900px the
whole group would be. `opens with the actions flush to the bar trailing edge` is
the assertion that says they stay reachable, so the band is `position: fixed`
instead — the controls hold the screen's edge at every scroll position, and the
band covers the full viewport width because that is now what its box *is*.
Making `#app` `width: max-content` was measured too and is worse than either: it
resizes the table it was supposed to leave alone, from 1146px to 1276px at 1440px
and to **17,895,672px** on a phone.

A fixed box leaves no height behind it, so `.chrome-space` carries the same
`clientHeight` the band is measured by — one measurement, so the room and the band
cannot disagree. The band starts as `sticky` and swaps to `fixed` only once that
height is known (`.pinned`), so there is never a frame laid out with a pinned band
over a spacer of nothing; measured over the first forty frames in both engines,
`.content`'s top never moves. `holds the chrome over its own band with the
document scrolled right` asserts it at 700 and 390px — fifteen columns, scrolled
fully right, every probe across the band inside `.chrome` and the table's header
still clear of it. It used to run at 1000px too, and on nine columns: since the
desktop table is mounted only where it fits, the widths at which any view scrolls
sideways are the stacked list's past its six-column bound, and it takes fifteen
53px columns to reach past 700px of window
(§Two renderings, and only one of them mounted). At 1000px there is no longer a
view that scrolls sideways at all, which the test's own
`maxScrollLeft > 0` guard is what said.

**There are two named boundaries in this app, and they are not the same
number.** Each has one home, and the two answer different questions:

| boundary | number | width it is about | question it answers | asked by |
|---|---|---|---|---|
| **chrome density** | `800px` | the WINDOW | how much room has this bar for words? | `CHROME_QUERY` in `Page.svelte`, and `@media (max-width: 800px)` in the bar, the masthead and the pickers |
| **sidebar fit** | `1191px` floor, further out per column set | the LAYOUT (`documentElement.clientWidth`) | can the table be seen beside a 260px track, by the fit rule's own criterion? | `sidebarPermanentAt` in `lib/fit.ts` owns it over the fit model; `Page.svelte`'s `drawer` rune reads it and writes a class the layout, the scrim and the drawer's own rules answer; the `Filters` trigger takes it as a prop; `App.svelte`'s reserve asks the floor directly |

**Everything in the app that reads a width is in that table**, and the list is
short on purpose: the chrome's `matchMedia` rune, the sidebar's and the mount
decision's shared `layoutPx` rune in `Page.svelte`, and the placeholder's
`permanent` rune in `App.svelte`. The last two subscribe through
`lib/layout-width.ts` and the first cannot — CSS has no way to ask about the
layout width, so a boundary a stylesheet has to agree with is a window boundary
by necessity (§Two renderings, and only one of them mounted). A third notion is
not wanted; the mistake to guard against is adding a width read that answers to
neither of these two.

They were one number until the sidebar's own was measured (§Filters), and
collapsing them again is the mistake to guard against: the chrome's is a
question about *type and gaps*, which stop fitting at 800px, and the sidebar's
is a question about *the table's min-content*, which is 917px on its own and
1177px with the track. Nothing about the first predicts the second.

**They are not even about the same width.** A media query measures the window,
which includes a classic scrollbar; the fit model measures the layout the table
is given, which does not. That is right for the chrome — the bar spans the
window — and wrong for the sidebar, which is why the sidebar's boundary stopped
being a media query and became a rune over a width the script reads. The
mismatch was worth 12–15px, and in it the sidebar had its column while the table
was still being sized as though it did not (§Filters).

Between them the bar is one row carrying an extra control it never used to
carry — `Filters`, **with its word**, because words-become-icons is the chrome's
boundary and did not move. Measured at 801px with a two-digit column badge, the
row's remaining slack is **36px in Chromium and 33px in Firefox and WebKit**;
`keeps the one-row toolbar to one row at the narrowest width that has one` is in
`cross-browser.spec.ts` rather than the smoke suite because the two engines that
run there are the two whose UA form face is the generic `sans-serif`, which is
how this row once wrapped on CI alone.

**Every number in this section is the app's own face, and that is not
automatic**: a form control does not inherit `font-family`, so without the one
rule in `app.css` that gives it back the bar is drawn in whatever face the host
resolves for the engine, and the numbers below swing across a 51px range on what
a machine has installed (§Theming). With the rule in place the three engines
agree to within **2.4px** across the whole setup row. Anything retaken here must
be measured with it, or it is one machine's.

**`800px` is written `800px` rather than `799.98px`**, so exactly 800 is
"mobile" as it always has been. `429.98px` takes the repo's `.98` convention so
no width matches two tiers at once, and so the number that gets named is the
first width of the *upper* tier: a `max-width: 430px` matches *at* 430 and would
put the flush band's rules on the width meant to open the capped one. The
sidebar's boundary needs no such spelling any more — a `>=` in the script is the
whole convention, and `SIDEBAR_PERMANENT_PX` is the first PERMANENT width by
construction rather than by a hundredth of a pixel.

**The design asked for a merged line from 700px to 800px, and the shipped
controls do not fit one.** Measured with the icon forms in place, the setup row
needs 374px in Chromium and 376px in Firefox and WebKit, and the actions 329px
and 331px — the actions carry a worded `About`, two glyphs and the three
utilities — so the merged line's own minimum is a **727px viewport in Chromium
and 731px in the other two**. It covers 69 of the 100 pixels the design asked
for, not the band; below 731 the bar wraps anyway with the two rows in the
**wrong order**, because `flex-wrap` puts the actions after the setup where the
design puts them above it. So the split stays on the boundary that already
exists and the bands are separate for the whole sub-800 range, which is one row
of chrome between 700px and 800px that the design hoped to save.

**The actions lead and the setup follows.** What acts on the table sits above
what the table is, so the row carrying every word and all the colour is the one
nearest the table.

**The cap is 414px** — the setup row's own width at a 430px viewport, which is that
screen less the bar's padding — so above 430 the row holds the spacing it has
there rather than growing gaps that reach 171px by 700px, and centres the
surplus. Below 430 the cap is wider than
the row, so it stops meaning anything and the row goes flush to both padding
edges, which is the property the whole rebuild exists to restore. `space-around`
was measured and rejected: it never touches the padding edge again at any width.

**The `--s3` → `--s2` pill step at 800px is density, not fit.** It is the band
where every pixel of chrome is paid before the first shoe, and that is the whole
reason for it: held at the base `--s3` the setup row's content lands within a
pixel of the 414px cap — 1px under in Chromium, 0.8px over in Firefox — so
nothing about fit chooses between the two values.

**The pill padding steps at `429.98px`, not at the `374.98px` the design named.**
That figure came from a rig carrying the app's tokens but not its components, and
its pills are narrower than the real ones by enough to move the boundary. Held
at the band above's `--s2`, the three groups measure what the merged line above
needs — 374/376px — against the 344px available at 360px, so they are 30 to 32px
over there, still 15 to 17px over at 375px and 0 to 2.4px over at 390px,
so the flush band, the one the rebuild exists to make flush, overflowed at all
three. At `--s1` for **every** pill they measure 318px and 320px, which is 24 to
26px clear at 360px. So the step moved to the boundary that already existed for
that band and one width changes shape instead of two.

**Both steps are written twice, and Svelte's scoping leaves no way to state them
once.** `ZoneToggle.svelte` owns its own buttons' padding in its own scoped style
block, so `Toolbar.svelte`'s `.s` rule has never reached them — which is why
"every pill" is spelled out. Stepping only the pills the toolbar owns leaves the
row 14px over at 360px in Chromium and 16px over in the other two, and leaves
the zone group a step behind its neighbours between 430px and 800px: one group
padded differently from the two it stands with, in a row whose whole point is
that the three read as one family.

**The setup row's `gap` is `--s1` below 800px, and it is spacing rather than
fit.** Under `space-between` the gap is only a floor, so the visible gaps are
whatever the row has spare and the value changes nothing above the binding
widths: at `--s2` the row is 16 to 18px clear at 360px and 30 to 32px clear of
the 414px cap above 430, and the engines walk 360px to 1440px in 10px steps clean
at either value. So there is nothing to buy by moving it and a visible step at
360px to lose.

**The group divider is gone** at every width (§The toolbar).

## Where the utilities live

Copy link, Export CSV and Display are **worded in the masthead above 800px and
icons on the toolbar's control row below it** — two different parents, so one
node cannot serve both.

**`Display` replaced the theme cycle in that slot rather than joining it.** Once
the wash became tunable (§The display preferences) the alternative was a fourth
utility beside three, on a bar whose contents already need 331px at 320px; the
theme is a display preference like the rest, so it moved **inside** the panel as
a control and the bar kept three. Measured, the swap costs the row **1px** at
320px and nothing at all from 360px up — the worded control is the same width as
the two beside it and the glyph is the same 15px box the theme icon was.

The markup is written **once**, as a snippet in `Page.svelte`, and handed to
**exactly one host**: `Header` and `Toolbar` each take a `utilities?: Snippet`
prop, and the band decides which of the two gets it. Rendering into both and
hiding one with `display: none` is the move this app has already rejected once,
for the two table renderings (§Two renderings, and only one of them mounted): a
`display: none` button is still a tab stop for anything that does not evaluate
CSS, and two nodes answering to `Copy link` are two answers to "how do I share
this?". The copy confirmation is one always-rendered `role="status"`, empty until
it has something to say, for the same reason and for one more
(§What a control says it did).

**The band is asked in the script, not as an `@media` rule**, exactly as
`PHONE_QUERY` already is, because a media rule cannot unmount anything. It is
`CHROME_QUERY`, the chrome-density boundary, and it is **not** the sidebar's —
the drawer has its own rune over the fit model, and a 1000px window
draws the utilities worded in the masthead with a drawer still behind it
(§The chrome bands). Each is `max-width` and **inverted rather than
duplicated**: a `min-width` twin of a `max-width` boundary is not its
complement — every fractional width between them matches neither, which browser
zoom and Firefox's fractional viewport widths both produce — so there is one
query per boundary and its complement is whatever it does not match.
`leaves the utilities in the masthead at a width where the sidebar is still a
drawer` is what holds the two apart.

**The host is wrapped in `{#if utilities}` in both parents**, and that is
load-bearing rather than tidiness: a zero-width flex item is still a flex item
and still takes the container's gap, so an empty host left standing at the band
it does not own adds trailing air inside a row whose whole job is to be flush
right. That is the same trap the old `.spacer { display: none }` rule was written
for.

**The CSS moves with the markup.** Svelte scopes a style block to the markup
authored in that file, and a snippet written in `Page.svelte` carries `Page`'s
scope wherever it is rendered — so the header's own `button`, `.icon` and
`.copied` rules stop reaching these three the moment they move, and they would
ship unpainted. They live in `Page.svelte`'s style block now. `Header` loses
`theme`, `onexport` and `ontheme` with them.

**`Filters` and `Columns` lose their words on the same boundary**, so nothing on
this bar is half-worded: one boundary governs every words-become-icons swap. The
cost is deliberate — a 760px laptop window gets glyph-only Filters and Columns
even though the merged line has slack for the words. Both render **both forms**
and let CSS choose, so the accessible name never changes with the viewport, and
the glyph is default-hidden and *revealed* by the query rather than paired with a
`min-width` twin, for the reason above. The column picker's count badge is
what survives its word — the count is the only thing on that control that
changes, and it is why the label was given a badge rather than a growing string —
so the summary carries `aria-label="Columns, N shown"`, and the picker owns its
own tightening rather than the toolbar reaching in with a `:global`.

Two consequences of that label, both worth carrying: the name changes at **every**
width, so the desktop control reads `Columns, 6 shown` rather than `Columns 6`;
and **`<summary>` has no implicit ARIA role**, so `getByRole('button', …)` never
matches it however it is labelled. Browsers do expose the label to assistive
tech, so it is doing its job — but any assertion about this control has to go
through `details.picker summary` and read the attribute.

**The Display control is a `<button>` with a conditional panel, where the column
picker is a `<details>`.** Two reasons, and the second decided it: `<summary>`
has no implicit ARIA role, so no role query ever matches it however it is
labelled (below) — and this control stands among `Copy link` and `Export CSV`,
which are buttons a runner and a test both find the same way. A closed
`<details>` also still renders its children, and eleven controls and two
swatches may not pay for themselves while invisible (§What a drag may
recompute). It joins every floating-panel contract regardless: outside press,
Escape, focus-leave, the stacking tree and an on-screen geometry assertion at
every width (§Every floating panel dismisses the same way, §Stacking order).

The glyph geometry lives in `app/src/components/icons.ts` as path data, never as
whole SVG documents: a whole document would need `{@html}`, and this app has
exactly two sanctioned sinks (§Sanitised-HTML boundary). The `<svg>` wrapper, its
size and its `aria-hidden` belong to each template, because the accessible name
is the button's and an icon carrying one of its own would announce twice.

**Because the snippet changes host, nothing rendered inside it may own state that
has to survive the band.** A host swap destroys and rebuilds every component in
the snippet, so `DisplayMenu`'s open flag lives in `Page.svelte` and arrives as a
prop: held locally, the panel shut itself the moment a phone was rotated or a
window dragged across 800px. The state can be lifted and the DOM cannot, so
`Page.svelte` also hands focus to the trigger in the band that has just arrived —
otherwise a keyboard runner crosses the boundary with the panel still up and no
ring anywhere on the page. That effect depends on the band alone and reads the
open flag untracked, or opening the panel would yank focus back to the trigger.

Three e2e guards hold it: `mounts each utility exactly once at every width` steps
either side of 800 because that boundary is asked twice, once by the CSS and once
by the rune, and the failure mode is the two disagreeing;
`moves the utilities between bands on a resize`, because a listener that never
fires would pass the first guard at every width and still strand the controls in
the wrong band for anyone who rotates a phone or drags a window; and
`keeps the Display panel open across the chrome boundary, in both directions`,
which is the state-and-focus half and walks both ways because only one of them
was ever walked before.

## The About panel

`AboutDialog.svelte` owns **the whole explanation**: what "Measured at" picks,
what the three scores read and deliberately do not, and what the stability
preference adds. One body of copy to keep true, in one place, rather than a
sentence beside each control that has to agree with the other two. The component
owns the words; this section does not restate them.

It is the **`AddFilterDialog` pattern, not `HelpPopover`'s** — appended to
`<body>`, scrim, centred, `min(28rem, 92vw)` wide, `max-height: 80vh`, the body
scrolling inside a frame that keeps the title and `Close` still, dismissed by
`Close`, Escape or an outside press, Tab trapped and focus returned to the
opener. A popover is sized for two sentences anchored to the control it explains;
this is four sections read whole, from two different openers, at every width.
Taking the dialog's pattern means the focus trap, the scrim, the stacking order
and the `<body>` mount are already solved and already tested (§Stacking order).

**Two entry points**, and both open the same panel: the `About` button, which is
first in the toolbar's actions group at every width (§The toolbar), and the
`New here?` line under the setup strip's cards (§The setup strip). `Page.svelte`
holds `aboutOpen` and renders the panel outside `.chrome`.

**One bound worth keeping:** the body does not scroll at 390×844 — most phones —
nor at 900×740. If the copy grows past that, cut copy rather than raising
`max-height`; 80vh is the add-filter dialog's own and is shared deliberately.
`smoke.spec.ts` measures it at 390×844.

**The Stability section names Easy and Tempo by hand**, where the toolbar caption
it replaces derived them from the definitions that declare a stable variant
(§The story scores). Prose is worth the loss of that derivation — but a fourth
stable story would leave the panel quietly claiming two, so the derivation
survives as a guard rather than as an interpolation: `AboutDialog.test.ts`
asserts that exactly `easy` and `tempo` declare one, and fails with the sentence
to edit rather than in a reader's face.

## Stacking order

**Not one scale — a tree.** A z-index only ever means something next to its
siblings, and three of the boxes here are stacking contexts of their own, so
the numbers inside them are not comparable with the numbers outside. Read the
indentation, not the column:

| Layer | z-index | Ranked against |
|---|---|---|
| sticky shoe-name column | 1 | the page |
| pinned `thead` (its name cell, 3) | 2 | the page |
| **pinned chrome** — header and toolbar | 5 | the page |
| ↳ column picker panel | 10 | *the chrome's children only* |
| ↳ Display panel | 10 | *the chrome's children only* |
| **sidebar** — sticky, so a context at `z-index: auto` | — | the page, at 0 |
| ↳ month picker panel | 20 | *the sidebar's children only* |
| drawer scrim, wherever the sidebar is a drawer | 25 | the page |
| filter drawer, wherever the sidebar is a drawer | 30 | the page |
| Add-filter dialog's scrim, About panel's scrim | 32 | the page |
| Add-filter dialog, About panel | 35 | the page |
| skip link | 40 | the page |

So the column picker's 10 does **not** outrank the chrome's 5 — it is inside
it, and rides wherever the chrome goes. The month picker's 20 does not outrank
the drawer's 30 for the same reason. Only the unindented rows can be compared
with one another.

**A modal has to be a child of `<body>`, or its number is not on this scale at
all.** `position: sticky` creates a stacking context whatever its z-index, so
the desktop sidebar is one; the Add-filter dialog was written inside it and its
`z-index: 20` was therefore ranked against the sidebar's own children, never
against the page. The pinned chrome and the table's sticky header both painted
over the open dialog, and no value would have fixed it — 2000 inside a context
that sits at 0 still loses. The dialog moves itself to `<body>` on mount and is
removed from there when it closes.

The drawer is the reason the dialog sits at 35 rather than below 30: wherever
the sidebar is a drawer the dialog opens *from* it, and once it is no longer a descendant
of that drawer it has to outrank it explicitly. Its own scrim takes the gap
between the two — over the drawer it has to dim, under the dialog it belongs to
— which is why the dialog and its scrim are siblings in `<body>` rather than
nested (§Filters). Both facts are measured in
`smoke.spec.ts`, at 1200px and at 375px, by sampling `elementFromPoint` across
the open dialog's box — the desktop fix broke the phone once, and each width
only catches its own failure.

**The About panel takes the Add-filter dialog's own 35 over 32 rather than a
layer of its own**, because the two can never be open at once. The reason is the
modality, not the drawer: above the sidebar's boundary it is permanent and both openers
sit on surfaces that are simply part of the page. Each dialog lays its own scrim
at 32 over everything else and traps Tab inside itself, so whichever is up puts
the other's opener behind a scrim and out of reach (§The About panel).

**Two floating boxes size against the viewport, and neither may exceed it.**
There is no global `box-sizing` reset — the components that size against their
container set it themselves — so a width meant as a total has to say so:

- the **Add-filter dialog** is `width: min(28rem, 92vw)`, which is meant to
  leave 4% of the screen each side. Measured in content-box the 16px padding and
  1px border each side landed on top of it and the box came out 34px wider than
  asked: 365px inside a 360px screen, clipping its own border and both left
  corners off the edge at every phone width. It carries
  `box-sizing: border-box`, and now sits 14px clear of each edge at 360px.
- the **Display panel** is `width: min(20rem, calc(100vw - var(--s5)))` and
  `box-sizing: border-box`, so it is sized against the **viewport** and can
  never be wider than the screen it hangs in: 320px of panel from 344px up, and
  296px at a 320px window. Its body is the scrollport rather than the panel
  itself, which is not arrangement — `:where(.scrollport)` carries zero
  specificity by design, so any padding the component set on the same element
  would silently delete the ring's reservation (§Theming). The head stays still
  above it, which also keeps `Reset` reachable from a ramp dragged somewhere
  unreadable.
- the **column picker panel** is `min-width: 20rem` of *content*, so 354px in
  total against the 352px the bar leaves it at 360px — its left hairline fell
  off the screen. The 4px a side comes out of the **padding** below 400px, never
  out of the 20rem: at 20rem the direction legend holds one line, and border-box
  sizing shrinks it to 320px and wraps it, which the design forbids. **Below
  360px the 20rem cannot fit at all** — 346px of panel wants 354px of screen —
  so there the panel spans the bar (`left`/`right` both at `--s2`, `min-width: 0`
  to let them size it) and the legend does take a second line. One width, traded
  for the checkboxes being on screen.

**Both anchored panels hang off the chrome below 800px, not off their own
trigger.** The `right: 0` says "the end of the row", which was true while the
picker was the last control on the bar. It is not true below 800px: the actions band takes the
whole width and the utilities are pushed past the picker, so the summary sits
mid-bar and the panel opened at **x = −166** with all 52 checkboxes off the left
edge — at every width the drawer exists at, not only the narrow ones. `.picker`
drops `position: relative` there, which hands the panel to `.chrome`, and the
`--s2` inset restores the air the toolbar's own padding used to supply. The
media block sits **after** the base `.panel` rule: a media query carries no
extra specificity, so a `right: 0` declared below it would win.

The Display panel takes the same fix for a different reading of the same fact:
its trigger *is* the last control on the row, but the row itself does not fit
below **345px in Chromium and 347px in Firefox and WebKit** — its contents need
329px and 331px against the 304px a 320px screen leaves — so at 320px the
trigger sits 17 to 19px past the right edge and a panel anchored to it goes with
it. Handed to `.chrome` the panel measures 16px from the left edge and 8px from
the right there. `top: 100%` is then the foot of the chrome band rather than the
foot of the trigger, which is where a panel opened from a two-row bar wants to
be anyway. **The trigger's own overhang is not fixed by this and is not a bug
outstanding**: every utility has been past the right edge at 320px since the
chrome rebuild, and 320px is below the supported floor — §The narrowest supported
width is 360px measures what serving it would cost and declines to pay. At 360,
where the phone bounds are stated, the trigger clears the edge by 8px.

That defect shipped through a green suite, because every assertion the suite
made about the picker was a DOM one and an off-screen box is still `visible`.
The geometry is measured in `smoke.spec.ts` now — the open panel's box against
the viewport, plus a hit test on the first checkbox, at 320, 360, 390, 700, 800,
801 and 1200px — with the legend's one-line bound asserted from 360px up. The
Display panel has its own walk of the same shape, and measures its **height**
too: it is the only floating box in the app that opens below the chrome on a
short phone, so a body outgrowing its `max-height` would put `Reset` past the
foot of the screen with nothing to scroll.

## Theming

Three states — auto, light and dark — persisted in `localStorage` and applied in
`main.ts` **before** the dataset fetch, so a saved dark theme never flashes light.
Storage access is wrapped: it throws rather than returning null in blocked
contexts, and losing the preference beats losing the click.

**The control is a three-pill segmented group inside the Display panel, not a
cycle.** `lib/theme.ts` exports `setTheme(name)` and no stepper, because a cycle
is the wrong shape for three named states: reaching the third costs two presses,
and the button can only ever show the state you are *in* rather than the ones you
could have. The group is the same language the toolbar's zone and story groups
speak — `lib/roving.ts` for one tab stop and arrows that move *and* activate,
`aria-checked` for the state, a recessed `--bg` track, and the chosen pill filled
`--accent-solid` carrying `--on-accent`. It measures 133px against 78px of slack
inside the panel at every width from 360px to 1440px, and 54px at 320px.

Colour, spacing, radius, type and elevation all live in `app.css` as tokens on
`:root`, with dark values under both `prefers-color-scheme` and `[data-theme]`
so the toggle wins in either direction. Components choose none of them: the
scales are `--s1`…`--s6`, `--r-sm`/`--r-md`/`--r-full`, `--t-xs`…`--t-xl` and
the three shadows — `--shadow-panel`, `--shadow-sticky`, `--shadow-dialog`, all
three pinned in `app/src/lib/tokens.test.ts`, which also fails the build on a
component that writes its own rem font size or px radius.

The row surface sits at the end of the lightness axis in each theme — white in
light, near-black in dark — and both washes travel inward from it, separated
only by hue. **Grey means "more"; blue means "better".** A metric with a
declared direction gets `--wash-blue` on the ranked ramp, so only leaders read
as tinted, which is what a ranking wants; a neutral metric gets `--wash-grey`
**linear**, because a scale must read as a gradient rather than a podium.
Row hover paints as a translucent layer so the wash underneath survives it.

**Alpha is resolved in `app/src/lib/wash.ts`, not in CSS.** The cell binds
`--a` and the stylesheet only composites it. The ramp lives in a module for two
reasons: the ranked curve needs a power, which `calc()` cannot express, and the
contrast rule has to be asserted across the **whole** of both ramps rather than
at an endpoint. `wash.test.ts` sweeps `p` over `[0, 1]`, composites the fill
over the surface at `a(p)` and holds the theme's own ink to 4.5:1 in both
themes and on both ramps. The neutral ramp clears by a wide margin, which is
why it needs the assertion rather than a reason to skip it: an unasserted rule
is one a retune deletes in silence.

**One ink at every step.** A ramp that switched to white numerals cannot
satisfy 4.5:1 anywhere near the switch: it must pass through a crossover
luminance where both inks are equally bad, and the best obtainable there is
4.22:1 against this theme's ink. With one ink contrast falls monotonically as
the wash strengthens, which is what makes the endpoint genuinely the worst
case. Do not reintroduce a second ink without redoing that arithmetic.

**The endpoint is not the worst case once a row is hovered.** `--hover-wash` is
painted as a background *image* over the cell's wash, so a pointed-at peak cell
is a third layer and lands below the ramp's own endpoint. `wash.test.ts` sweeps
both ramps under that overlay too against the same 4.5:1 bar, because nothing
else in the suite would fail if `--hover-wash` grew, and the margins it records
are the ones to read: it is the owner of those figures, and it composites in
sRGB where the app paints `color-mix(in oklab, …)`, which round-trips the dark
fill a step lighter — so the painted cell is a little *better* than the model,
never worse. Its ratios are not restated here: one fact, one home.

**`--accent`, `--accent-solid` and `--on-accent` are three tokens with three
jobs.** `--accent` is the small mark — hairlines, carets, in-range bars, links,
the focus ring — and never sits behind text. `--accent-solid` is the darker
variant used only where a filled accent carries text: `--on-accent` on
`--accent` is 4.56:1 in light but **3.61:1 in dark**, so the two themes cannot
share one solid value. `--on-accent` is the one ink allowed on it, and it is a
token rather than a `#fff` written into each component, because the fill and its
ink are one fact and a literal splits it across the components that read it —
`Toolbar.svelte`, `ZoneToggle.svelte`, `MonthPicker.svelte`,
`DiscontinuedFilter.svelte` and the Display panel's theme group.
`tokens.test.ts` fails the build on a raw white in a component's style block.

**All three are DERIVED, per theme, from one primary colour**
(§The display preferences), and each one's lightness is solved against its own
obligation rather than shared. The three obligations are the three jobs:
`--accent-solid` carries `--on-accent` at 4.5:1, `--accent-dim` carries
`--text-dim` at 4.5:1, and `--accent` clears the **flat-mark 3:1** against every
surface it is drawn on — which is also what makes the focus ring visible
wherever a control sits. The derivation pins each role's OKLab lightness and
*scales* its chroma, both read back off the shipped token rather than written
down: the family then keeps the shape a designer gave it, so `--accent-dim`
stays a pale tint of the primary rather than becoming a second vivid one, and a
runner asking for a greyer primary gets a greyer family rather than a greyer
mark beside an unchanged surface. Where a pin does not pay — a yellow at
`--accent`'s own lightness is far brighter in the sense the contrast rule
measures and stops being a mark on white — the lightness walks toward the end
that does and stops at the first value that does. `wash.test.ts` sweeps 98
hue/vividness points against all three obligations in both themes; the worst
margins it records are the ones to read.

**`--hover-wash` follows `--accent` by construction**, and that is a coupling
rather than a convenience: it is `color-mix(in oklab, var(--accent) 6%,
transparent)`, so a derived accent changes what a pointed-at cell composites to,
and the wash's own strength cap therefore solves against the **derived** accent.
A guard measuring the shipped blue while the chrome wore the runner's colour
would be checking a screen nobody sees.

`--divider` is deliberately **darker than `--border`**: a divider sits on
`--chrome`, where a border-coloured hairline measures 1.22:1 and simply is not
there. Its remaining carriers are the setup strip's group divider and the About
panel's list bullets — the toolbar's own hairline is gone (§The toolbar).

**One treatment for a secondary button** — `--surface` fill, `--border`
hairline, `--r-sm`, `--t-sm`, and `--accent-dim` on hover — carried by the
three utilities wherever their band mounts them (§Where the utilities live), the
`About` button, the drawer toggle, the sidebar's Add filter and Clear filters
pair, and the Add-filter dialog's and the About panel's Close. It is repeated per component
rather than written once as a global `button` rule, because most of this app's
buttons are **not** this: the segmented pills, the table headers, the range
rows' clear icon, the setup cards and the two `<details>` summaries each carry
their own, and a global rule would have to be undone in more places than it
applied. The cost of that choice is that a button which simply omits it renders
as a bare UA control among styled ones — which is exactly what it looks like.

**The one thing that IS global on a form control is its face.**
`button, input, select, textarea { font-family: inherit }` in `app.css`, because
`font-family` does not inherit into a form control: with no rule a `<button>`
renders in the UA's own default form face. That is not a treatment a component
could reasonably choose — this app *self-hosts* Inter Tight so it never has to ask
the machine what it has — and it is not one a component should state for itself
either, which several of them used to.

It is also a **measurement** rule, and that is the half to know. The UA face is
not one face: Chromium asks for `Arial`, Firefox and WebKit for the generic
`sans-serif`, and every host resolves those against its own fontconfig. Without
the rule the one-row toolbar's slack at 801px swings across a 51px range on what
a machine has installed — comfortable on a developer's machine, **negative on a
GitHub runner whose `sans-serif` is DejaVu Sans**, where the row wrapped — so
every measured width in §The chrome bands was a number about the *host* rather
than about the app. With it they are the app's, identical on every machine to
within 2.4px, and `draws every control in a face this app names` fails the build
on the next control that escapes it. The `font: inherit` shorthand is rejected
for the reset: it also resets `font-size`, which each component owns.

**A face whose load errors is asked for again**, twice, backing off — `lib/font-retry.ts`,
wired in `main.ts` before the table can request one. `font-display: swap` covers
the *paint*, so a face that never arrives costs a reflow rather than a blank
page, but nothing re-requested one: a transient failure on the first load left a
runner on a fallback for the whole session, and the app's own measured widths are
the self-hosted face's. It is not hypothetical — WebKit under a loaded preview
server was seen failing both faces and never retrying, which is why the fit guard
had to be taught to refuse a fallback's metrics rather than measure it. That
guard stays, and stays loud; this is the app declining to need it. A face still
errored after the last attempt stays errored.

Two mechanics are load-bearing. `FontFace.load()` returns the existing promise
for anything whose status is not `unloaded`, so an errored face can never be
asked again and a retry means constructing a **replacement** and adding it to the
set. And the replacement's URL and descriptors are read back out of the CSSOM
rule that failed, so `app.css` stays the one home for both — Vite fingerprints
those URLs at build time, and restating them in script would be a second spelling
a rebuild could quietly make wrong. Each rebuilt face is in the set, so its own
failure arrives back at the same listener: the chain is driven by the failures
rather than by a loop, and a per-family count is what ends it.

**A scrollport reserves room for its scrollbar as well as for its ring, and the
two are different facts.** A bar is drawn at the port's inline end, and the two
ports whose rows *end* in a number — the column picker's coverage figures and the
Display panel's outputs — put that number flush against it: 4px of air, so the bar
read as touching the figure where it takes layout and was painted straight over it
where it is an **overlay**, which is Firefox's own default on Linux. Both ports
therefore pay `--s3` of `padding-inline-end` and give it straight back as a
negative `margin-inline-end`, so the *row* keeps the width it had — measured
identical at 308px with a classic bar and 320px with an overlay, before and after —
and only the bar moves, out of the figures and into the panel's own padding.
`scrollbar-gutter: stable` was the obvious tool and answers neither case: the
classic bar already takes its layout, and the property has no effect at all on an
overlay one. `smoke.spec.ts` enumerates the ports and holds each to one bar's
width, in the same shape and for the same reason the ring's room is enumerated.

**One focus ring, with one exemption.** A 2px surface-coloured ring inside a
2px accent ring, drawn with `box-shadow` so both rings are painted rather than
transparent — a plain `outline-offset` shows whatever is behind, and on a chip
carrying the wash's peak alpha the ring would sit accent-on-accent and nearly
vanish. The rule lives once in `app.css` inside `:where()`, so it carries no
specificity.

Because it is drawn **outside** the element, **every scrollport a focusable
thing sits in reserves the room for it, and the reservation is made in one
place**: `--ring-room` is the ring's own outer spread, the ring reads it so the
two cannot drift, and `.scrollport` in `app.css` pays it as `padding` plus a
matching `scroll-padding` — the padding for a control at rest, the
`scroll-padding` for one Tab has just scrolled flush against the edge. A
scrollport carries that class; it does not restate the number. There are four —
the column picker's list, the add-filter dialog's list, the brand list and the
sidebar — and the rule was originally written per list against a spec that named
**two**, so the two nobody had counted reserved nothing and clipped the ring on
every row Tab scrolled to. `smoke.spec.ts` therefore **enumerates** every
scrolling box that holds a focusable and measures its slack rather than reading
the CSS back, so a fifth scrollport that forgets the class fails on the day it is
added. The three lists give the inline room back with a negative margin of their
own, and the sidebar's takes it out of `FilterSidebar`'s padding, so nothing
moved on screen.

**Reserving the room is only half of it: the app scrolls focus into that room
itself.** A ring is worth what the browser's willingness to scroll the thing
wearing it makes it worth, and on the same 90-stop walk the three engines do
three different things. WebKit **never scrolls the sidebar at all** — it is
sticky with an `overflow-y` of its own, and before the page has been scrolled its
box runs 130px past the foot of the window, so 24 consecutive stops (16 in the
phone drawer) were focused with nothing visible anywhere on screen. Firefox
declines to scroll a control that is already *partly* visible and ignores
`scroll-padding` when it does scroll, so the row at the foot of a list kept focus
with 7px of itself, and all of its ring, past the clip edge. Chromium honours
both, which is why neither was noticed. `lib/focus-scroll.ts` therefore computes
the scroll rather than asking for one — `scrollIntoView` is the same heuristic
under another name and reproduces the Firefox half — and reads the room to leave
back off the port's own `scroll-padding`, so `--ring-room` stays the one home for
the number. One delegated `focusin` listener, gated on `.scrollport`: nothing
outside a port is touched, because the table and the chrome are the browser's to
scroll and a second opinion there is how a page starts fighting its own sticky
header. There is no animation to reduce — every engine's own focus scroll is
instant, and a Tab held down through the sidebar would otherwise queue an
animation per stop. `cross-browser.spec.ts` walks the sidebar in the two engines that get
it wrong.

The exemption is **table rows**: a `box-shadow` ring draws outside the box, and
a row spans the full table width and abuts its neighbours with no gap, so an
outside ring paints over both of them and inside the phone panel
`overflow-y: clip` cuts it off at the first and last row. Rows draw an **inset**
ring in their own components instead, and the global rule excludes `tr`
explicitly rather than leaving the component rule to win on specificity, so the
two can never both draw. The desktop uses an `outline` there, because a shoe is
one row; the phone uses inset shadows on two rows — three edges each, meeting in
the middle — because a shoe is its name row *and* its chip row, `aria-expanded`
sits on the first of them, and a ring round that one alone stops halfway down the
thing it describes. Two outlines would draw a line between the rows and read as
two rings.

**The checkbox is drawn by the app**, and the reason is contrast rather than
taste. With a native control the browser owns the tick's ink and changes its mind
about it: Chromium flips to a dark tick once the fill is light enough — 3.02:1
against `--accent` in dark — WebKit lightens whatever fill it is given, and
Chromium's own focus outline ignores `accent-color` entirely. None of that is
reachable from a stylesheet, so a themed checkbox on a *runner-chosen* primary
colour could not be guaranteed at all. Under `appearance: none` the painted
colour **is** the token, so the same solver that answers for the ramp answers for
the tick. The rule lives once in `app.css`, because there are checkboxes in the
plate group, the brand list, the column picker and the Display panel and one
control should not be four; `--accent-solid` fills it and `--on-accent` inks it,
which is the one job `--accent-solid` exists for, and the unchecked face takes
`--hist-dim` — the flat-mark token — because an empty box is a mark and not a
word. The tick is a `background-image` because an `<input>` is a replaced element
and generates no pseudo-element, and its ink is a literal inside an SVG data URI
because a data URI cannot read a custom property: `tokens.test.ts` pins that
literal to `--on-accent` from both sides. The box is 15px against the native
13px, which costs about 2px a label row and is accepted — 13px was under every
touch-target guideline there is.

That is also why there is no second ring exemption any more. A **native**
checkbox was one: WebKit paints no `box-shadow` on a checkbox's rendered control,
so the rule's `outline: none` half landed and its `box-shadow` half did not, and
in Safari every checkbox in the app had no focus indicator whatsoever, the column
picker's whole list included — the one control whose job is choosing what the
table shows. An `appearance: none` box is not a native control:
WebKit paints the ring on it like anything else. That is a claim about one engine
which was made wrongly once, so `cross-browser.spec.ts` asserts **the app's own
two-layer ring** at `--ring-room` rather than "an indicator of some kind" — a UA
outline appearing there would mean the shadow had silently stopped landing again,
and a laxer assertion would pass.

**`--text-dim` is held to 4.5:1 against every surface it is set on**, not against
one representative surface: `--surface`, `--bg`, `--chrome`, `--well`,
`--border-soft` and `--accent-dim`, all asserted in `wash.test.ts` and pinned
from the other side by `tokens.test.ts`. The segmented groups' recessed track is
`--bg`, the column picker's count badge `--border-soft`, and a chosen setup
card's description sits on `--accent-dim`; a value chosen against white alone
clears it there and misses those, by as much as 4.28:1 against 4.5. A chosen
setup card's **name** takes no accent
colour for the same reason: `--accent` on `--accent-dim` is 4.19:1 in light and
3.28:1 in dark, and the accent border is what says "chosen".

**The surface is painted on the row** — `tr.shoe` in the desktop table,
`tr.values` on a phone — and never on the numeric cell. The wash is a
translucent `background-color` on that cell at higher specificity, so a
cell-level surface would simply be replaced by it and the wash would composite
over the page instead of over the surface, which is the one thing the rule
above is about. The sticky name cell carries a surface of its own as well,
because the numeric cells scroll underneath it rather than behind the row.

**Elevation follows what is pinned**: page, then the table's panel, then the
sticky header on top of it. The neutrals are warm-grey, and the page sits one
step behind the chrome and two behind the row surface (`--bg`, `--chrome`,
`--surface`), with `--well` a **recessed** fourth: it is where an expanded row
sits, in both renderings, because an open row belongs to the row above it rather
than floating over the table. Dark lifts off near-black — `#0f1113` page against
a `#1a1d21` surface — where a nearly pure black drove the wash to mud.

Two shadows carry the two raised planes: `--shadow-panel` on the table's panel,
which is `none` in dark because the surface step already carries it there, and
`--shadow-sticky`, which the pinned header casts onto the rows sliding under it.
`--shadow-dialog` is the third, for anything floating free of the page.

Direction is **declared**, in `app/src/lib/direction.ts`, and never inferred
from a slug or a name: `outsole-durability` is Dremel dent depth in mm, so
lower is the more durable shoe despite the word, and `size-rating` is a
runs-small/true/runs-large scale on which 3 is correct rather than a mediocre
score. Stack, drop, softness, stiffness and every width are `neutral` because
they are fit and feel preferences with no fleet-wide better end
(docs/shoe-stories.md). Only `lower` inverts the percentile; `neutral` changes
the ramp's colour and nothing else, and leaves the pickers' direction mark blank.
An unlisted key reads `neutral`, and `direction.test.ts` fails the build when
an upstream numeric test arrives unclassified (docs/operations.md
§Contract-drift runbook).

The contrast obligation splits by the kind of mark, because one rule cannot
cover both:

- **Flat mark** — the inactive histogram bars and the pickers' coverage bars are
  a single fill, drawn or not. They clear **3:1 against every surface they are
  actually drawn on**, which is three: `--surface` inside the drawer, `--bg`
  where the sidebar is a column and declares no background of its own,
  and `--border-soft`, the track the pickers' coverage fill sits in. "Every
  surface" is the load-bearing part — a value chosen against `--surface` alone
  clears the bar in the one case that only happens inside the drawer.
  `wash.test.ts` asserts all three, per theme.
- **Gradient wash** — governed by **text over the ramp at 4.5:1**, with no
  surface floor. Every intermediate value of a ramp is closer to the surface
  than its endpoint and tends to 1:1 as p→0, so a surface floor is
  unsatisfiable by construction. The ramp is swept rather than sampled at its
  endpoint, so a future non-monotonic curve cannot slip through; on today's
  monotonic ramps the worst case is `p = 1` in both. Retune `--wash-grey`,
  `--wash-blue` and `WASH_PEAK` against that.

## The display preferences

The ranked ramp above is **tunable**, from one `Display` menu, and every constant
it names is that menu's default rather than its law. Six things move — the
**primary colour**'s hue and vividness, a base colour with the same pair,
strength, emphasis and the floor — and one thing does not, which is the whole
design: **lightness**. `lib/wash.ts` owns the engine, `lib/display.ts` the
preference and its stylesheet, `lib/oklab.ts` the colour space both work in.

**The primary colour is the app's, not the table's.** One hue and one vividness
feed the tint the leading cells carry *and* the whole accent family the chrome is
drawn in (§Theming), because a table whose leaders read green under a blue
toolbar is two decisions where a runner made one. The two halves cannot be tuned
apart, and that is the point rather than a limitation.

**The defaults are a podium, and the numbers say how much of one.** Emphasis 4
over a floor of 0.35 at the shipped strength means a ranked column is bare below
about **p 0.58** — measured on the real fleet, 41–44% of the cells in a ranked
column carry any tint at all — and what is painted falls away fast: the top rank
sits at 0.93 of alpha, the 5th percentile at 0.66, the 10th at 0.45, the 30th at
0.05. "Only leaders read as tinted" is what the section above claims, and these
are the numbers that make it true rather than approximately true. The emphasis
slider runs to **6**, past its own default, because a slider that ended where the
app ships could only ever be dragged one way.

**Lightness is pinned per theme, because a lightness slider is a contrast
slider.** WCAG contrast is a ratio of relative luminances, and OKLab's `L` is
very nearly a monotone function of luminance; hue and chroma at a fixed `L` move
it far less. So the engine pins each tint's `L` to that theme's own
`--wash-blue`, in OKLCh, and hands the runner the two axes that cannot spend the
contrast budget on their own. `toGamutLab` reduces **chroma** where sRGB cannot
hold the request and never touches `L`, for the same reason: clipping the linear
channels — the obvious alternative — moves luminance by however much it clipped.
There is no free-rein mode, and the reference mockup's one is the argument for
that rather than against it: unpinning the sliders drove the worst ramp step
under 2:1 in three drags.

**A pinned lightness is not a guarantee on its own, so a solver caps the
strength.** Per theme, `resolveWash` bisects for the largest strength that keeps
that theme's own ink at 4.5:1 across the **whole** painted ramp — swept, not
sampled at the endpoint, because a base-on ramp carries one flat alpha and its
worst step is not its last — and with `--hover-wash` composited on top, since a
pointed-at cell is the app's real worst case (§Theming). The app paints
`min(strength, cap)`.

**One painted strength, and it is the lower of the two caps.** The two themes
bind on opposite halves of the wheel: WCAG luminance is 71% green, so at one
pinned `L` a red is far darker than a green in the sense the rule measures, and
a dark fill on white threatens the light theme's near-black ink while a bright
one on near-black threatens the dark theme's near-white. A red at 0.37 chroma
caps light at 0.74 and leaves dark uncapped; a green at the same chroma caps
dark at 0.92 and leaves light uncapped. Painting each theme its own cap would
mean a runner on `auto` gets a different ramp at sunset with no repaint of their
own — so the binding cap is painted in both, and the panel names the theme that
bound it. That is the only thing the cap note ever says.

**The solver runs on a preference change and nothing else.** It is a few
thousand contrast evaluations; a cell is a `Math.pow`. `resolveWash` returns a
`WashPaint` — four numbers — and the table reads only that, so the per-cell cost
is exactly what it was before the menu existed and `recompute-budget.test.ts`
holds it there (§What a drag may recompute). The preference is its own state
beside `ViewState`, so a filter drag re-resolves nothing at all.

**Colours are quantised before they are solved for.** What reaches the browser
is a `#rrggbb`, so that is what `color-mix` interpolates between and what the
screen composites — and rounding two endpoints then mixing is not the colour you
get from mixing then rounding. Solving on the unrounded tint over-reported a
base-on ramp by up to 0.03 of ratio, which is a guard passing on a colour nobody
paints.

**Base off is a podium; base on is a scale, and the difference is semantic.**
With the base off — the default — alpha carries the magnitude and only leaders
read as tinted, which is what a ranking wants and what the app has always done.
With it on, **every** ranked cell is tinted at one flat strength and the
**colour** carries the magnitude, interpolating base → better along the emphasis
curve. That is a real departure from leaders-only tinting and it is the point of
the control: a runner who cares only about the top of the table can put the whole
range on a red→green ramp. Two consequences follow and both are stated in the
panel. The floor means nothing there — every cell is painted — so its slider is
disabled rather than hidden, because a control that vanishes reads as a bug.
And because both tints sit at the **same** pinned lightness, a base-on ramp is
very nearly iso-lightness: what little travel is left comes from the two tints'
**vividness** differing, since OKLab `L` is not luminance and a more chromatic
colour composites lighter. Two equally vivid tints therefore leave hue carrying
the magnitude alone — which is exactly what a red→green ramp does to a runner
who cannot separate the two. So `resolveWash` **measures** the painted ramp's
lightness span rather than testing it for monotonicity: a flat line never
reverses, so a monotonicity check would have reported "fine" forever. Measured,
a red→green pair at one vividness spans 0.0055 and the default pair 0.0034,
against 0.289 with the base off; the panel states it below one 8-bit step
(0.01), and stays quiet where a vividness difference has kept the ordering
readable without colour.

**The neutral grey ramp takes no preference at all.** A metric with no better
end has nothing about it to tune, and `greyAlpha` is untouched by every control
here.

**The preference is stored locally and never in the URL.** The URL is the view —
what is being asked of the fleet — and a shared link has to show the recipient
the same table (§View and URL ownership). A colour ramp is a property of the
reader's eyes and screen, so a link carrying one would repaint someone else's
table for them. Its own key beside the theme's, a versioned shape, and every
field clamped independently on read: an unrecognised version reads as the
defaults, but one bad number costs that number rather than the four beside it.
The shape is at **v2** — the colour's two fields were renamed when it became the
primary colour, and the emphasis and floor defaults moved under them, so a v1
record is neither readable by name nor trustworthy by value.

**At the default state nothing is written at all.** `resolveWash` reports
`tokenFill` there and no override stylesheet exists, so `app.css`'s own
`--wash-blue` **and its own accent family** reach the screen exactly as they
always have, in both themes, byte for byte — asserted from both ends in
`wash.test.ts` (the alpha of all 401 steps against the frozen closed form) and
`display.test.ts` (the empty stylesheet). It is one predicate for both, because
it is one preference: either the stylesheet's colours paint or the engine's do.
This is why the defaults are stated at the sliders' own steps — 235° / 0.2 —
rather than at some rounder or more familiar pair: they are a colour someone
asked the sliders for directly, with no existing token to round to. They are
still pinned to `--wash-blue`, because `usesTokenFill` keys off them: moving
them without moving the token would leave the panel reading one colour while
the default state painted another. `wash.test.ts`'s guard checks that
directly — the token IS `toGamutLab(washL, primaryChroma, primaryHue)` at
these two numbers, not merely close to what they nominally ask for.

**Both themes' `--wash-blue` are written as the value the engine derives.**
Chroma 0.2 does not fit sRGB at either theme's pinned lightness, so each token
is that theme's own gamut-reduced point at 235° — light lands at chroma ≈0.126,
dark at ≈0.114, both hex rather than an `hsl()` because neither is a value a
designer chose by eye any more. The accent family follows the same rule:
`--accent`, `--accent-solid` and `--accent-dim` in `app.css` are `solveAccents`'
own output at the default request, not a hand-picked `hsl()`.

**The override stylesheet mirrors `app.css`'s own blocks**, and has to: the
dark values sit under both `prefers-color-scheme` and `[data-theme]` so the theme
control wins in either direction, and a single `:root` rule would paint the light
tint on a runner whose OS is dark. The accent family rides in the **same** rule as
the wash, and `display.test.ts` holds every block to carrying both — a
`prefers-color-scheme` rule that moved the tint and left the accent behind is a
half-repaint. `--hover-wash` is deliberately absent: it is a `color-mix` of
`--accent` in `app.css`, so it follows by construction and a declaration here
would be a second home for the 6%. Base-on switches a **rule** rather than a
value — `data-wash="dual"` on the root selects the two-colour cell rule in both
tables — because the single-colour rule has to stay literally untouched at the
default state for the byte-identical claim to mean anything, and a `var()`
fallback resolving to the same colour does not give that: it round-trips the
token through OKLab first.

**`wash.test.ts` asserts the property, not the constants.** It sweeps a grid of
252 preference states — hues, chromas, strengths, emphases from 1 to 6, base on
and off — rebuilds the composite the stylesheet performs from the **resolved**
values alone, and holds the theme's ink to 4.5:1 hovered in both themes, with the
**derived** accent as the hover overlay. A solver checked against its own cell
function proves nothing about what a cell paints. A second sweep does the same
for the accent family over 98 hue/vividness points. The shipped-constant
assertions stay beside both: they are now the default case of the same rules.

Both sweeps carry an explicit generous timeout. They are compute-bound — a few
hundred bisections apiece — and a slow CI runner crossed vitest's 5s default once
already; a correctness guard must not become a flake because a machine was busy.

**Nothing here announces.** Every control in the app says what it did (§What a
control says it did) and these are the exemption: a slider drag is sixty changes
a second, a native `<input type="range">` already speaks its own value, and the
one fact worth hearing — that the guard is holding the strength down — is stated
in the panel as text rather than fired into the status region on every frame of a
drag.

## Coverage

A metric's coverage is the share of shoes carrying a reading among the shoes
passing every **non-range** filter — the population `applyFilters` reports as
`considered`. Non-range is load-bearing twice over: if range filters counted, a
metric's own bound would move its own denominator as the user typed it, and any
bounded metric would read 100% every time, because a bound already excludes
every shoe lacking a reading. The number would become a tautology exactly when
it was being used.

It is stated as **counts, not a percentage**: `378 / 450 measured` on the
heading line, and **only below complete coverage**, so most rows on a default
view fall silent. "84%" of an unstated pool is the complaint; both numbers on
screen state the denominator instead of assuming it. Filter to last year and it
reads `120 / 180`, where both numbers visibly moved. It is set in `--font-mono`
with `tabular-nums`, so every figure in the sidebar shares a grid with every
figure in the table.

**One vocabulary, and the shape decides only how many figures there are.** A
single metric and a **zone pair** each carry one, on the heading line; a
**superseded pair** carries one per generation, on its radio rows, with the word
repeated rather than hoisted to a column label so a row read on its own still
says what its numbers mean.

A zone pair takes one figure because **both halves are read in the same test
run**, so the two halves carry identical counts and a figure per half is
duplication. Generations take two because they genuinely differ, often by an
order of magnitude — a retiring method near-complete while its replacement is
still in the low tens. That difference is the whole basis of the choice, so it
has to be on screen. `coverage.test.ts` asserts the zone-pair equality against
the dataset rather than trusting it
(docs/operations.md §Contract-drift runbook).

There are **no coverage bars anywhere in the sidebar**. With only ever two rows
to compare, a bar earned less than it cost, and it competed with the emphasis
below. `ColumnPicker` and `AddFilterDialog` keep their percentage bars: those
choose among forty-odd metrics against a constant denominator, where a
percentage is a comparison device rather than a claim about a pool.

### Emphasis marks what is filtering

Bold reports a fact about the view: a metric heading is bold when any of its
rows carries a bound, and so is the specific half or generation carrying it.
Scanning the sidebar then answers "what is constraining this shortlist?" without
reading a number.

It replaced a `· in use` marker that named the half the zone group had selected.
That was a preset's business rather than a property of the filter, and it made a
zone pair look like a control it is not — the two halves were named twice, once
by the marker and again by each range row's own legend. **The halves are named
once now, by their legends.**

Both halves of a zone pair stay independently filterable, and that is deliberate
rather than incidental: a link carrying `r.heel-stack` and
`r.shock-absorption-forefoot` together is a legitimate thing to want. Do **not**
give a zone pair the superseded pair's switch — generations are mutually
exclusive by nature, zones are two measurements of two parts of a shoe
(docs/app.md §URL encoding).

### There is no sparse warning

The live count is the whole treatment: **do not add a badge that classifies a
metric as thin.** Coverage by release year shows every sparse metric is
**era-shaped**, not sporadic — each is either *arriving* (a clean adoption ramp
from nothing, like `breathability-25`) or *retiring* (near-total coverage then a
cliff, like `stiffness`). Not one is uniformly thin, so "this test is rarely
run" is a sentence that is false about every metric it would be shown on. The
per-year shares are not quoted here on purpose: curating release months moves
shoes between years, so any figure written down goes stale on the next curation
pass rather than on the next scrape.

Any such classifier needs a notion of **era per test**, which the dataset does
not carry; that is a BACKLOG.md item, not something to approximate from the age
of the oldest reading. Meanwhile the count **demonstrates** the answer as the
runner filters: narrow to recent shoes and an arriving metric fills in while a
retiring one empties out, which is more than a static label could have said.

`SPARSE_BELOW` and `isSparse` stay, redefined: they are a **preset-safety**
threshold, not a warning threshold. Nothing on screen reads them; their
consumers are the two suite guards that ride on the threshold — the preset bound
(§Presets) and the score's own half of it (§The story scores) — which is where a
retune or a deletion has to be argued. Why generations exist at all is
docs/scraping.md §Test lineage.

## Decisions

### The narrowest supported width is 360px

**320px is not supported, and the cost of supporting it is why.** Every phone
bound in this document is stated at 360 — the usual Android width — and at 360
the app is clean: the document scrolls sideways by **0px** in Chromium and
Firefox, and every floating panel is on screen. At 320 it is not, and the
failures are one failure wearing three faces:

| at 320px | measured |
|---|---|
| the document scrolls sideways | **27px** Chromium, **26px** Firefox |
| the toolbar overflows its own row | 27px in Firefox; Chromium spends it on a `.chrome` grown to 347px instead |
| the column picker's panel leaves the screen | 19px past the right edge in Chromium |

The cause is the same in all three: the six-column list needs **332px of table
plus 2px of panel border**, and after the bleed the document's minimum is 347px.
Nothing about the chrome is really at fault — it follows the document (§The
chrome bands), so it reports the table's shortfall as its own.

**So the only real fix is narrower columns, and that is the bill.** Fitting six
into 320 means giving up 27px across them: 53px a column becomes about 48.5px,
and the text bound inside it — `MAX_LABEL_PX`, 48px today — becomes about 44.5px.
Measured against the real catalogue with the app's own `widestWordPx`, that takes
the labels with a word too wide for their column from **2 of 55 to 21 of 55**.
Nearly two in five column headers would clip or overhang, and the repair is not
mechanical: each one needs a new hand-written `SHORT_LABELS` entry that still
reads as the metric it names, and the whole `CHAR_PX` table and every bound in
§The chrome bands would be re-measured against a size the design was never drawn
at. The alternative — five columns below 360 — is a different default view on the
narrowest screen, which is a design change rather than a fix.

The decision is therefore to **hold the floor at 360px of layout** and leave 320
as a width the app degrades on rather than one it serves. It already degrades
gracefully: the page scrolls sideways and everything stays reachable. The floor
is guarded rather than promised — `fit-boundary.mjs` asserts no view scrolls
sideways **from 360px of layout up**, and `fits six columns and keeps the rest
reachable at 360px` holds the column count there — and the 320px readings that
appear elsewhere in this document are recorded as *what happens*, not as bugs
outstanding. Revisit only if a 320px phone becomes worth a five-column default.

### Every row links back to RunRepeat
Attribution is structural, not decorative: the header carries a permanent
RunRepeat link and every expanded row opens with a link to that shoe's review.
The link lives in the expanded panel rather than the collapsed row because the
row's click target is the expander. Do not remove or defer-load either link
(docs/decisions.md §Be a good citizen toward RunRepeat).

### The header names the catalogue, the receipt owns the count
The header states a fact about the **catalogue** — `450 shoes · updated 27 Jul
2026` — which does not move under filtering. Everything that responds to a
filter belongs to the receipt, whose wording is unchanged. Two counts a
centimetre apart with different denominators read as the app contradicting
itself, even though both were correct: the header answered "how big is this
dataset?" and the receipt answers "what did your filters do?", and nothing on
screen said so. `Header.svelte` therefore takes no `visible` prop.

`Header` and `Receipt` are each mounted **once** in `Page.svelte`, outside the
`{#if phone}` switch, so this is one edit and both renderings change together.

The build date is formatted with locale **and** time zone pinned. `builtAt` is a
UTC instant, so formatting it locally renders the previous day for every reader
west of Greenwich. Both pins are load-bearing: dropping the zone is what makes
the string vary by visitor.

Attribution is a **masthead credit**: a `LAB DATA BY` micro-label over
`RunRepeat ↗` at normal text weight. The label is the one place the type scale is
overridden — **9px**, below `--t-xs`'s 12px floor — and it is deliberate. The
scale bottoms out at 12px because that is the floor for anything a reader has to
*read*; this label is not read, it is what lets the name under it be set in plain
text with no link colour competing with the wash, and at 12px it competes with
the catalogue count beside it instead. It is also what keeps the desktop's
stacked label-over-name form cheap; below 800px the credit sets on **one line**
inside the provenance block, because the count directly above it already carries
the small print (§The header names the catalogue, the receipt owns the count). The link itself stays permanent,
visible and immediately clickable — that is structural, not decorative
(docs/decisions.md §Be a good citizen toward RunRepeat).

**Below 800px the masthead becomes a banner: the wordmark at the left margin, and
opposite it one right-aligned provenance block** — the catalogue count over the
credit, the credit on one line. The two are stacked because both say where the
data came from; inline among buttons the credit read as a caption for whichever
button followed it. The header is **one row at every width**, measured in both
engines, and its trailing air is **≤1px below 800px** — that is what "flush"
means here, and `keeps the banner one flush row at ${width}px` in
`smoke.spec.ts` is what holds it at 360px and 390px with the count line at its
widest.

**The `.spacer` is load-bearing and must not be deleted again.** `main` removed
it at this tier, on the reasoning that a spacer has nothing to push once the bar
wraps — and that left every item packed against the left margin: 59px of trailing
air at 390px and **248px at 700px**, where the header spent a whole second row on
three buttons while most of row one sat empty. The banner does not wrap, so the
spacer is exactly what holds the right edge.

**Desktop is the default and the banner is the override**, never the other way
round. Writing it banner-first would need a `min-width` twin of the sidebar's
`max-width: 800px`, and a twin is not a complement (§Where the utilities live).
One query, and its complement is whatever the query does not match. The `.prov` wrapper therefore **dissolves to
`display: contents` above 800px**, with `order` putting the count back beside the
wordmark, so the desktop masthead keeps the exact arrangement the visual-polish
pass settled and one wrapper serves both bands without a second copy of the count
in the markup. Both e2e row counters skip boxless children, so a
`display: contents` `.prov` is not counted and the desktop header still reads as
one row — the one thing given up is that a desktop `.prov` wrapping *internally*
would no longer show as a row, which the banner's own `air` bound is what holds.

**The count steps down to `--t-xs` at 560px and below, and the month is what
decides it.** `en-GB` renders September as `Sept`, the widest string the
formatter can emit. Re-measured on the banner rather than carried over from the
masthead: at 360px that line takes **three** lines at `--t-sm` in Chromium — 54px
tall, and 7px of overflow with it — and two in Firefox, against one 16px line at
`--t-xs` in both. The banner is 41px tall with the step and 100px without it. The
tier's old `--gap-x` step went with the masthead: the banner's spacer is `flex: 1`
and absorbs the difference, so forcing the wider gap changes height, trailing air
and overflow by nothing in either engine. Re-measure against the **widest** month,
not the current build's, if the string ever grows again.

### Columns are permissive, ranges and sorts are strict
`cols` accepts any test slug — showing a column the catalogue no longer carries
is harmless, it just prints nothing — while range keys are restricted to numeric
tests and sort keys to the keys that have an order: numeric tests, the shoe
fields, and the categorical columns, which sort by their label
(§Categorical columns). The asymmetry is the point: a bad column costs one ugly
cell, a bad range hides the entire fleet. Do not unify the allowlists — but
every sort a header offers has to be one the parser accepts, or `Copy link`
hands out a URL that reopens on a different view than the one that was shared.

**Permissive means permissive about whether the slug still exists**, not only
about the type of test behind it. Filtering `cols` against the live catalogue
instead drops the unknown column silently, and a link naming only unknown slugs
falls through to the default set — the exact opposite of what it asked for, with
nothing on screen saying so.

Permissive about the slug is not permissive about the **shape**: an unknown key
is rendered verbatim as a header, so what survives has to look like a slug —
lowercase hyphen-joined alphanumerics, at most 64 characters against the longest
the catalogue has ever carried (38). `name` and `brand` are still refused, being
sort fields the table renders itself, and that pair is derived as
`SORT_FIELDS` minus `COLUMN_FIELDS` rather than listed again.

Two consequences, both accepted. An unknown column's header still offers a sort
the parser will not carry — but every value in it is missing, so the tie-break
decides the whole order and that tie-break is RunRepeat score descending, which
is `DEFAULT_SORT`: the rows a recipient opens on are the rows that were shared,
and only the `aria-sort` mark differs. And the column picker does not offer the
column, so it cannot be unticked there; `All` and any story rebuild the column
set and clear it.

### The dataset is a fetched asset, not a bundled import
`sync-data` copies `data/shoes.json` into `public/` and the app fetches it at
runtime. That keeps the dataset swappable after the build — which is exactly
how the e2e run substitutes its fixture into `dist/` — and gives a load
failure somewhere to surface, as an error message with a Retry button rather
than a blank page. Importing the JSON as a module would take both away.

**The loading state waits before it appears.** Nothing renders for the first
`SKELETON_AFTER_MS` (300ms); past that, a skeleton shaped like the rows that are
coming. The 2MB asset is same-origin and most loads finish well inside the delay,
and a placeholder that flashes for one of those is worse than the text it
replaced.

**Its shape is a contract with the table, not decoration.** It mirrors the panel
chassis — `--surface`, hairline, `--r-md`, `--shadow-panel` — a header band, and
a thumbnail-free row per shoe on the table's own `14rem` name column. A skeleton
that stops matching **causes the jump it exists to prevent**, so its row height
is reserved as `min-height: 1lh` in the **figure** face rather than as a number:
a row is 8px of padding, one line box and a 1px hairline, and the line box is the
mono cells', whose metrics run a pixel taller than the UI face's at this size. A
px height reserves 29px against the table's 36px.

Three more parts of that contract. The placeholder **reserves the sidebar track**
(`--sidebar-w`, the token `Page.svelte` lays out against), because what replaces
it is the second cell of a two-column layout rather than a full-bleed block:
without the reservation the placeholder starts at x=16 and the table lands at
x=276. It reserves it **on the sidebar's own boundary**, the floor under it, not the
chrome's — the reserve exists to hold the geometry the loaded page will have, so
a track reserved at a width where the page then draws none is the 260px jump
this shape was built to prevent, only in the other direction (§Filters).
`reserves no sidebar track at a width where the loaded page has none` measures
that at 1000px, on the far side of the boundary from the two widths the full
reserve is measured at. Its **cell count is derived** from `defaultColumns` plus
one for the name column, never written out. And its **head band is the table's**, stated in line
boxes of the same two faces: the header name's lines, a gap and the mono unit
line.

**The head band's line count is the one thing here that cannot be derived**, and
it is the difference between a 71px band and an 89px one. The table's own header
takes a third name line once a column is short enough to wrap one
(§Table presentation), but which names those are arrives in the dataset the
placeholder is waiting for — so the reserve keys off the input that does drive
it, the width of the track the header wraps in, through a `@container` query on
the placeholder's own box. At the default column set that threshold is **956px
of track**. It is a claim about the shipped catalogue's labels rather than a
constant: `smoke.spec.ts` measures the placeholder against the real header on
both sides of it, so a rename that moves it fails the build rather than the
layout. It has moved once already, from 1025px, when the sort mark left the name
line in a figure column and handed that line `--caret-w` back — and it moved by
69px rather than by 12, because a threshold is where one particular label breaks
and not a width you can add the saving to. The e2e fixture's own labels are not the catalogue's, so the two flip at
different widths and the test probes a viewport well inside each band rather than
the boundary itself.

**The contract had an axis it never covered, and it was the one that moved.**
`x`, `w`, the head band and the row height were all asserted; `y` was not, and the
table landed **285px** below the placeholder at 1440px. The cause is that the
placeholder was the only element in the document: the chrome, the setup strip and
the receipt all mount above it at once when the data lands.

**The room above the table is reserved by the real bands, laid out and made
invisible.** No constant could state it — the chrome steps four times between
1440px and 320px, the strip five, and both move again when the face swaps in — so
`App.svelte` renders `Header`, `Toolbar` and (on a bare arrival) `SetupStrip`
inside `.reserve`, which is `visibility: hidden` and `inert`. That keeps the
layout while taking every box out of the accessibility tree, out of hit-testing
and out of the tab order, and it is the one form of the height that cannot drift
from the one the page will use. Nothing is drawn and nothing is offered: a visible
band of controls that did nothing when pressed would be a worse defect than the
jump.

**Whether the strip is reserved is `isBareArrival()`**, in `lib/arrival.ts` —
the same predicate `Page.svelte` opens the strip on, written once, because a
placeholder reserving a strip the page then did not draw is the jump in the other
direction. It is asked here of the address the runner arrived on, and there of the
canonical one, which is one rule over two addresses and diverges only on an owned
key parsing drops (§View and URL ownership). `Header` therefore takes `total` and `builtAt` as **optional**: the
count is a fact about the catalogue and it waits for one rather than standing in
for it, so the loading masthead reserves the count's line box (`min-height: 1lh`
on `.count`) and states nothing.

**What is left is the receipt, and it is left deliberately.** Its wording counts
shoes, so how many lines it takes is a fact about the data the placeholder is
waiting for; the placeholder reserves the receipt's own box with **one** line in
it. The residual is 0–1px at 1440, 1200 and 800px and one line box where the real
receipt wraps, which is the bound `smoke.spec.ts` holds. Reserving three lines
instead would be the same error pointing the other way.

**The inner tracks are not part of the contract, and must not be "fixed" to
match.** The placeholder lays out `14rem repeat(n, 1fr)`; the real name column is
`min-width: 14rem` under `table-layout: auto`, so what it *takes* — 370px at
1440px — is set by the shoe names in the dataset the placeholder is waiting for.
The test asserts the half that is knowable: the placeholder's name track is the
table's own declared minimum, read off the cell rather than restated.

**Wherever the stacked list is the rendering that fits, the placeholder is still
the desktop table's chassis**, which the list is not (§Two renderings, and only
one of them mounted): the real table there is 8px wider and 4px further left, and
its head band shorter. It cannot be otherwise — the fit decision's inputs are the
catalogue's labels and the fleet's own strings, which are in the payload the
placeholder is waiting for, so at that moment the page does not yet know which
rendering it will mount. What matters is the axis the reserve exists for, and
that one holds: measured at 800px and 900px in both engines, where the list now
mounts, the table lands within **1px** of where the placeholder drew it, with the
same 4px and 8px residual the phone always had. Known and unreserved — the
assertions run at desktop widths, where the placeholder and the table are the
same object.

`App.test.ts` pins the row count, the cell count, the structure and which bands
the reserve holds — the parts that are DOM facts — and `smoke.spec.ts` measures
the geometry against the real table in a browser, on both a bare arrival and a link
that carries filters, because none of it exists in jsdom. The pulse stays behind a
`prefers-reduced-motion` guard.

### What a control says it did

With only the receipt, whose text is a row **count**, and a `role="status"`
holding `Copied`, a control announced itself only if it happened to change how
many shoes were showing — which left most of the bar silent with the table below
it rearranged. Two of those silences are loud: switching zone renames every score
column and moves every number in it with the receipt's text byte-identical, and
`Export CSV` sits beside `Copy link` in the same snippet, one with a status node
and one without.

**One region, not eight patches.** A single `role="status"` in `Page.svelte`,
always rendered and only ever re-texted — a live region created together with its
text is not reliably announced, which is the rule the Copy-link confirmation was
already written to. It is clipped rather than hidden, because `display: none`
takes a region out of the accessibility tree and nothing in it is ever spoken.
Singular is a decision: two rapid actions read as the later one rather than
racing. `Copy link`'s confirmation now goes through it too and `.copied` is
visible feedback with no role of its own, so `Export CSV` beside it is no longer
the silent half of a pair.

**What it says is derived from the view the control produced**, in
`app/src/lib/announce.ts`, rather than passed down from each call site: the
controls live in four components and half reach `setView` through an `onchange`
that carries no notion of what was pressed. One diff is also what makes the
exemptions checkable — a rule the module does not implement is a control that
says nothing, and `announce.test.ts` is that list. The two actions that change no
view state at all, `Export CSV` and `Copy link`, announce from their own
handlers.

**Two rules decide whether a control announces.** It says what the action *did*,
not what the control now *is* — so it never repeats what native semantics already
speak on the control the runner is standing on. And it never states a row count:
that is the receipt's, and every filter is therefore exempt by construction
(§The header names the catalogue, the receipt owns the count).

| control | native semantics say | verdict |
|---|---|---|
| zone | `radio "Forefoot" [checked]` — the choice | **announces** `Measured at the forefoot: columns and scores updated`. The radio is named `Forefoot`; the columns it renames are `Forefoot stack mm` and `Energy return forefoot %`, and every value in them moves. Different facts |
| stability | `button "Stability" [pressed]` — the preference | **announces** `Stability on: story scores updated`. The button's state is not the score definition changing under every number |
| sort header | `button "Weight g"`; the `aria-sort` lands on the `th`, the button's **parent** | **announces** `Sorted by Weight, lowest first`. An ancestor's attribute changing is not reliably re-spoken, and 450 rows reordering is not the button's state |
| add filter | dialog closes, focus returns to `Add filter` | **announces** `Filter added: Stiffness`. The row lands two thousand pixels down a drawer that is closed at 360px |
| remove filter | the control is **destroyed by its own press** | **announces** `Filter removed: Stiffness` |
| Export CSV | `button "Export CSV"` — nothing in the DOM changes | **announces** `CSV exported`. The case that has no other signal at all |
| Copy link | `button "Copy link"` | **announces** `Copied`, through the one region rather than a second one |
| column picker | `checkbox "Drop" [checked]` inside the `Columns` group | **exempt.** The checkbox *is* the column: its own state on the control the runner is standing on already says "Drop is a column". `Column added: Drop` beside `Drop, checked` is the double-speak these rules exist to prevent |
| expand a row | `row [expanded]` on the focused row itself | **exempt**, for the same reason and more plainly |
| feature checklist | `checkbox "Both sides (semi) (176)" [checked]` inside the `Gusset` group | **exempt.** The column picker's argument with a different noun: the checkbox's own state says the value is selected, and the only other thing that moved is the row count. The figure in its label is the facet's own, not the table's, so it says nothing the receipt is saying |
| feature tri-state | `radio "Yes" [checked]` inside `Removable insole` | **exempt**, exactly as Discontinued's is: the radio names the state now chosen, and what it did to the fleet is a count |
| story, `All`, search, brand, plate, date, a bound, a feature selection, `Clear filters` | — | **exempt.** Every one moves the row count, and the receipt is the row count's home |

**Precedence, not sequence:** one action produces one sentence, so the most
specific true thing wins. A story rewrites the sort **and** the columns together,
which is why the sort rule requires the columns to have held still — otherwise a
story click would claim `Sorted by Easy heel score` on top of the receipt it
already moved. A zone click on a story view rebuilds everything and still names
the zone, because that is the one thing a runner needs told. A generation switch
swaps one row key for another rather than adding one, and `Clear filters` can
take several rows and every bound with them; both are left to the receipt.

### Sharing is copying the address bar
`Copy link` **flushes the pending view write and then** writes
`location.href` to the clipboard, which is the whole feature: the URL already *is*
the view (§View and URL ownership). The flush is the feature working at all rather
than a refinement — the write path is debounced (§View and URL ownership), so a
runner who changes a filter and reaches straight for the button copied the
*previous* view while the new one was on screen, well inside the interval and with
the status region saying `Copied` over it.
It sits in this handler rather than in a shorter interval: the interval exists for
the drag, and this is the one press that has to be current. The
confirmation is a separate node rather than a relabelled button — swapping the
label would change the control's accessible name to something that cannot then be
pressed — and both an absent clipboard (outside a secure context) and a rejected
write leave it unsaid, because neither may claim a success that did not happen.
It is the **visible** half only: the announcement goes through the app's one
status region, like every other action's (§What a control says it did). The node
is still always rendered, because it collapses its own flex gap while it is
silent, so the header is spaced the same whether or not a link has ever been
copied.
The page carries a `<title>` and an SVG favicon
so a shared link previews as something; Open Graph tags need an image and a
decision, and are their own BACKLOG.md item.
