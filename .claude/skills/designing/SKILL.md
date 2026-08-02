---
name: designing
description: Use before any creative work — a new feature, component, or behaviour change. Interview, decide, then write one spec with a build-sheet tail. Supersedes superpowers:brainstorming and superpowers:writing-plans in this project.
---

# Designing

Turn an idea into an approved spec that implementation starts from — one
document, one review pass. This project keeps its context in the repo
(CLAUDE.md, the owning docs, docs/policies.md), so a spec cites that
context instead of restating it, and it never contains the code it is
deciding about.

**Announce at start:** "Using designing to shape <the idea>."

<HARD-GATE>
No implementation — no code, no scaffolding — until the spec is approved.
Low-fidelity exploration (below) is not implementation.
</HARD-GATE>

## Before anything

Read CLAUDE.md, docs/policies.md, and the owning doc(s) for every domain
touched. Then the policy check: list which policies the work touches, and
cite them in the spec rather than re-deciding them locally. If it touches
one marked UNDECIDED, that decision happens now, with the user, and lands
in docs/policies.md (dated in docs/decisions.md). Cross-cutting gaps are
where this project's predecessors bled — a feature spec never quietly
invents link semantics, focus behaviour, vocabulary, or validation rules.

## Interview

- One question at a time: purpose, constraints, success criteria,
  explicit non-goals. Multiple choice where it helps. Wait for the answer.
- Scope check early: several independent subsystems → decompose into
  separate specs before refining any of them.
- Propose 2–3 approaches with trade-offs, recommendation first. YAGNI
  ruthlessly — every approach sheds features before it is presented.

## Exploration before precision

Where a decision depends on how something renders, performs, or
distributes, measure the real thing before writing the number down. If
the artifact does not exist yet, the spec records the bound as *"measured
at implementation; asserted in `<suite>`"* — an invented constant in a
spec is a defect, not a placeholder. Throwaway probes and sketches are
encouraged; spec only what survived them.

## The spec

Save to `docs/specs/YYYY-MM-DD-<topic>.md`. Present it section by
section, scaled to complexity, getting approval as you go.

Contents: the decisions made and why; bounds as testable numbers, each
naming the assertion's home; interfaces; failure behaviour; non-goals;
the policies cited. Not contents: restated code, step-by-step
instructions, invented measurements, copy authored for surfaces that do
not exist yet.

## The build sheet (tail of the same file)

The replacement for a separate plan:

- **File map** — create/modify, per task.
- **Interfaces** — exact signatures wherever one task's output is
  another's input. This block is how a fresh implementer learns the names
  its neighbours use.
- **Tasks** — one to three lines each: the deliverable, the acceptance
  evidence (the test or command that proves it), and pointers (owning
  doc §, spec §, policy §). A task is the smallest unit worth a
  reviewer's gate: split only where a reviewer could reject one task
  while approving its neighbour.
- **Global constraints** — one line each, exact values verbatim.
- **Sequencing notes** — only where order is genuinely at risk.

No code in the build sheet. The repo is the brief: an implementer reads
the docs the pointers name. Stated once, because it is the reason this
skill exists: plans that restate code cost more than the code, drift
before execution, and eat review rounds that belong to implementation
(evidence: project-skeleton `lessons/`).

## One review pass, then stop

1. Self-review, once: coverage (every requirement has a task),
   consistency (names and signatures agree across sections), ambiguity
   (anything readable two ways gets one reading), placeholder scan. Fix
   inline.
2. The user reads the file, once. Fold their changes.

Then stop. No further review rounds on the document — from here,
findings come from implementation review, where they attach to real code
instead of prose.

## Bedding in

These skills are new. Note every place this skill was unclear, silent,
or wrong as you work — including interview mechanics that failed (prose
attached to a question tool is not surfaced; ask in plain text) — and
report the list to the user unprompted at the end of the engagement,
with what the skill should say instead. This section retires when the
skills do.

## Terminal state

Invoke `delivering`. When a later spec supersedes this one, this one is
frozen history; docs/ wins every disagreement.
