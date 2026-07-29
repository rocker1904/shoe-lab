# Strike as a Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the strike a preset rather than a field — derived, deselectable and absent from the URL — so the two selection groups above the table behave alike.

**Architecture:** This is mostly deletion. `ViewState` loses `strike`, so `serializeView`/`parseView` lose a key, `swapStrike` loses its reason to exist, and `isDefaultView` gets a constant to compare against. What replaces them is a derivation that already exists in another form: `selectedPreset` matches the view against each story, and this extends it to match against each `(side, story)` pair.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + Testing Library, Playwright.

**Design spec:** `docs/superpowers/specs/2026-07-29-strike-as-preset-design.md`.
**Frontend contracts:** `docs/app.md` §Presets, §View and URL ownership, §URL encoding.

## Global Constraints

- **`npm run verify` before every commit** (check:docs + typecheck + lint + test:coverage). Every task here touches components or view state, so each also needs `npm -w app run e2e`.
- Coverage floors: lines ≥ 90, branches ≥ 85 on `app/src/lib/**` (currently 100 / 99.15 — do not spend the headroom).
- **TDD**: failing test first, observed failing, then implement.
- `noUncheckedIndexedAccess` is on.
- **Feature work happens in a worktree** (CLAUDE.md): `git worktree add -b strike-preset ~/dev/shoe-lab-strike-preset main`, then **`npm install` inside it** — a worktree does not inherit `node_modules`.
- **Docs ride the change**; comments are WHY-only and point at owning docs; never reference `docs/superpowers/` from source.
- Every commit body ends with `Co-Authored-By: <the model writing the commit> <noreply@anthropic.com>`.
- **A deletion lands with its replacement in the same commit.** No shims, no compatibility branches.
- The per-task file lists are indicative. `npm run verify` is the gate: fix collateral breakage in the same commit.

## Known traps, learned the hard way on the previous branch

- `@testing-library/user-event` is **not** a dependency. Use `fireEvent`.
- `readFileSync(new URL(..., import.meta.url))` fails under the jsdom environment. Use `fileURLToPath` + `join`.
- Bare `vi.useFakeTimers()` breaks the suite (it fakes `queueMicrotask`, which the `Element.animate` stub needs). Fake only `['setTimeout','clearTimeout']`.
- `window.matchMedia`, `ResizeObserver` and `Element.animate` are stubbed in `app/src/test-setup.ts`; `matchMedia` always reports non-matching, so the suite sees the desktop rendering.
- Svelte 5 `transition:` runs through WAAPI, so animated state changes need `waitFor`, not synchronous assertions.
- `check:docs` reads `git ls-files -co`, so deletions must be **staged** before `verify` will run.
- **The view write is debounced.** `Page.test.ts` settles before reading `location.search`; new assertions must do the same. The restore-from-storage write flushes immediately and must keep doing so.

## Deletions

| Deleted | Replaced by | Task |
|---|---|---|
| `ViewState.strike` | a derived mark, computed from the view's side-paired keys | 1 |
| `swapStrike` | nothing — a side change re-derives from `(side, story)` | 3 |
| `strike=` in `serializeView` and `parseView` | nothing; the columns already encode the side | 2 |
| `defaultView(strike)`'s parameter | a constant, heel-shaped | 1 |
| `FilterSidebar`'s `strike` prop | nothing — unused since `· in use` was deleted | 4 |

## Existing tests this plan breaks

| Thing | Because | Task |
|---|---|---|
| `urlstate.test.ts` — 17 `strike` references | the field, the parameter and the URL key all go | 1, 2 |
| `presets.test.ts` — 46 `strike` references | `applyPreset` keeps its side argument, but `defaultView()` calls lose theirs | 1 |
| `Page.test.ts` — 4 | `onStrike` re-derives; `All` changes behaviour | 3 |
| `Toolbar.test.ts` — 6, `SetupStrip.test.ts` — 8 | the strike prop becomes a nullable mark | 4 |
| `FilterSidebar.test.ts` — 5 | the prop is removed | 4 |
| `lineage.test.ts` — 1, `MetricRow.test.ts` — 1 | incidental `Side` usage; check before editing | — |
| `persist.ts` `VIEW_STORAGE_KEY` | the URL encoding changes; bump `v3` → `v4` **once**, in Task 2 | 2 |

## File Structure

| File | Responsibility |
|---|---|
| `app/src/lib/urlstate.ts` | `ViewState` without `strike`; parameterless `defaultView()`; `strike=` gone; `swapStrike` gone |
| `app/src/lib/side.ts` | **create** — `sideOf(view)`, the derivation |
| `app/src/lib/presets.ts` | unchanged in shape; `applyPreset` keeps taking a side |
| `app/src/lib/persist.ts` | storage key bump |
| `app/src/Page.svelte` | derived `sideMark`; `(side, story)` matching; `All` per spec §4 |
| `app/src/components/Toolbar.svelte`, `SetupStrip.svelte` | nullable side mark |
| `app/src/components/FilterSidebar.svelte` | prop removed |

---

### Task 1: `ViewState` loses `strike`, and the side becomes derivable

**Files:**
- Create: `app/src/lib/side.ts`, `app/src/lib/side.test.ts`
- Modify: `app/src/lib/urlstate.ts`, `urlstate.test.ts`, `app/src/lib/presets.test.ts`

**Interfaces:**
- Produces: `export function sideOf(v: ViewState): Side | null`.
- `defaultView(): ViewState` — no parameter. `defaultColumns(side: Side): string[]` — **keeps** its parameter.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/side.test.ts
import { describe, expect, it } from 'vitest';
import { sideOf } from './side';
import { defaultColumns, defaultView } from './urlstate';

const withCols = (cols: string[]) => ({ ...defaultView(), columns: cols });

describe('sideOf', () => {
  it('reads heel from a heel-shaped view', () => {
    expect(sideOf(defaultView())).toBe('heel');
  });

  it('reads forefoot when every side-paired key is forefoot', () => {
    expect(sideOf(withCols(defaultColumns('forefoot')))).toBe('forefoot');
  });

  it('is null when the view mixes sides — the case that makes mixing legible', () => {
    const v = withCols(['score', 'heel-stack', 'shock-absorption-forefoot']);
    expect(sideOf(v)).toBeNull();
  });

  it('reads the side from a bound as well as a column', () => {
    const v = defaultView();
    v.columns = ['score'];
    v.filters.ranges['energy-return-forefoot'] = { min: 60 };
    expect(sideOf(v)).toBe('forefoot');
  });

  it('reads the side from the sort key', () => {
    const v = { ...defaultView(), columns: ['score'], sort: { key: 'heel-stack', dir: 'desc' as const } };
    expect(sideOf(v)).toBe('heel');
  });

  it('is null when no side-paired metric is used at all', () => {
    expect(sideOf(withCols(['score', 'msrpGbp', 'weight']))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm -w app run test -- side`
Expected: FAIL — cannot resolve `./side`, and `defaultView()` still demands an argument.

- [ ] **Step 3: Create `side.ts`**

```ts
import { SIDE_PAIRS, type Side } from './lineage';
import type { ViewState } from './urlstate';

/** Every key that names one half of a declared side pair, and which half it is. */
const SIDE_OF_KEY = new Map<string, Side>(
  SIDE_PAIRS.flatMap((p) => [[p.forefoot, 'forefoot'] as const, [p.heel, 'heel'] as const]));

/**
 * The side a view is *about*, or null when it does not commit to one. Derived rather than
 * stored, exactly as the story mark is: a view that mixes sides is not wrong, it simply is not
 * either preset, and the toolbar shows neither marked (docs/app.md §Presets).
 */
export function sideOf(v: ViewState): Side | null {
  const used = new Set<Side>();
  for (const key of [...v.columns, ...Object.keys(v.filters.ranges), v.sort.key]) {
    const side = SIDE_OF_KEY.get(key);
    if (side) used.add(side);
  }
  return used.size === 1 ? [...used][0]! : null;
}
```

- [ ] **Step 4: Take `strike` off `ViewState`**

Remove the field from the interface. `defaultView()` loses its parameter and names heel in **one** place; `defaultColumns(side)` **keeps** its parameter, which is what stops a call site drifting:

```ts
/**
 * Heel is the arbitrary half, named here and nowhere else. It is not a silent assumption:
 * the toolbar renders Heel as marked on this view, because the mark is derived from it
 * (docs/app.md §Presets). `defaultColumns` still demands a side so no other call site can
 * default by accident.
 */
export function defaultView(): ViewState {
  return { filters: { ...EMPTY_FILTERS, ranges: {} }, sort: { ...DEFAULT_SORT },
           columns: defaultColumns('heel'), generations: {}, rows: [] };
}
```

`isDefaultView` becomes `sameValue(v, defaultView())`.

- [ ] **Step 5: Fix the fallout in `urlstate.test.ts` and `presets.test.ts`**

`applyPreset` keeps its side argument, so `presets.test.ts` mostly needs `defaultView(strike)` → `defaultView()`. Read each assertion rather than replacing mechanically: some assert the *baseline is strike-relative*, which is exactly what stops being true.

- [ ] **Step 6: Run `npm run verify`** → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Derive the side from the view instead of storing it"
```

---

### Task 2: `strike=` leaves the URL

**Files:**
- Modify: `app/src/lib/urlstate.ts`, `urlstate.test.ts`, `app/src/lib/persist.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('never writes a strike key', () => {
  const v = { ...defaultView(), columns: defaultColumns('forefoot') };
  expect(serializeView(v)).not.toContain('strike');
});

it('carries the side in the columns instead', () => {
  const v = { ...defaultView(), columns: defaultColumns('forefoot') };
  expect(parseView(serializeView(v), idx).columns).toEqual(defaultColumns('forefoot'));
});

it('ignores a legacy strike key rather than honouring it', () => {
  // No compatibility branch: the tool was never shared, so no such link is in anyone's hands.
  expect(parseView('strike=forefoot', idx)).toEqual(defaultView());
});

it('round-trips a mixed-side view losslessly', () => {
  const v = defaultView();
  v.columns = ['score', 'heel-stack', 'shock-absorption-forefoot'];
  v.filters.ranges['energy-return-forefoot'] = { min: 60 };
  expect(parseView(serializeView(v), idx)).toEqual(v);
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

Delete the `strike` read at `parseView`'s head and the `strike` write in `serializeView`. The `cols` comparison becomes `defaultColumns('heel')` — the one baseline — so a forefoot default view now serialises its columns in full. **That is the accepted cost** (spec §4a); do **not** add a `side=` shorthand in this task.

- [ ] **Step 4: Bump `VIEW_STORAGE_KEY`** from `shoe-lab.view.v3` to `v4`. The encoding changed, and a stored `strike=forefoot` would otherwise be read as a view that quietly lost its side. `persist.test.ts` derives the version and needs no edit — confirm rather than assume.

- [ ] **Step 5: Run `npm run verify` and `npm -w app run e2e`.**

- [ ] **Step 6: Update `docs/app.md` §URL encoding** — remove `strike=` from the key list; record that the side rides in `cols`, and that a forefoot default view is therefore verbose (spec §4a), with the `side=` shorthand named as the remedy if it ever matters.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Drop strike from the URL and bump the stored view"
```

---

### Task 3: `Page` derives both marks, and `All` means all paces

**Files:**
- Modify: `app/src/Page.svelte`, `app/src/Page.test.ts`
- Delete: `swapStrike` from `app/src/lib/urlstate.ts` and its tests

- [ ] **Step 1: Write the failing tests**

`All`'s behaviour is the thing a reader will get wrong, so it is pinned in three states.

```ts
it('marks both groups when the view is a story on a side', async () => {
  render(Page, { data });
  fireEvent.click(screen.getByRole('radio', { name: /Easy/ }));
  await settle();
  expect(screen.getByRole('radio', { name: /Easy/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Heel/ })).toBeChecked();
});

it('drops the side mark when the view mixes sides', async () => {
  history.replaceState(null, '', '?cols=score,heel-stack,shock-absorption-forefoot');
  render(Page, { data });
  await settle();
  expect(screen.getByRole('radio', { name: /Heel/ })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: /Forefoot/ })).not.toBeChecked();
});

it('All keeps the derived side and restores that side default columns', async () => {
  history.replaceState(null, '', `?cols=${defaultColumns('forefoot').join(',')}&r.weight=~250`);
  render(Page, { data });
  await settle();
  fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  await settle();
  expect(location.search).not.toContain('r.weight');
  expect(parseView(location.search.slice(1), idx).columns).toEqual(defaultColumns('forefoot'));
});

it('All on a mixed view clears the filters and leaves the columns alone', async () => {
  const mixed = 'score,heel-stack,shock-absorption-forefoot';
  history.replaceState(null, '', `?cols=${mixed}&r.weight=~250`);
  render(Page, { data });
  await settle();
  fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  await settle();
  expect(location.search).not.toContain('r.weight');
  expect(location.search).toContain(`cols=${encodeURIComponent(mixed).replace(/%2C/g, ',')}`);
});

it('All clears a filter the user set by hand, not only a preset\\'s', async () => {
  render(Page, { data });
  fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'nova' } });
  await settle();
  fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
  await settle();
  expect(location.search).not.toContain('q=');
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

```svelte
const sideMark = $derived(sideOf(snapshot));
/** Both marks are lenses over the view. A hand-edited view matches no story and no side, and
 *  shows neither — the behaviour the story group already had (docs/app.md §Presets). */
const storyMark = $derived(
  sideMark === null ? null
  : PRESETS.find((p) => sameValue(snapshot, applyPreset(p.id, data.shoes, idx, sideMark)))?.id ?? null);

function onSide(next: Side) {
  setView(storyMark ? applyPreset(storyMark, data.shoes, idx, next)
                    : { ...defaultView(), columns: defaultColumns(next) });
}

/**
 * `All` speaks for the story group and means "all paces". With a side to work from it restores
 * that side's baseline; with none — a deliberately mixed view — it clears the filters and
 * leaves the table's shape alone, because there is no defensible column set to impose
 * (docs/app.md §Presets).
 */
function onStory(id: string) {
  if (id !== 'all') return setView(applyPreset(id, data.shoes, idx, sideMark ?? 'heel'));
  const side = sideOf(snapshot);
  if (side === null) {
    const next = structuredClone(snapshot) as ViewState;
    next.filters = { ...EMPTY_FILTERS, ranges: {} };
    return setView(next);
  }
  setView({ ...defaultView(), columns: defaultColumns(side) });
}
```

Delete `swapStrike` and its tests: a side change now re-derives, and there is nothing left to carry across.

- [ ] **Step 4: Run `npm run verify` and `npm -w app run e2e`.**

- [ ] **Step 5: Update `docs/app.md` §Presets** — both marks derived; what `All` does in each of the three states; that `All` clears hand-set filters too, and why undoing only the preset's share would require the stored `preset` field the section already rules out. Update §View and URL ownership where it describes the strike surviving a clear.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Make All mean all paces and derive both marks"
```

---

### Task 4: The surfaces take a nullable mark

**Files:**
- Modify: `app/src/components/Toolbar.svelte`, `Toolbar.test.ts`, `app/src/components/SetupStrip.svelte`, `SetupStrip.test.ts`, `app/src/components/StrikeToggle.svelte`, `app/src/components/FilterSidebar.svelte`, `FilterSidebar.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('marks neither side when the view commits to none', () => {
  render(Toolbar, { ...props, side: null });
  expect(screen.getByRole('radio', { name: /Heel/ })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: /Forefoot/ })).not.toBeChecked();
});

it('keeps one tab stop even with nothing selected', () => {
  render(Toolbar, { ...props, side: null });
  const strike = screen.getAllByRole('radio', { name: /Heel|Forefoot/ });
  expect(strike.filter((r) => r.tabIndex === 0)).toHaveLength(1);
});
```

The second is a **regression guard, not a red-first test** — verified before writing this: `roving.ts:31` already falls back to the first radio when nothing is checked (`list.find(checked) ?? list[0]`), so it passes today. It is here because a nullable mark makes "nothing checked" reachable for the first time, and a later refactor that assumed a checked radio would break keyboard access silently.

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

`strike: Side` becomes `side: Side | null` through `Toolbar`, `SetupStrip` and `StrikeToggle`. `FilterSidebar` drops the prop entirely — nothing there has used it since `· in use` was deleted.

**The setup strip keeps a pre-selected Heel**, because the table behind it must render and the strip is a first-run flow rather than a gate. That is a genuine default, not a derived mark, and the comment must say so.

- [ ] **Step 4: Run `npm run verify` and `npm -w app run e2e`.**

- [ ] **Step 5: Verify by rendering**, per CLAUDE.md §Working approach. Build, serve `app/dist`, drive Playwright and confirm at 1280px: a default view marks Heel; `?cols=…forefoot…` marks Forefoot; a mixed-column URL marks neither; clicking `All` from a forefoot view keeps forefoot columns; clicking `All` from a mixed view leaves the columns untouched. Report the measured URLs.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Let both selection groups show nothing selected"
```

---

### Task 5: Documentation and backlog

**Files:**
- Modify: `docs/app.md`, `docs/shoe-stories.md`, `BACKLOG.md`

- [ ] **Step 1: Finish what Tasks 2 and 3 did not cover**

`docs/shoe-stories.md` §Which half a story uses — a story still bounds one side; what changes is that the side is a *selection* rather than an identity, so "who you are survives a clear" is no longer true and should not be reinstated. Check `docs/app.md` for surviving references to `swapStrike`, to `strike` as a field, and to the strike surviving a clear.

- [ ] **Step 2: Update `BACKLOG.md`**

Add the `side=` URL shorthand as a deferred item, with spec §4a's reasoning and the trigger — do it if a forefoot default link's length becomes annoying in practice, not before.

- [ ] **Step 3: Run `npm run check:docs`** → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Record what the side change leaves behind"
```

---

## Acceptance

1. `npm run verify` and `npm -w app run e2e` both green; coverage on `app/src/lib/**` no worse than 100 / 99.15.
2. `grep -r "strike" app/src` returns no `ViewState` field, no `swapStrike`, and no URL key — only the `Side` type and the setup strip's first-run default.
3. `serializeView` never emits `strike=`, and `parseView('strike=forefoot')` equals `defaultView()`.
4. A mixed-side view marks neither side, and both groups still have exactly one tab stop each.
5. `All` restores the derived side's columns; on a mixed view it clears filters and changes nothing else; in both cases it clears hand-set filters.
6. A round trip of a mixed-side view through `serializeView`/`parseView` is lossless.
7. `defaultView()` takes no argument; `defaultColumns` still requires a side.
