# Hunting

How to find failure modes in this project with agents, what this app's failure modes actually
**are**, and the instrument that measures them.

It earns a file of its own under docs/decisions.md §Doc system's test for a fifth doc: it cost a
parallel hunt to learn, and putting it in docs/app.md would file testing technique inside a
document about view state.

## Decisions

Three calls that are settled rather than observed. They were filed among the observations below
until it became clear what the difference costs: an observation invites a cheaper alternative next
time, and each of these already had its cheaper alternative tried.

### WebKit needs Docker

It cannot launch on Arch — it wants `libicu74`, `libxml2`, `libflite1`, the same wall
docs/operations.md §The e2e run needs three browsers records. Build outside, then:

```
sh hunt/in-docker.sh .hunt/your-probe.mjs      # probe calls start({ build: false })
```

~3–4 minutes for a three-engine probe. It found two S2s on its first run, both invisible to the
other engines. **Its limit: Playwright's WebKit is WebCore, not Mobile Safari** — iOS focus
auto-zoom is not observable, `visualViewport.scale` stays exactly 1. That one needs a real iPhone.

### Strongest available model for judgment

The one controlled comparison in the hunt used the models available at the time: same journey,
same rig, same brief — **Sonnet filed 0 findings, Opus filed 6.** That is evidence for a capability
floor, not a permanent provider allowlist. A cheaper model is fine for mechanical work like shaking
the rig down, and that pass paid for itself by finding two rig defects. But a cheap agent reporting
"nothing found" retires a direction that was never searched, and nothing downstream can tell that
apart from a clean one.

### Sequencing

Shake the rig down with one solo agent before any parallelism — its gaps are false-positive
generators and you pay for them once instead of N times. Then run journeys before class sweeps:
class-based sweeps miss integration failures because every class looks fine in isolation.

Reference cost from that hunt: an Opus journey was ~200–245k tokens, 40–125 tool calls,
20–30 minutes. Re-measure before using those figures to budget another provider or model family.

## The failure classes this app actually produces

The most useful result of the first hunt was not any finding. It was discovering that **the
arithmetic is mature and the defects are somewhere else entirely.**

Independently confirmed clean by four agents: receipt arithmetic under composed bounds,
leave-one-out exclusion counts, coverage denominators over `considered`, the wash ramp, sort with
missing-last, CSV fidelity under filter and sort, the score breakdown reconstructing its own answer
to ≤0.02, and `build:dataset` being byte-identical over unchanged inputs. **Read it as a list of
directions that did not pay, not as a map of the app** — mechanisms move, and one on this list
already has. **Do not start a hunt by re-checking sums.** Six directions paid instead:

**Vocabulary — one word or glyph meaning two things.** The em dash is both "no reading" and the
real value `none`, and the proof was that sorting sends the same glyph to opposite ends of the
table one click apart. Search matches `name` while Brand matches `brand`. Ask what a symbol means
on *another* surface, not whether it is right on this one.

**Lifecycle — state that does not survive a reload or a second visitor.** A link to the default
view carries nothing, so the recipient's own stored session answers it. `Copy link` pressed inside
the URL write's debounce copies the previous view. These need two histories or a race, so no unit test
reaches them.

**Geometry the suite never looks at.** The chrome pinned to the viewport rather than the document;
one pixel of window either side of a viewport boundary costing hundreds of pixels of
sideways overflow (docs/app.md §Filters); a picker off the left edge at 320px. The
suite asserts what it was told to; nobody had walked the width ladder.

**Announcement.** The receipt reports a *count*, so on its own it announces a control only when
that control happens to change how many shoes show. What each control is supposed to say, and which
say nothing on purpose, is docs/app.md §What a control says it did.

**Engine-specific focus behaviour.** Everything WebKit gave up was focus, not layout: `@container`,
the overflow pair, the sticky header, `color-mix` and every catalogue label are identical across
three engines, while Safari paints no ring on any checkbox and never scrolls the sidebar as Tab
walks it. **The app owns its focus indicator and its scroll-into-view assumptions, and Safari
honours neither.**

**Docs enumerating counts.** The docs are wrong exactly where they enumerate the app's current
shape — brands, rows, fields, tab stops, workflow steps — and right everywhere they record a
decision or a measurement of the world. Not one physical constant, frozen score, threshold or
endpoint had drifted. The fix is structural: an enumerable count wants an assertion, not an edit
(AGENTS.md §Working approach, "state bounds as testable numbers").

## The rig

`hunt/` is tracked; `.hunt/` is its gitignored output — queue, screenshots, probe scripts.
**That split is load-bearing**: `check:docs` scans untracked-but-unignored files for dead doc
pointers, so a finding correctly reporting a broken pointer would fail the build by being right.

| file | what it does |
|---|---|
| `hunt/serve-real.mjs` | builds if stale, serves on :4180, and answers `/shoes.json` from an **in-memory read** of the real `data/shoes.json` — never a copy into `dist/`, which is a race a rig cannot see (below) |
| `hunt/drive.mjs` | `open()`/`session()`/`cold()`/`pair()` plus the measurement helpers, and `diff()` |
| `hunt/report.mjs` | `file()` — which **refuses a finding with no reproduction** — and `suspect()` |
| `hunt/png.mjs` | minimal PNG decoder, so contrast can be read off painted pixels |
| `hunt/smoke.mjs` | proves every helper returns the right shape in every engine |
| `hunt/fit-boundary.mjs` | **asserts**, and exits non-zero: the sidebar's boundary, the fit rule and the two agreeing, against the real fleet |
| `hunt/overscan.mjs` | how far the page travels per animation frame under the hardest gestures, per engine and rendering — the readings `OVERSCAN_PX` and `PHONE_OVERSCAN_PX` are chosen against. `hunt/overscan-3engine.log` and `hunt/overscan-phone-3engine.log` are the recorded runs |
| `hunt/phone-window-cost.mjs` | compares the real 390px phone list before and after windowing: DOM population, range-drag flush, new scroll work and the full-fleet group measurement. `hunt/phone-window-cost.log` records the three-run Chromium/Firefox reading |
| `hunt/in-docker.sh` | runs a probe in the Playwright image, the only place WebKit launches here |

`fit-boundary.mjs` is the one file here that makes a claim about the app rather than about the rig,
and it lives here because it cannot live anywhere else: the e2e fixture is five shoes with one-word
names whose document fits at every width, so no assertion in the suite can see the overflow the
boundary is derived from (docs/app.md §Filters). Run it when the fleet grows, when `defaultColumns`
changes, when a table cell's wording moves, or when `lib/fit.ts`'s font tables are regenerated —
those are the inputs that move the boundary, and each moves it silently.

**It has no tests and will rot silently. Run `node hunt/smoke.mjs` before trusting it**, and again
after any UI change — the selectors move.

**Committed source cites a finding, or a tracked `hunt/` rig — never a `.hunt/` path.** A pointer to
a gitignored one-shot script reads as provenance and does not function as it: the directory is
worktree-local, so the pointer dangles the moment the branch lands, and what it says in the meantime
is *trust me, I measured it*. So a comment states the number and the conditions it was taken at —
the engines, the widths, the fleet — which is what lets the next reader judge it or take it again.
Where re-running is the only way to check a constant, the rig is promoted into `hunt/` and cited
there; `hunt/overscan.mjs` is the one that earned it, `OVERSCAN_PX` being a budget with no assertion
behind it. `.delivery/` is worse than dangling and is never cited at all: the delivery convention
deletes it. One branch put 28 such pointers into `app/src` and `app/e2e` before this was written
down.

Serving the **real dataset** is the point: `app/scripts/prepare-e2e.mjs` deliberately swaps
it for a 5-shoe fixture — which is why the 1200px overflow survived a long run of green CI before
anyone traced it.

### Re-running a finding against a branch

`start({ root: '/home/sam/dev/shoe-lab-<branch>' })` serves another checkout — its own `data/` and
`node_modules`, nothing written outside it — so "does this branch fix finding N" is measured rather
than read off a diff.

**Run the same probe against `main` first.** Checking the `mobile-chrome` branch, four of eight
probes returned identical results on both checkouts because the *probe* was failing, not because
the branch changed nothing. Without the baseline every one of those would have been reported as
"the branch does not address this", which is a false all-clear rather than a null result. A probe
that cannot reproduce a finding on the checkout it was found on says nothing about any other.

### Rig lessons, each of which cost an agent real time

**The rig produced four confidently wrong measurements over the hunt, and an agent caught every one
of them — the rig never caught itself.** That is the strongest argument for the evidence bar.

1. **Never string-parse a CSS colour here.** Graded cells compute to `oklab(…)`; a parser reading
   the first three numbers as r,g,b reported 1.01:1 where the truth was 4.77:1. `drive.mjs`
   normalises through a 1×1 canvas.
2. **Computed contrast runs ~0.04 low against paint**, because it composites in sRGB while the ramp
   paints `color-mix(in oklab)`. It produced one false suspicion. **Sweep with `contrastFailures`,
   settle with `contrastPainted`**, which reads real pixels and takes ink from the cascade.
3. **`:focus-visible` does not apply to a programmatic `.focus()` after a pointer interaction**, so
   a ring measured post-click reads as missing. Use `ringWalk()`, which drives by Tab.
4. **An inset `box-shadow` cannot be clipped**, so counting it made 57 of 80 phone stops false
   positives. Shadow layers split on commas outside parentheses.
5. **Playwright's string-form `evaluate` returns `undefined` rather than throwing** — a broken
   helper looks like a clean measurement. Pass real functions.
6. **`resize()` needs to settle**; measured immediately it read WebKit as rendering the desktop
   table at 600px, a 317px overflow that does not exist.
7. **Do not pipe a probe through `tail` and wait** — `tail` blocks until exit, so it looks hung.
   Redirect to a file and read it.
8. **A dataset copied into `dist/` is raced by any `npm -w app run e2e` anywhere.** `serve-real`
   copied `data/shoes.json` into `app/dist/` once at start; a suite run in any checkout then wrote
   the 5-shoe fixture over it, and from that moment every measurement was of `cushy` and `Cushy 2`
   rather than the fleet — silently, because the page still renders. It cost two runs before a
   screenshot gave it away, and it has caught two separate waves. Serving from an in-memory read
   taken at start costs nothing and removes the class.
9. **In WebKit a pointer press disables Tab until focus is moved off what it pressed.** WebKit
   anchors sequential focus navigation to the *node the pointer last pressed*, not to
   `activeElement`. Press a child that cannot take focus — the word inside the column picker's
   `<summary>`, say — and every later Tab and Shift+Tab resolves back to that child's focusable
   ancestor and moves focus nowhere, firing **no focus event at all**. A probe that clicks a control
   open and then walks it by keyboard therefore measures the app answering an exit that never
   happened, in the one engine that behaves differently. Re-focusing does not clear it, because the
   ancestor is already `activeElement` and `focus()` is a no-op; `blur()` then `focus()` does.
   Chromium and Firefox navigate away in every one of those cases. Reproduced on a five-line page
   with no app code in it, and it is what made `cross-browser.spec.ts` › *closes the column picker
   every way out* fail in WebKit alone.

## Briefing a hunting agent

Seven parts. The ones marked **verified** changed behaviour measurably; the rest are observations
from a hunt where more than one thing varied at a time, and should be held loosely.

1. **You find; you never fix.** No tracked file, no `git add`, no `npm -w app run e2e` (it poisons
   the rig with the fixture). Only `.hunt/`.
2. **The journey or class, and its exact bounds** — plus what neighbouring agents own, so a
   trespass becomes a note rather than a duplicate.
3. **The rig**, as a code block of real calls. Numbers, not pictures: `shot()` demands a reason an
   eye is the instrument, and the reason lands in the finding.
4. **The evidence bar. A finding with no reproduction is not a finding** — an exact failing command
   or a numeric assertion carrying the measured figure. Everything else goes to `suspect()`.
   **Verified: this replaces an adversarial verification stage entirely.** Nothing filed across
   45 findings had to be thrown out, and verification at triage is free because you just run it.
5. **File incrementally, never at the end.** An agent stopped mid-run still leaves what it proved.
6. **The stop rule.** Complete the journey *regardless* of any dry streak, then stop after ~25 tool
   calls with no new S1–S3 finding and no rig-limitation discovery; S4s do not reset the counter,
   or an agent near its limit develops a sudden enthusiasm for cosmetic nitpicks.
   **Verified as a correction**: the first brief said both "stop at 25" and "stop when the journey
   is exhausted", and the agent reasonably let the second win. State the precedence.
7. **End with what the rig could not do.** **Verified: this is worth more than any single finding.**
   Every agent found at least one gap, four were false-positive generators, and the next agent
   inherits the fix.

### What else measurably helped

- **Tell each agent what is already proved clean.** Coverage compounds; later agents started
  further along and stopped re-walking arithmetic.
- **Hand over a spec's claims as a list to falsify**, not as background reading. Every number in
  the visual-polish spec was measured against a mockup; the phone agent checked them against the
  real fleet and most held, which is itself worth knowing.
- **Assign orphaned findings explicitly.** The 700–844px band was measured by one agent that
  declined to file it as out of remit. Findings that fall between two briefs are exactly how a real
  defect goes unowned; give it to someone.
- **Let an agent append to an existing finding** rather than opening a near-duplicate. Three did,
  and one *corrected* a wave-1 finding that was backwards.

## The queue

One file per finding, `.hunt/findings/NNNN-slug.md`, never a shared append target so parallel
agents cannot race. Severity is about the app, not the fix:

| | |
|---|---|
| **S1** | the app says something untrue — a wrong number, an unsupported claim, two surfaces contradicting |
| **S2** | a runner cannot finish a journey |
| **S3** | degraded but survivable |
| **S4** | cosmetic, or doc-only |

S1 sits at the top because it is the failure this project has repeatedly chosen to treat as
serious: `Say only what the measurements support` is a commit subject, the sparse warning was
deleted rather than tuned because its classifier was wrong, and
docs/decisions.md §Frozen scores and live thresholds exists to stop a number drifting for
reasons a runner cannot see.

**Triage by root cause, not severity.** 45 findings collapsed to eight groups and nine
independents; several groups are one decision wearing many numbers.

## What a hunt cannot see

- **iOS Safari proper.** See above.
- **Anything live.** No agent may make a network request — docs/scraping.md §Politeness owns the
  only sanctioned live traffic, and that is a project rule rather than a gap.
- **Whether a design is good.** Taste is out of scope by construction: a decision you would have
  made differently is a disagreement for BACKLOG.md, not a bug. Behaviour, contrast, geometry and
  truthfulness are in.
