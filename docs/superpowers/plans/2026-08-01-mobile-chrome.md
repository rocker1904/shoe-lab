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
- **Measure, do not reason.** Layout claims are settled by rendering at real widths and reading boxes out of the DOM, never by arguing about CSS. Drive Playwright from the repo root (`node_modules/playwright` is there); check Chromium **and Firefox**.
- **Tokens only.** No raw colour literals in a component style block — `tokens.test.ts` fails the build on one. Spacing uses `--s1..--s6`, radii `--r-sm/--r-md/--r-full`, type `--t-xs..--t-xl`.
- **`--accent-solid`, not `--accent`, wherever `--on-accent` sits on a fill** (docs/app.md §Theming).
- **Every icon-only control keeps the accessible name its worded form had.** No exceptions, at any width.
- **The RunRepeat attribution stays a permanent, visible, immediately-clickable link** (docs/decisions.md §Be a good citizen toward RunRepeat). It may move within the chrome; it may never be hidden, deferred, put behind a menu, or reduced to an icon alone.
- **Tier boundaries take the `.98` convention** so no width matches two tiers: `374.98px`, `429.98px`, `699.98px`. `800px` is the existing sidebar boundary and is reused **unchanged** — exactly 800 stays "mobile", as today.
- **Gate before every push:** `npm run verify` (check:docs + typecheck + lint + test:coverage), then `npm -w app run e2e:docker`. The host lacks WebKit's system libraries, so `e2e:docker` is the sanctioned path and is the one that must be green.
- **Feature work happens in a worktree** at `~/dev/shoe-lab-<branch>`, `npm install` inside it (do **not** symlink `node_modules` — it breaks the test runner via Vite's `server.fs.allow`). Land by rebase and fast-forward, no merge commits. Do **not** regenerate `data/` on the branch.

---

## File Structure

**Created**
- `app/src/components/AboutDialog.svelte` — the modal panel and all of its copy. One responsibility: render the explanation and dismiss itself.
- `app/src/components/AboutDialog.test.ts` — its unit tests.
- `app/src/components/icons.ts` — the four new inline SVG strings (copy, export, filters, columns) as typed constants, so the same glyph cannot drift between the two hosts that render it.

**Modified**
- `app/src/components/Header.svelte` — banner below 800px; masthead unchanged above; hosts the worded utilities.
- `app/src/components/Toolbar.svelte` — two rows below 700px, one above; stability pill; About button; hosts the icon utilities.
- `app/src/Page.svelte` — owns `aboutOpen`, renders `AboutDialog`, passes the utilities snippet to both hosts.
- `app/src/components/SetupStrip.svelte` — `?` popovers out, "New here?" line in.
- `app/src/components/ColumnPicker.svelte` — the summary becomes an icon plus its badge below 700px.
- Tests: `Header.test.ts`, `Toolbar.test.ts`, `SetupStrip.test.ts`, `Page.test.ts`, `app/e2e/smoke.spec.ts`.
- `docs/app.md` — the owning doc for every behaviour here.
- `BACKLOG.md` — note that per-metric help would reintroduce `HelpPopover` from git history.

**Deleted**
- `app/src/components/HelpPopover.svelte` — no consumer survives Task 4.

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
  // straight out of it and the promise is a lie.
  it('traps Tab inside itself and opens on the Close button', async () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).not.toBe(document.body);
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
    // Close rather than the first link: it is the control every reader needs and the one a keyboard
    // user is looking for, and starting there makes the trap's first Tab move forward into the copy.
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
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the copy fits without scrolling, in a browser**

jsdom has no layout, so this cannot be a unit test. Write `/tmp/about-fit.mjs` and run it from the repo root against `npm -w app run dev`:

```js
import { chromium } from './node_modules/playwright/index.mjs';
// 390x844 is most phones, 390x667 the SE, 900x740 a half-screen desktop window.
const SIZES = [[390, 844], [390, 667], [900, 740]];
const browser = await chromium.launch();
for (const [width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: 'About' }).click();      // available from Task 2 on
  await page.evaluate(() => document.fonts.ready);
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

In `docs/app.md`, add a `## The About panel` section: what it owns (the whole explanation), that it is the `AddFilterDialog` pattern rather than `HelpPopover`'s, its two entry points (Task 2 and Task 4), and the one bound worth keeping — the body does not scroll at 390×844. Do not restate the copy; the component owns it.

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
  render(Toolbar, { props: { ...props, onabout } });
  const about = screen.getByRole('button', { name: 'About' });
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
it('opens the About panel from the toolbar and hands focus back on close', async () => {
  render(Page, { props: { data } });
  const about = await screen.findByRole('button', { name: 'About' });
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

Now the button exists, run `/tmp/about-fit.mjs` against `npm -w app run dev`. Expected `0` at 390×844 and 900×740.

- [ ] **Step 6: Commit**

```bash
git add app/src app/src/Page.svelte docs/app.md
git commit -m "Put the way in on the bar that is always there"
```

---

### Task 3: The stability preference becomes a pill

**Files:**
- Modify: `app/src/components/Toolbar.svelte`
- Modify: `app/src/components/Toolbar.test.ts`, `app/src/Page.test.ts:138`, `app/e2e/smoke.spec.ts:689,695,730`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: `AboutDialog`'s Stability section (Task 1) — it is now the only place the caption's sentence lives.
- Produces: the preference renders as `<button type="button" class="pill" aria-pressed={stability}>Stability</button>`. Its accessible name is exactly `Stability`. The props `stability: boolean` and `onstability: (v: boolean) => void` are unchanged, so `Page.svelte` needs no edit.

- [ ] **Step 1: Write the failing tests**

In `app/src/components/Toolbar.test.ts`, replace the whole `describe('Toolbar stability preference', ...)` block with:

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

1. Delete `SCORE_LABEL`, `SCORE_HELP`, the `HelpPopover` import, `STABLE_STORIES`, `listed` **only if nothing else uses them** — check first: `STABLE_STORIES`/`listed` also feed the caption, which is going, so both go with it.
2. Replace the whole `.stability` block with the pill, inside a new `.setup` wrapper that also holds the two groups:

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
  .setup { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
```

4. Delete the now-dead `.stability`, `.pref`, `.stability label`, `.stability small`, and `.toolbar.no-groups .stability` rules, and the `@media (max-width: 879.98px) { .stability { … } }` block.

- [ ] **Step 4: Update the three other call sites**

`app/src/Page.test.ts:138`:

```ts
    await fireEvent.click(screen.getByRole('button', { name: 'Stability' }));
```

`app/e2e/smoke.spec.ts` — all three occurrences:

```ts
  await page.getByRole('button', { name: 'Stability' }).click();
```

and the assertion at line 695 becomes:

```ts
  await expect(page.getByRole('button', { name: 'Stability' })).toHaveAttribute('aria-pressed', 'true');
```

- [ ] **Step 5: Run and watch them pass**

Run: `npm -w app run test`
Expected: PASS across the suite. Then `npm -w app run e2e:docker` — expected green.

- [ ] **Step 6: Document it**

In `docs/app.md` §Presets (or §The toolbar, whichever owns the preference today), replace the checkbox-and-caption description with the pill: what it is, why it is a pill (a third answer about the same table, standing with two groups), and that its explanation now lives in the About panel. Delete any sentence that describes the caption or the `?`.

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
- Modify: `app/src/components/SetupStrip.test.ts`, `app/src/Page.svelte`
- Modify: `docs/app.md`, `BACKLOG.md`

**Interfaces:**
- Consumes: `AboutDialog` (Task 1), `aboutOpen` in `Page.svelte` (Task 2).
- Produces: `SetupStrip` gains one prop, `onabout: () => void`. It renders a line spanning the grid, after the cards: `New here? <button class="link">Read about this table ↗</button>`.

- [ ] **Step 1: Write the failing test**

In `app/src/components/SetupStrip.test.ts`, replace the test named `explains a group in a popover rather than a tooltip, and hands focus back on Escape` with:

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

Add to `app/src/Page.test.ts`:

```ts
it('opens the About panel from the setup strip too', async () => {
  render(Page, { props: { data } });
  await fireEvent.click(await screen.findByRole('button', { name: /Read about this table/ }));
  expect(screen.getByRole('dialog', { name: 'About this table' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm -w app run test -- SetupStrip Page`
Expected: FAIL — `Unable to find role="button" and name /Read about this table/`.

- [ ] **Step 3: Implement**

In `app/src/components/SetupStrip.svelte`: delete the `HelpPopover` import, the `ZONE_HELP` and `STORY_HELP` constants, and the two `<HelpPopover …/>` instances; add `onabout` to the props; add the line after the story cards, inside `.grid`:

```svelte
    <p class="invite">New here? <button type="button" class="link" onclick={onabout}>Read about this table ↗</button></p>
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
grep -rn "HelpPopover" app/src || echo "no consumers left"
```

- [ ] **Step 4: Run and watch them pass**

Run: `npm run verify`
Expected: PASS. `MonthPicker.svelte:218` mentions `HelpPopover` in a comment about z-index — update that comment to name what it is actually comparing against now (the About dialog's 35, or whatever sibling it clears), because a pointer to a deleted component is doc rot.

- [ ] **Step 5: Document it**

`docs/app.md`: the strip no longer explains its own groups; the About panel does, and the strip invites it. `BACKLOG.md`: add a line under the per-metric-help item noting that `HelpPopover.svelte` was deleted in this change and would be recovered from git history rather than rewritten.

- [ ] **Step 6: Commit**

```bash
git add -A app/src docs/app.md BACKLOG.md
git commit -m "Ask the newcomer in words, and delete the mechanism that whispered"
```

---

### Task 5: The utilities render once and appear in two places

**Files:**
- Create: `app/src/components/icons.ts`
- Modify: `app/src/Page.svelte`, `app/src/components/Header.svelte`, `app/src/components/Toolbar.svelte`
- Modify: `app/src/components/Header.test.ts`, `app/src/components/Toolbar.test.ts`, `app/src/Page.test.ts`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `icons.ts` exports `COPY_ICON`, `EXPORT_ICON`, `FILTERS_ICON`, `COLUMNS_ICON` as `string` constants holding inline SVG markup. `Header` and `Toolbar` each take a `utilities?: Snippet` prop and render it. `Page.svelte` defines the snippet once and passes the same one to both.

**Why two hosts:** above 800px the utilities are worded in the masthead; below it they are icons on the control row. Two different parents, so one node cannot serve both. The markup is written once and instantiated twice, with CSS hiding the wrong instance — `display: none` keeps the hidden one out of the accessibility tree, so no control ends up with two accessible names.

- [ ] **Step 1: Write the failing tests**

Add to `app/src/Page.test.ts`:

```ts
// Two hosts, one visible at a time — but jsdom evaluates no media query, so what is asserted here
// is the property that matters for assistive tech: exactly one node answers to each name once the
// hidden host is discounted. `smoke.spec.ts` measures which one is on screen.
it('gives every utility exactly one accessible name per host', async () => {
  render(Page, { props: { data } });
  await screen.findByRole('button', { name: 'Export CSV' });
  for (const name of ['Copy link', 'Export CSV']) {
    const found = screen.getAllByRole('button', { name });
    expect(found.length).toBeLessThanOrEqual(2);
    for (const el of found) expect(el).toHaveAccessibleName(name);
  }
  expect(screen.getAllByRole('button', { name: /Toggle theme/ }).length).toBeLessThanOrEqual(2);
});
```

That is the only new unit test for this task. Both hosts render a snippet they are handed, which is
Svelte's behaviour rather than ours; what is worth asserting is the property the two hosts create
together — one accessible name per control — and that is asserted above in `Page.test.ts` and
measured per band by the e2e guard in Step 6. Do not add a `Toolbar` test that only checks the host
element exists; it would assert nothing.

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run test -- Page`
Expected: FAIL — only one host renders the utilities today.

- [ ] **Step 3: Create the icons module**

Create `app/src/components/icons.ts`. **Path data only, never whole SVG documents:** `{@html}` has exactly two sanctioned sinks in this app and neither is an icon, and `html-boundary.test.ts` fails the build the moment a third appears (docs/app.md §Sanitised-HTML boundary). The geometry is shared; each `<svg>` element is written in its template.

```ts
/**
 * One home per glyph: each of these is drawn in two hosts (docs/app.md §Where the utilities live),
 * and a second copy is how one control ends up looking like two. Geometry only — the `<svg>`
 * wrapper, its size and its `aria-hidden` belong to the template, because the accessible name is
 * the button's and an icon carrying one of its own would announce twice.
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

Cut `copyLink`, the `copied` state and the three buttons out of `Header.svelte` into `Page.svelte`, and define one snippet there. It takes `worded` so the two hosts differ in their label rather than in their markup:

```svelte
{#snippet utilities(worded: boolean)}
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

Type the prop on both hosts as `utilities?: Snippet<[boolean]>` (`import type { Snippet } from 'svelte'` — `Toolbar.svelte` already imports it for `columns`).

Pass the same snippet to both hosts, leaving every other prop on each as it is: add `utilities={utilities}` to the existing `<Header … />` and `<Toolbar … >` calls. `Header` renders `{@render utilities?.(true)}`, `Toolbar` renders `{@render utilities?.(false)}`.

Each host hides its instance at the band it does not own:

```css
/* Header.svelte */
@media (max-width: 800px) { .utils-host { display: none; } }
/* Toolbar.svelte */
@media (min-width: 800.02px) { .utils-host { display: none; } }
```

`display: none` rather than `visibility` or an off-screen shift, deliberately: it is what takes the hidden instance out of the accessibility tree so no control has two names.

**Where the host sits in each parent.** In `Header.svelte` it is the last child, after `.prov`. In `Toolbar.svelte` it is the last child of `.actions`, after the column picker, and it carries `margin-left: auto` — that is what splits the control row into "what opens a panel" on the left and "what you do to a table you are happy with" on the right, which is the composition the design was signed off on. Without it the five controls bunch at one end and the row's 90px of slack lands in the wrong place.

```css
  /* Toolbar.svelte */
  .actions .utils-host { margin-left: auto; }
```

- [ ] **Step 5: Run the suite**

Run: `npm run verify`
Expected: PASS. `Header.test.ts`'s clipboard tests now belong to `Page.test.ts` — move them rather than deleting them, keeping every assertion including the two failure paths (no clipboard, and a rejecting clipboard) and the always-rendered empty live region.

- [ ] **Step 6: Prove one host is visible per band, in a browser**

Add to `app/e2e/smoke.spec.ts`:

```ts
/**
 * The three utilities are written once and instantiated in two hosts, so exactly one instance must
 * be on screen at any width — two would be two tab stops with the same name, and zero would lose
 * the controls. jsdom evaluates no media query, so only a browser can answer it.
 */
test('shows each utility exactly once at every width', async ({ page }) => {
  for (const width of [360, 390, 430, 560, 700, 799, 800, 801, 900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const name of ['Copy link', 'Export CSV']) {
      await expect(page.getByRole('button', { name }), `at ${width}px`).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: /^Toggle theme/ })).toHaveCount(1);
  }
});
```

Playwright's `getByRole` ignores `display: none` subtrees, so this asserts exactly what the a11y tree sees.

Run: `npm -w app run e2e:docker`
Expected: green.

- [ ] **Step 7: Document it**

`docs/app.md`: add §Where the utilities live — one snippet, two hosts, `display: none` chosen for the accessibility tree, and the e2e guard's name.

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
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: the `utilities` snippet prop from Task 5.
- Produces: below 800px `<header>` has exactly two children — `<h1>` and `.prov` — where `.prov` stacks `.count` over the credit, right-aligned. Above 800px the masthead is exactly what it is today.

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
  <span class="utils-host">{@render utilities?.(true)}</span>
</header>
```

CSS: `.prov` is a right-aligned column below 800px and dissolves into today's inline arrangement above it.

```css
  .prov { display: flex; align-items: center; gap: var(--gap-x); }
  .credit { display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
            text-decoration: none; color: var(--text); }

  @media (max-width: 800px) {
    /* The spacer stays — it is what makes the banner flush right, and deleting it is exactly what
       left 59px of air at 390px and 248px at 700px on the old header. */
    header { --gap-x: var(--s3); flex-wrap: nowrap; padding: var(--s1) var(--s2); }
    .prov { flex-direction: column; align-items: flex-end; gap: 0; }
    /* One line, not the desktop's stack: the block above it already carries the small print. */
    .credit { flex-direction: row; align-items: baseline; gap: 5px; }
  }
```

Delete the old `@media (max-width: 800px)` block's `flex-wrap: wrap`, `.spacer { display: none }` and `.credit { align-items: flex-start }` rules, and the `@media (max-width: 560px)` block **only if** the count still fits — see Step 4.

- [ ] **Step 4: Measure the banner rather than assuming it**

The old `max-width: 560px` rule dropped `.count` to `--t-xs` because at `--t-sm` the widest month (`Sept`) wrapped the line at 360px. The banner is a different composition, so re-measure rather than keeping or dropping the rule on faith. Write `/tmp/banner-fit.mjs`:

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

Expected: `overflow: 0` at every width, `air` ≤ 1 at every width below 800 (that is what "flush" means), and `height` no greater at 360 than at 430. **Run the same script in Firefox** (`import { firefox }`) — the user's daily browser, and the one Chromium-only checks have misrepresented before.

Bind whatever the widest month costs: temporarily set `builtAt` to a September date in the dev data or override the rendered text in the page, and re-run at 360px. If it wraps, keep the `--t-xs` step and say so in the comment; if it does not, delete the rule and say why in the commit.

- [ ] **Step 5: Run the suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Document it**

`docs/app.md`: the header is one row at every width; below 800px the provenance block stacks and the banner is flush; the spacer is load-bearing and must not be deleted again. Record the measured trailing air as the bound (`≤1px`), not as a screenshot claim.

- [ ] **Step 7: Commit**

```bash
git add app/src docs/app.md
git commit -m "Stand the provenance opposite the name and hold the right edge"
```

---

### Task 7: The band ladder

**Files:**
- Modify: `app/src/components/Toolbar.svelte`, `app/src/components/ColumnPicker.svelte`
- Modify: `app/e2e/smoke.spec.ts`
- Modify: `docs/app.md`

**Interfaces:**
- Consumes: `.setup` and `.actions` from Task 3, the icon paths from Task 5.
- Produces: the toolbar's DOM order is `.setup` then `.actions` at every width; CSS alone moves them. No new props.

**The ladder, exactly:**

| query | composition |
|---|---|
| (none — above 800px) | one row: `.setup` (zone · story · Stability) — spacer — `.actions` (About, Columns). No Filters: the sidebar is permanent. |
| `max-width: 800px` | one row: `.setup` — spacer — `.actions` (About, Filters icon, Columns icon, utilities icons) |
| `max-width: 699.98px` | two rows: `.actions` first (order: -1), then `.setup`. `.setup` is `space-between`, capped at `414px` and centred |
| `max-width: 429.98px` | `.setup` drops the cap: full width, `space-between`, flush to both padding edges |
| `max-width: 374.98px` | `.s` inline padding `var(--s2)` → `var(--s1)` |

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
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm -w app run e2e -- --grep "lays the chrome out in bands" --project=chromium`
Expected: FAIL at the 660px case — today the bar does not split into `.setup` and `.actions` rows.

- [ ] **Step 3: Implement the ladder**

Replace `Toolbar.svelte`'s three media blocks with:

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
    .filters-toggle { display: inline-flex; }
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
     that reach 171px by 700px. */
  @media (max-width: 429.98px) {
    .setup { max-width: none; margin-inline: 0; }
  }

  /* 360px is the binding width, not 375 — it is the usual Android one. At `--s2` a pill the three
     groups need 353px against the 344px this padding leaves; at `--s1` they need 323px. */
  @media (max-width: 374.98px) {
    .s { padding-inline: var(--s1); }
  }
```

Delete `.sep` and its markup: with the pill joining the run, a hairline between the first and second of three groups reads as arbitrary, and no band below 800px has one (spec §Decisions — the group divider goes).

- [ ] **Step 4: Give Filters and Columns their icon forms below 700px**

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
  @media (max-width: 699.98px) {
    .word { display: none; }
    .glyph { display: inline-flex; }
  }
```

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
  @media (max-width: 699.98px) {
    .word, .chev { display: none; }
    .glyph { display: inline-flex; }
    summary { padding-inline: var(--s2); }
  }
```

`aria-label` on the summary rather than a visually-hidden span: the accessible name must not change with the viewport, and the count belongs in it because the badge is the only remaining indication of what the control holds.

- [ ] **Step 5: Run and watch it pass**

Run: `npm -w app run e2e -- --grep "lays the chrome out in bands" --project=chromium`
Expected: PASS. Then the full `npm -w app run e2e:docker` — all three engines.

- [ ] **Step 6: Verify no band overflows, in both engines**

Write `/tmp/band-fit.mjs` walking 360→1440 in 10px steps, asserting for `header`, `.setup` and `.actions` that `scrollWidth - clientWidth <= 0` and that no element's right edge passes its parent's padding box. Run it in **chromium and firefox**. Any overflow is a bug in this task, not a tolerance.

- [ ] **Step 7: Document it**

`docs/app.md`: add §The chrome bands — the table of queries above, why `800` is shared with the sidebar, why 700 rather than 629, why the cap is 414 and what it preserves, and that the divider is gone. State the numbers as bounds that can be re-measured.

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

Then delete the `.toolbar.no-groups` class and its rule if nothing reads it any more: with `.setup` empty, the actions already hold the right edge and the rule it existed for is gone. `grep -rn "no-groups" app/` before deleting, and remove the assertion in `Toolbar.test.ts` that names it.

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

`degrades the toolbar in tiers and keeps the table header clear of the chrome` is written against `.sep`, `.stability` and the 880/610 boundaries, none of which survive. Keep its second half verbatim — the pinned-header-clears-the-chrome loop at 1200/700/375 is still exactly right and is the `--thead-top` guard. Delete the first half and let Task 7's `lays the chrome out in bands` own the tier claims. Keep the `paceW === wrapW` assertion (the story group must not stretch) by folding it into the bands test.

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

- [ ] **Step 3: Add the accessible-name sweep**

```ts
/**
 * Five controls lose their words below 700px. Each keeps the name its worded form had, at every
 * width — an icon that ships without one is unusable and untestable at the same time.
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
    await expect(page.getByRole('button', { name: /^Columns/ })).toHaveCount(1);
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
Expected: both green, all three engines.

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
- [ ] `npm -w app run e2e:docker` — green, all three engines
- [ ] Rebase onto `main` and fast-forward — no merge commits (docs/decisions.md §Linear history, no merge commits)
- [ ] Remove the worktree, delete the branch
- [ ] `data/` is **not** regenerated on this branch — this is a code-only change

## Self-review notes for the implementer

Two places where this plan tells you to check before you write, rather than telling you what you will find. Both are real:

1. **Task 5, Step 1** — whether the installed `@testing-library/svelte` can construct a snippet prop. If it cannot, assert the two-host behaviour through `Page.test.ts` and the e2e guard only, and delete the placeholder. Do not ship a test that asserts nothing.
2. **Task 8, Step 3** — the pill may already be absent on the landing screen when you get there, because Task 3 put it inside `{#if showGroups}`. Keep the test anyway; it guards a rule with a reason that is not visible from the markup.
