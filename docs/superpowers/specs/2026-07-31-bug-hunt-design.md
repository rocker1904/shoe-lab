# Bug hunt design

The project has been built at pace and never used. Every feature landed with
tests, a doc and a green CI run, and almost none of it has been driven end to
end by anything that behaves like a runner. This is the missing UAT, run by
agents, under a token budget that will not stretch to doing it twice.

**The hunt finds; it does not fix.** Its output is a queue of reproducible
findings on disk. Fixing is a separate campaign, sequenced afterwards, and
nothing in this design touches `app/`, `scraper/`, `shared/` or `data/`.

## What shapes the error surface

Not the visual polish alone. That pass repaints every surface — both
typefaces, all seven neutral tokens, elevation, header, desktop table, a
rebuilt phone rendering, the filter sidebar, the setup strip, the expanded
row, the dialogs, the drawer, the loading skeleton and a global focus-ring
rule — and it is the freshest code in the repo when the hunt starts, so it
carries the highest density. But it is a fraction of the whole, and the
untested surface is the whole project.

It also carries **seven declared departures from pure appearance** and fixes
**two defects in passing**, all enumerated in its own opening. Declared
changes are not the risk; a pass that describes itself as appearance-only
while moving seven behaviours is exactly where an eighth hides unnoticed.

Five standing blind spots, none of which the polish pass moves:

| blind spot | why it hides bugs |
|---|---|
| e2e runs on a **5-shoe fixture** | the catalogue is 450 shoes and 49 tests; `prepare-e2e.mjs` swaps the real data *out* by design |
| the layout suite is **Chromium-only** | `cross-browser.spec.ts` covers filters and nothing else; Firefox is the author's daily browser |
| **coverage gates only `app/src/lib/**`** | components and `Page.svelte` have tests but no gate, and `Page.svelte` owns view state |
| **no a11y automation at all** | every custom widget is hand-built: roving radiogroups, popovers, dialogs, sticky headers |
| **no live network in tests** | correct, and it means page-shape drift is only ever caught by the monthly `check:live` |

The 1200px table overflow is the shape of the whole problem: real-data-only,
invisible to the fixture, and it kept CI red for roughly thirty commits before
anyone traced it. It was not a hard bug. Nothing was looking.

Three defects are already known and are seeded into the queue rather than
rediscovered: `popstate` is unhandled so Back does not restore
(BACKLOG.md item 4); `Outsole durability` offers no direction in the sidebar
while the phone table renames it `Outsole wear` for exactly that reason, so
two surfaces contradict each other (BACKLOG.md item 5); and CLAUDE.md cites
`.superpowers/audit.mjs` as the example measurement rig, which does not exist.

## Decisions

### Find only, fix later
Agents never touch source. A find-only hunt costs a fraction of a
find-and-fix one per bug, needs no worktree isolation between parallel agents,
and — the reason that actually decides it — leaves a **clean queue** rather
than a dirty branch when a window ends mid-sentence. Fixing is where the
project's real cost sits anyway: TDD means every fix carries a failing test
first, so no fix is ever cheap enough to bundle into a hunting agent's budget
as an afterthought.

### The evidence bar replaces a verification stage
The standard defence against plausible-but-wrong findings is a second agent
paid to refute each one. That doubles the hunt's cost. Instead:

**A finding with no reproduction is not a finding.**

Every queue entry carries either an exact command that fails, or a numeric
assertion measured from the DOM with the actual figure recorded. Anything an
agent believes but cannot demonstrate goes on a one-line list in
`.hunt/suspicions.md`, which costs nobody anything and can be swept later if
it is ever worth it. Verification then happens for free at triage: run the
repro.

This is the same rule the project already runs on — measure, do not reason
(CLAUDE.md §Working approach) — applied to the agents doing the measuring.

### Numbers, not pictures
Screenshots are by far the most expensive thing an agent can do, and
"measure, do not reason" almost never requires one. Box geometry, scroll
widths, computed styles, contrast ratios and tab order all read out of the DOM
as numbers at negligible cost. **The rig is numeric by default; an agent
takes a screenshot only where a human eye is genuinely the instrument**, and
says why in the finding.

### Journeys before classes
The first wave is shaped by what a runner does, not by defect taxonomy.
Class-based sweeps systematically miss integration failures, because every
class looks fine in isolation — and integration is precisely what has never
been exercised here. Class sweeps follow in the second wave, where they also
benefit from a rig the journey wave has already debugged.

### The rig is scratch and dies with the hunt
`.hunt/` is gitignored, like `.notes/` and `.corpus/`. When a finding becomes
a permanent bound it enters `app/e2e/` or a unit test **as part of its fix, in
the same commit** (CLAUDE.md §Conventions, docs ride the change). The hunt
does not graduate its own findings; a harness that outlives its purpose is
maintenance the project did not ask for.

**`.hunt/` must be added to `.gitignore` before the first finding is written.**
`check:docs` scans untracked-but-unignored files for dead doc pointers, so a
finding that correctly reports a broken `docs/… §…` pointer would otherwise
fail `npm run verify` — the hunt would break the build by succeeding.

## The rig

Three files under `.hunt/`.

**`serve-real.mjs`** — builds the app and places the real `data/shoes.json`
into `dist/`, then serves it on a fixed port. A near-inversion of
`app/scripts/prepare-e2e.mjs`, which exists to do the opposite.

**`drive.mjs`** — takes `{engine, width, height, url}` and returns a page with
measurement helpers: box geometry, `scrollWidth` against `clientWidth`,
computed contrast between any two elements, a tab-order walk, a focus-trap
check, and text extraction. **Firefox is the default engine** — it is the
author's browser and the least-covered one in the suite; Chromium and WebKit
are cross-checks where a measurement disagrees.

**`report.mjs`** — appends a finding, schema-checked.

### The queue is one file per finding
`.hunt/findings/NNNN-slug.md`, never a shared append target, so parallel
agents cannot race each other. Frontmatter carries `id`, `title`, `surface`,
`severity`, `wave`, `agent`, `status`. The body is fixed: what is wrong, the
reproduction, expected against actual with figures, and the owning doc.

`.hunt/INDEX.md` holds titles only. An agent reads it before writing — cheap
enough to do every time — so the same bug is not filed five times by five
journeys that all pass through the toolbar.

### Severity
Drawn from what this project demonstrably values, not invented.

| | meaning |
|---|---|
| **S1** | **the app says something untrue** — a wrong number, a claim the measurements do not support, two surfaces contradicting each other |
| **S2** | **a runner cannot finish a journey** — broken interaction, unreachable control, lost state |
| **S3** | degraded but survivable — overflow, contrast miss, missing keyboard path |
| **S4** | cosmetic, or doc-only |

S1 sits at the top because it is the failure this project has repeatedly
chosen to treat as the serious one: `Say only what the measurements support`
is a commit subject, the sparse warning was deleted rather than tuned because
its classifier was wrong, and docs/decisions.md §Frozen scores and live
thresholds exists to stop a number drifting for reasons the runner cannot see.

## The dry streak

An agent is not capped on findings — a productive agent should keep going,
because that is the best token spend available. It is capped on
**unproductive work**:

> Stop after **N tool calls since the last S1–S3 finding was written.**

**S4 findings do not reset the counter.** Without that rule an agent nearing
its limit develops a sudden enthusiasm for cosmetic nitpicks in order to stay
alive, and the cap inverts into a noise generator. With it, and with the
reproduction bar making a padded finding more expensive than stopping,
continuing is only worthwhile when there is genuinely something there.

**N starts at 25 and is recalibrated after the first solo run**, once the real
ratio of tool calls to findings is visible. It is likely to end up per
agent type rather than global: a rendering sweep burns several calls per
measurement, a doc sweep almost none. A generous absolute ceiling stays as a
runaway backstop only, never as the operative limit.

## The waves

### Wave 1 — journeys
Five agents, each walking one path end to end in a real browser against real
data.

1. **First visit → first shortlist.** Cold land, setup strip, pick a story,
   pick a zone, read the table.
2. **Refine and interrogate.** Add-filter dialog, drag ranges, sort, expand a
   row, read the detail panel, check the receipt's counts against the table,
   export CSV.
3. **Share and return.** Copy the URL, open it in a fresh context with no
   `localStorage`, confirm it reproduces; reload with persistence; then Back
   and forward.
4. **Phone at 360px and 390px.** Where the polish pass is most aggressive and
   where the fixture has never been representative.
5. **The awkward runner.** Keyboard-only end to end, every popover escaped,
   plus dark theme and reduced motion.

### Wave 2 — class sweeps
6. **Claim versus reality.** Every number and invariant in `docs/` checked
   against code and data. No browser, pure read: the cheapest agent in the
   hunt and the highest S1 yield. A doc pass landed recently, so the expected
   yield is lower than it would have been — it runs anyway, because the
   polish pass rewrites parts of docs/app.md and because the cost is near zero.
7. **Data pipeline.** Determinism by rebuilding from `.corpus/` and diffing,
   validation gates, sanitiser, coercion, curated-date merge, slug collisions.
   Reads `.corpus/` by path; **writes nothing into `data/`.**
8. **Score arithmetic.** Implemented math against docs/shoe-stories.md, frozen
   constants, thin-coverage guards, ties, all-terms-missing. Never tuned
   toward RunRepeat's own pace labels — divergence there is the point, not a
   defect.
9. **Real-data rendering matrix.** Widths against three engines, numeric only.
   The 1200px-overflow class, swept deliberately instead of discovered by CI
   going red.
10. **Adversarial state.** Hostile URLs, impossible filter combinations, empty
    results, relaxation, preset marks, `All` semantics, sort stability,
    corrupted persistence.

### Wave 3
Deliberately unallocated: it goes wherever waves 1 and 2 point. Plus one
**completeness critic** whose only job is to name the surface nobody touched.

### Sequencing is a shakedown
Harness → **journey 1 solo** → fix the rig → **journey 2 solo** → fix the rig
→ **journeys 3, 4 and 5 in parallel**. Wave 2 then runs parallel throughout,
since agents 6, 7 and 8 barely touch the rig at all.

Two solo runs before any parallelism means rig defects are paid for once
rather than five times. To make that work, **every agent's report ends with a
required section: what the rig could not do, and what it had to hand-roll
around.** That section is the input to the iteration, and it is worth more
than any single finding the agent produces.

### Findings are written incrementally, never at the end
This is the single most important instruction given to any hunting agent. An
agent killed mid-run still leaves everything it had already proven. An agent
that batches its write-up leaves nothing.

## Resumption

Two mechanisms, and only one of them is load-bearing.

**The wake-up is a backgrounded `sleep`.** A background command keeps running
across turns and re-invokes the orchestrator when it exits, so a sleep sized
to the window reset wakes this session with its context intact — no file
needs reading, and agents can be resumed from their own transcripts via
`SendMessage`, keeping everything they had already loaded.

**The timeout does not apply, and that was measured rather than assumed.** A
backgrounded `sleep 660` returned exit 0 after exactly 660s, through both the
120s default and the 600s cap, so no timeout is imposed on a background
command and the wake-up is one command rather than a chain. The measurement
covers 660s and not 18000s, but since no limit was applied at all there is no
mechanism left to expire at the longer duration.

The one real limit: it needs the session to survive. Nothing recovers a
wake-up from a closed terminal.

**The written state is the fallback, and it is free.** `.hunt/STATE.md` names
what is built, which agents have run and what they found, the queue by
severity, the current dry-streak calibration, the known rig gaps, and the
single next action. It is rewritten at every wave boundary and after every
agent returns, so an interruption anywhere costs at most one agent's tail. If
the session is gone, a cold one reads that file and continues.

A scheduled cloud agent was considered and rejected: it runs remotely against
GitHub, so it can see neither `.hunt/` nor `.corpus/`, both gitignored, and
making it work would mean committing the queue against the decision above.

## Budget

The journeys start after the visual polish lands, because a rendering finding
against today's `main` is thrown away by it. **The harness does not wait** —
it serves real data and measures the DOM, and only its selectors are exposed
to the repaint, so it is built and shaken down now against current `main`.

Two class sweeps also do not wait: agent 7 (data pipeline) and agent 8 (score
arithmetic) touch nothing the polish pass moves, so they are pure gain
whenever there is budget for them, landed or not.

Agents run as plain `Agent` batches, not as a `Workflow`. Workflow fan-out
would be tidier and would give deterministic resume, but it is billed heavily
and was not asked for; batches keep the spend visible and interruptible, which
is what the constraint actually is.

## What this hunt does not do

- It does not fix anything, or write a test, or touch tracked source.
- It does not regenerate `data/`. That happens once, in the primary checkout,
  after landing (CLAUDE.md §Conventions) — never from a hunting agent.
- It does not make live requests to runrepeat.com. No exceptions; the four
  scraper CLIs and `check:live` remain the only live traffic in the project.
- It does not re-litigate the visual polish design. A finding that a mocked
  decision was wrong is a design disagreement, not a bug; it belongs in
  BACKLOG.md. **Taste is out of scope; behaviour, contrast, geometry and
  truthfulness are in.**

### Where the polish pass is thinnest
Its own Verification section is strong and covers tokens, labels, the contrast
ramp, phone geometry, expanded-row overflow, the font-swap header offset,
`headerUnits`, the sidebar accent rule and skeleton geometry. The hunt should
aim at what that list does **not** reach, because everything on it will
already have been proven:

| unverified by that spec | why it is a live risk |
|---|---|
| **the one-ring focus rule** | a `box-shadow` ring is clipped by `overflow: clip`/`hidden`, and the phone panel now uses exactly that; applied to *every* focusable thing with no test named |
| **`@container` in the expanded row** | its container is a scrollport that can exceed the viewport; measured in two engines, and the suite runs three |
| **the drawer scrim** | new element over a focus-trapping drawer below 800px — stacking order, dismissal, and whether it blocks what the trap already blocks |
| **hover-revealed drag grips** | `@media (hover: none)` is a coarse proxy; hybrid touch-and-pointer devices satisfy neither branch cleanly |
| **the theme toggle as an icon button** | three states, SVG per state, no visible text — an accessible name now has to come from somewhere |
| **the SVG ✕ clear control** | same: a glyph replaced by a graphic, and the name has to survive it |
| **the pickers' direction legend** | direction moves out of the table header into two dialogs; the sidebar still carries none, so the `Outsole durability` contradiction changes shape rather than resolving |

## The harness contract

No separate implementation plan: the harness is three small files and a plan
document would be longer than the thing it plans. The detail that a plan would
have carried lives here instead, which is what makes one-agent-at-a-time
feedback sufficient.

`serve-real.mjs` exposes `start()` → `{ url, stop() }`. It builds once and
reuses the build if `dist/` is newer than `data/shoes.json` and `app/src`, so
the second agent does not pay for the first agent's build.

`drive.mjs` exposes `open({ engine = 'firefox', width, height, path = '/', theme, reducedMotion })`
→ a Playwright page plus:

| helper | returns |
|---|---|
| `box(sel)` | rounded `{x, y, w, h}` |
| `overflows()` | `{ scrollWidth, clientWidth, overflowsBy }` for the document |
| `contrast(sel)` | computed ratio of an element's text against its **composited** background, walking ancestors through translucent layers |
| `tabWalk(from)` | ordered list of focused elements' accessible names, with duplicates and traps flagged |
| `focusRingOf(sel)` | whether a ring is painted **and unclipped**, since that is the failure mode the box-shadow rule introduces |
| `names(sel)` | accessible name and role, for controls that lost their text |
| `shot(sel, why)` | a screenshot — **requires a reason string**, which lands in the finding |

`report.mjs` exposes `file(finding)` and `suspect(line)`. `file()` refuses a
finding whose `repro` is empty; that refusal is the evidence bar, enforced
rather than remembered.

### The agent brief template
Every hunting agent is dispatched with the same seven-part brief, varying only
in part 2:

1. **You find; you never fix.** Do not edit tracked source, tests or `data/`.
2. **Your journey or class**, and its exact bounds.
3. **The rig**, with the helper table above, and: numbers not pictures — a
   screenshot needs a reason and the reason is recorded.
4. **The evidence bar.** No reproduction, no finding — put it in
   `suspicions.md` and move on.
5. **File incrementally.** Write each finding the moment it is proven. You may
   be stopped at any time and anything unwritten is lost.
6. **The dry streak.** Stop after N tool calls since your last S1–S3 finding.
   S4 does not reset it.
7. **End with what the rig could not do**, and what you hand-rolled around.
   This section is worth more than any single finding you file.
