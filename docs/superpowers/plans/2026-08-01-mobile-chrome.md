# Mobile chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the chrome below 800px as three bands, drop the desktop toolbar's second row, and give the app one About panel that owns every word of explanation the chrome currently scatters across three `?` popovers.

**Architecture:** `Header.svelte` becomes an identity banner below 800px (wordmark opposite a right-aligned provenance block) and keeps today's masthead above it. `Toolbar.svelte` grows a second row below 700px — a control row for things that act on the table, a setup row for what the table is — and merges them into one line above 700px. The stability checkbox becomes a segmented pill standing with the zone and story groups. A new `AboutDialog.svelte` (modelled on `AddFilterDialog.svelte`, not `HelpPopover.svelte`) carries all the explanation; `HelpPopover.svelte` is deleted.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + @testing-library/svelte (jsdom), Playwright (chromium/firefox/webkit via `e2e:docker`). No runtime dependency beyond Svelte.

**Spec:** docs/superpowers/specs/2026-07-31-mobile-chrome-design.md — read it before Task 1. Where this plan and the spec disagree, the spec wins; where either disagrees with `docs/`, `docs/` wins.

## Global Constraints

- **Read CLAUDE.md first.** Its §Conventions and §Working approach are binding, not advisory.
- **Docs ride the change.** A behaviour-changing commit updates the owning doc (`docs/app.md` for everything here) in the same commit. `npm run check:docs` fails on a broken `§` pointer.
- **Comments are WHY-only** — constraints, failure modes, cross-file coupling, deliberate tradeoffs. Never restate what the code says (docs/README.md §Rules, rule 5).
- **TDD**: failing test first, watch it fail for the stated reason, minimal implementation, watch it pass, commit.
- **Commits**: concise single-line subject, no embedded measurements, trailer `Co-Authored-By: <authoring model> <noreply@anthropic.com>`.
- **No live network in tests, ever.**
- **Measure, do not reason.** Layout claims are settled by rendering at real widths and reading boxes out of the DOM, never by arguing about CSS. Drive Playwright from the repo root (`node_modules/playwright` is there); check Chromium **and Firefox**. The one-off rigs below are throwaway — write them in your session scratchpad, never in the repo, and never in `/tmp`. Each needs `npm -w app run dev` already serving — **read the port off the Vite banner rather than assuming 5173**, which it will not use if something else already holds it. Inside `page.evaluate`, await `document.fonts.ready.then(() => null)` rather than the bare promise: it resolves to a `FontFaceSet`, and the repo's own e2e cases say why in a comment.
- **Tokens only.** No raw colour literals in a component style block — `tokens.test.ts` fails the build on one. Spacing uses `--s1..--s6`, radii `--r-sm/--r-md/--r-full`, type `--t-xs..--t-xl`.
- **`--accent-solid`, not `--accent`, wherever `--on-accent` sits on a fill** (docs/app.md §Theming).
- **Every icon-only control keeps the accessible name its worded form had.** No exceptions, at any width.
- **The RunRepeat attribution stays a permanent, visible, immediately-clickable link** (docs/decisions.md §Be a good citizen toward RunRepeat). It may move within the chrome; it may never be hidden, deferred, put behind a menu, or reduced to an icon alone.
- **Tier boundaries take the `.98` convention** so no width matches two tiers: `429.98px`, `699.98px`. `800px` is the existing sidebar boundary and is reused **unchanged** — exactly 800 stays "mobile", as today. The spec's fourth boundary, `374.98px`, is **not** built: Task 7 shows by measurement that the pill padding has to step at `429.98px` instead, and two boundaries doing one job is what that task deletes.
- **Never write a `min-width` twin of a `max-width` boundary.** The two are meant to be complements and are not: every fractional width between them matches neither, which browser zoom and Firefox's fractional viewport widths both produce. One query, and its complement is the unqueried default.
- **Gate before every push:** `npm run verify` (check:docs + typecheck + lint + test:coverage), then `npm -w app run e2e:docker`. The host lacks WebKit's system libraries, so `e2e:docker` is the sanctioned path for the whole suite and is the one that must be green (docs/operations.md §The e2e run needs three browsers). **Every guard this plan adds lands in `smoke.spec.ts`, which `playwright.config.ts` runs in Chromium only** — the other two engines run `cross-browser.spec.ts` alone. So "e2e green" never means "checked in three engines", and the Firefox readings this plan asks for come from the hand-driven rigs, not from the suite. A single spec can be run on the host without Docker: `npm -w app run e2e -- --grep "<name>" --project=chromium` (Chromium and Firefox launch natively here; only WebKit does not).
- **Feature work happens in a worktree** at `~/dev/shoe-lab-<branch>`, `npm install` inside it (do **not** symlink `node_modules` — it breaks the test runner via Vite's `server.fs.allow`). Land by rebase and fast-forward, no merge commits. Do **not** regenerate `data/` on the branch.

---

## File Structure

**Created**
- `app/src/components/AboutDialog.svelte` — the modal panel and all of its copy. One responsibility: render the explanation and dismiss itself.
- `app/src/components/AboutDialog.test.ts` — its unit tests.
- `app/src/components/icons.ts` — the new glyphs' path data (copy, export, filters, columns) as one typed constant, so a glyph cannot drift between the worded template and the icon one. Path data, never whole SVG documents: a whole document would need `{@html}`, and this app has exactly two sanctioned sinks (docs/app.md §Sanitised-HTML boundary).

**Modified**
- `app/src/components/Header.svelte` — banner below 800px; masthead unchanged above; hosts the worded utilities. Loses `theme`, `onexport` and `ontheme` in Task 5.
- `app/src/components/Toolbar.svelte` — two rows below 700px, one above; stability pill; About button; hosts the icon utilities.
- `app/src/Page.svelte` — owns `aboutOpen`, renders `AboutDialog`, owns the utilities snippet and the `mobile` rune that decides which host mounts it, and owns the clipboard copy that used to live in the header.
- `app/src/components/SetupStrip.svelte` — `?` popovers out, "New here?" line in.
- `app/src/components/ColumnPicker.svelte` — the summary becomes an icon plus its badge below 800px.
- `app/src/components/MonthPicker.svelte` — one z-index comment names the deleted component.
- `app/src/components/ZoneToggle.svelte` — one media block, so the zone pills tighten with the story pills on the flush band (Task 7). Its buttons' padding is authored here, so no rule in `Toolbar.svelte` can reach it.
- Tests: `Header.test.ts`, `Toolbar.test.ts`, `SetupStrip.test.ts`, `Page.test.ts`, `app/e2e/smoke.spec.ts`.
- `docs/app.md` — the owning doc for every behaviour here.
- `BACKLOG.md` — the per-metric-help item argues from a mechanism this change deletes.

**Deleted**
- `app/src/components/HelpPopover.svelte` — no consumer survives Task 4. It has no test file of its own; what covered it lives in `Toolbar.test.ts`, `SetupStrip.test.ts` and two `smoke.spec.ts` cases, all of which Tasks 3 and 4 rewrite.

---

### Task 1: The About panel

**Files:**
- Create: `app/src/components/AboutDialog.svelte`
- Create: `app/src/components/AboutDialog.test.ts`
- Modify: `docs/app.md` (add §The About panel)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AboutDialog` with exactly one prop — `onclose: () => void`. It renders a scrim and a `role="dialog" aria-modal="true" aria-label="About this table"` node, both mounted into `<body>`. Later tasks only ever do `{#if aboutOpen}<AboutDialog onclose={() => (aboutOpen = false)} />{/if}`.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/AboutDialog.test.ts`:

```ts
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AboutDialog from './AboutDialog.svelte';
import { SCORE_DEFS } from '../lib/score-defs';

describe('AboutDialog', () => {
  it('is a modal dialog named for what it explains', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog', { name: 'About this table' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
  });

  // Three sections, one per control on the setup row it explains. The headings are the labels the
  // reader has already seen on screen, so the panel reads as a key to that row.
  it('carries one section per control on the setup row', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog');
    for (const heading of ['Measured at', 'Easy, Tempo and Race', 'Stability']) {
      expect(within(dlg).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  // `story` is this project's word for a preset, not a runner's. It appears nowhere a runner reads.
  it('never says story', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    expect(screen.getByRole('dialog').textContent).not.toMatch(/story|stories/i);
  });

  // The claim "every number here was measured rather than given by a reviewer" is contradicted
  // twice on the same screen: the RunRepeat Score column is a reviewer's verdict, and the Easy,
  // Tempo and Race columns are computed by us. The panel distinguishes the two instead.
  it('says whose each score is rather than claiming everything is measured', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent(/RunRepeat Score column is their verdict, not ours/i);
    expect(dlg.textContent).not.toMatch(/every number/i);
  });

  it('states what the scores exclude and why a shoe can have none', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent(/price and release date are not factored in/i);
    expect(dlg).toHaveTextContent(/unscored, and sorts last/i);
  });

  // The attribution is structural, not decorative (docs/decisions.md §Be a good citizen toward
  // RunRepeat): a panel that talks about whose data this is links to them.
  it('links to RunRepeat', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const link = within(screen.getByRole('dialog')).getByRole('link', { name: /RunRepeat/ });
    expect(link).toHaveAttribute('href', 'https://runrepeat.com/catalog/running-shoes');
  });

  // The Stability section names Easy and Tempo by hand, where the caption it replaces derived them
  // from the definitions that declare a stable variant. Prose is worth the trade — but a fourth
  // stable story would leave the panel quietly claiming two, so the derivation becomes a guard
  // instead of an interpolation, failing here with the sentence to edit rather than in a reader's
  // face (docs/app.md §The story scores).
  it('names by hand exactly the stories that declare a stable variant', () => {
    expect(SCORE_DEFS.filter((d) => d.stable).map((d) => d.id)).toEqual(['easy', 'tempo']);
  });

  it('closes on the Close button, on Escape and on an outside press', async () => {
    const onclose = vi.fn();
    render(AboutDialog, { props: { onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledTimes(1);

    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(2);

    await fireEvent.click(screen.getByTestId('about-scrim'));
    expect(onclose).toHaveBeenCalledTimes(3);
  });

  // `aria-modal` tells a screen reader the rest of the page is inert; without a trap, Tab walks
  // straight out of it and the promise is a lie. The panel holds exactly two stops — the credit
  // link and Close — so a Tab from either end has to land on the other rather than on `<body>`.
  it('traps Tab inside itself and opens on the Close button', async () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /RunRepeat/ }));
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm -w app run test -- AboutDialog`
Expected: FAIL — `Failed to resolve import "./AboutDialog.svelte"`.

- [ ] **Step 3: Write the component**

Create `app/src/components/AboutDialog.svelte`. The dismissal, focus trap, `<body>` mount and z-index are `AddFilterDialog.svelte`'s solved problems — take them rather than inventing a second set (docs/app.md §Stacking order):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let { onclose }: { onclose: () => void } = $props();

  let panel = $state<HTMLElement | null>(null);
  let closeBtn = $state<HTMLButtonElement | null>(null);

  /** Mounted on `<body>`: nested in the pinned chrome its z-index would be measured against that
   *  sticky ancestor's children rather than the page (docs/app.md §Stacking order). */
  function toBody(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Close rather than the credit link: this panel is prose with two stops in it, and the one a
    // reader arrives wanting is the way out. Landing on the link would put a keyboard user one Tab
    // from leaving the page instead.
    closeBtn?.focus();
    return () => opener?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // Not stopped: this node lives in `<body>`, so the filter drawer's key handler is not on its
      // bubble path and there is no second dismissal to suppress.
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...(panel?.querySelectorAll<HTMLElement>('a, button') ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" data-testid="about-scrim" onclick={onclose} use:toBody></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="About this table"
     onkeydown={onkeydown} bind:this={panel} use:toBody>
  <h2>About this table</h2>
  <!-- The body scrolls and the title and foot do not, so Close is reachable without scrolling to
       it — the panel is prose read whole rather than a list scrolled through. -->
  <div class="body">
    <p class="lede">Shoe Lab compares running shoes on RunRepeat's lab tests.</p>

    <section>
      <h3>Measured at</h3>
      <p>Stack, energy return, shock absorption and midsole width are measured at the heel and at
        the forefoot. Pick which end the table and scoring use — usually the one you land on.</p>
    </section>

    <section>
      <h3>Easy, Tempo and Race</h3>
      <ul>
        <li>Each score transforms and weights the lab metrics that matter for that kind of run, and
          sets the columns to match. All clears them.</li>
        <li>Price and release date are not factored in.</li>
        <li>Expand a row for the breakdown. A shoe missing a metric is unscored, and sorts last.</li>
        <li>The RunRepeat Score column is their verdict, not ours.</li>
      </ul>
    </section>

    <section>
      <h3>Stability</h3>
      <p>Adds midsole width and heel counter stiffness to the Easy and Tempo scores. Not Race: race
        shoes are all tall and narrow.</p>
    </section>
  </div>
  <div class="foot">
    <a href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">Lab data by RunRepeat ↗</a>
    <button type="button" class="close" onclick={onclose} bind:this={closeBtn}>Close</button>
  </div>
</div>

<style>
  /* Same layer as the add-filter dialog, for the same reason: over the filter drawer's 30, under
     the skip link's 40 (docs/app.md §Stacking order). `border-box` is load-bearing — `92vw` is
     meant to be the whole dialog, and measured content-box the padding and border land on top of
     it and clip both corners off a 360px screen. */
  .dialog {
    position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 35;
    box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--s3); width: min(28rem, 92vw); max-height: 80vh;
    padding: var(--s4); background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-dialog);
  }
  .scrim { position: fixed; inset: 0; z-index: 32; background: var(--scrim); }
  @media (prefers-reduced-motion: no-preference) {
    .scrim { animation: fade 200ms ease-out; }
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  h2 { margin: 0; font-size: var(--t-lg); }
  .body { overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: var(--s2); }
  section { display: flex; flex-direction: column; gap: 3px; }
  h3 { margin: 0; font-size: var(--t-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-dim); }
  p { margin: 0; font-size: var(--t-sm); line-height: 1.5; }
  .lede { color: var(--text-dim); }
  ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--s1); }
  li { font-size: var(--t-sm); line-height: 1.45; padding-left: 13px; position: relative; }
  li::before { content: ''; position: absolute; left: 3px; top: 8px; width: 4px; height: 4px;
               border-radius: var(--r-full); background: var(--divider); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s3);
          border-top: 1px solid var(--border-soft); padding-top: var(--s3); }
  .foot a { font-size: var(--t-xs); color: var(--text-dim); text-decoration: none; }
  .foot a:hover { color: var(--accent); }
  .close { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
           border-radius: var(--r-sm); background: var(--surface); color: var(--text);
           font: inherit; font-size: var(--t-sm); }
  .close:hover { background: var(--accent-dim); }
</style>
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm -w app run test -- AboutDialog`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the fit rig — it is run in Task 2**

jsdom has no layout, so this cannot be a unit test. It also cannot be run yet: the only way into the panel is the button Task 2 adds. Write `about-fit.mjs` in your scratchpad now, so the bound is recorded with the copy it constrains, and run it at Task 2 Step 5.

```js
import { chromium } from './node_modules/playwright/index.mjs';
// 390x844 is most phones, 390x667 the SE, 900x740 a half-screen desktop window.
const SIZES = [[390, 844], [390, 667], [900, 740]];
const browser = await chromium.launch();
for (const [width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://localhost:5173/');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'About' }).click();      // available from Task 2 on
  const over = await page.evaluate(() => {
    const b = document.querySelector('[role="dialog"] .body');
    return Math.max(0, b.scrollHeight - b.clientHeight);
  });
  console.log(width, 'x', height, '->', over, 'px of scroll');
  await page.close();
}
await browser.close();
```

Expected once Task 2 has wired the button: `0` at 390×844 and 900×740. A few pixels at 390×667 is accepted by the spec. **If 390×844 scrolls at all, cut copy rather than raising `max-height`** — 80vh matches the add-filter dialog and the spec chose it deliberately.

- [ ] **Step 6: Document it**

In `docs/app.md`, add a `## The About panel` section: what it owns (the whole explanation), that it is the `AddFilterDialog` pattern rather than `HelpPopover`'s, its two entry points (Task 2 and Task 4), and the one bound worth keeping — the body does not scroll at 390×844. Do not restate the copy; the component owns it. Say one more thing, because it is the deliberate loss in this task: the Stability sentence names Easy and Tempo **by hand** where the caption it replaces derived them, and the guard in `AboutDialog.test.ts` is what stops a fourth stable story making the panel false.

Add one sentence to `docs/app.md` §Stacking order too: this dialog takes the add-filter dialog's own 35 over 32 rather than a layer of its own, because the two can never be open at once. The reason is the modality, not the drawer — above 800px the sidebar is permanent and both openers sit on surfaces that are simply part of the page. Each dialog lays its own scrim at 32 over everything else and traps Tab inside itself, so whichever is up puts the other's opener behind a scrim and out of reach.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/AboutDialog.svelte app/src/components/AboutDialog.test.ts docs/app.md
git commit -m "Give the app one place that explains itself"
```

---

### Task 2: The About button, and Page owning the panel

**Files:**
- Modify: `app/src/components/Toolbar.svelte` (the `.actions` group)
- Modify: `app/src/Page.svelte`
- Modify: `app/src/components/Toolbar.test.ts`, `app/src/Page.test.ts`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: `AboutDialog` from Task 1 (`onclose: () => void`).
- Produces: `Toolbar` gains one prop, `onabout: () => void`, and renders `<button type="button" class="about">About</button>` as the **first** item of `.actions`. `Page.svelte` holds `let aboutOpen = $state(false)`.

- [ ] **Step 1: Write the failing tests**

Add to `app/src/components/Toolbar.test.ts` — note `props` needs `onabout: vi.fn()` adding to the shared object at the top of the file:

```ts
it('offers the way in before the controls that open panels', async () => {
  const onabout = vi.fn();
  const { container } = render(Toolbar, { props: { ...props, onabout } });
  const about = screen.getByRole('button', { name: 'About' });
  // First of the group, not merely present: it is the one a reader might need before they know
  // what Filters and Columns are for.
  expect(container.querySelector('.actions')!.firstElementChild).toBe(about);
  await fireEvent.click(about);
  expect(onabout).toHaveBeenCalled();
});

// It explains the table rather than acting on it, so it is present on the landing screen too —
// which is the one screen where a reader does not yet know what any of this is.
it('offers About while the setup strip still holds the questions', () => {
  render(Toolbar, { props: { ...props, showGroups: false } });
  expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
});
```

Add to `app/src/Page.test.ts` (inside the existing top-level describe that renders `Page`):

```ts
// `getBy`, not `findBy`: `Page` renders synchronously here and the suite runs under fake timers,
// so a `waitFor` would be an unnecessary dance with the clock. Every test in this file does the same.
it('opens the About panel from the toolbar and hands focus back on close', async () => {
  render(Page, { props: { data } });
  const about = screen.getByRole('button', { name: 'About' });
  // jsdom's synthetic click does not move focus the way a real one does, and the dialog hands
  // focus back to whatever held it — so the trigger has to actually hold it first.
  about.focus();
  await fireEvent.click(about);
  expect(screen.getByRole('dialog', { name: 'About this table' })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog', { name: 'About this table' })).toBeNull();
  expect(about).toHaveFocus();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm -w app run test -- Toolbar Page`
Expected: FAIL — `Unable to find role="button" and name "About"`.

- [ ] **Step 3: Implement**

In `app/src/components/Toolbar.svelte`, add `onabout: () => void` to the props type and destructuring, and put the button first in `.actions`:

```svelte
<div class="actions">
  <!-- First of the pair that opens a panel, because it is the one a reader might need before they
       know what Columns is for. -->
  <button type="button" class="about" onclick={onabout}>About</button>
  <button type="button" class="filters-toggle" aria-expanded={showFilters} aria-controls="filter-sidebar"
          onclick={onfilters}>Filters</button>
  {@render columns?.()}
</div>
```

Style it as the sixth carrier of the one secondary-button treatment — same rule as `.filters-toggle`:

```css
  .about { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
           background: var(--surface); color: var(--text); border-radius: var(--r-sm);
           font-size: var(--t-sm); white-space: nowrap; }
  .about:hover { background: var(--accent-dim); }
```

In `app/src/Page.svelte`, add the state, pass the handler, and render the dialog after `.chrome` (never inside it — it mounts itself to `<body>` anyway, and a sticky ancestor would make its z-index meaningless):

```svelte
  let aboutOpen = $state(false);
```

```svelte
  <Toolbar ... onabout={() => (aboutOpen = true)} ... >
```

```svelte
{#if aboutOpen}
  <AboutDialog onclose={() => (aboutOpen = false)} />
{/if}
```

with `import AboutDialog from './components/AboutDialog.svelte';` beside the other component imports.

- [ ] **Step 4: Run and watch them pass**

Run: `npm -w app run test -- Toolbar Page`
Expected: PASS.

- [ ] **Step 5: Run Task 1 Step 5's fit check for real**

Now the button exists, run the `about-fit.mjs` rig against `npm -w app run dev`. Expected `0` at 390×844 and 900×740.

- [ ] **Step 6: Document it**

`docs/app.md` §The toolbar: `About` is the first of the actions group and is on the bar at **every** width, strip up or down — it explains the table rather than acting on it, so the one screen where a reader knows least is the one screen it must not be missing from. Name the entry point; §The About panel owns the panel itself.

- [ ] **Step 7: Commit**

```bash
git add app/src docs/app.md
git commit -m "Put the way in on the bar that is always there"
```

---

### Task 3: The stability preference becomes a pill

**Files:**
- Modify: `app/src/components/Toolbar.svelte`
- Modify: `app/src/components/Toolbar.test.ts`, `app/src/Page.test.ts:138`, `app/e2e/smoke.spec.ts:255,258,259,272,283,284,336,344,345,689,695,730`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: `AboutDialog`'s Stability section (Task 1) — it is now the only place the caption's sentence lives.
- Produces: the preference renders as `<button type="button" class="s pill" aria-pressed={stability}>Stability</button>`, inside a `.seg.one` track so it reuses the groups' own paint. Its accessible name is exactly `Stability`. The props `stability: boolean` and `onstability: (v: boolean) => void` are unchanged, so `Page.svelte` needs no edit.

- [ ] **Step 1: Write the failing tests**

In `app/src/components/Toolbar.test.ts`, replace the whole `describe('Toolbar stability preference', ...)` block with the four tests below. That block holds the only `tick` caller in the file — **drop `import { tick } from 'svelte';` with it**, or lint fails on an unused import.

```ts
describe('Toolbar stability preference', () => {
  // A pill in the same family as the two groups it stands with, rather than a checkbox left among
  // them. `aria-pressed` is what makes a toggle button say which state it is in.
  it('is a toggle pill that reports the change', async () => {
    let got: boolean | undefined;
    render(Toolbar, { props: { ...props, stability: false, onstability: (v: boolean) => { got = v; } } });
    const pill = screen.getByRole('button', { name: 'Stability' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    await fireEvent.click(pill);
    expect(got).toBe(true);
  });

  it('shows the preference as pressed when it is on', () => {
    render(Toolbar, { props: { ...props, stability: true } });
    expect(screen.getByRole('button', { name: 'Stability' })).toHaveAttribute('aria-pressed', 'true');
  });

  // The caption and the `?` are gone: their words are the About panel's, and a second copy would
  // drift from it. The bar is 21px shorter for the `?` alone and a whole row for the caption.
  it('carries no checkbox, no caption and no help popover', () => {
    render(Toolbar, { props: { ...props } });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/adds midsole width/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^About the/ })).toBeNull();
  });

  // It stands with the zone and story groups, not with the controls that open panels.
  it('sits on the setup row with the groups, not among the actions', () => {
    const { container } = render(Toolbar, { props: { ...props } });
    expect(container.querySelector('.setup .pill')).not.toBeNull();
    expect(container.querySelector('.actions .pill')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run test -- Toolbar`
Expected: FAIL — `Unable to find role="button" and name "Stability"`.

- [ ] **Step 3: Implement**

In `app/src/components/Toolbar.svelte`:

1. Delete `SCORE_LABEL`, `SCORE_HELP`, the `HelpPopover` import, `STABLE_STORIES`, `listed` **only if nothing else uses them** — check first: `STABLE_STORIES`/`listed` also feed the caption, which is going, so both go with it. `STABLE_STORIES` is the file's only reader of `SCORE_DEFS`, so **that import goes too** — typecheck and lint both fail on it otherwise. `PRESETS` stays: `STORIES` still reads it.
2. Replace the whole `.stability` block with the pill, inside a new `.setup` wrapper that also holds the two groups. The `.sep` hairline goes **here**, markup and rules together, rather than being left dangling for Task 7: with the pill joining the run, a line between the first and second of three groups reads as arbitrary, and no band below 800px has one (spec §Decisions — the group divider goes).

```svelte
<div class="toolbar" class:no-groups={!showGroups} data-testid="toolbar">
  <div class="setup">
    {#if showGroups}
      <div class="zone-wrap"><ZoneToggle {zone} onchange={onzone} /></div>
      <div class="pace-wrap">
        <span class="seg" role="radiogroup" aria-label="Built for" use:roving>
          {#each STORIES as s (s.id)}
            <button type="button" role="radio" class="s" aria-checked={selected === s.id}
                    class:on={selected === s.id} onclick={() => onstory(s.id)}>{s.label}</button>
          {/each}
        </span>
      </div>
      <!-- A property of the runner rather than of the search, so it rides the bar rather than the
           strip — but it answers a third question about the same table, so it is drawn as one pill
           in the same family rather than as a checkbox standing among segmented groups. -->
      <span class="seg one">
        <button type="button" class="s pill" aria-pressed={stability}
                class:on={stability} onclick={() => onstability(!stability)}>Stability</button>
      </span>
    {/if}
  </div>
  <!-- unchanged from Task 2: About, Filters, the column picker, then the utilities host -->
  <div class="actions">…</div>
</div>
```

3. The pill reuses `.seg`/`.s`/`.s.on` verbatim, so the fill is already `--accent-solid` under `--on-accent`. Add only:

```css
  /* One control in a track sized for a group: the padding is the group's, so the pill lines up with
     the pills beside it rather than sitting in a tighter box of its own. */
  .seg.one { padding: 2px; }
  /* Provisional until Task 7 lays the ladder over it — the wrapper has to exist for the pill to
     stand in, and Task 7's `.setup` rule supersedes this one. */
  .setup { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
```

4. Delete the now-dead rules: `.sep`, `.stability`, `.pref`, `.stability label`, `.stability small`, `.toolbar.no-groups .stability`, the whole `@media (max-width: 879.98px)` block (its two survivors, `.sep { display: none }` and `.actions { order: 1 }`, are about a hairline that is gone and an order Task 7 restates), and `.stability { order: 2 }` inside the 800px block. Svelte warns on an unused selector, so anything missed here shows up as a build warning rather than silently.

- [ ] **Step 4: Update the other call sites — including two the checkbox's *element* is wired into**

`app/src/Page.test.ts:138`:

```ts
    await fireEvent.click(screen.getByRole('button', { name: 'Stability' }));
```

`app/e2e/smoke.spec.ts` — the three `checkbox` queries at :689, :695 and :730. `.check()` is a checkbox verb and does not exist on a button, so :689 and :730 become:

```ts
  await page.getByRole('button', { name: 'Stability' }).click();
```

and the assertion at :695 becomes:

```ts
  await expect(page.getByRole('button', { name: 'Stability' })).toHaveAttribute('aria-pressed', 'true');
```

**Three further e2e sites read markup this task deletes** — the `.stability` box and the `.sep` hairline — and they are not rewritten until Task 8, so strip the readings out now rather than leaving the suite red across five tasks:

- `smoke.spec.ts:258` — drop `stabY` from `boxes()`, and with it the assertion at :283 (`expect(mid.stabY).toBeGreaterThan(mid.zoneY!)`). Task 8 Step 4b rewrites what is left of that test.
- `smoke.spec.ts:255,259` — drop `const sep = q(…)` and `sepShown` from the same `boxes()`, and with them **both** assertions that read it: :272 (`expect(wide.sepShown).toBe(true)`) and :284 (`expect(mid.sepShown).toBe(false)`). :272 is the one that goes red the instant the markup goes — a deleted `.sep` makes `sepShown` false at every width, so the wide case fails on the first run of this task's Step 5. :284 would still pass, and is deleted with it because it asserts nothing once there is no hairline to hide.
- `smoke.spec.ts:336` — drop `stabY` from `seen`, and with it the two assertions at :344–:346 (`expect(seen.stabY).not.toBeNull()` and the one comparing it with `actY`). The remaining `groups` and `actRightGap` assertions still hold and still say something; Task 8 Step 4 replaces the test wholesale.

Leave the surrounding prose comments alone — Task 8 rewrites both tests and their reasons together.

- [ ] **Step 5: Run and watch them pass**

Run: `npm -w app run test`
Expected: PASS across the suite. Then `npm -w app run e2e:docker` — expected green.

- [ ] **Step 6: Document it**

In `docs/app.md` §The toolbar — which is where the preference is described today, under **The score is explained where it is changed** — replace the checkbox-and-caption paragraph with the pill: what it is, why it is a pill (a third answer about the same table, standing with two groups), and that its explanation now lives in the About panel. Delete every sentence describing the caption, the `?`, or the label-versus-wrapping reasoning, which was about a checkbox. The group divider goes in the same edit: §The toolbar's opening sentence names it.

- [ ] **Step 7: Commit**

```bash
git add app/src app/e2e docs/app.md
git commit -m "Let the preference answer its question the way its neighbours do"
```

---

### Task 4: The setup strip invites the panel, and HelpPopover goes

**Files:**
- Modify: `app/src/components/SetupStrip.svelte`
- Delete: `app/src/components/HelpPopover.svelte`
- Modify: `app/src/components/SetupStrip.test.ts`, `app/src/Page.test.ts`, `app/src/Page.svelte`
- Modify: `app/e2e/smoke.spec.ts` (two tests drive the popover this deletes: :42–:45 and the whole test at :575)
- Modify: `app/src/components/MonthPicker.svelte` (a z-index comment names the deleted component)
- Modify: `docs/app.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: `AboutDialog` (Task 1), `aboutOpen` in `Page.svelte` (Task 2).
- Produces: `SetupStrip` gains one prop, `onabout: () => void`. It renders a line spanning the grid, after the cards: `New here? <button class="link">Read about this table</button>`.

**Deviation from the spec, deliberately:** the spec writes the invite as `Read about this table ↗`. The arrow goes. `↗` already has one meaning in this chrome — it is the mark on the RunRepeat credit, where it says *this leaves the app* — and this button opens a modal. Reusing it here teaches the reader the arrow means nothing. The accent colour is what carries the affordance.

- [ ] **Step 1: Write the failing test**

In `app/src/components/SetupStrip.test.ts`, add `onabout: vi.fn()` to the shared `props` object at the top of the file — the prop is required, so every other `render(SetupStrip, { props: { ...props } })` in the file is a typecheck error without it. Then replace the test named `explains a group in a popover rather than a tooltip, and hands focus back on Escape` with:

```ts
// One body of explanation to keep true, offered in words on the screen where a first arrival is
// standing rather than in a punctuation mark.
it('invites the About panel instead of explaining each group itself', async () => {
  const onabout = vi.fn();
  render(SetupStrip, { props: { ...props, onabout } });
  expect(screen.queryByRole('button', { name: /^About Measured at/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^About Built for/ })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: /Read about this table/ }));
  expect(onabout).toHaveBeenCalled();
});
```

Add the second entry point beside the first, in `app/src/Page.test.ts`'s `describe('Page', ...)`, next to the Task 2 case. **Not** `describe('Page setup strip', ...)`: that block renders `Page` but lives in `SetupStrip.test.ts`, not this file, and splitting the two entry points across two files is how one of them stops being checked.

```ts
it('opens the About panel from the setup strip too', async () => {
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('button', { name: /Read about this table/ }));
  expect(screen.getByRole('dialog', { name: 'About this table' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm -w app run test -- SetupStrip Page`
Expected: FAIL — `Unable to find role="button" and name /Read about this table/`.

- [ ] **Step 3: Implement**

In `app/src/components/SetupStrip.svelte`: delete the `HelpPopover` import, the `ZONE_HELP` and `STORY_HELP` constants, and the two `<HelpPopover …/>` instances; add `onabout` to the props; add the line after the story cards, inside `.grid`:

```svelte
    <!-- No `↗`: that mark means "leaves the app" on the credit in the masthead, and this opens a
         panel. One glyph, one meaning. -->
    <p class="invite">New here? <button type="button" class="link" onclick={onabout}>Read about this table</button></p>
```

```css
  /* Spans the grid rather than sitting in a card track: it is an offer about the whole strip. */
  .invite { grid-column: 1 / -1; margin: var(--s1) 0 0; font-size: var(--t-xs); color: var(--text-dim); }
  .link { padding: 0; border: 0; background: none; font: inherit; font-weight: 500; color: var(--accent);
          cursor: pointer; }
  .link:hover { text-decoration: underline; }
```

On the phone tier the `.label, .card, .divider { grid-row: auto; }` rule already lets a new child flow; confirm `.invite` needs no `grid-row` there by rendering it.

In `app/src/Page.svelte`, pass it through: `<SetupStrip … onabout={() => (aboutOpen = true)} />`.

Then delete the component and check nothing imports it:

```bash
git rm app/src/components/HelpPopover.svelte
grep -rn "HelpPopover" app/src app/e2e || echo "no consumers left"
```

There is no `HelpPopover.test.ts` — the component never had one. Everything that covered it lives in the two suites this task edits and in the two e2e tests below, which is why the grep spans `app/e2e` as well.

- [ ] **Step 3b: The two e2e tests that drive the popover**

Neither is optional and neither is mentioned by the spec; both go red the moment the `?` stops existing.

1. `smoke.spec.ts:42–:45`, inside `opens on the setup strip and resumes the previous session across a reload`. Four lines open `About Built for` and read the panel. Replace them with the invite, which is the same claim — the strip offers its explanation in one press and hands focus back on Escape — through the mechanism that replaced it:

```ts
  // one body of explanation, offered in words rather than in a punctuation mark
  await strip.getByRole('button', { name: /Read about this table/ }).click();
  await expect(page.getByRole('dialog', { name: 'About this table' })).toContainText('lab tests');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
```

2. `smoke.spec.ts:575`, the whole test `sets the help popover in its own type, whatever it is mounted in`. **Delete it, and say why in the commit**: it guards a component that renders inside other people's boxes and therefore inherits their casing and tracking. The About panel is mounted on `<body>`, so it inherits nothing and there is no host typography to reset — the guard has no failure left to catch. Do not port it to `AboutDialog`; a test that can only pass is worse than no test.

- [ ] **Step 4: Run and watch them pass**

Run: `npm run verify`, then `npm -w app run e2e:docker`.
Expected: both PASS. `MonthPicker.svelte:218` mentions `HelpPopover` in a comment about z-index — update that comment to name what it is actually comparing against now (the About dialog's 35, or whatever sibling it clears), because a pointer to a deleted component is doc rot.

- [ ] **Step 5: Document it**

`docs/app.md` §The setup strip: delete the `HelpPopover` paragraph and the typography-reset paragraph under it — both describe a component that no longer exists — and say instead that the strip invites the About panel, which owns the explanation.

`BACKLOG.md` item 5 currently argues the per-metric help needs no invention because "the mechanism already exists… already used by the setup strip and the stability checkbox". That sentence is false after this task, so **rewrite it** rather than appending a correction beside it: the mechanism existed, was deleted here with its last consumer, and would be recovered from git history rather than written again. The rest of the item — where the copy lives, what it may claim, how far it reaches — is untouched.

- [ ] **Step 6: Commit**

```bash
git add -A app/src app/e2e docs/app.md BACKLOG.md
git commit -m "Ask the newcomer in words, and delete the mechanism that whispered"
```

---

### Task 5: The utilities are written once and mounted in the host their band owns

**Files:**
- Create: `app/src/components/icons.ts`
- Modify: `app/src/Page.svelte`, `app/src/components/Header.svelte`, `app/src/components/Toolbar.svelte`
- Modify: `app/src/components/Header.test.ts`, `app/src/Page.test.ts`, `app/e2e/smoke.spec.ts`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `icons.ts` exports one `ICON_PATHS` object of `d` strings (geometry only — see Step 3; the `COPY_ICON`-style whole-SVG constants an earlier draft named are **not** what this builds, because whole SVG documents would need `{@html}`). `Header` and `Toolbar` each take a `utilities?: Snippet` prop and render it with `{@render utilities?.()}`. `Page.svelte` defines the snippet once and hands it to **exactly one** host.

**Deviation from the spec, deliberately:** the spec's §Where the utilities live says to instantiate the snippet in **both** hosts and hide the wrong one with `display: none`, on the grounds that `display: none` keeps the hidden copy out of the accessibility tree. That is true of the accessibility tree and beside the point everywhere else, and this plan renders into exactly one host instead. The reasoning is below; it is recorded here as a deviation because the spec otherwise wins (§Spec).

**Why two hosts, and why only one is ever mounted.** Above 800px the utilities are worded in the masthead; below it they are icons on the control row. Two different parents, so one node cannot serve both. The obvious move — render into both and hide one with `display: none` — is the one this app has already rejected once, for the two table renderings: *"only one may be in the DOM at a time: a `display: none` table is still queryable, and two tables' headers would be two answers to 'what are the columns?' for assistive tech and for the suite alike"* (docs/app.md §Two renderings, and only one of them mounted). The same is true of three buttons and a live region. So the band is asked as a **media query in the script**, exactly as `PHONE_QUERY` already is, and the snippet goes to one host:

```svelte
  /**
   * Which host draws the utilities, asked in the script rather than as an `@media` rule, because
   * **only one may be in the DOM at a time** — a `display: none` button is still a tab stop for
   * anything that does not evaluate CSS, and two nodes answering to `Copy link` are two answers to
   * "how do I share this?" (docs/app.md §Two renderings, and only one of them mounted).
   * The query is the sidebar's own `max-width: 800px` inverted rather than a `min-width` twin: two
   * queries that are meant to be complements drift apart at fractional widths, and this boundary is
   * shared with the drawer.
   */
  const MOBILE_QUERY = '(max-width: 800px)';
  let mobile = $state(untrack(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false));
  $effect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return;
    const sync = () => (mobile = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
```

The existing effect that closes the drawer on a resize watches the same string. **Fold it into the rune** rather than leaving two homes for one boundary — `$effect(() => { if (!mobile) showFilters = false; })` — and delete the `matchMedia('(max-width: 800px)')` block it replaces. Keep its comment: it explains why the width that stops being a drawer is the width that closes it.

- [ ] **Step 1: Write the failing test**

Add to `app/src/Page.test.ts`:

```ts
/**
 * The band owns the host, and only one host is mounted. The suite's `matchMedia` stub never
 * matches, so it always renders the desktop band — a mobile one has to be asked for outright.
 */
it('hands the utilities to the bar below 800px, and to nothing else', () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => ({
    matches: q.includes('max-width: 800px'), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as typeof window.matchMedia);
  const { container } = render(Page, { props: { data } });
  const toolbar = container.querySelector('[data-testid="toolbar"]')!;
  for (const name of ['Copy link', 'Export CSV']) {
    expect(screen.getAllByRole('button', { name }), `${name} is mounted twice`).toHaveLength(1);
    expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
  }
  expect(screen.getAllByRole('button', { name: /^Toggle theme/ })).toHaveLength(1);
  // One live region, or the confirmation is announced twice or by the hidden copy.
  expect(screen.getAllByRole('status')).toHaveLength(1);
});

// A regression guard rather than a red-first test: the masthead already draws them here, and this
// is what says the rune did not quietly move them to the bar at every width.
it('leaves the utilities in the masthead above 800px', () => {
  const { container } = render(Page, { props: { data } });
  expect(within(container.querySelector('header')!)
    .getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  expect(within(container.querySelector('[data-testid="toolbar"]')!)
    .queryByRole('button', { name: 'Copy link' })).toBeNull();
});
```

`vi.restoreAllMocks()` in the file's `afterEach` already puts the stub back, so the spy needs no teardown of its own.

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run test -- Page`
Expected: FAIL on the first test — the utilities are in the masthead at every width today, so `within(toolbar).getByRole` finds nothing. The second test passes already and is labelled as the guard it is.

- [ ] **Step 3: Create the icons module — and the doc section its comment points at**

`check:docs` scans `.ts` as well as `.md`, and the module comment below names `docs/app.md §Where the utilities live`. **Write that section now**, not at Step 7: Step 5's `npm run verify` runs `check:docs` first and fails on a pointer to a heading that does not exist yet. Step 7 then fills it out rather than creating it.

Create `app/src/components/icons.ts`. **Path data only, never whole SVG documents:** `{@html}` has exactly two sanctioned sinks in this app and neither is an icon, and `html-boundary.test.ts` fails the build the moment a third appears (docs/app.md §Sanitised-HTML boundary). The geometry is shared; each `<svg>` element is written in its template.

```ts
/**
 * One home per glyph: each of these is drawn by a template that has a worded twin beside it
 * (docs/app.md §Where the utilities live), and a second copy is how one control ends up looking
 * like two. Geometry only — the `<svg>` wrapper, its size and its `aria-hidden` belong to the
 * template, because the accessible name is the button's and an icon carrying one of its own would
 * announce twice.
 */
export const ICON_PATHS = {
  copy: 'M6.6 9.4a2.9 2.9 0 004.1 0l2-2a2.9 2.9 0 00-4.1-4.1l-.8.8M9.4 6.6a2.9 2.9 0 00-4.1 0l-2 2a2.9 2.9 0 004.1 4.1l.8-.8',
  export: 'M8 2.2v7.6m0 0L5.2 7M8 9.8L10.8 7M3 13h10',
  filters: 'M2.6 3.4h10.8L9.4 8.2v4.1l-2.8 1.3V8.2z',
  columnsBox: 'M2.4 2.9h11.2v10.2H2.4z',
  columnsBars: 'M6.1 2.9v10.2M9.9 2.9v10.2',
} as const;
```

The theme cycle's three glyphs stay inline where they are today: they are drawn in one place only, so lifting them here would be a second home for no gain.

- [ ] **Step 4: Move the utilities into a snippet in Page.svelte**

Cut `copyLink`, the `copied` state and the three buttons out of `Header.svelte` into `Page.svelte`, and define one snippet there — adding `import { ICON_PATHS } from './components/icons';` beside the other imports, which is the only new import this step needs. It reads `mobile` directly rather than taking a parameter — there is one instance, so there is nothing to parameterise:

```svelte
{#snippet utilities()}
  {@const worded = !mobile}
  <span class="utils">
    <button type="button" class:icon={!worded} onclick={copyLink}
            aria-label="Copy link" title={worded ? undefined : 'Copy link'}>
      {#if worded}Copy link{:else}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d={ICON_PATHS.copy} stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      {/if}
    </button>
    <!-- Rendered whether or not there is anything to say: a live region created together with its
         text is not reliably announced, so only the text may arrive late. -->
    <span class="copied" class:said={copied} role="status">{copied ? 'Copied' : ''}</span>
    <button type="button" class:icon={!worded} onclick={onExport}
            aria-label="Export CSV" title={worded ? undefined : 'Export CSV'}>
      {#if worded}Export CSV{:else}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d={ICON_PATHS.export} stroke="currentColor" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      {/if}
    </button>
    <!-- An icon per state at both bands, and the `aria-label` is what makes the three-way cycle
         usable without sight — the drawing carries no accessible name of its own. -->
    <button type="button" class="icon" onclick={onTheme}
            aria-label="Toggle theme (currently {theme})" title="Theme: {theme}">
      {#if theme === 'auto'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 010 12z" fill="currentColor"/></svg>
      {:else if theme === 'light'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7L13 13M13 3l-1.3 1.3M4.3 11.7L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 016.4 2.5a5.8 5.8 0 107.1 7.1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      {/if}
    </button>
  </span>
{/snippet}
```

The `title` is set only on the icon form: at the worded band the label is already on screen, and a
tooltip repeating a visible label is the mechanism the visual-polish pass removed.

Type the prop on both hosts as `utilities?: Snippet` (`import type { Snippet } from 'svelte'` — `Toolbar.svelte` already imports it for `columns`; `Header.svelte` does not and needs the import adding). Each host renders `{@render utilities?.()}`, and gets it only at the band it owns:

```svelte
  <Header … utilities={mobile ? undefined : utilities} />
  <Toolbar … utilities={mobile ? utilities : undefined}>
```

**Where the host sits in each parent, and why it is not rendered empty.** In `Header.svelte` it is the last child, after `.prov`. In `Toolbar.svelte` it is the last child of `.actions`, after the column picker. In **both** it is wrapped in `{#if utilities}`, and that is load-bearing rather than tidiness: a zero-width flex item is still a flex item and still takes the container's gap, so an empty host left standing at the band it does not own adds `--s3` of trailing air inside a row whose whole job is to be flush right. That is the same trap the old `.spacer { display: none }` rule was written for, and it would fail Task 6's `air ≤ 1` and Task 8's `actRightGap ≤ 1` from the wrong side of the boundary each time.

```svelte
  <div class="actions">
    <button type="button" class="about" onclick={onabout}>About</button>
    <button type="button" class="filters-toggle" …>…</button>
    {@render columns?.()}
    {#if utilities}<span class="utils-host">{@render utilities()}</span>{/if}
  </div>
```

and it carries `margin-left: auto` — that is what splits the control row into "what opens a panel" on the left and "what you do to a table you are happy with" on the right, which is the composition the design was signed off on. Without it the five controls bunch at one end and the row's 90px of slack lands in the wrong place.

```css
  /* Toolbar.svelte */
  .actions .utils-host { margin-left: auto; }
```

**The CSS moves with the markup, and it cannot be left behind.** Svelte scopes a style block to the markup *authored in that file*, and a snippet written in `Page.svelte` carries `Page`'s scope wherever it is rendered — so `Header.svelte`'s `button`, `.icon`, `.copied` and `.copied:not(.said)` rules stop reaching these three buttons the moment they move, and they ship unpainted. Move all four into `Page.svelte`'s style block, with `.utils` for the group, and rewrite the one that reads a Header-local custom property:

```css
  /* Page.svelte — the utilities, wherever their band mounts them. */
  .utils { display: flex; align-items: center; gap: var(--s3); }
  /* The one secondary-button treatment (docs/app.md §Theming); `--t-sm` stated rather than left to
     the UA's 13.33px, because matching it by 0.05px of luck is not carrying it. */
  .utils button { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
                  background: var(--surface); color: var(--text); border-radius: var(--r-sm);
                  font-size: var(--t-sm); }
  .utils button:hover { background: var(--accent-dim); }
  .utils .icon { display: inline-flex; align-items: center; justify-content: center; }
  .copied { font-size: var(--t-sm); color: var(--good); }
  /* A silent region is still a flex item, so it would carry a gap on each side and space the row
     differently depending on whether a link had ever been copied. The group's OWN gap now, not the
     header's `--gap-x`: that variable is Header-local and does not exist in the bar. */
  .copied:not(.said) { margin-inline-start: calc(-1 * var(--s3)); }
```

`Header.svelte` keeps its `.actions` rule only if something still uses it — nothing does once the three buttons leave, so **delete `.actions`, `button`, `button:hover`, `.icon`, `.copied` and `.copied:not(.said)` from it**, along with the comment above `.actions` about the group wrapping mid-line, which describes a wrap that can no longer happen.

**Header loses three props.** `theme`, `onexport` and `ontheme` have no reader left in `Header.svelte`; typecheck and lint both fail on the unused bindings. Remove them from the props type, the destructuring, the `<Header … />` call in `Page.svelte`, and the shared `props` object in `Header.test.ts`. `total` and `builtAt` stay.

Note in passing: `tokens.test.ts` sweeps `src/components/*.svelte` for a raw white on an accent fill, and `Page.svelte` is not in that directory. Nothing moving here fills with the accent, so nothing is lost today — but it is why new accent-filled markup belongs in a component rather than in `Page.svelte`.

- [ ] **Step 5: Move the tests that moved with the code**

`Header.test.ts` is left testing a component that no longer owns what four of its cases assert. Move, do not delete:

- the three clipboard cases (`copies the current view, and says so`, `claims nothing when the clipboard refuses`, `copies nothing where there is no clipboard`) and the `stubClipboard` helper with them, to `Page.test.ts`. Keep every assertion, including the always-rendered empty live region — but **two of the mechanisms they are written on do not survive the move, because `Page.test.ts` runs under `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` and `Header.test.ts` does not**:
  - `const settled = () => new Promise((r) => setTimeout(r, 0))` never resolves under a faked `setTimeout`, so both of the failure cases would hang rather than fail. What they are actually waiting for is the rejected or absent `writeText` promise settling, which is a **microtask**: `await Promise.resolve()` is the whole of it. Do not carry `settled` across; do not reach for `advanceTimersByTime`, which would answer a question the clock is not being asked.
  - `await screen.findByRole('status')` is a `waitFor`, and this file deliberately has none — Task 2's own case says why. `copied` is set synchronously once `writeText` resolves, so `await Promise.resolve()` then `expect(screen.getByRole('status')).toHaveTextContent(/copied/i)` asserts the same thing without a dance with the clock.

  `copyLink`'s own `setTimeout(… , 2000)` is left unadvanced, exactly as `Page.test.ts` already leaves the export case's deferred revoke: none of the three cases is about the confirmation expiring.
- `keeps one accessible name per theme state while the glyph becomes an icon` — `Page.test.ts:209` already asserts the same property through `names the active theme on the toggle`, so this one is a **duplicate rather than a loss**: delete it and say so in the commit.

`Header.test.ts` keeps the catalogue-count and build-date cases, and gains Task 6's.

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Prove one host is mounted per band, in a browser**

Add to `app/e2e/smoke.spec.ts`:

```ts
/**
 * The utilities are written once and mounted in the host their band owns, so exactly one instance
 * must exist at any width — two would be two tab stops with the same name, and zero would lose the
 * controls. The widths step either side of 800 because that boundary is asked twice, once by the
 * CSS and once by the rune in `Page.svelte`, and the failure mode is them disagreeing.
 */
test('mounts each utility exactly once at every width', async ({ page }) => {
  for (const width of [360, 390, 430, 560, 700, 799, 800, 801, 900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const name of ['Copy link', 'Export CSV']) {
      await expect(page.getByRole('button', { name }), `at ${width}px`).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: /^Toggle theme/ })).toHaveCount(1);
    await expect(page.getByRole('status'), `at ${width}px`).toHaveCount(1);
  }
});

// And the swap survives a resize rather than only a fresh load: the rune is what moves them, so a
// listener that never fires would pass every case above and still strand the controls in the wrong
// band for anyone who rotates a phone or drags a window.
test('moves the utilities between bands on a resize', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await expect(page.locator('header').getByRole('button', { name: 'Copy link' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('[data-testid="toolbar"]').getByRole('button', { name: 'Copy link' }))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(1);
});
```

Run: `npm -w app run e2e:docker`
Expected: green.

- [ ] **Step 7: Document it**

`docs/app.md`: add §Where the utilities live — one snippet, the host chosen by a rune rather than by `display: none`, **why** (the same reason §Two renderings, and only one of them mounted gives for the two tables), that the rune inverts the sidebar's own `max-width: 800px` rather than declaring a `min-width` twin, and the two e2e guards' names.

- [ ] **Step 8: Commit**

```bash
git add -A app/src app/e2e docs/app.md
git commit -m "Write the utilities once and let each band show its own form"
```

---

### Task 6: The banner

**Files:**
- Modify: `app/src/components/Header.svelte`
- Modify: `app/src/components/Header.test.ts`
- Modify: `app/e2e/smoke.spec.ts` (the two `keeps the masthead in one left column at Npx` cases at :474 assert the arrangement this task replaces)
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: the `utilities` snippet prop from Task 5.
- Produces: below 800px `<header>` renders three children — `<h1>`, the spacer and `.prov`, which stacks `.count` over the credit, right-aligned. The utilities host is not rendered at this band at all (Task 5), so nothing follows `.prov` to take a gap after it. Above 800px the masthead is exactly what it is today.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/Header.test.ts`:

```ts
// The count and the credit are both facts about where the data came from, so they stack into one
// block opposite the wordmark rather than the credit sitting inline among buttons, where it read as
// a caption for whichever button followed it.
it('stacks the catalogue fact and the credit into one provenance block', () => {
  const { container } = render(Header, { props });
  const prov = container.querySelector('.prov');
  expect(prov).not.toBeNull();
  expect(prov!.querySelector('.count')).not.toBeNull();
  expect(prov!.querySelector('.credit')).not.toBeNull();
});

// Structural, not decorative (docs/decisions.md §Be a good citizen toward RunRepeat).
it('keeps the attribution a visible, immediately-clickable link', () => {
  render(Header, { props });
  const link = screen.getByRole('link', { name: /RunRepeat/ });
  expect(link).toHaveAttribute('href', 'https://runrepeat.com/catalog/running-shoes');
  expect(link).toBeVisible();
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run test -- Header`
Expected: FAIL — `.prov` does not exist.

- [ ] **Step 3: Implement**

In `app/src/components/Header.svelte`, wrap the count and credit:

```svelte
<header>
  <h1>Shoe Lab</h1>
  <span class="spacer"></span>
  <!-- Attribution is structural, not decorative: a permanent, visible, immediately-clickable link
       (docs/decisions.md §Be a good citizen toward RunRepeat). It stacks under the catalogue fact
       because both say where the data came from — beside a button it read as that button's caption. -->
  <span class="prov">
    <span class="count">{total} shoes · updated {updated}</span>
    <a class="credit" href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">
      <span class="credit-label">Lab data by</span>
      <!-- the external-link arrow is unchanged from today: copy the existing `<svg>` verbatim -->
      <span class="credit-name">RunRepeat <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3 7L7 3M7 3H3.8M7 3v3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>
  </span>
  <!-- `{#if}`, not `{@render utilities?.()}` on its own: an empty span is still a flex item and
       still takes the header's gap, which is exactly what would stop the banner being flush. -->
  {#if utilities}<span class="utils-host">{@render utilities()}</span>{/if}
</header>
```

CSS: `.prov` **dissolves entirely above 800px** so the desktop masthead keeps the exact arrangement the visual-polish pass settled — wordmark, count, spacer, credit, buttons, in that order — and becomes a right-aligned column below it. `display: contents` makes the wrapper's children header flex items again; `order` puts the count back on the left of the spacer, where wrapping it in `.prov` would otherwise have moved it to the right-hand group. That move would be a change to a band the spec says is untouched.

**Desktop is the default and the banner is the override, not the other way round.** Writing it banner-first would need a `min-width` twin of the sidebar's `max-width: 800px`, and that is the construction Task 5 rejects on this very boundary: `max-width: 800px` and `min-width: 800.02px` leave every fractional width in between matching neither, which browser zoom and Firefox's fractional viewport widths both produce. One query, and its complement is whatever the query does not match:

```css
  /* Above 800px the two facts are header items in their own right, in the order the visual-polish
     pass settled — the wrapper exists for the banner, and grouping them here would move the
     catalogue count from beside the wordmark to the far right. `display: contents` is what lets one
     wrapper serve both bands without a second copy of the count in the markup. */
  .prov { display: contents; }
  h1 { order: -2; }
  .count { order: -1; }
  /* `.credit`'s existing desktop rule is unchanged: column, flex-end, 1px. */

  @media (max-width: 800px) {
    /* The spacer stays — it is what makes the banner flush right, and deleting it is exactly what
       left 59px of air at 390px and 248px at 700px on the old header. */
    header { --gap-x: var(--s3); flex-wrap: nowrap; padding: var(--s1) var(--s2); }
    /* One block, right-aligned, opposite the wordmark. One line for the credit, not the desktop's
       stack: the count sitting directly above it already carries the small print. */
    .prov { display: flex; flex-direction: column; align-items: flex-end; gap: 0; }
    .credit { flex-direction: row; align-items: baseline; gap: 5px; }
  }
```

`order` on `.count` and `h1` is harmless below 800px — inside a `.prov` that is a flex column the count is the first child anyway, and `h1` is the header's first item either way — so neither needs restating in the query.

**`display: contents` and the two e2e row counters: leave the counters alone.** Both (`never adds a chrome row that a narrower window hands back`, and Step 4b's rewrite below) already filter on `getBoundingClientRect().height > 0`, which is why today's zero-height `.spacer` is not counted. A `display: contents` `.prov` has no box either, so above 800px it is skipped and the count comes from the children that do have one — `h1` and the utilities host, on one row. That is 1, which is the right answer. Do **not** extend the walk into `.prov`'s children: below 800px `.prov` is a real flex column with two stacked lines, so a counter that descended into it would report 2 rows for the banner and fail both Step 4b's `rows === 1` and the monotonicity guard. The one thing given up is that a desktop `.prov` wrapping internally would no longer show as a row — say so in the doc rather than fixing it here; the banner's own `air` bound is what holds that edge.

Delete the old `@media (max-width: 800px)` block's `flex-wrap: wrap`, `.spacer { display: none }` and `.credit { align-items: flex-start }` rules — **and the two long comments above them**. Both reason about a masthead that carried three buttons at this band ("those 67px of extra line push the theme button onto a third row", "once the bar wraps this block starts its row"); the buttons left in Task 5 and the bar no longer wraps, so the comments now explain the opposite of what the code does. A comment that survives the reason it recorded is the doc rot this repo fails builds over (docs/README.md §Rules, rule 5). Write the new reason instead: the block stacks right-aligned because both lines say where the data came from.

The `@media (max-width: 560px)` block holds three declarations and they do **not** stand or fall together — see Step 4:

- `padding-inline: var(--s2)` is genuinely redundant once the 800px block sets `padding: var(--s1) var(--s2)`. It goes.
- `--gap-x: var(--s2)` is **not** redundant: the 800px block sets `--gap-x: var(--s3)`, so deleting this widens the banner's two gaps by 8px at exactly the widths with the least room. Keep or drop it on the rig's reading, not on the assumption that it is a no-op.
- `.count { font-size: var(--t-xs) }` is Step 4's question, and Step 4 answers it with a measurement rather than this line.

- [ ] **Step 4: Measure the banner rather than assuming it**

The old `max-width: 560px` rule dropped `.count` to `--t-xs` because at `--t-sm` the widest month (`Sept`) wrapped the line at 360px. The banner is a different composition, so re-measure rather than keeping or dropping the rule on faith. Write `banner-fit.mjs` in your scratchpad:

```js
import { chromium } from './node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
await page.evaluate(() => document.fonts.ready);
for (const width of [360, 375, 390, 412, 430, 560, 700, 799, 800, 820, 900]) {
  await page.setViewportSize({ width, height: 900 });
  const m = await page.evaluate(() => {
    const h = document.querySelector('header');
    const cs = getComputedStyle(h);
    const box = h.getBoundingClientRect();
    const kids = [...h.children].filter((e) => getComputedStyle(e).display !== 'none');
    const right = Math.max(...kids.map((e) => e.getBoundingClientRect().right));
    return { height: Math.round(box.height),
             air: Math.round(box.right - parseFloat(cs.paddingRight) - right),
             overflow: h.scrollWidth - h.clientWidth };
  });
  console.log(width, m);
}
await browser.close();
```

Expected: `overflow: 0` at every width, `air` ≤ 1 at every width below 800 (that is what "flush" means), and `height` no greater at 360 than at 430. **Run the same script in Firefox** (`import { firefox }`) — the user's daily browser, the one Chromium-only checks have misrepresented before, and the only place Firefox is checked at all, since `smoke.spec.ts` is a Chromium-only project.

Bind whatever the widest month costs. **Do not edit `data/` to do it** — this branch must not touch the dataset, and a regenerated `data/` is what makes the rebase unresolvable (CLAUDE.md §Conventions). Overwrite the rendered string in the page instead, exactly as the existing e2e case at `smoke.spec.ts:490` already does:

```js
await page.evaluate(() => {
  document.querySelector('header .count').textContent = '450 shoes · updated 27 Sept 2026';
});
```

`en-GB` renders September as `Sept`, which is the widest string the formatter can emit. If the line wraps at 360px, keep the `--t-xs` step and say so in the comment; if it does not, delete the rule and say why in the commit.

**A prior reading, to be confirmed rather than trusted:** the banner was reconstructed over `main` in a browser — actions removed, count and credit wrapped in a right-aligned `.prov`, credit on one row, `padding: var(--s1) var(--s2)`, count set to `450 shoes · updated 27 Sept 2026`. At 360px the count measured **252px wide and 36px tall at `--t-sm` — two lines** — against **224px and 16px at `--t-xs`**. The one-line credit measured 143px, which fits at every width. So the expected answer is that **the `--t-xs` step stays** and only the `padding-inline` half of the 560px block goes. Re-run it against the real components before writing the comment: a reconstruction is not the thing.

- [ ] **Step 4b: Rewrite the masthead test at smoke.spec.ts:474**

Both `keeps the masthead in one left column at ${width}px` cases assert the composition this task replaces: that `.credit-label` and `.credit-name` share a left edge with `h1`, and that the header takes two rows. The banner right-aligns the provenance and takes one row, so both assertions are now false by design — and the property they were protecting (the widest month does not cost a row) is still worth holding. Rewrite in place, keeping the 360/390 loop and the `Sept` override:

```ts
/**
 * The banner is ONE row at every phone width, and the provenance block holds the trailing edge:
 * `main` left 59px of air at 390px and 248px at 700px by deleting the spacer at this band, which is
 * the raggedness the rebuild exists to remove. The count line is checked at the WIDEST month the
 * formatter can emit — `en-GB` renders September as `Sept`, 8px wider than the July it was first
 * measured against, and once cost 26px of chrome at 360px by wrapping.
 *
 * jsdom lays nothing out, so only a browser can answer either half.
 */
for (const width of [360, 390]) {
  test(`keeps the banner one flush row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready.then(() => null));

    const seen = await page.evaluate(() => {
      const header = document.querySelector('header')!;
      header.querySelector('.count')!.textContent = '450 shoes · updated 27 Sept 2026';
      const box = header.getBoundingClientRect();
      const kids = [...header.children]
        .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
      const ys = kids.map((e) => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; })
        .sort((a, b) => a - b);
      const right = Math.max(...kids.map((e) => e.getBoundingClientRect().right));
      return {
        rows: ys.reduce((n, y, i) => (i === 0 || y - ys[i - 1] > 4 ? n + 1 : n), 0),
        air: Math.round(box.right - parseFloat(getComputedStyle(header).paddingRight) - right),
        titleLeft: Math.round(header.querySelector('h1')!.getBoundingClientRect().left),
        padLeft: Math.round(box.left + parseFloat(getComputedStyle(header).paddingLeft)),
      };
    });
    expect(seen.rows, 'the widest month wraps the banner onto a second row').toBe(1);
    expect(seen.air, 'the provenance block left the right edge').toBeLessThanOrEqual(1);
    expect(seen.titleLeft, 'the wordmark left the left edge').toBe(seen.padLeft);
  });
}
```

- [ ] **Step 5: Run the suite**

Run: `npm run verify`, then `npm -w app run e2e:docker`.
Expected: both PASS.

- [ ] **Step 6: Document it**

`docs/app.md` §The header names the catalogue, the receipt owns the count: the header is one row at every width; below 800px the provenance block stacks and the banner is flush; the spacer is load-bearing and must not be deleted again. Record the measured trailing air as the bound (`≤1px`), not as a screenshot claim, and name the e2e guard that holds it.

- [ ] **Step 7: Commit**

```bash
git add app/src app/e2e docs/app.md
git commit -m "Stand the provenance opposite the name and hold the right edge"
```

---

### Task 7: The band ladder

**Files:**
- Modify: `app/src/components/Toolbar.svelte`, `app/src/components/ColumnPicker.svelte`, `app/src/components/ZoneToggle.svelte`
- Modify: `app/e2e/smoke.spec.ts`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: `.setup` and `.actions` from Task 3, the icon paths from Task 5.
- Produces: the toolbar's DOM order is `.setup` then `.actions` at every width; CSS alone moves them. No new props.

**The ladder, exactly:** there is no spacer element on this bar — `.actions { margin-left: auto }` is what holds the trailing edge, and "— gap —" below is that auto margin rather than markup.

| query | composition |
|---|---|
| (none — above 800px) | one row: `.setup` (zone · story · Stability) — gap — `.actions` (About, Columns). No Filters: the sidebar is permanent. |
| `max-width: 800px` | one row: `.setup` — gap — `.actions` (About, Filters icon, Columns icon, utilities icons). Pill inline padding `--s3` → `--s2` |
| `max-width: 699.98px` | two rows: `.actions` first (order: -1), then `.setup`. `.setup` is `space-between`, capped at `414px` and centred |
| `max-width: 429.98px` | `.setup` drops the cap: full width, `space-between`, flush to both padding edges. **Every** pill's inline padding `--s2` → `--s1`, the zone group's included |

**Why `429.98px` carries the padding step, and why `374.98px` is gone.** The spec's band-3 figures came from a rig carrying the app's tokens but not its components, and its pills are narrower than the real ones by enough to move every boundary. Measured over `main` in Chromium, with a `Stability` pill built from the story group's own track:

| pill inline padding | zone | story | Stability | band 3 | at 360 | 375 | 390 | 412 | 430 |
|---|---|---|---|---|---|---|---|---|---|
| spec's rig, 6px then 4px | — | — | — | 353 / 323 | −9 | | | | |
| the spec's ladder, 375–800 (`.s` = `--s2`, zone untouched) | 133 | 193 | 74 | **400** | −56 | −41 | −26 | −4 | +14 |
| the spec's ladder, ≤374.98 (`.s` = `--s1`, zone untouched) | 133 | 161 | 66 | **360** | −16 | −1 | +14 | +36 | +54 |
| **chosen: every pill at `--s1`** | 101 | 161 | 66 | **328** | +16 | +31 | +46 | +68 | +86 |

Slack is against the content box the bar's `--s2` padding leaves (`width − 16`); negative is overflow. Two things fall out of it. The spec's ladder **overflows band 3 at 360, 375 and 390px** — the whole band the rebuild exists to make flush — and its own `overflow ≤ 0` assertion in Step 1 is what would report it. And **`ZoneToggle.svelte` owns its buttons' `padding: var(--s1) var(--s3)` in its own scoped style block**, so the Toolbar's `.s` rule cannot reach it and never has; the spec's figures assume it steps with the story pills, and it does not.

So the step moves to the boundary that already exists for the flush band, applies to the zone group as well, and the `374.98px` tier is deleted rather than retuned — one width where band 3 changes shape instead of two, and `.98` on the only one left. The figures above are Chromium; **re-measure in Firefox at Step 6 before the boundary is called settled**, and treat the 430px cap the same way: at 430 the row measures 400px inside a 414px cap, which is 7px of gap either side rather than the 36px the spec's table promised.

- [ ] **Step 1: Write the failing browser tests**

These are layout claims; jsdom lays nothing out, so they go in `app/e2e/smoke.spec.ts`:

```ts
/**
 * The chrome below 800px is three bands — identity, what acts on the table, what the table is —
 * and above it two. Each assertion here is a property rather than a pixel count, so a retune of any
 * boundary keeps them meaningful (docs/app.md §The chrome bands).
 */
test('lays the chrome out in bands', async ({ page }) => {
  const settle = async () => {
    const card = page.getByTestId('setup-strip').getByRole('button', { name: /^All/ });
    await expect(page.getByRole('button', { name: 'About' })).toBeVisible();
    if (await card.count()) await card.click();
    await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  };
  const bands = () => page.evaluate(() => {
    const tb = document.querySelector('[data-testid="toolbar"]')!;
    const cs = getComputedStyle(tb);
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    const box = tb.getBoundingClientRect();
    const setup = tb.querySelector('.setup')!.getBoundingClientRect();
    const actions = tb.querySelector('.actions')!.getBoundingClientRect();
    const kids = [...tb.querySelector('.setup')!.children].map((k) => k.getBoundingClientRect());
    return {
      sameRow: Math.abs((setup.y + setup.height / 2) - (actions.y + actions.height / 2)) < 4,
      setupBelow: setup.y > actions.y,
      leftInset: Math.round(kids[0].left - (box.left + padL)),
      rightInset: Math.round((box.right - padR) - kids[kids.length - 1].right),
      overflow: tb.scrollWidth - tb.clientWidth,
      // The story group must take the row it is given rather than filling one of its own — carried
      // over from the tier test Task 8 retires, which is where this claim lived.
      paceW: tb.querySelector('.pace-wrap .seg')!.getBoundingClientRect().width,
      wrapW: tb.querySelector('.pace-wrap')!.getBoundingClientRect().width,
    };
  });

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  await settle();
  expect((await bands()).sameRow, 'the bar split above 800px').toBe(true);

  await page.setViewportSize({ width: 760, height: 900 });
  expect((await bands()).sameRow, 'the bar split between 700 and 800').toBe(true);

  // Below 700 the two bands separate, and the actions lead: what acts on the table sits above what
  // the table is, so the row carrying every word is the one nearest the table.
  await page.setViewportSize({ width: 660, height: 900 });
  const split = await bands();
  expect(split.sameRow).toBe(false);
  expect(split.setupBelow).toBe(true);

  // 430 and below: flush to both padding edges — the property the whole rebuild exists to restore.
  for (const width of [430, 390, 375, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const b = await bands();
    expect(b.overflow, `the setup row overflows at ${width}px`).toBeLessThanOrEqual(0);
    expect(b.leftInset, `not flush left at ${width}px`).toBeLessThanOrEqual(1);
    expect(b.rightInset, `not flush right at ${width}px`).toBeLessThanOrEqual(1);
  }

  // Above 430 it stops widening and centres, so the two insets stay equal and stop growing apart.
  for (const width of [500, 560, 629, 690]) {
    await page.setViewportSize({ width, height: 900 });
    const b = await bands();
    expect(Math.abs(b.leftInset - b.rightInset), `not centred at ${width}px`).toBeLessThanOrEqual(2);
    expect(b.leftInset, `the capped row grew at ${width}px`).toBeGreaterThanOrEqual(0);
  }

  // And at every width: the story group is shrink-wrapped, never stretched to fill its wrapper.
  for (const width of [1200, 900, 760, 660, 560, 430, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const b = await bands();
    expect(b.paceW, `the story group stretches at ${width}px`).toBe(b.wrapW);
  }
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run e2e -- --grep "lays the chrome out in bands" --project=chromium`
Expected: FAIL at the 660px case — today the bar does not split into `.setup` and `.actions` rows.

- [ ] **Step 3: Implement the ladder**

These are the **layout** rules only. `.seg`, `.s`, `.s.on`, the `.filters-toggle` paint (its padding, border, background, hover and `--t-sm`) and the count-badge rules are untouched — do not read this block as a replacement for the whole `<style>`. What it replaces is `.toolbar`, `.setup`, `.actions`, `.filters-toggle`'s `display` declaration alone — its paint rule stays where it is, and this is one rule split, not two rules left standing — and the **two** media blocks Task 3 left behind (`max-width: 800px` and `max-width: 609.98px`; the `879.98px` one went with the hairline):

```css
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3);
             padding: var(--s2) var(--s5); background: var(--chrome);
             border-bottom: 1px solid var(--border); }
  .setup { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
  .actions { display: flex; align-items: center; gap: var(--s3); margin-left: auto; }

  /* Unchanged from today and NOT inside a media block: above 800px the sidebar is permanent, so the
     drawer toggle has nothing to toggle and is hidden by default rather than by a query. */
  .filters-toggle { display: none; }

  /* Below 800px every pixel of chrome is paid before the first shoe, on the screen with the least
     of it: the gutter and the vertical padding halve, and Filters appears because the sidebar is a
     drawer here. 800 rather than 799.98 deliberately — it is the sidebar's own boundary and the two
     must agree, or the drawer toggle shows on a width laid out as a desktop. */
  @media (max-width: 800px) {
    .toolbar { padding: var(--s1) var(--s2); gap: var(--s1) var(--s2); }
    .filters-toggle { display: inline-flex; padding-inline: var(--s2); }
    /* The pills' own padding is what buys the fit, and it steps HERE rather than at the row split:
       at the base `--s3` the three groups measure 456px against the 684px a 700px screen leaves,
       and the merged line has to hold the actions beside them. */
    .s { padding-inline: var(--s2); }
  }

  /* Below 700 the one line stops fitting: 613px of content against the 684px a 700px screen leaves
     is the last width where it does. The two bands separate and the ACTIONS lead — what acts on the
     table above what the table is, so the row carrying every word sits nearest the table. */
  @media (max-width: 699.98px) {
    .actions { order: -1; flex-basis: 100%; }
    .setup { flex-basis: 100%; justify-content: space-between;
             max-width: 414px; margin-inline: auto; }
  }

  /* At 430px and below the cap is wider than the row, so it stops meaning anything and the row goes
     flush to both padding edges — which is the property the rebuild exists to restore. 414px is the
     row's own content width at 430px: above that it holds this spacing rather than growing gaps
     that reach 171px by 700px.
     The pills tighten again on the same boundary rather than on one of their own: 360px is the
     binding width, not 375 — it is the usual Android one — and at `--s2` the three groups measure
     400px against the 344px this padding leaves there. At `--s1`, ALL of them, they measure 328px.
     The zone group is the reason "all of them" is written out: its padding lives in
     `ZoneToggle.svelte`, a scoped style block this rule cannot reach, and stepping only the pills
     this file owns leaves the row 16px over at 360px. */
  @media (max-width: 429.98px) {
    .setup { max-width: none; margin-inline: 0; }
    .s { padding-inline: var(--s1); }
  }
```

And the matching half in `ZoneToggle.svelte`, which is the only edit that component takes:

```css
  /* The bar's flush band tightens every pill on its setup row, and this group's buttons are two of
     them — but their padding is authored here, so `Toolbar.svelte`'s rule has never reached them.
     One boundary, stated twice because scoping gives it no choice; docs/app.md §The chrome bands
     owns the number. */
  @media (max-width: 429.98px) {
    button { padding-inline: var(--s1); }
  }
```

`.sep` is already gone — Task 3 took its markup and its rules together. Confirm rather than repeat: `grep -n "sep" app/src/components/Toolbar.svelte` should find nothing.

- [ ] **Step 4: Give Filters and Columns their icon forms below 800px**

**800, not 700** — one boundary governs every "words become icons" swap on this bar, so nothing on it is half-worded: the utilities go to icons at 800 (Task 5), and Filters and Columns go with them. The cost is deliberate and worth naming in the commit: a 760px laptop window gets glyph-only Filters and Columns even though the merged line has slack for the words.

In `Toolbar.svelte`, render both the word and the glyph and let CSS choose, so the accessible name never changes with the viewport:

```svelte
<button type="button" class="filters-toggle" aria-expanded={showFilters} aria-controls="filter-sidebar"
        onclick={onfilters} aria-label="Filters">
  <span class="word">Filters</span>
  <svg class="glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d={ICON_PATHS.filters} stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </svg>
</button>
```

```css
  .glyph { display: none; }
  @media (max-width: 800px) {
    .word { display: none; }
    .glyph { display: inline-flex; }
  }
```

Default-hidden glyph, revealed by the query — the pair is exhaustive at any width including fractional ones, which a `min-width`/`max-width` twin would not be.

In `ColumnPicker.svelte`, the summary does the same — **and keeps its count badge**, which is the only thing that survives the word. The glyph is a real `<svg>` sibling, not a `::before`: a pseudo-element cannot carry path data without `{@html}` or a background image, and neither is allowed here.

```svelte
<summary bind:this={summary} aria-label="Columns, {columns.length} shown">
  <span class="word">Columns</span>
  <svg class="glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d={ICON_PATHS.columnsBox} stroke="currentColor" stroke-width="1.3" />
    <path d={ICON_PATHS.columnsBars} stroke="currentColor" stroke-width="1.3" />
  </svg>
  <span class="count-badge">{columns.length}</span>
  <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</summary>
```

```css
  /* The badge is what survives the word: the count is the only thing on this control that changes,
     and it is why the label was given a badge rather than a growing string in the first place. */
  .glyph { display: none; }
  @media (max-width: 800px) {
    .word, .chev { display: none; }
    .glyph { display: inline-flex; }
    summary { padding-inline: var(--s2); }
  }
```

This rule replaces what the toolbar used to reach into with `.actions :global(summary) { padding-inline: var(--s2) }` — the picker owns its own tightening now, so delete that `:global` when Task 7 Step 3 replaces the media blocks rather than leaving both.

`aria-label` on the summary rather than a visually-hidden span: the accessible name must not change with the viewport, and the count belongs in it because the badge is the only remaining indication of what the control holds. Two consequences to carry, both verified against the code as it stands:

- The name changes **at every width**, not only below 700px — desktop goes from `Columns 6` to `Columns, 6 shown`. `ColumnPicker.test.ts:38` reaches the control through `getByText('Columns').closest('summary')`, which still resolves against the `.word` span, and `smoke.spec.ts:614` uses `details.picker summary`. Nothing else names it, so nothing else needs changing — but re-run that grep rather than trusting this line.
- **`<summary>` has no implicit ARIA role**, so Playwright's `getByRole('button', …)` will never match it. (Checked in the installed `playwright-core`: `DETAILS` maps to `group`, `SUMMARY` appears nowhere in the role table.) Browsers do expose the `aria-label` to assistive tech, so the label is doing its job — but any e2e assertion about this control has to go through `page.locator('details.picker summary')` and read `aria-label`, never `getByRole`. Task 9 Step 3 depends on this.

- [ ] **Step 5: Run and watch it pass**

Run: `npm -w app run e2e -- --grep "lays the chrome out in bands" --project=chromium`
Expected: PASS. Then the full `npm -w app run e2e:docker`.

- [ ] **Step 6: Verify no band overflows, in both engines**

Write `band-fit.mjs` in your scratchpad, walking 360→1440 in 10px steps, asserting for `header`, `.setup` and `.actions` that `scrollWidth - clientWidth <= 0` and that no element's right edge passes its parent's padding box. **This is where the `429.98px` step is confirmed rather than assumed** — the widths that decided it were read in Chromium off a reconstruction, and Firefox sets text at its own metrics. Run it in **chromium and firefox** — this rig is the only Firefox coverage the chrome gets, since `smoke.spec.ts` is a Chromium-only project. Any overflow is a bug in this task, not a tolerance.

- [ ] **Step 7: Document it**

`docs/app.md`: add §The chrome bands — the table of queries above, why `800` is shared with the sidebar, why 700 rather than 629, why the cap is 414 and what it preserves, and that the divider is gone. State the numbers as bounds that can be re-measured. Two more sentences, because both are things the next reader will otherwise undo: the pill padding steps at `429.98px` rather than the spec's `374.98px`, with the measured widths that moved it; and the step is written **twice**, in `Toolbar.svelte` and in `ZoneToggle.svelte`, because Svelte's scoping leaves no way to state it once.

- [ ] **Step 8: Commit**

```bash
git add app/src app/e2e docs/app.md
git commit -m "Give the bar one band for what acts and one for what is"
```

---

### Task 8: The landing screen

**Files:**
- Modify: `app/src/components/Toolbar.svelte`
- Modify: `app/src/components/Toolbar.test.ts`, `app/e2e/smoke.spec.ts` (rewrite the test at :322)
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: the pill (Task 3), the ladder (Task 7).
- Produces: with `showGroups={false}`, `.setup` renders **nothing at all** — no zone group, no story group, no pill.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/Toolbar.test.ts`:

```ts
// With All selected there is no score column on screen, and the preference only ever changes a
// score — so while the strip is up it is being offered at the one moment it provably cannot do
// anything. The bar gains all three groups in one move when the strip hands over.
it('offers no stability pill while the setup strip still holds the questions', () => {
  render(Toolbar, { props: { ...props, showGroups: false } });
  expect(screen.queryByRole('button', { name: 'Stability' })).toBeNull();
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run test -- Toolbar`
Expected: FAIL — the pill renders regardless of `showGroups`.

- [ ] **Step 3: Implement**

The pill is already inside the `{#if showGroups}` block from Task 3, so this passes as soon as Task 3 is in. **If it already passes, do not delete the test** — it is the guard for a rule that would otherwise be re-broken by whoever next moves the pill. Say so in the commit message rather than inventing work.

Then delete the `.toolbar.no-groups` class and its rule if nothing reads it any more: with `.setup` empty, the actions already hold the right edge and the rule it existed for is gone. `grep -rn "no-groups" app/` before deleting — the only reader left is `Toolbar.test.ts`'s `marks itself group-less so the preference stops claiming a row of its own`, and that is the **whole test**, not one assertion inside it. Delete the test with the class: it asserted a marker for a rule that no longer exists, and the property it stood in for — the landing bar is one row with the actions flush right — is measured in the browser by Step 4's rewrite.

- [ ] **Step 4: Rewrite the e2e test at smoke.spec.ts:322**

That test asserts the preference never sits below the actions — a property about a control that is no longer on that row. Replace it, keeping its width ladder and its real subject (the landing bar is never left lopsided):

```ts
/**
 * While the strip is up the bar carries no groups, so its left side is empty by design and the
 * actions hold the trailing edge alone. What must stay true is that they hold it: the old bar left
 * 211px of void at 390px and 597px at 800px by letting them lead a row instead.
 *
 * jsdom lays nothing out and evaluates no media query, so only a browser can answer it.
 */
test('opens with the actions flush to the bar trailing edge', async ({ page }) => {
  for (const width of [360, 390, 430, 560, 610, 700, 800, 840, 900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('setup-strip')).toBeVisible();
    const seen = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="toolbar"]')!;
      const bar = el.getBoundingClientRect();
      const act = el.querySelector('.actions')!.getBoundingClientRect();
      return {
        groups: !!el.querySelector('.zone-wrap'),
        pill: !!el.querySelector('.pill'),
        // against the bar's OWN padding, not a constant: it differs by tier
        gap: Math.round(bar.right - parseFloat(getComputedStyle(el).paddingRight) - act.right),
        rows: new Set([...el.children].filter((c) => c.getBoundingClientRect().height > 0)
          .map((c) => Math.round(c.getBoundingClientRect().y))).size,
      };
    });
    expect(seen.groups, `the bar drew its groups beside the strip at ${width}px`).toBe(false);
    expect(seen.pill, `the bar offered stability with nothing to score at ${width}px`).toBe(false);
    expect(seen.gap, `the actions left the right edge at ${width}px`).toBeLessThanOrEqual(1);
    expect(seen.rows, `the landing bar took two rows at ${width}px`).toBe(1);
  }
});
```

- [ ] **Step 4b: Rewrite the tier test at smoke.spec.ts:238**

`degrades the toolbar in tiers and keeps the table header clear of the chrome` is written against `.sep`, `.stability` and the 880/610 boundaries, none of which survive (Task 3 already took the `.stability` readings out of it). Keep its second half verbatim — the pinned-header-clears-the-chrome loop at 1200/700/375 is still exactly right and is the `--thead-top` guard — and rename the test for what is left of it. Delete the first half, `boxes()` with it, and let Task 7's `lays the chrome out in bands` own the tier claims; the `paceW === wrapW` assertion is already carried there, so nothing is lost in the move.

- [ ] **Step 5: Run everything**

Run: `npm run verify && npm -w app run e2e:docker`
Expected: both green.

- [ ] **Step 6: Document it**

`docs/app.md` §Presets: the preference is absent while the strip is up, and **why** — no story means no score column, so it can change nothing. That reason is the whole justification and must not be lost to a later "restore it for consistency" change.

- [ ] **Step 7: Commit**

```bash
git add app/src app/e2e docs/app.md
git commit -m "Stop offering the preference where it can change nothing"
```

---

### Task 9: The guards that hold the design

**Files:**
- Modify: `app/e2e/smoke.spec.ts`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no source changes — only assertions.

- [ ] **Step 1: Extend the monotonicity ladder**

The existing test `never adds a chrome row that a narrower window hands back` walks `header` and toolbar children separately. Both have changed shape, so re-point it and extend the ladder to step either side of the new boundaries:

```ts
  for (const width of [1440, 1200, 1000, 940, 900, 860, 820, 801, 800, 790, 760, 720, 701, 700, 699,
                       680, 640, 600, 560, 500, 460, 431, 430, 429, 412, 400, 390, 380, 375, 370,
                       365, 360]) {
```

The counter itself is unchanged — it clusters child centres, which still describes both bands.

- [ ] **Step 2: Add the chrome-height ceiling**

A bound, not a pin, so a font tweak does not fail the build but a regression does:

```ts
/**
 * Every row of chrome is paid before the first shoe. `main` spent 198px at 360px with the pills up;
 * the rebuild is meant to spend well under that at every phone width, and the ceiling is what stops
 * the saving being given back one padding step at a time.
 */
test('keeps the chrome under its ceiling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('setup-strip').getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const [width, ceiling] of [[360, 130], [390, 130], [430, 130], [700, 95], [900, 100]] as const) {
    await page.setViewportSize({ width, height: 900 });
    const h = await page.evaluate(() =>
      Math.round(document.querySelector('.chrome')!.getBoundingClientRect().height));
    expect(h, `the chrome is ${h}px at ${width}px`).toBeLessThanOrEqual(ceiling);
  }
});
```

The ceilings carry headroom over the rig's figures (118px below 700, 83px at 700–800, 92px at 900). **Re-measure the real components first and set each ceiling ~10px above what they actually spend** — a ceiling that is already tight fails on the next font tweak and teaches everyone to raise it.

This test **replaces** the pair at `smoke.spec.ts:445`, `keeps the phone chrome under its ceiling at ${width}px`. Those hold 170px strip-up and 210px strip-down at 360 and 390 — bounds written against `main`'s 198px, which the rebuild is meant to beat by 80px. Leaving them beside a 130px ceiling would mean two guards on one property with the looser one silently doing nothing. Delete them, and carry the one thing they hold that the new test does not: the **strip-up** reading, which is the binding case because it is a first arrival. Add it to the new test as its own pass over 360 and 390 before the `All` card is clicked, with its own ceiling re-measured the same way.

- [ ] **Step 3: Add the accessible-name sweep**

```ts
/**
 * Four controls lose their words at 800px — Copy link, Export CSV, Filters and Columns (the theme
 * cycle is a glyph at every width and never had a word to lose). Each keeps the name its worded
 * form had, at every width: an icon that ships without one is unusable and untestable at once.
 */
test('never ships an icon without its name', async ({ page }) => {
  for (const width of [360, 430, 690, 760, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const name of ['Copy link', 'Export CSV', 'About']) {
      await expect(page.getByRole('button', { name }), `${name} at ${width}px`).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: /^Toggle theme/ })).toHaveCount(1);
    if (width <= 800) await expect(page.getByRole('button', { name: 'Filters' })).toHaveCount(1);
    // NOT `getByRole`: `<summary>` has no implicit ARIA role, so a role query never matches it
    // however it is labelled (Task 7 Step 4). The label is still what a screen reader announces.
    await expect(page.locator('details.picker summary'), `Columns at ${width}px`)
      .toHaveAttribute('aria-label', /^Columns, \d+ shown$/);
  }
});
```

- [ ] **Step 4: Add the panel's two entry points**

```ts
test('opens the About panel from the bar and from the strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Read about this table/ }).click();
  await expect(page.getByRole('dialog', { name: 'About this table' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'About this table' })).toHaveCount(0);

  await page.getByRole('button', { name: 'About' }).click();
  const dlg = page.getByRole('dialog', { name: 'About this table' });
  await expect(dlg).toBeVisible();
  // The body is read whole rather than scrolled through: on the phone most people carry, it fits.
  const over = await dlg.locator('.body').evaluate((b) => b.scrollHeight - b.clientHeight);
  expect(over, 'the About copy no longer fits a 390x844 phone').toBeLessThanOrEqual(0);
});
```

- [ ] **Step 5: Run the whole gate**

Run: `npm run verify && npm -w app run e2e:docker`
Expected: both green.

- [ ] **Step 6: Screenshot both themes at the four bands, in both engines**

Not an assertion — a look, which is what catches what no bound describes. Render 360, 430, 560, 760, 900 and 1440 in light and dark, in Chromium and Firefox, and read them. Anything that looks wrong is a defect to fix in the task that owns it, not a note for later.

- [ ] **Step 7: Final doc pass**

Re-read `docs/app.md`'s chrome sections end to end against the code as it now stands. Delete every sentence describing a control that no longer exists (the checkbox, its caption, its `?`, the divider, the 610/880 tiers). Run `npm run check:docs`. Then re-read this plan's spec and confirm each section has landed.

- [ ] **Step 8: Commit**

```bash
git add app/e2e docs/app.md
git commit -m "Hold the bands to bounds a font tweak cannot quietly undo"
```

---

## Landing the branch

- [ ] `npm run verify` — green
- [ ] `npm -w app run e2e:docker` — green (the chrome guards are Chromium; Firefox is covered by the rigs in Tasks 6, 7 and 9)
- [ ] Rebase onto `main` and fast-forward — no merge commits (docs/decisions.md §Linear history, no merge commits)
- [ ] Remove the worktree, delete the branch
- [ ] `data/` is **not** regenerated on this branch — this is a code-only change

## Self-review notes for the implementer

Five places where this plan tells you to check before you write, rather than telling you what you will find. All five are real:

1. **Task 6, Step 3** — that the desktop header still counts as **one** row with `.prov` at `display: contents`. The expected answer is yes, and the reasoning is written out there: both counters already skip boxless children, which is why today's zero-height `.spacer` is not counted either. Run the monotonicity guard at 900px and confirm 1 before moving on. If it reports something else, fix the layout, not the counter — a counter that descends into `.prov` reports 2 for the banner and fails Step 4b.
2. **Task 6, Step 4** — whether the banner still needs the `--t-xs` step on `.count`. A reconstruction over `main` says yes (252px and two lines at `--t-sm` against 224px and one at `--t-xs`, at 360px with the widest month), and a reconstruction is not the components. Confirm it, in both engines, and let the reading decide the `--gap-x` half of that block too.
3. **Task 7, Steps 3 and 6** — the pill-padding boundary. It is set at `429.98px` on measured widths rather than the spec's `374.98px`, and the measurement was Chromium-only and taken off a probe pill rather than the shipped one. Band 3 has 16px in hand at 360px on those numbers, which is not much; Step 6's Firefox run is what makes it a bound rather than a guess. If Firefox comes out over, the answer is a wider tightening or shorter labels — raise it, do not quietly widen the query.
4. **Task 7, Step 4** — whether the merged line at 700–800px still reads well with Filters and Columns as glyphs. The boundary was chosen for consistency rather than for fit, so there is slack there by construction; if the row looks under-filled at 760px, that is a finding worth raising rather than silently retuning.
5. **Task 8, Step 3** — the pill may already be absent on the landing screen when you get there, because Task 3 put it inside `{#if showGroups}`. Keep the test anyway; it guards a rule with a reason that is not visible from the markup.
