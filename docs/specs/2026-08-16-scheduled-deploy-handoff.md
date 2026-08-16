# Scheduled deploy handoff

status: delivered-and-frozen

## Purpose and scope

Restore the documented refresh chain: a changed scheduled or manual refresh
pushes its data commit, dispatches the normal CI gate, and deploys that exact
commit only after every CI job passes.

The current refresh-to-CI dispatch succeeds because `workflow_dispatch` is an
exception to `GITHUB_TOKEN` recursion suppression. CI's completion does not
then emit the `workflow_run` that `deploy.yml` expects, so the chain stops after
a green CI run. The correction makes CI explicitly dispatch Deploy and gives
Deploy the source CI run to verify before it obtains or publishes the SHA.

## Policies

- docs/policies.md §Failure posture: a deployment follows only a successful CI
  run and failure leaves the previous Pages deployment live.
- docs/policies.md §Third parties and cost: the chain remains credential-free
  and uses only GitHub Actions and Pages.
- docs/decisions.md §Free tools only: no PAT, deploy key, GitHub App, or paid
  service is introduced.
- docs/decisions.md §Testing bar: adversarial, no live network: the repository's
  workflow checker rejects a dispatch path that can select an unproved SHA.

No policy is undecided and no policy changes.

## Decisions

### CI explicitly dispatches Deploy

`ci.yml` gains one final job that needs every existing CI job. It runs only for
`push` and `workflow_dispatch` runs on `main`, then dispatches `deploy.yml` with
its own run ID. Pull-request and non-main manual CI runs never dispatch.

This replaces `deploy.yml`'s `workflow_run` trigger for both code pushes and
refresh-dispatched CI. One explicit path avoids maintaining separate trust and
SHA-selection rules for human and token-authored commits. The dispatched
Deploy run is independent of CI's cancel-in-progress group and retains the
Pages group's no-cancel behavior.

### Deploy derives the SHA from a proved CI run

`deploy.yml` accepts one required `source_run_id` dispatch input. A read-only
validation job reads that run from the repository's Actions API, rejects an
ineligible workflow before waiting, then waits for an eligible in-progress run
to complete. It accepts only a successful `CI` workflow run from this
repository, on `main`, whose source event was `push` or `workflow_dispatch`.
The verified run's `head_sha` is the only checkout ref; no caller supplies a
deployment SHA.

This validation keeps a direct or mistaken manual Deploy dispatch from
bypassing CI. The Pages-privileged deployment job needs the validation job, so
a rejected source run fails before checkout, build, artifact upload, or Pages
permissions. Rerunning an accepted Deploy run revalidates the same immutable
CI run and SHA.

### The refresh workflows remain credential-free

Both refresh workflows continue to push and dispatch CI with `GITHUB_TOKEN`.
CI uses its own job-scoped `actions: write` permission for the Deploy dispatch;
Deploy's validation job uses `actions: read`; its separate deployment job keeps
only the existing contents, Pages and identity permissions. No standing
credential or secret is added.

## Success bounds

- A successful `push` or `workflow_dispatch` CI run on `main` dispatches Deploy
  only after `full-suite` and `classic-scrollbars` both pass.
- Deploy checks out exactly the accepted source run's `head_sha`.
- A failed or cancelled CI run, a pull-request CI run, a non-main run, a run of
  another workflow, or a run from another repository cannot publish Pages.
- A changed refresh still dispatches the same CI workflow; an unchanged
  refresh still ends without CI or Deploy.
- Pages concurrency remains `cancel-in-progress: false`.
- `npm run check:workflows` and `npm run verify` are green.

## Failure behavior

If either CI job fails or is cancelled, the deploy-dispatch job does not run.
If the dispatch itself fails, CI is red and Pages remains unchanged. If Deploy
cannot verify the source run or the source is not eligible, Deploy fails before
checkout and publication. Existing Pages content remains live in every case.

## Build sheet

### File map

| Task | File | Change |
|---|---|---|
| 1 | `scripts/check-workflows.mjs` | Guard the explicit CI dispatch, source-run input, eligibility checks, and verified-SHA checkout. |
| 1 | `.github/workflows/ci.yml` | Dispatch Deploy after every CI job succeeds on eligible `main` runs. |
| 1 | `.github/workflows/deploy.yml` | Verify the source CI run and derive its checkout SHA. |
| 1 | `docs/operations.md` | Own the corrected refresh/deploy chain, trust boundary, permissions, and failure behavior. |
| 2 | `docs/specs/2026-08-16-scheduled-deploy-handoff.md` | Freeze the delivered spec. |

### Interface

`deploy.yml` exposes one required `workflow_dispatch` string input named
`source_run_id`. `ci.yml` supplies `github.run_id`; Deploy exposes the verified
source run's `head_sha` from its read-only validation job as a job output and
passes only that output to `actions/checkout` in the Pages-privileged job.

### Tasks

1. **Restore the proved deploy handoff.** First change `check:workflows` so it
   fails against the current indirect chain, then add the final CI dispatch,
   source-run validation, verified checkout, and matching operations text in
   one behavior commit. Acceptance: the workflow guard reddens before the
   workflow edits and passes afterwards; `npm run verify` is green.

2. **Land and freeze.** After implementation and whole-branch review, rebase
   and fast-forward onto clean local `main`, freeze this spec, rerun the gates,
   and push the verified main branch so the repair is active before the next
   schedule. Acceptance: local and remote `main` name the reviewed commit,
   history is linear, and the worktrees are clean.

### Global constraints

- Deploy selects no caller-provided SHA.
- Only a completed, successful `CI` run for `main` in this repository is
  eligible, and only when its event is `push` or `workflow_dispatch`.
- The Deploy dispatch happens only after both existing CI jobs pass.
- Pull requests never reach Pages permissions or Deploy code execution.
- `GITHUB_TOKEN` remains the only automation credential.
- Pages deployments are never cancelled in progress.
- No data regeneration, dependency, scraper request, or app behavior change.

### Sequencing notes

- The feature branch is workflow-and-docs only; it never regenerates `data/`.
- Task 1 owns all behavior and receives one implementation review. Task 2 is
  only final review, spec freeze, verification, linear landing, and push.
