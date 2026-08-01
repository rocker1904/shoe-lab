<script lang="ts">
  import { tick } from 'svelte';
  import { dismissOnOutsidePress } from '../lib/dismiss';
  import { MONTHS, monthLabel, startOfMonth } from '../lib/release-date';

  let { value, min, max, onchange }: {
    /** The live bound, always the first of its month, or undefined for no bound. */
    value: string | undefined;
    /** The fleet's own first and last release dates — the picker offers nothing outside them. */
    min: string; max: string;
    /** Only ever a bound. Clearing belongs to the Any chip beside the trigger, which is the one
     *  control that can unset a date (docs/app.md §Released after is month-granular). */
    onchange: (iso: string) => void;
  } = $props();

  /** Emitted only while the panel exists: an IDREF naming a node that is not in the document is an
   *  unresolvable reference rather than a promise of one — the rule the table rows already follow. */
  const PANEL_ID = 'month-picker-panel';

  const yearOf = (iso: string) => Number(iso.slice(0, 4));
  const monthOf = (iso: string) => Number(iso.slice(5, 7));
  const minYear = $derived(yearOf(min));
  const maxYear = $derived(yearOf(max));

  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  /**
   * The year on screen, which is not the bound's year: stepping through years must be able to
   * leave the bound behind and come back to it without emitting anything on the way.
   * Seeded on each open rather than held across them, so reopening always starts somewhere
   * defensible — the bound if there is one, and otherwise the newest shoes, which is the
   * direction a runner filtering by release date is heading.
   */
  let year = $state(0);

  const label = $derived(value ? monthLabel(value) : 'Any month');

  async function toggle() {
    open = !open;
    if (!open) return;
    year = value ? yearOf(value) : maxYear;
    await tick();
    // Focus must land *inside* the panel, or the Escape handler below — which is bound to the panel
    // — never sees a key, and the picker can only be left by choosing a month. The bound month if
    // this year holds it, so the grid opens where the runner left it.
    focusGrid();
  }
  /** Every month button in document order, disabled ones included: the arrows need the geometry to
   *  step *over* one, and the tab stop has to be able to skip it. */
  const cells = (): HTMLButtonElement[] =>
    [...(panel?.querySelectorAll<HTMLButtonElement>('[role="gridcell"]') ?? [])];
  function focusGrid() {
    const list = cells();
    const target = list.find((c) => c.getAttribute('aria-selected') === 'true' && !c.disabled)
      ?? list.find((c) => !c.disabled)
      ?? panel?.querySelector<HTMLElement>('button:not(:disabled)');
    target?.focus();
  }

  /**
   * The grid's own keys, deliberately not `lib/roving.ts`. That action activates whatever it moves
   * to, which is right for a radiogroup — the role promises selection follows focus — and wrong
   * here, where activating commits a filter and shuts the panel: one arrow press was a committed
   * bound the runner never chose. So this is a `grid` and the arrows only move
   * (docs/app.md §Released after is month-granular).
   */
  const COLUMNS = 4;
  function onGridKey(e: KeyboardEvent) {
    const list = cells();
    const from = list.indexOf(document.activeElement as HTMLButtonElement);
    if (from === -1) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key];
    let next: number;
    let stride: number;
    if (delta !== undefined) { next = from + delta; stride = Math.sign(delta); }
    else if (e.key === 'Home') { next = 0; stride = 1; }
    else if (e.key === 'End') { next = list.length - 1; stride = -1; }
    else return;
    e.preventDefault();
    // Clamped, not wrapped: twelve months are a calendar, and running off December into January of
    // the same year reads as a bug rather than a convenience. A disabled month is stepped over in
    // the direction of travel, and if nothing enabled lies that way focus simply stays put.
    for (let i = next; i >= 0 && i < list.length; i += stride) {
      if (!list[i]!.disabled) { list[i]!.focus(); return; }
    }
  }
  function close() {
    open = false;
    // Back to the trigger, or focus lands on `<body>` and a keyboard user loses the sidebar.
    trigger?.focus();
  }
  function choose(month: number) {
    onchange(startOfMonth(`${year}-${String(month).padStart(2, '0')}`));
    close();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Below 800px the sidebar is itself a drawer with its own Escape handler, and this panel is a
    // real descendant of it — so without this, one Escape would shut the picker and the drawer
    // around it (docs/app.md §Filters).
    e.stopPropagation();
    close();
  }
  /** Clamped here rather than left to the buttons' `disabled`: that attribute is an affordance, and
   *  a guard that only exists in the markup is one a stray click or a test can walk straight past. */
  async function step(delta: number) {
    year = Math.min(maxYear, Math.max(minYear, year + delta));
    await tick();
    // The button just pressed may have disabled itself at the end of the range. Tested for
    // *disabled* rather than for focus having already left: the browser drops focus to `<body>` on
    // its own schedule, and at this point it is often still reported on the dead button. Either way
    // the keyboard user is about to be left with nothing, so catch them back into the grid — which
    // at the end of the range is where the remaining choice is anyway.
    const active = document.activeElement as HTMLButtonElement | null;
    if (!panel?.contains(active) || active?.disabled) focusGrid();
  }

  /**
   * Tab out of the panel and it closes. Pointer dismissal is a separate listener below, because a
   * click on something unfocusable — a heading, the sidebar's own padding — moves focus to nothing
   * and arrives here as a null `relatedTarget`, which is indistinguishable from a stepper disabling
   * itself under the pointer. Guarded on the whole anchor rather than the panel so that Tabbing
   * back to the trigger does not count as leaving.
   */
  function onfocusout(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (to === null || anchor?.contains(to)) return;
    open = false;
  }
  let panel = $state<HTMLElement | null>(null);
  let anchor = $state<HTMLElement | null>(null);
  /** Guarded on the whole anchor rather than the panel, so the trigger's own press counts as inside
   *  and is left to `toggle`. `lib/dismiss.ts` owns the rest of the reasoning, and the same effect
   *  is what the column picker runs too. */
  $effect(() => {
    if (!open) return;
    return dismissOnOutsidePress(() => anchor, () => (open = false));
  });

  /**
   * The fleet's own ends. A bound before the first release keeps every dated shoe and drops the
   * undated ones, and a bound after the last empties the table — neither is a comparison anyone
   * opened this panel to make, and both are reachable only in the two edge years. Every year
   * between them offers all twelve.
   */
  const disabled = (month: number) =>
    (year === minYear && month < monthOf(min)) || (year === maxYear && month > monthOf(max));

  /**
   * The grid's single tab stop. The bound's own month when this year holds it, and otherwise the
   * first month the fleet reached — never nothing, and never a disabled month: either leaves the
   * twelve buttons unreachable by Tab, which is the whole reason the grid manages `tabindex` at all.
   */
  const tabStop = $derived.by(() => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !disabled(m));
    const bound = value && yearOf(value) === year ? monthOf(value) : undefined;
    return bound !== undefined && months.includes(bound) ? bound : months[0];
  });
</script>

<div class="anchor" bind:this={anchor}>
  <button type="button" class="trigger" bind:this={trigger} onclick={toggle}
          aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? PANEL_ID : undefined}
          aria-label="Released after, {label}">
    <span>{label}</span>
    <span class="caret" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  </button>

  {#if open}
    <!-- `tabindex="-1"` because Escape is answered here, and a key event only reaches this node
         while focus is inside it. -->
    <div class="panel" id={PANEL_ID} role="dialog" tabindex="-1" aria-label="Choose a release month"
         bind:this={panel} onkeydown={onkeydown} onfocusout={onfocusout}>
      <div class="head">
        <button type="button" aria-label="Previous year" disabled={year <= minYear}
                onclick={() => void step(-1)}>‹</button>
        <!-- Text, not a heading: the panel is already named, and a second name for the year would
             be read as structure rather than as the state of the grid below it. -->
        <span data-testid="picker-year" aria-live="polite">{year}</span>
        <button type="button" aria-label="Next year" disabled={year >= maxYear}
                onclick={() => void step(1)}>›</button>
      </div>
      <!-- Enter and Space need no handler: these are real buttons, so the browser turns both into
           the click below. Only the arrows are ours, in `onGridKey`. -->
      <!-- `tabindex="-1"` on the grid itself: the cells carry the tab order, and the role wants the
           container reachable for the arrow handler bound to it. -->
      <div class="grid" role="grid" tabindex="-1" aria-label="Month" onkeydown={onGridKey}>
        {#each [0, 1, 2] as row (row)}
          <!-- `display: contents`, so the rows the grid role requires do not break the four columns
               the buttons are actually laid out in. -->
          <div role="row">
            {#each MONTHS.slice(row * COLUMNS, row * COLUMNS + COLUMNS) as name, col (name)}
              {@const month = row * COLUMNS + col + 1}
              {@const checked = value === `${year}-${String(month).padStart(2, '0')}-01`}
              <button type="button" role="gridcell" aria-label={name} disabled={disabled(month)}
                      aria-selected={checked} tabindex={month === tabStop ? 0 : -1}
                      onclick={() => choose(month)}>{name.slice(0, 3)}</button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .anchor { position: relative; display: block; }
  .trigger {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s2); width: 100%;
    padding: var(--s2); border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface); color: var(--text); font: inherit; cursor: pointer; text-align: left;
  }
  .trigger:hover { border-color: var(--accent); }
  .caret { display: inline-flex; color: var(--text-dim); }
  /* Absolute inside the sidebar, not portalled to `<body>` like the Add-filter dialog: this panel
     is the width of the column it sits in, so it never reaches the table, and the section it hangs from
     sits near the top of the sidebar's scroll content, so it is never clipped
     (docs/app.md §Stacking order). 20 only has to clear this panel's own siblings inside the
     sidebar, which is why it does not have to reach the modals' 32 and 35. */
  /* `width: 100%` with `border-box`, not a fixed width: the sidebar is a scroll container, so
     `overflow-x` computes to `auto` alongside its `overflow-y`, and a panel wider than the column
     is clipped rather than allowed to overhang. A 15rem panel lost its fourth column and half the
     next-year control. Matching the column also makes it right inside the mobile drawer, which is
     a different width again. */
  .panel {
    position: absolute; top: calc(100% + var(--s1)); left: 0; z-index: 20;
    width: 100%; box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md);
    box-shadow: var(--shadow-dialog);
  }
  .head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
  .head button {
    padding: 0 var(--s2); border: 1px solid var(--border); border-radius: var(--r-sm);
    background: var(--surface); color: var(--text); font: inherit; cursor: pointer;
  }
  .head button:disabled { opacity: 0.4; cursor: default; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s1); }
  .grid [role='row'] { display: contents; }
  .grid button {
    padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
    background: none; color: var(--text); font: inherit; font-size: var(--t-sm); cursor: pointer;
  }
  .grid button:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-dim); }
  /* `--accent-solid` carrying `--on-accent`, because an ink sits on this fill: `--on-accent` on
     `--accent` is 3.71:1 in dark, and a raw `#fff` here would split the pair across files
     (docs/app.md §Theming). */
  .grid button[aria-selected='true'] { background: var(--accent-solid); color: var(--on-accent); }
  .grid button:disabled { color: var(--text-dim); opacity: 0.4; cursor: default; }
</style>
