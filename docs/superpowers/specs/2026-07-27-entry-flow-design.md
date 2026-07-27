> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Entry flow

**Date:** 2026-07-27
**Status:** Approved design, pending implementation plan
**Scope note:** Second of two specs from the UX review. The first, metric legibility,
made the metric surface honest. This one answers "where do I start?". Preset
*thresholds* are not here — they are docs/shoe-stories.md and BACKLOG.md item 1.

## 1. Problem

The page opens on a sidebar of ten range sliders and a table sorted by score. Nothing
answers the question a runner actually arrives with, which is not "what is the heel
stack" but "what shoes suit the running I am doing".

The three presets that do answer it are three small chips in a toolbar, visually
subordinate to the sliders. And the tool's founding motivation was **confidence that
nothing was missed** — which the receipt now serves once you are filtering, but not at
the moment you start.

## 2. What this is not

Free-form filtering is not being replaced or hidden. Some people want to set their own
bounds and should be able to, immediately, without dismissing anything. The funnel is
the **default path, never the only one**.

## 3. The entry band

Above the table, a band offering the three stories from docs/shoe-stories.md as cards:
**Easy**, **Tempo**, **Race**. Each carries its name, one line of what the session is
for, and **the number of shoes it currently returns**, computed at load from the live
dataset.

The count is the point. It makes an abstract choice concrete, it exposes a preset that
has become too narrow as the fleet moves, and it costs one pass over the dataset that
the app already holds in memory.

Beside the cards, always visible and never behind a disclosure: **Browse all N shoes**.
That is the escape hatch, and it must not read as a lesser option.

### 3.1 The band collapses, it does not disappear

Once a story is picked, or any filter is touched, the band collapses to the chip row
that exists today. It never vanishes entirely — re-choosing a story is a normal thing
to want, and a control that disappears cannot be found again.

The band is expanded when the view equals `defaultView()` and collapsed otherwise.
That rule is derived from state, not stored, so it survives a shared link correctly: a
link carrying filters opens collapsed, a bare link opens expanded.

## 4. Applying a story

A story applies through the existing `applyPreset`, which **replaces** the view rather
than layering on it (docs/app.md §Presets). Two changes to what it sets:

- **Columns.** A story sets the columns that matter to it, not the global defaults.
  Race showing toebox width is noise; Easy showing it is not. This makes `applyPreset`
  the single place a story is expressed.
- **Generations.** `ViewState` now carries `generations`, so a preset must populate it
  for any pair it bounds. A preset must never bound a metric its own coverage warning
  would flag — a preset that trips the app's own "this hides more than it shows" is
  self-inflicted (docs/app.md §Coverage).

## 5. Repeat visits

The view is persisted so returning to the tool resumes where you left off rather than
back at the entry band.

**What is stored:** the serialised query string — the exact output of `serializeView` —
under a storage key carrying a schema version. Nothing else. No bespoke JSON shape.

**Why that shape:** restoring runs the stored string back through `parseView`, so it
inherits the hostile-input handling that already exists and is already adversarially
tested. A test slug that has since left the catalogue is dropped by machinery that
exists today, and no second parser can drift from the first.

**Precedence, in order:**

1. a query string in the URL — a shared link must always beat a previous session
2. stored state whose version matches
3. `defaultView()`

**Versioning:** the stored version is a hand-maintained constant, bumped when the URL
encoding changes. On mismatch the stored value is discarded silently. **There are no
migrations, ever** — losing a previous search is a trivial cost and migration code is
not.

It is deliberately not derived from the build: `main` deploys continuously, so a
build-derived version would discard state on every push.

**Storage access is wrapped** exactly as the theme is: it throws rather than returning
null in blocked contexts, and losing a saved view must never cost the page
(docs/app.md §Theming).

## 6. Deliberately unchanged

- The URL stays write-only; the Page keeps owning view state
  (docs/app.md §View and URL ownership).
- `popstate` stays unhandled — Back still does not restore the previous view. That is
  BACKLOG.md item 5 and wants working through on its own terms.
- The receipt, coverage bars and generation switching are untouched.

## 7. Non-goals

- **Preset thresholds.** docs/shoe-stories.md owns the reasoning; BACKLOG.md item 1
  owns the numbers and the three things the app still lacks — a not-carbon plate
  token, a fleet percentile helper, and a Tempo weight bound.
- **The value / last-generation axis.** `previousVersion` and `latestVersion` exist and
  a story could one day offer "last season's model, cheaper", but street price does not
  exist and MSRP does not express it. Nothing here may block it later.
- **Per-user state beyond the view**: owned shoes, shoes of interest, a release
  calendar. Explicitly deferred, explicitly not designed against.

## 8. Acceptance criteria

1. `npm run verify` green; `npm -w app run e2e` green.
2. A first visit with no URL and no stored state opens with the band expanded and all
   450 shoes listed.
3. Choosing a story replaces the view, collapses the band, and sets that story's
   columns.
4. **Browse all** is reachable without dismissing anything and leaves the fleet whole.
5. A link carrying filters opens collapsed and matches the link, ignoring stored state.
6. A reload with no query string restores the previous view.
7. A stored value written under a different version is discarded without error, and the
   app opens at defaults.
8. Blocked storage does not break the page in either direction — reading or writing.
9. No preset bounds a metric that its own coverage warning would flag.
