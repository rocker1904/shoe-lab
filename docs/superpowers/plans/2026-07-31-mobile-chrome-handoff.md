# Handoff: mobile chrome, option C

Written at the end of the visual-polish session, for a fresh session to pick up.

## Where things stand

The whole-app visual redesign is **landed and pushed**. `main` is at `37682a0`
plus follow-ups. `npm run verify` and `npm -w app run e2e:docker` both exit 0
(728 app tests, 44 e2e across Chromium/Firefox/WebKit). The design is recorded
in `docs/superpowers/specs/2026-07-30-visual-polish-design.md` and the
implementation in `docs/superpowers/plans/2026-07-31-visual-polish.md`. Both
are frozen artifacts; where they disagree with `docs/`, `docs/` wins.

**This handoff covers one remaining piece of work, not a defect in that pass.**

## The problem

Below ~560px the chrome is a pile of loosely-packed groups rather than a
composition. Measured on `main` at 360px:

- Header row 1: `Shoe Lab` + `450 shoes · updated 27 Jul 2026`.
- Header row 2: a **two-line** credit block (`LAB DATA BY` / `RunRepeat ↗`)
  sitting inline with three one-line buttons. The credit reads as a label for
  `Copy link`, and the row is lumpy because one item is twice the height of
  its neighbours.
- Nothing is flush right: row 1 ends at x=320.7, row 2 at x=324.8, and both are
  **identical at 390px** — the header does not use the extra width. The toolbar
  beneath is flush (352/382), so the header floats loose above a justified bar.
- The stability caption wraps to two lines and dominates the toolbar, while
  `Filters` / `Columns` sit alone on a row with the whole left half empty.

Total: **164.8px** of chrome before any content, +33px with the story pills up.

An earlier agent "fixed" this and missed it — it corrected a spacer indent, a
flex-end on the credit's own lines and a count line one pixel from wrapping,
all real but none of them the reported problem. Treat that as the warning: the
complaint is about **composition**, and no `margin-left: auto` addresses it.

## The decision

**Option C**, chosen from three mocked alternatives. Measured **79px** at both
360 and 390 — less than half of today.

Two lines:

1. **Identity line.** Wordmark at the left margin; the count and the RunRepeat
   credit stack into one right-aligned provenance block opposite it.
2. **One control rail.** Everything pressable on a single row: the stability
   preference, the three utilities (Copy link, Export CSV, theme cycle) as
   icons, `Filters`, and `Columns` as a grid icon carrying its count badge.

The mockups were built with the brainstorming visual companion under
`.superpowers/brainstorm/` (gitignored). Re-render from the spec if they have
been cleaned up — the description above is sufficient to rebuild them.

### What C costs, and what the user accepted

Copy link, Export CSV and Columns lose their text labels at this width. That
was accepted knowingly in exchange for halving the chrome. Every one of them
keeps its accessible name — do not let an icon ship without one.

## Constraints that cannot move

- The RunRepeat attribution stays a **permanent, visible, immediately-clickable
  link** (docs/decisions.md §Be a good citizen toward RunRepeat). It may be
  restyled or relocated within the chrome. It may not be hidden, deferred,
  put behind a menu or reduced to an icon alone.
- Copy link, Export CSV, the three-state theme cycle, Filters, Columns and the
  stability preference all stay reachable.
- The stability caption may move behind its existing `?` HelpPopover at this
  width — that mechanism already exists and is the sanctioned place for an
  explanation.
- Everything in the visual-polish spec stays: Inter Tight + JetBrains Mono,
  `--accent hsl(211 84% 46%)`, `--accent-solid hsl(211 84% 44%)` wherever
  `--on-accent` sits on a fill, the wash constants (`0.15 / 1.8 / 0.94`), one
  focus ring with the `tr` exemption.
- `--thead-top` is measured and ResizeObserver-backed. Any chrome change must
  keep the pinned table header flush **after `document.fonts.ready`** — the
  webfont reflows the chrome after first paint. There is an e2e guard.
- The existing e2e guard that **chrome never adds a row as the window narrows**
  must stay green. It walks 1440→360 across all three toolbar tier boundaries.

## The open question: larger phones

**This is not designed yet and is the first thing to settle.** C was measured at
360 and 390 only. The tiers that need deciding:

- 390–430 (iPhone Pro Max, Pixel Pro) — does C simply stretch, or does the
  extra ~70px buy back a text label or two?
- 430–560 — where C should hand over to the existing middle tier.
- 560–800 — currently a separate tier; check it still composes once C lands
  beneath it. The toolbar tier boundaries are `609.98px` and `879.98px`, set to
  those exact values so a width does not match two tiers at once.

Measure before designing. Do not assume a breakpoint.

## How to work

`CLAUDE.md` §Working approach is binding and was repeatedly vindicated this
session: **measure, do not reason.** Every claim in the spec that survived was
one somebody rendered; several that were merely argued turned out wrong —
a "podium" wash ramp that blanked the mid-fleet, a two-column review layout
that came out taller than what it replaced, a focus-ring comparison staged on a
background where the treatments could not differ.

Specifically for this work:

- Drive Playwright from the repo root; screenshot at real widths and read boxes
  out of the DOM. Check both themes.
- Verify in **Firefox** as well as Chromium — the user's daily browser is
  Firefox, and the e2e run covers all three engines via `e2e:docker`
  (the host lacks WebKit's system libraries; `npm -w app run e2e:docker` is the
  sanctioned path and is the one that must be green).
- Feature work happens in a worktree at `~/dev/shoe-lab-<branch>`, landed by
  rebase and fast-forward — no merge commits. **`npm install` inside the
  worktree; do not symlink `node_modules`**, which breaks the test runner via
  Vite's `server.fs.allow`.
- Commits: single-line subjects, no embedded measurements, trailer naming the
  authoring model.
- Docs ride the change, in the same commit.

## Related open items

- **BACKLOG 13** — the add-filter dialog's scrim is provisional pending a user
  decision. It is self-contained; the exact three deletions are named at both
  sites.
- **BACKLOG 11** — `size-rating`'s unit string `3 = true` wraps to two lines on
  the phone, adding 16px to a pinned header. The label guard covers the column
  name but has never covered the unit line.
