---
name: delivering
description: Use when an approved spec with a build sheet exists. Executes it task by task with implementation-level reviews and lands the branch. Supersedes superpowers:executing-plans and superpowers:subagent-driven-development in this project.
---

# Delivering

Execute a build sheet: TDD per task, an independent review of every
task's diff, one whole-branch review at the end. Reviews attach to code,
never to prose. Run continuously — no check-ins between tasks; the only
reasons to stop are BLOCKED, a DISCOVERY that moves behaviour, or done.

**Announce at start:** "Using delivering to execute <spec>."

## Setup

- Isolated worktree via superpowers:using-git-worktrees. Never on main
  without explicit consent.
- Ledger at `.delivery/<spec-basename>/progress.md`, gitignored (add
  `.delivery/` to .gitignore if absent), first line naming the spec. The
  ledger is what survives compaction: after one, trust it and `git log`
  over recollection. On resume, tasks with a `complete` line are done —
  never re-execute them.
- Read the spec once. Todo per task. Scan the build sheet for internal
  contradictions or policy collisions; raise everything found as one
  batched question before starting, not one interrupt each mid-run.

## Choosing the execution mode

Signals, not a global default. Mixing within a sheet is fine; record
mode switches in the ledger.

- **Inline** — the controller implements. For short sheets (≤3 tasks),
  tasks sharing an evolving interface (handing a reshaping interface
  between fresh contexts is where integration bugs breed), or
  discovery-heavy work where spec amendments will be frequent.
- **Crew** — an implementer subagent, sequential, **reused across
  consecutive tasks**. For longer sheets of clearer tasks. Reuse
  amortises the warm-up read (CLAUDE.md + owning docs + spec) and
  carries learnings forward. Budget: start a new task on the same
  implementer only while its summed reported usage is under ~45% of its
  context window (~450k tokens of a 1M window — completions report
  usage; keep the running total in the ledger). That leaves headroom for
  the task plus its fix rounds. On rotation: distil the outgoing agent's
  learnings into a ledger note, and seed the fresh agent's first brief
  with it. Rotate early if a reused implementer's tasks start needing
  more fix rounds than its earlier ones did — that is degradation,
  and riding it to the budget line buys nothing.
- **Parallel worktree agents** — only for genuinely independent tasks
  with frozen interfaces, with the merge cost priced in. Sequential is
  the default.
- Mechanical sweeps (renames, applying a settled pattern) go to a cheap
  model in any mode.

**Model floor:** implementation from a build sheet is judgment work —
implementers and reviewers take the strong model by default. The
measured basis: same brief, same rig, the cheap model filed zero
findings where the strong one filed six. A cheap "done" can be a
direction never actually searched.

## The brief (crew mode)

The repo is the brief. A dispatch contains: the task's lines from the
build sheet; the interfaces it consumes and produces; global constraints
verbatim; pointers to CLAUDE.md, the owning doc section, the policy
entry and the spec section; your resolution of any ambiguity you noticed; and the
report-file path (`.delivery/<spec>/task-N-report.md` — full report
there, short status back). Never paste code, session history, or
prior-task summaries — the ledger, the interfaces block, and rotation
notes carry cross-task state.

Implementer statuses: DONE · DONE_WITH_CONCERNS (read the concerns
before reviewing) · NEEDS_CONTEXT (provide it, continue) · BLOCKED
(change something — context, model, task size — never re-run unchanged) ·
DISCOVERY (see below).

## Every task, either mode

1. Record BASE: `git rev-parse HEAD`.
2. Implement with superpowers:test-driven-development. Docs ride the
   change: the owning doc moves in the same commits.
3. Build the review package into one file under `.delivery/<spec>/`:
   `git log --oneline BASE..HEAD`, `git diff --stat BASE..HEAD`,
   `git diff -U10 BASE..HEAD`. Always BASE..HEAD — `HEAD~1` silently
   drops all but the last commit of a multi-commit task.
4. Dispatch a fresh reviewer — never skipped, never the implementer,
   identical in both modes; the diff does not care who wrote it. It
   gets the task's build-sheet lines, the spec §, docs/policies.md, and
   the package path. Two required verdicts: spec compliance AND quality.
   Never pre-judge findings for it ("don't flag X" is you sparing
   yourself a loop).
5. Fix loop, on spec ❌ or Critical/Important findings. Crew: resume the
   implementer for rounds 1–3; rounds 4–5 dispatch a fresh implementer
   on a stronger model (this rotation replaces any planned reuse —
   trouble is the natural rotation point). Inline: the controller fixes.
   Either way every round ends with a scoped re-review of the fix diff —
   an unreviewed fix is how regressions land. Cap: 5 rounds. At the cap,
   adjudicate each open finding yourself: park it with a written ruling
   in the ledger, or STOP and surface it if anything downstream builds
   on it. Minors go straight to the ledger for final-review triage and
   never extend a loop. Silent discards are forbidden.
6. Ledger: `Task <N>: complete (commits <base7>..<head7>, <review
   outcome>)`. Then the next task.

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
  provenance.
- Then superpowers:finishing-a-development-branch. After landing, delete
  `.delivery/<spec>/` — git history is the record now.

## Rationalizations

| Excuse | Reality |
|---|---|
| "This task is too small to review" | Small diffs hide S1s; the reviewer is cheap, the regression is not. |
| "I'll fix it and skip the re-review" | Unreviewed fixes are how regressions land. Every round ends scoped. |
| "One more round will converge" | Past the cap the failure is structural. Adjudicate and route. |
| "I'll note the discovery after finishing the task" | Finishing means building on the wrong spec, then paying review to defend it. Stop now. |
| "Keep the implementer going, it's only at 60%" | Past the budget its fix rounds degrade first — exactly the work that needs headroom. |
| "Ledger later" | The ledger is what survives compaction. Later is after the crash. |
