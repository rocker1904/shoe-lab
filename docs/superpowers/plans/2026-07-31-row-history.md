# Row-based history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Back close an open shoe panel instead of leaving the site, and let a shared link carry which rows are open.

**Architecture:** The open-row set moves out of the two table components into `Page.svelte`, where it lives **beside** `ViewState` rather than inside it, so the toolbar's derived marks cannot see it. It gets its own `open=` URL token via a new `serializeOpen`/`parseOpen` pair. A change to that set is the **only** thing that calls `pushState`; every view change keeps the existing debounced, replace-only path untouched. `popstate` takes only the open set from the entry it lands on and keeps the live view.

**Tech Stack:** Svelte 5 (runes, `SvelteSet`), TypeScript, Vitest + @testing-library/svelte (jsdom), Playwright (chromium/firefox/webkit).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-row-history-design.md`. Where it disagrees with `docs/`, `docs/` wins.
- **TDD**: failing test first, every task. `npm run verify` green before every commit.
- **Docs ride the change**: a behaviour-changing commit updates the owning doc in the same commit.
- **Comments are WHY-only** (docs/README.md §Rules, rule 5). Every comment below is written to that bar — keep them as given.
- **No live network in tests, ever.**
- Commits: concise single-line subjects, no embedded measurements, trailer `Co-Authored-By: <authoring model> <noreply@anthropic.com>`.
- Work happens in the worktree `~/dev/shoe-lab-row-history` on branch `row-history`. Do not regenerate `data/`.
- Run commands from the repo root: `npm run verify`, `npm run test`, `npm -w app run e2e`.

---

### Task 1: `cancel()` on the debounce

`popstate` needs to drop a pending write rather than land it: the write belongs to the entry just left, which can no longer be reached.

**Files:**
- Modify: `app/src/lib/debounce.ts`
- Test: `app/src/lib/debounce.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Debounced<A>.cancel(): void` — drops the pending call without invoking `fn`.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('debounce', ...)` block in `app/src/lib/debounce.test.ts`:

```ts
  it('cancels the pending call, for popstate', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.cancel();
    vi.advanceTimersByTime(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not resurface a cancelled call on the next flush', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.cancel();
    write.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('takes a fresh call after a cancel', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.cancel();
    write('b');
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledExactlyOnceWith('b');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- debounce`
Expected: FAIL — `write.cancel is not a function`.

- [ ] **Step 3: Implement `cancel`**

In `app/src/lib/debounce.ts`, add to the interface after `flush()`:

```ts
  /** Drop the pending call unwritten. `popstate` is the caller: the pending write belongs to the
   *  entry just left, which can no longer be reached, so landing it would put one view's address on
   *  another entry (docs/app.md §View and URL ownership). */
  cancel(): void;
```

and beside `out.flush = fire;`:

```ts
  out.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- debounce`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/debounce.ts app/src/lib/debounce.test.ts
git commit -m "Let a pending write be dropped as well as landed"
```

---

### Task 2: The `open=` encoding

Two new pure functions. `ViewState`, `serializeView` and `parseView` are **not** touched — `parseView`'s body is a chain of `else if`s on known keys, so an `open=` token already falls through, and this task pins that.

**Files:**
- Modify: `app/src/lib/urlstate.ts`
- Test: `app/src/lib/urlstate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `serializeOpen(open: string[]): string` — `''` when empty, else `open=<slug>,<slug>` (commas percent-encoded by `URLSearchParams`, as `brands` and `plate` already are).
  - `parseOpen(qs: string, slugs: ReadonlySet<string>): string[]` — deduped, catalogue-checked, insertion order preserved.

- [ ] **Step 1: Write the failing tests**

In `app/src/lib/urlstate.test.ts`, extend the import from `./urlstate` with `parseOpen, serializeOpen`, extend the import from `./test-fixtures` with `FLEET`, and add this block after `describe('urlstate', ...)`:

```ts
describe('open rows', () => {
  const SLUGS = new Set(FLEET.map((s) => s.slug));

  it('serialises nothing when no row is open', () => {
    expect(serializeOpen([])).toBe('');
  });
  it('round-trips an open set, in the order it was opened', () => {
    expect(parseOpen(serializeOpen(['racer', 'cushy']), SLUGS)).toEqual(['racer', 'cushy']);
  });
  it('drops a slug the catalogue no longer has', () => {
    expect(parseOpen('open=cushy,gone-shoe', SLUGS)).toEqual(['cushy']);
  });
  it('an all-separator value stays empty rather than becoming a member', () => {
    expect(parseOpen('open=,,', SLUGS)).toEqual([]);
  });
  it('dedupes a repeated slug', () => {
    expect(parseOpen('open=cushy,cushy', SLUGS)).toEqual(['cushy']);
  });
  // The two encodings compose into one address, so neither may write the other's token.
  it('serializeView never emits an open key', () => {
    const v = defaultView();
    v.filters.brands = ['Brand'];
    expect(serializeView(v)).not.toContain('open');
  });
  it('parseView ignores an open token', () => {
    expect(sameValue(parseView('open=cushy', idx), defaultView())).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- urlstate`
Expected: FAIL — `serializeOpen is not a function`.

- [ ] **Step 3: Implement the pair**

Append to `app/src/lib/urlstate.ts`:

```ts
/**
 * The open detail panels — what the runner is *reading*, which is not part of what they searched.
 * Deliberately not a `ViewState` field: the toolbar marks are `sameValue` comparisons of whole
 * views, so an open row in there would unmark the story the moment one was tapped
 * (docs/app.md §View and URL ownership).
 */
export function serializeOpen(open: string[]): string {
  if (!open.length) return '';
  const p = new URLSearchParams();
  p.set('open', open.join(','));
  return p.toString();
}

/**
 * The catalogue is passed in because this function's signature is free to take it — `parseView` is
 * locked to a `TestIndex` by its call sites and could never vouch for a shoe slug. So a slug that
 * has left the fleet is dropped rather than carried inert, which is the contract the rest of the
 * encoding already keeps (docs/app.md §URL encoding).
 */
export function parseOpen(qs: string, slugs: ReadonlySet<string>): string[] {
  const raw = new URLSearchParams(qs).get('open');
  if (!raw) return [];
  // The same all-separator rule `brands`, `plate` and `rows` follow: ",," is absent, not empty.
  return [...new Set(raw.split(',').filter(Boolean))].filter((slug) => slugs.has(slug));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- urlstate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/urlstate.ts app/src/lib/urlstate.test.ts
git commit -m "Give the open detail panels an encoding of their own"
```

---

### Task 3: Lift the open set out of the two tables

`ShoeTable.svelte` and `ShoeTableMobile.svelte` each own a `SvelteSet`, and only one of them is ever mounted — so crossing 700px silently drops every open row today. `Page.svelte` takes ownership. **No URL or history behaviour yet.**

The set is passed down and **mutated in place, never replaced**: both tables hold this exact object, so a new one would leave them reading the old.

**Files:**
- Modify: `app/src/components/ShoeTable.svelte:1-80`, `app/src/components/ShoeTable.svelte:107-131`
- Modify: `app/src/components/ShoeTableMobile.svelte:1-108`, `app/src/components/ShoeTableMobile.svelte:136-158`
- Modify: `app/src/Page.svelte` (script; both table call sites at `:331-337`)
- Modify: `docs/app.md` §Two renderings, and only one of them mounted
- Test: `app/src/components/ShoeTable.test.ts:12-19`, `app/src/components/ShoeTableMobile.test.ts:16-24`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: both tables take two new props — `open: ReadonlySet<string>` and `ontoggle: (slug: string) => void`. `Page.svelte` exposes neither; it holds `const open = new SvelteSet<string>()` and `function toggleOpen(slug: string): void`.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/ShoeTable.test.ts` inside `describe('ShoeTable', ...)`:

```ts
  // The set is the parent's now, so a row opened before the component remounts is still open after
  // — which is what makes crossing 700px stop dropping every panel.
  it('renders a panel for a row the parent already has open', () => {
    setup({ open: ['cushy'] });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });
```

and add the matching test to `app/src/components/ShoeTableMobile.test.ts` inside `describe('ShoeTableMobile', ...)`:

```ts
  it('renders a panel for a card the parent already has open', () => {
    setup({ open: ['cushy'] });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- ShoeTable`
Expected: FAIL — `setup` does not accept `open`, and no panel renders.

- [ ] **Step 3: Update both test harnesses**

In `app/src/components/ShoeTable.test.ts`, replace `setup` (lines 12–19) with:

```ts
function setup(over: { shoes?: Shoe[]; view?: Partial<ViewState>; scores?: ScoreColumns; open?: string[] } = {}) {
  const onchange = vi.fn();
  const view = { ...defaultView(), ...over.view };
  view.columns = over.view?.columns ?? ['score', 'heel-stack', 'plate'];
  // The set lives in Page.svelte now, so this helper plays the parent. A `SvelteSet` mutated in
  // place is what the component actually receives, so no re-render plumbing is needed here either.
  const open = new SvelteSet<string>(over.open ?? []);
  const rendered = render(ShoeTable, { props: { shoes: over.shoes ?? FLEET, data, view, onchange,
    scores: over.scores ?? new Map(), stability: false, open,
    ontoggle: (slug: string) => { if (!open.delete(slug)) open.add(slug); } } });
  return Object.assign(onchange, { rendered });
}
```

and add to its imports:

```ts
import { SvelteSet } from 'svelte/reactivity';
```

In `app/src/components/ShoeTableMobile.test.ts`, replace `setup` (lines 16–24) with:

```ts
function setup(over: { shoes?: Shoe[]; view?: Partial<ViewState>; scores?: ScoreColumns; tests?: LabTest[]; open?: string[] } = {}) {
  const onchange = vi.fn();
  const view = { ...defaultView(), ...over.view };
  view.columns = over.view?.columns ?? ['releasedAt', 'score', 'heel-stack', 'plate'];
  // The set lives in Page.svelte now, so this helper plays the parent. A `SvelteSet` mutated in
  // place is what the component actually receives, so no re-render plumbing is needed here either.
  const open = new SvelteSet<string>(over.open ?? []);
  const rendered = render(ShoeTableMobile, {
    props: { shoes: over.shoes ?? FLEET, data: over.tests ? { ...data, tests: over.tests } : data,
      view, onchange, scores: over.scores ?? new Map(), stability: false, open,
      ontoggle: (slug: string) => { if (!open.delete(slug)) open.add(slug); } } });
  return Object.assign(onchange, { rendered });
}
```

and add to its imports:

```ts
import { SvelteSet } from 'svelte/reactivity';
```

- [ ] **Step 4: Make both components controlled**

In **`app/src/components/ShoeTable.svelte`**:

Delete the import `import { SvelteSet } from 'svelte/reactivity';` (line 3) and delete line 33 with its comment:

```ts
  // A set, not a single slug: comparing two shoes means having both panels open at once.
  const expanded = new SvelteSet<string>();
```

Add to the `$props()` type, after `stability: boolean;` and its comment:

```ts
    /** Owned by `Page.svelte`, because only one of the two tables is ever mounted and a set owned
     *  here would be dropped whole every time the viewport crossed 700px
     *  (docs/app.md §Two renderings, and only one of them mounted). */
    open: ReadonlySet<string>;
    ontoggle: (slug: string) => void;
```

and to the destructuring: `let { shoes, data, view, scores, stability, open, ontoggle, onchange }`.

Replace `toggle` (lines 65–74) with:

```ts
  async function toggle(slug: string, row: HTMLElement | null) {
    const opening = !open.has(slug);
    ontoggle(slug);
    if (!opening) return;
    // The panel opens *below* the row, so a row near the fold opens off screen. Awaited so the
    // panel exists to be scrolled to. jsdom implements no layout and defines neither
    // `scrollIntoView` nor `matchMedia`, hence the optional calls.
    await tick();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    row?.nextElementSibling?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
```

Then replace every remaining `expanded.has(` with `open.has(` — four occurrences, at lines 107, 108, 115 and 129.

In **`app/src/components/ShoeTableMobile.svelte`**: make the identical prop change (same comment, same two props, same destructuring addition), delete the `SvelteSet` import (line 3) and `const expanded = new SvelteSet<string>();` (line 32), and replace `toggle` (lines 92–102) with:

```ts
  async function toggle(slug: string, row: HTMLElement | null) {
    const opening = !open.has(slug);
    ontoggle(slug);
    if (!opening) return;
    // The panel opens below the shoe, so a shoe near the fold opens off screen. Awaited so the
    // panel exists to be scrolled to. jsdom implements no layout and defines neither
    // `scrollIntoView` nor `matchMedia`, hence the optional calls.
    await tick();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    row?.nextElementSibling?.nextElementSibling?.scrollIntoView?.(
      { behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
```

Then replace every remaining `expanded.has(` with `open.has(` — four occurrences, at lines 136, 137, 140 and 156.

- [ ] **Step 5: Give `Page.svelte` the set**

Add to the imports:

```ts
  import { SvelteSet } from 'svelte/reactivity';
```

Add after `let showFilters = $state(false);`:

```ts
  /**
   * What the runner is reading, held beside the view rather than inside it: every toolbar mark is a
   * `sameValue` comparison of whole `ViewState`s, so an open panel in there would unmark the story
   * the moment a row was tapped (docs/app.md §View and URL ownership).
   *
   * Mutated, never replaced — both tables hold this exact set, and a new object would leave them
   * reading the old one.
   */
  const open = new SvelteSet<string>();

  function toggleOpen(slug: string) {
    if (!open.delete(slug)) open.add(slug);
  }
```

Pass both to each table (`Page.svelte:331-337`):

```svelte
      {#if phone}
        <ShoeTableMobile shoes={visibleSorted} {data} {view} {scores} {open} ontoggle={toggleOpen}
                         stability={view.stability} onchange={setView} />
      {:else}
        <ShoeTable shoes={visibleSorted} {data} {view} {scores} {open} ontoggle={toggleOpen}
                   stability={view.stability} onchange={setView} />
      {/if}
```

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: PASS. All existing expansion tests in both component suites still pass unchanged — the harnesses mutate a real `SvelteSet`, so a click still opens a panel.

- [ ] **Step 7: Update the owning doc**

In `docs/app.md`, in §Two renderings, and only one of them mounted, add after the paragraph explaining that only one table is mounted:

```markdown
**Because only one is mounted, neither may own the open-row set.** A set held in the
component is dropped whole the moment the viewport crosses 700px, so a phone rotated
mid-read closed every panel. `Page.svelte` owns it and passes it to whichever table is
up, mutated in place rather than replaced — both renderings hold the same object.
```

- [ ] **Step 8: Commit**

```bash
git add app/src/Page.svelte app/src/components/ShoeTable.svelte app/src/components/ShoeTableMobile.svelte app/src/components/ShoeTable.test.ts app/src/components/ShoeTableMobile.test.ts docs/app.md
git commit -m "Let the page own which rows are open, not whichever table is mounted"
```

---

### Task 4: Push on open, replace on everything else

The behaviour change. A history entry records which rows are open and nothing else.

**Files:**
- Modify: `app/src/Page.svelte:41-49` (init), `:200-228` (write path), `:230+` (handlers)
- Modify: `docs/app.md` §View and URL ownership, §URL encoding
- Test: `app/src/Page.test.ts`

**Interfaces:**
- Consumes: `debounce().cancel()` (Task 1); `serializeOpen`, `parseOpen` (Task 2); `const open` and `toggleOpen` in `Page.svelte` (Task 3).
- Produces: no new exports. `VIEW_WRITE_MS` and `serializeView`'s output are unchanged, so `VIEW_STORAGE_KEY` stays `v4`.

- [ ] **Step 1: Write the failing tests**

Add to `app/src/Page.test.ts`. Extend the `./lib/urlstate` import with nothing new; add `parseOpen` is not needed here. Add this block at the end of the file's top-level `describe` (or as a new top-level `describe` matching the file's existing structure):

```ts
describe('history is row-based', () => {
  /** The row strip is the click target in both renderings; jsdom always mounts the desktop one. */
  const rowFor = (name: string) => screen.getByText(name).closest('tr')!;

  it('opens a row with a history entry rather than a replacement', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    expect(push).toHaveBeenCalledOnce();
    expect(location.search).toContain('open=cushy');
  });

  it('closing a row is its own entry, never a history.back()', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    await fireEvent.click(rowFor('cushy'));
    expect(push).toHaveBeenCalledTimes(2);
    expect(location.search).not.toContain('open=');
  });

  // The bound that keeps the debounce safe: a dragged handle fires about sixty view updates a
  // second, and none of them may reach the history stack.
  it('a filter change never pushes', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    settle();
    expect(push).not.toHaveBeenCalled();
    expect(location.search).not.toBe('');
  });

  // Without the flush, the pending replace lands on the NEW entry 200ms later and closes in the URL
  // a row that is open on screen.
  it('flushes the pending view write before pushing', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    await fireEvent.click(rowFor('cushy'));
    settle();
    expect(location.search).toContain('open=cushy');
  });

  it('Back closes the row and keeps a filter changed while it was open', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    settle();
    expect(location.search).toContain('open=cushy');
    // jsdom's own history traversal is asynchronous and this suite runs on a fake clock, so the
    // entry Back lands on is put in place directly and the event a browser would fire is dispatched.
    history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();
    expect(location.search).not.toContain('open=');
    expect(location.search).toContain('sort=');
  });

  // Cancelled, not flushed. A flush would land the pre-Back address on the entry Back arrived at
  // before the reconciling write overwrote it — invisible in the final URL, so the call count is
  // what distinguishes the two.
  it('Back cancels the pending write rather than landing it', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    const replace = vi.spyOn(history, 'replaceState');
    history.replaceState(null, '', '/');
    replace.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();
    settle();
    expect(replace).toHaveBeenCalledOnce();
  });

  it('storage keeps the view and not the reading', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    settle();
    expect(localStorage.getItem(VIEW_STORAGE_KEY) ?? '').not.toContain('open');
  });

  it('a link carrying open rows arrives with them open', async () => {
    history.replaceState(null, '', '/?open=cushy');
    render(Page, { props: { data } });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });

  it('a link naming a shoe that has left the fleet opens nothing', async () => {
    history.replaceState(null, '', '/?open=gone-shoe');
    render(Page, { props: { data } });
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });

  // The whole reason the open set sits outside `ViewState`.
  it('an open row does not unmark the story', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    settle();
    expect(screen.getByRole('radio', { name: /Easy/, checked: true })).toBeInTheDocument();
    // `cushy` rather than `racer`: Easy gates carbon out, so the carbon shoe is not on screen.
    await fireEvent.click(rowFor('cushy'));
    expect(screen.getByRole('radio', { name: /Easy/, checked: true })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- Page`
Expected: FAIL — `pushState` is never called; `open=` never reaches `location.search`.

- [ ] **Step 3: Parse the token at init**

In `app/src/Page.svelte`, extend the `./lib/urlstate` import with `parseOpen, serializeOpen`, and replace the `initial` block (lines 44–49) with:

```ts
  const initial = untrack(() => {
    const qs = location.search.replace(/^\?/, '');
    const stored = qs ? null : readStoredView();
    // Read from the query string only, never from storage: a stored view never carries open rows,
    // so a returning visitor does not find last week's panel hanging open mid-table.
    const openRows = parseOpen(qs, new Set(data.shoes.map((s) => s.slug)));
    return { view: parseView(qs || stored || '', indexTests(data.tests)), restored: stored !== null,
             bare: !qs && stored === null, open: openRows };
  });
```

and seed the set (Task 3's `const open`):

```ts
  const open = new SvelteSet<string>(initial.open);
```

- [ ] **Step 4: Compose the address, and split the write**

Replace the write path (lines 207–223) with:

```ts
  /** The address bar carries the view and the reading; storage carries only the view. Composing
   *  them here is what keeps `serializeView` free of the `open` token, and so keeps `persist.ts`
   *  storing its exact output (docs/app.md §View and URL ownership). */
  const addressOf = (v: ViewState, rows: string[]) =>
    [serializeView(v), serializeOpen(rows)].filter(Boolean).join('&');

  /**
   * Still the one write path, now asynchronous. A drag fires about sixty view updates a second, so
   * writing on each would make a two-second gesture 120 `replaceState` calls — past Safari's
   * throttle inside a single drag — plus 120 synchronous storage writes. The state assignment in
   * `setView` stays immediate, so the table filters live (docs/app.md §View and URL ownership).
   */
  const writeView = debounce((address: string, stored: string) => {
    history.replaceState(null, '', address ? `?${address}` : location.pathname);
    writeStoredView(stored);
  }, VIEW_WRITE_MS);
  // A page being torn down cannot wait out a timer, and `pagehide` is the last event a bfcache
  // navigation reliably delivers.
  const flushView = () => writeView.flush();
  window.addEventListener('pagehide', flushView);
  window.addEventListener('popstate', onPopState);
  onDestroy(() => {
    window.removeEventListener('pagehide', flushView);
    window.removeEventListener('popstate', onPopState);
    flushView();
  });

  function setView(v: ViewState) {
    view = v;
    writeView(addressOf(v, [...open]), serializeView(v));
  }
```

- [ ] **Step 5: Make the toggle the one thing that pushes**

Replace `toggleOpen` (added in Task 3) with:

```ts
  /**
   * The only thing in the app that pushes. Back is a navigation gesture rather than an undo, and the
   * one place this tool has to navigate to is a shoe — so an entry records which rows are open, and
   * a filter never spends one (docs/app.md §View and URL ownership).
   *
   * The pending view write is flushed first: it belongs to the entry being left, and left pending it
   * would land on the new one 200ms later and close in the URL a row that is open on screen.
   *
   * Closing is a push too. `history.back()` would assume the row being closed owns the top entry,
   * which two open rows disprove.
   */
  function toggleOpen(slug: string) {
    writeView.flush();
    if (!open.delete(slug)) open.add(slug);
    const address = addressOf(snapshot, [...open]);
    history.pushState(null, '', address ? `?${address}` : location.pathname);
  }

  /**
   * A history entry records which rows are open; every other dimension is always the live view. So
   * Back takes only the open set from the entry it lands on and leaves the view alone — adopting the
   * popped address wholesale would discard any filter changed while the row was open — then
   * reconciles the address bar to the merge.
   *
   * The pending write is CANCELLED rather than flushed: it belongs to the entry just left, which can
   * no longer be reached. Nothing is lost — `setView` assigns the state immediately, so the live
   * view already holds the change and the write below carries it (docs/app.md §View and URL ownership).
   */
  function onPopState() {
    writeView.cancel();
    const rows = parseOpen(location.search.replace(/^\?/, ''), new Set(data.shoes.map((s) => s.slug)));
    for (const slug of [...open]) if (!rows.includes(slug)) open.delete(slug);
    for (const slug of rows) open.add(slug);
    const address = addressOf(snapshot, [...open]);
    history.replaceState(null, '', address ? `?${address}` : location.pathname);
    writeStoredView(serializeView(snapshot));
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- Page`
Expected: PASS.

- [ ] **Step 7: Run the full gate**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 8: Update the owning doc**

In `docs/app.md` §View and URL ownership, **replace** the paragraph beginning "`popstate` is deliberately unhandled" with:

```markdown
**Back closes the shoe you opened, and nothing else pushes.** Back is a navigation
gesture rather than an undo, and this tool has one screen plus N shoe panels: filters,
sort, columns and the story buttons are the one place being tuned, so they keep the
`replaceState`-only path. A change to the open-row set is the only thing that calls
`pushState`, and it flushes the pending view write first — left pending, that write
lands on the new entry 200ms later and closes in the URL a row that is open on screen.
Closing a row is a push too: `history.back()` would assume the row being closed owns the
top entry, which two open rows disprove.

**A history entry records which rows are open; every other dimension is always the live
view.** `popstate` therefore takes only the open set from the entry it lands on, keeps
the view as it stands, and `replaceState`s the merge. Adopting the popped address
wholesale would discard any filter changed while the row was open. The pending write is
`cancel`led rather than flushed — it belongs to the entry just left, which can no longer
be reached — and nothing is lost, because the state assignment was immediate and the
reconciling write carries it.

The open set is held **beside** `ViewState`, not in it. Every toolbar mark is a
`sameValue` comparison of whole views (§Presets), so an `open` field would unmark the
story the moment a row was tapped. Keeping it out makes that unreachable rather than
handled, and leaves `applyPreset`, `allView` and `projectZone` with nothing to carry.
It is also why storage still holds **the exact output of `serializeView`**: that
function never emits the token, so a returning visitor gets their view back without last
week's panel hanging open.
```

In `docs/app.md` §URL encoding, add `open` to the token list — after the `rows` entry in the opening paragraph, extend it to read `` `rows` (comma-joined), `open` (comma-joined shoe slugs) `` — and add after the `stab=1` paragraph:

```markdown
`open` names the shoes whose detail panels are showing, and is the one token that is not
view state: it is what the runner is reading rather than what they searched, and it is
the only thing a history entry records (§View and URL ownership). It is parsed by its own
`parseOpen` rather than by `parseView`, which is what lets it be checked against the
fleet — `parseView` only ever receives a `TestIndex` and could never vouch for a shoe
slug. A slug that has left the fleet is dropped, and an all-separator value stays absent,
the same rule `brands`, `plate` and `rows` follow.
```

- [ ] **Step 9: Commit**

```bash
git add app/src/Page.svelte app/src/Page.test.ts docs/app.md
git commit -m "Make Back close the shoe and let a link carry the open panels"
```

---

### Task 5: Prove it in a real browser, and close the backlog item

jsdom cannot prove either headline claim: its `matchMedia` stub never fires a change event, so the 700px crossing is unreachable, and its history traversal is asynchronous under the suite's fake clock. Both are asserted at real widths in Playwright.

**Files:**
- Modify: `app/e2e/smoke.spec.ts`
- Modify: `app/e2e/cross-browser.spec.ts`
- Modify: `BACKLOG.md:9`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: nothing.

- [ ] **Step 1: Write the failing e2e tests**

Add to `app/e2e/smoke.spec.ts`:

```ts
test('Back closes the open shoe instead of leaving the site', async ({ page }) => {
  await page.goto('/?plate=carbon');
  await page.getByText('racer').first().click();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();
  await expect(page).toHaveURL(/open=racer/);

  await page.goBack();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toHaveCount(0);
  // The filter that was in the address before the row was opened is still there, and so is the app.
  await expect(page).toHaveURL(/plate=carbon/);
  await expect(page.getByTestId('receipt')).toBeVisible();
});
```

Add to `app/e2e/cross-browser.spec.ts`:

```ts
test('keeps an open panel across the 700px rendering swap', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.getByText('cushy').first().click();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();

  // The two tables are separate components and only one is ever mounted, so this crossing used to
  // drop every open panel.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByTestId('shoe-table-mobile')).toBeVisible();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite to verify the new tests pass**

Run: `npm -w app run e2e`
Expected: PASS across chromium, firefox and webkit. If the Playwright browsers are missing, install them first — docs/operations.md §The e2e run needs three browsers.

- [ ] **Step 3: Close the backlog item**

In `BACKLOG.md`, delete item 4 in full (the line beginning `4. **Back/forward navigation, and row expansion in the URL.**`) and renumber items 5–14 to 4–13. Check for cross-references to the old numbering while renumbering.

- [ ] **Step 4: Run the full gate one more time**

Run: `npm run verify`
Expected: PASS, including `check:docs`.

- [ ] **Step 5: Commit**

```bash
git add app/e2e/smoke.spec.ts app/e2e/cross-browser.spec.ts BACKLOG.md
git commit -m "Prove Back and the rendering swap in three real browsers"
```

---

## Landing

Per CLAUDE.md: rebase `row-history` onto `main` and fast-forward — no merge commits — then remove the worktree and delete the branch. `data/` is untouched by this work, so no regeneration is needed.
