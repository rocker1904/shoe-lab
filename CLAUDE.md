# CLAUDE.md

Shoe Lab is a running-shoe comparison tool over RunRepeat's lab-test data:
a polite zero-runtime-dep TypeScript scraper writes validated, deterministic
datasets into `data/` (git is the database), and a Svelte 5 static SPA
(GitHub Pages: https://rocker1904.github.io/shoe-lab/) filters and compares
them. Refresh runs on GitHub Actions; the repo is public. Goals: useful shoe
shortlists, shareable filter URLs, near-zero maintenance, and never being a
bad citizen toward runrepeat.com.

## Start here

- `BACKLOG.md` — prioritised follow-ups; the one home for aspiration.
- `docs/README.md` — the documentation contract. Read it before writing any
  doc or comment.
- `main` is deployed continuously — what's merged is what's live (deploy
  lags a push by ~1 min; there is no separate live-state doc).

## Doc index

The only index (parity-checked by `npm run check:docs`). Read the owning doc
before working in its domain.

| Doc | Owns |
|---|---|
| docs/decisions.md | project-wide decisions: robots posture, git-as-database, testing bar |
| docs/scraping.md | pipeline, endpoints, payload formats, politeness contract, validation gates |
| docs/app.md | frontend contracts: view/URL ownership, sanitised-HTML boundary, presets, filters |
| docs/shoe-stories.md | what Easy, Tempo and Race mean to a runner, and why the thresholds follow |
| docs/operations.md | workflows, refresh model, deploy chain, contract-drift runbook |
| README.md | user-facing: what this is, attribution, quick start (not agent reference) |
| BACKLOG.md | prioritised future work |

`docs/superpowers/` (spec + plan) are frozen build-time artifacts — history,
not reference; where they disagree with docs/, docs/ wins.

## Conventions

- **Commands**: root `npm run verify` is the CI gate (check:docs + typecheck
  + lint + test:coverage — the sequence has one owner; run it before pushing)
  plus `npm run test` (no coverage, safe for filtered runs); scraper
  `npm -w scraper run scrape:metrics | scrape:details | scrape:releases |
  build:dataset | check:live` — both scrapers take `--from-corpus <dir>` to
  re-extract from local pages with no network, `scrape:metrics` rewriting the
  catalogue only (docs/scraping.md §Re-extracting from a corpus); app
  `npm -w app run dev | build | e2e` (e2e is CI's only step outside `verify` —
  needs the Playwright browser).
- **No live network in tests, ever.** Live requests happen only in the four
  scraper CLIs and `check:live`, all via `PoliteHttp` (docs/scraping.md
  §Politeness). Never call fetch directly against runrepeat.com.
- **Binding invariants** (each owned and explained in its doc — do not
  "fix" them): `{@html}` renders only the two build-time-sanitised fields
  (docs/app.md §Sanitised-HTML boundary); the Page owns view state locally
  and only writes the URL (docs/app.md §View and URL ownership);
  `build-dataset` is deterministic — no wall-clock in outputs
  (docs/scraping.md §Determinism); validation gates fail runs rather than
  write bad data (docs/scraping.md §Validation gates); a score's constants are
  frozen and never recomputed from the loaded fleet
  (docs/decisions.md §Frozen scores and live thresholds).
- **Datasets key shoes by slug**; metric values key by test id as string.
- **TDD is the norm**: failing test first for behaviour changes; suites,
  typecheck, lint green before every commit.
- **Docs ride the change**: a behaviour-changing commit updates the owning
  doc in the same commit.
- **Feature work happens in a worktree**: `~/dev/shoe-lab-<branch>`, landed in
  local `main` before anything is pushed, so `main` is only ever pushed having
  been built and verified as a whole. Land it by rebasing the branch onto
  `main` and fast-forwarding — no merge commits
  (docs/decisions.md §Linear history, no merge commits) — then remove the
  worktree and delete the branch. **Regenerate `data/` once, in the primary
  checkout, after landing** — never on the branch. A regeneration rewrites
  every record, so two branches each carrying one conflict as whole files and
  the rebase becomes unresolvable; a code-only branch rebases cleanly. This is
  a sequencing rule, not an access one — `.corpus/` is gitignored and lives in
  the primary checkout, but a worktree can read it by path
  (`--from-corpus ../shoe-lab/.corpus/pages`).
- **Commits**: concise single-line subjects, no embedded measurements;
  trailer `Co-Authored-By: <authoring model> <noreply@anthropic.com>` naming
  the model that wrote the commit (e.g. `Claude Opus 5 (1M context)`), on
  commits, never in PR descriptions.
- **Comments are WHY-only** — docs/README.md §Rules, rule 5.

## Working approach

The considered route is the faster one here. These are not style preferences;
each was learned by getting it wrong first.

- **Measure, do not reason.** Layout, spacing, typography and distribution
  questions get answered by rendering the thing and reading the result, never
  by arguing about CSS or eyeballing a description. Playwright is already a
  dependency (`node_modules/playwright`); drive it from the repo root, screenshot
  at real widths, and measure text and box sizes from the DOM. Design decisions
  made by reasoning alone have repeatedly survived review and then been wrong on
  screen.
- **State bounds as testable numbers.** "Six metric names must fit at 375px" is
  a bound; "the header should be readable" is not. Where a design implies a
  constraint, write the number down and build a rig that checks it —
  `.superpowers/audit.mjs` is one such rig, and its assertion belongs in the
  suite so upstream drift fails the build rather than clipping on a phone.
- **Check the real data before designing over it.** Distributions are not what
  they look like: price is effectively categorical (47 distinct values, five
  holding half the fleet), several metrics are 99% distinct, and coverage is
  era-shaped rather than sparse. Compute the shape before choosing an
  interaction for it.
- **Explore fully before writing anything up.** Keep offering alternatives until
  the human says they are done, not until an option looks good enough. Do not
  update specs or docs mid-design — batch the write-up after sign-off, or the
  churn outweighs the record.
- **Prefer deleting an assumption to abbreviating it.** The best fixes this
  project has found were removals: a duplicated brand line, a warning whose
  classifier was wrong, a tooltip that did not exist on mobile.
