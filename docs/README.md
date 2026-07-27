# Documentation contract

Docs in this repo exist to give an agent full context for a task in minimum
words. Words are money: the measure of the doc set is per-task read cost
(CLAUDE.md + the owning doc), not narrative completeness. This file is the
contract; the doc index lives in CLAUDE.md and nowhere else (parity-checked
by `npm run check:docs`). Sizing choices for this repo are recorded in
docs/decisions.md §Doc system.

## Rules

1. **One owner per fact.** Every fact, number, endpoint, and procedure has
   exactly one home; everywhere else points at it (syntax below). README.md
   is the sanctioned exception: it may summarise for human visitors, but
   must point at the owning doc rather than duplicating load-bearing detail
   (exact thresholds, endpoint parameters, step sequences).
2. **Forward-only.** Docs describe what is codified and why — never how we
   got here, what was tried and abandoned, or which review found what.
   History lives in git and the frozen `docs/superpowers/` artifacts.
3. **The reader is a competent agent.** Assume tool knowledge (TypeScript,
   Svelte, Vitest, Playwright, GitHub Actions). Record only what cannot be
   derived from the code plus what was expensive to derive (payload formats,
   endpoint behaviour, empirical data quirks). Never restate what a module
   or workflow file encodes — restated code is the main doc-rot vector.
4. **Decisions live with their subsystem.** Each domain doc carries a
   `## Decisions` section, one `### <name>` per decision: what was decided,
   why, and what an agent must not "fix". Project-wide decisions live in
   docs/decisions.md. Supersessions are collapsed into the current decision
   text — no layered "Update:" blocks. Enumerate all decision sections:
   `grep -rn '^## Decisions' docs/`.
5. **Comments explain WHY only** — constraints, failure modes, cross-file
   coupling, deliberate tradeoffs — for a reader who knows the tooling.
   Placement: guards one code site → comment at that site; guards several
   sites or shapes a design → the owning doc holds it and comments point
   there.
6. **Aspiration lives in BACKLOG.md only.** Committed docs describe current
   behaviour; future work is a backlog entry, not a "we should later"
   sentence in a domain doc. (This repo deploys `main` continuously, so
   there is no live-vs-codified split to track.)

## Pointer syntax

Cross-references are written `docs/<path>.md` or `docs/<path>.md §Heading`
(the § form pins a heading). One pointer per line; heading text may contain
spaces but no parentheses, backticks, quotes, semicolons, or pipes.
`npm run check:docs` resolves both forms in every tracked file and checks
CLAUDE.md's doc index against the files present, so renames and deleted
sections fail CI loudly. Prefer § pointers into long docs.

## Doc-gc (periodic review)

Run when a major phase lands or a backlog sweep happens. Per doc:
(1) `npm run check:docs` for dead refs; (2) duplication — grep load-bearing
literals (endpoints, thresholds, test ids) for second homes; (3) decisions
superseded by merged work but not collapsed; (4) compression — delete every
word that doesn't change what an agent would do; (5) comment sweep per
rule 5 over files touched since the last gc. Fix inline. This contract is
the standard to review against; if the contract itself is wrong, change it
deliberately and record why in docs/decisions.md.
