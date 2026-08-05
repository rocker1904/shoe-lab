---
name: delivering
description: Use when an approved spec with a build sheet exists. Executes it task by task with implementation-level reviews and lands the branch.
---

# Delivering

Execute a build sheet: TDD per task, an independent review of every
task's diff, one whole-branch review at the end. Reviews attach to code,
never to prose. Run continuously — no check-ins between tasks; the only
reasons to stop are BLOCKED, a DISCOVERY that moves behaviour, or done.

**Announce at start:** "Using delivering to execute <spec>."

## Setup

- **Read the spec's status line before anything else.** It must read
  `approved, in delivery`. Anything else — `drafted, awaiting review`
  above all — means the user has not signed off yet: stop and say so,
  before a worktree exists. Being handed a spec, or having written it
  yourself, is not approval; the line is, and only the user can write it.
- Use the environment's worktree workflow, or `git worktree` directly when no
  helper exists. Never work on main without explicit consent.
- Commit the approved spec before implementation begins — worktrees do not
  share untracked files, and the crew reads the spec from the repo. It is
  normally the branch's first commit. One explicitly user-requested
  housekeeping or documentation commit made before approval may precede it;
  record that exception in the ledger, and keep implementation after the spec.
- Ledger at `.delivery/<spec-basename>/progress.md`, gitignored (add
  `.delivery/` to .gitignore if absent), first line naming the spec. The
  ledger is what survives compaction: after one, trust it and `git log`
  over recollection. On resume, tasks with a `complete` line are done —
  never re-execute them.
- Read the spec once. Todo per task. Scan the build sheet for internal
  contradictions or policy collisions; raise everything found as one
  batched question before starting, not one interrupt each mid-run.
  **A trailing documentation task is one of those defects**: docs ride
  the behaviour commit that changes them, so fold each doc edit into the
  task that earns it and let the trailing task keep only what belongs to
  no single one — a dated decision entry, a policy line, a backlog
  closure.

## Choosing the execution mode

Signals, not a global default. Mixing within a sheet is fine; record
mode switches in the ledger.

- **Inline** — the controller implements. For short sheets (≤3 tasks),
  tasks sharing an evolving interface (handing a reshaping interface
  between fresh contexts is where integration bugs breed), or
  discovery-heavy work where spec amendments will be frequent.
- **Crew** — an implementer subagent, sequential, **reused across
  consecutive tasks**. For longer sheets of clearer tasks. Reuse
  amortises the warm-up read (AGENTS.md + owning docs + spec) and
  carries learnings forward. Reuse is the default and means the *same
  warm agent*: hand it the next task by follow-up message — a fresh
  spawn is a rotation, not a reuse. Budget: start a new task on the
  same implementer only while its summed reported usage is under ~45%
  of its context window (~450k tokens of a 1M window). Count tokens the
  harness reports per completion, keep the running total in the ledger,
  and never substitute the agent's own estimate of its context use —
  self-reports have been wrong where the reported totals were not. That
  leaves headroom for the task plus its fix rounds. On rotation: distil
  the outgoing agent's learnings into a ledger note, and seed the fresh
  agent's first brief with it. Rotate early if a reused implementer's
  tasks start needing more fix rounds than its earlier ones did — that
  is degradation, and riding it to the budget line buys nothing. Its
  earliest signature is subtler than failed tasks: an implementer
  certifying a check it did not fully run ("all nine pointers resolve"
  after checking only that they named the file) is degrading, whatever
  its test results.
- **Parallel worktree agents** — only for genuinely independent tasks
  with frozen interfaces, with the merge cost priced in. Sequential is
  the default.
- Mechanical sweeps (renames, applying a settled pattern) go to a cheap
  model in any mode.
- Name agents by FUNCTION ("crew implementer A", "reviewer 3"), never by
  task — spawn labels do not update on resume, and task attribution
  lives in the ledger. When comparing agents, blind the subjects: assign
  the task, never name the experiment — an agent that knows it is being
  evaluated works differently.

**Model floor:** implementation from a build sheet is judgment work —
implementers and reviewers take the strongest judgment-capable model the
active environment makes available. Do not translate this into a provider or
model-name allowlist. The measured basis for the floor lives in
docs/hunting.md §Strongest available model for judgment: on the same brief and
rig, the cheaper model filed zero findings where the stronger one filed six.
A cheap "done" can be a direction never actually searched.

**Where the harness fixes a model at spawn, the model is a property of the
agent, not of the task.** A follow-up message cannot change it — so a
cheap-model agent may be reused only for further *mechanical* tasks, and
**the first judgment task after a mechanical one is a rotation, not a
reuse**. Left implicit, this rule and the reuse default silently defeat
the floor: a cheap model correctly chosen for a mechanical first task
rides into every task handed to that agent afterwards, and nothing ever
presents as a model decision, because handing over the next task feels
like continuing rather than choosing. Measured here: three judgment
tasks, including a URL parser and a registry, were written by the cheap
model before anyone noticed the trailers.

**Keep delegated work asynchronous when the environment supports it.**
Sequencing comes from *when* you dispatch: send the agent, keep the user
updated, and act on the completion notification. If the harness only supports
synchronous delegation, state that limitation and keep each delegated unit
bounded.

## The brief (crew mode)

The repo is the brief. A dispatch contains: the task's lines from the
build sheet; the interfaces it consumes and produces; global constraints
verbatim; pointers to AGENTS.md, the owning doc section, the policy
entry and the spec section; your resolution of any ambiguity you noticed; and the
report-file path (`.delivery/<spec>/task-N-report.md` — full report
there, short status back). Never paste code, session history, or
prior-task summaries — the ledger, the interfaces block, and rotation
notes carry cross-task state.

Implementer statuses: DONE · DONE_WITH_CONCERNS (read the concerns
before reviewing) · NEEDS_CONTEXT (provide it, continue) · BLOCKED
(change something — context, model, task size — never re-run unchanged) ·
DISCOVERY (see below).

## When an agent dies without reporting

An API error, a stalled stream, a token or session limit — any cause
that is not the work itself. **Resume it from its transcript.** Its
context is intact and its task did not defeat it, so replacing it with a
fresh spawn throws away everything it had loaded, and re-running it from
scratch pays for that twice. This is the opposite case to BLOCKED, where
something must change before the agent runs again; here nothing should.

**Verify the tree yourself before resuming**, and put what you found in
the resume message: `HEAD`, whether the working tree is clean, and which
of its steps did and did not land. A dead agent may have left partial
edits it will not remember making, and a transcript preserves context but
not attention — an agent that half-remembers work it never finished will
skip it and report success. Restate the instruction compactly alongside
the pointer to your original message, for the same reason.

**A reviewer that dies without a verdict is not a review.** The task
stays unreviewed. Check the tree before resuming it, too: a reviewer that
died mid-probe can leave the worktree mutated, and a verdict reached on a
tree nobody has checked is worth no more than no verdict at all.

## Every task, either mode

1. Record BASE: `git rev-parse HEAD`.
2. Implement test-first, using the environment's TDD skill when one is
   available. Docs ride the change: the owning doc moves in the same commits.
   **Where the deliverable is a guard** — an assertion protecting an
   invariant that already holds — failing-test-first is incoherent, and
   the bar is **mutation**: write the assertion, break the invariant,
   record which case reddened and its message, revert, confirm green. A
   green guard that asserts nothing looks exactly like one that works,
   and the next task will be built on the assumption it protects.
   **Sweep for prose the change falsifies, beyond the diff's own files.**
   A WHY comment asserts a fact about neighbouring code and nothing
   typechecks it, so a behaviour change strands some every time. On this
   skill's second delivery that was the single most common finding —
   nine across eight reviews, every one in a file the diff never touched,
   including a browser claim that had been wrong for months and was
   inherited into new code by three people in a row before anyone
   rendered it. Hand the implementer the passages you already know of;
   assume the list is incomplete.
3. Build the review package into one file under `.delivery/<spec>/`:
   `git log --oneline BASE..HEAD`, `git diff --stat BASE..HEAD`,
   `git diff -U10 BASE..HEAD`. Always BASE..HEAD — `HEAD~1` silently
   drops all but the last commit of a multi-commit task.
4. Dispatch a fresh reviewer — never skipped, never the implementer,
   never a reused one, identical in both modes; the diff does not care
   who wrote it. Freshness is the feature, not a cost: a fresh agent
   does not assume it already holds the context, so it hunts beyond the
   diff's own files — which is where a warm/fresh comparison found the
   one Critical of the skill's first delivery (a registry in a file the
   diff never touched) after the warm arm reviewed the same package
   clean. Reviews were never ceremony in that data: every task,
   including the smallest, produced real findings. The reviewer reads
   its material itself — no delegating reading to subagents; delegated
   reading is context the verdict then does not have. It gets the
   task's build-sheet lines, the spec §, docs/policies.md, and the
   package path. Two required verdicts: spec compliance AND quality.
   Never pre-judge findings for it ("don't flag X" is you sparing
   yourself a loop). Do not mutate the worktree — commits, suite runs,
   doc edits — while a dispatched agent is verifying in it; a moving
   tree voids its evidence and yours.
5. Fix loop, on spec ❌ or Critical/Important findings. Crew: resume the
   implementer for rounds 1–3; rounds 4–5 dispatch a fresh implementer
   on a stronger model (this rotation replaces any planned reuse —
   trouble is the natural rotation point). Inline: the controller fixes.
   Either way every round ends with a scoped re-review of the fix diff —
   an unreviewed fix is how regressions land — with the executor scaled
   to the fix's blast radius: behaviour or shared-surface changes get an
   agent; prose, comment, or test-only fixes get the controller reading
   the diff. Someone who did not write the fix always reads it; measured
   basis: five agent re-review rounds caught nothing on small fixes,
   and the two controller-run rounds lost nothing. Cap: 5 rounds. At the cap,
   adjudicate each open finding yourself: park it with a written ruling
   in the ledger, or STOP and surface it if anything downstream builds
   on it. Minors go straight to the ledger for final-review triage and
   never extend a loop. Silent discards are forbidden.
6. Ledger: `Task <N>: complete (commits <base7>..<head7>, <review
   outcome>)`. **A finding can be real while fixing it makes the suite
   worse** — most often a test pinning a value later measured inert,
   which will then fire for a change that breaks nothing and teach the
   next reader to distrust the suite. Neither keeping it nor quietly
   dropping it is right: remove the assertion, move the knowledge that
   justified it into a comment beside the code and a backlog item, and
   write the ruling down. Findings travel forward: any review finding that names a
   later task's ground rides in that task's brief verbatim — a warning
   the reviewer wrote for task N+2 is worthless in a file task N+2's
   implementer never reads. Then the next task.

## Discovery — the spec was wrong and implementation found out

A measurement contradicting a spec number, an interface that does not
fit, a policy collision the design missed: **not a fix-loop matter, and
not something to work around.** Stop the task. State the evidence. Amend
the spec — with the user when the change moves behaviour they approved,
alone when the spec is merely catching up to reality — update
policy/decision docs if touched, ledger the amendment, resume. Crew
implementers report DISCOVERY with evidence instead of improvising.
Momentum is the enemy: an unreported discovery becomes a silent
divergence between spec and code, and the review loop will faithfully
enforce the wrong document.

## Finish

- Whole-branch review on the strongest model, package built from the
  merge base, pointed at the ledger's parked and minor lines to triage
  what blocks landing. One fix wave (one fixer with the complete list,
  not one per finding), one scoped re-review, adjudicate residuals.
- Gates before landing: suites green; owning docs moved wherever
  behaviour did; deliberately deferred items in BACKLOG.md with
  provenance. **Run the project's own end-to-end script, not the test
  runner directly** — the script builds first, and a runner pointed at a
  stale build reports failures that read exactly like regressions from
  whatever you did last.
- **Re-check the base, and treat a moved one as a re-verification event
  rather than a formality.** A delivery long enough to need this skill is
  long enough for the base to move under it. Rebase, resolve, and run
  every gate again on the tree that will actually land: the reviewed tree
  and the landing tree are then two different trees, and only the second
  one matters. Watch for conflicts that merge cleanly but are wrong —
  two branches closing *different* items in one ordered list is the
  sharp case, since each renumbers the other's survivors.
- **For an explicitly requested reviewed-but-unlanded handoff, stop here.**
  Keep the spec `approved, in delivery`; retain the branch, worktree and
  `.delivery/` evidence; and report the exact reviewed head. On a later landing
  instruction, resume here and re-check the base and gates before continuing.
- Flip the spec's status to delivered-and-frozen, and make sure nothing
  live names a backlog item by list position — titles survive
  renumbering, numbers do not; a still-live build sheet once pointed
  "remove item 5" at the wrong feature.
- Sweep the ledger and reviews for anything routed "record" or "next
  touch" and move it to its real home — a backlog line or a doc clause —
  BEFORE deletion; a note that lives only in `.delivery/` is already
  lost.
- Then use the environment's branch-finishing workflow, or the linear landing
  procedure in AGENTS.md directly. After landing, delete `.delivery/<spec>/` —
  git history is the record now.

## Bedding in

These skills are new. Throughout the run, keep a holding-pen section in
the ledger: every place this skill was unclear, silent, or wrong; every
deviation you chose and why; every step you invented that worked. At
the end of the engagement, report that list to the user unprompted,
with your judgement of what the skill should say instead — evidence
from the run, not impressions. This section retires when the skills do.

## Rationalizations

| Excuse | Reality |
|---|---|
| "This task is too small to review" | Small diffs hide S1s; the reviewer is cheap, the regression is not. |
| "I'll fix it and skip the re-review" | Unreviewed fixes are how regressions land. Every round ends scoped. |
| "One more round will converge" | Past the cap the failure is structural. Adjudicate and route. |
| "I'll note the discovery after finishing the task" | Finishing means building on the wrong spec, then paying review to defend it. Stop now. |
| "Keep the implementer going, it's only at 60%" | Past the budget its fix rounds degrade first — exactly the work that needs headroom. |
| "Ledger later" | The ledger is what survives compaction. Later is after the crash. |
