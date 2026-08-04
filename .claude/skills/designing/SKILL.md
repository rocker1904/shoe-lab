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

Then the registry sweep: list every registry, allowlist, exemption
table, token grammar, and counted claim that quantifies over things like
the feature — each one found is a file-map entry; each one missed is a
finding someone else pays to make. The categorical-filters delivery hit
this class four times, including its only Critical (a URL token that
never joined the arrival registry), and all four were findable at design
time by asking this one question. **A doc list that claims completeness
is a registry too** — a section enumerating "every token", "every field",
"every key this app owns" goes stale exactly like an allowlist, and
nothing fails when it does. The URL-shorthand delivery shipped its two
new tokens absent from the one doc paragraph promising to name them all,
and only the whole-branch review caught it.

## Interview

- One question at a time: purpose, constraints, success criteria,
  explicit non-goals. Multiple choice where it helps. Wait for the answer.
  Ask in plain text — prose attached to a question tool is not surfaced
  to the user, and options truncate; the reasoning belongs in the message.
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

The file is born **`status: drafted, awaiting review`** and stays that
way until the user says otherwise. A status line is a claim about what
the user has done, not a label for how finished the document feels —
writing `approved` before they have read it asserts something untrue
about them, and the next skill takes the line at its word.

Contents: the decisions made and why; bounds as testable numbers, each
naming the assertion's home; interfaces; failure behaviour; non-goals;
the policies cited. Not contents: restated code, step-by-step
instructions, invented measurements, copy authored for surfaces that do
not exist yet. Where the spec invokes an existing rule ("the brand
facet's counting rule, generalised"), point at the owning doc section
and state only the deltas — a paraphrase is where mechanisms fall out;
the fleet seed dropped from exactly such a paraphrase and cost two
review rounds to restore.

## The build sheet (tail of the same file)

The replacement for a separate plan:

- **File map** — create/modify, per task, the owning doc included: docs
  ride the behaviour commit that changes them, so **there is no trailing
  documentation task**. What genuinely belongs to no single task — a
  dated decision entry, a policy line, a backlog closure — is all a final
  one may carry. A file map is a hypothesis, not a checklist; expect the
  first task to disprove part of it.
- **Interfaces** — exact signatures wherever one task's output is
  another's input. This block is how a fresh implementer learns the names
  its neighbours use.
- **Tasks** — one to three lines each: the deliverable, the acceptance
  evidence (the test or command that proves it), and pointers (owning
  doc §, spec §, policy §). A task is the smallest unit worth a
  reviewer's gate: split only where a reviewer could reject one task
  while approving its neighbour. **Where the deliverable is a guard over
  an invariant that already holds, the evidence is mutation** — break the
  invariant, watch it redden, revert — never a failing test first, which
  is incoherent for a guard and can only be satisfied by breaking the
  code the task is not about.
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
   (anything readable two ways gets one reading), placeholder scan,
   **satisfiability**. Fix inline.

   Satisfiability is the one that hides: for each bound, name the
   mechanism that would *produce* the state it asserts. A bound whose
   state nothing can reach is a defect, not a gap — it will be written,
   quietly skipped, and found at the end by whoever checks the bounds
   against the tree. One shipped that way here: a round trip was demanded
   for a pair of tokens the encoder can never emit together, and it
   survived the author, eight task reviews and the implementer before
   the whole-branch review named it.
2. The user reads the file, once. Fold their changes, then **ask for
   approval in plain words and wait for it**. Their yes is the only
   thing that rewrites the status line to `approved, in delivery`.
   Silence is not a yes, folding their changes is not a yes, and "no
   further comments" on one section is not a yes to the file.

Then stop. No further review rounds on the document — from here,
findings come from implementation review, where they attach to real code
instead of prose.

## Bedding in

These skills are new. Note every place this skill was unclear, silent,
or wrong as you work, and report the list to the user unprompted at the
end of the engagement, with what the skill should say instead. This
section retires when the skills do.

## Terminal state

Invoke `delivering` **only once the status line reads
`approved, in delivery`**, which the review pass above is the only way
to reach. A spec still reading `drafted, awaiting review` is not a
terminal state: stop there and wait for the user, however finished the
document looks to you. `delivering`'s finish step then flips the line to
delivered-and-frozen — a live spec outliving its delivery is how a
build sheet gets re-run against a world it no longer describes. Once
frozen (or superseded), it is history; docs/ wins every disagreement.
