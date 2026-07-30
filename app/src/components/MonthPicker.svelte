<script lang="ts">
  import { tick } from 'svelte';
  import { MONTHS, monthLabel, startOfMonth } from '../lib/release-date';
  import { roving } from '../lib/roving';

  let { value, min, max, onchange }: {
    /** The live bound, always the first of its month, or undefined for no bound. */
    value: string | undefined;
    /** The fleet's own first and last release dates — the picker offers nothing outside them. */
    min: string; max: string;
    onchange: (iso: string | undefined) => void;
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
  function focusGrid() {
    const grid = panel?.querySelector<HTMLElement>('[role="radiogroup"]');
    const target = grid?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not(:disabled)')
      ?? grid?.querySelector<HTMLElement>('[role="radio"]:not(:disabled)')
      ?? panel?.querySelector<HTMLElement>('button:not(:disabled)');
    target?.focus();
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
    // Below 800px the sidebar is itself a drawer, so one Escape must not dismiss both — the same
    // reason HelpPopover and AddFilterDialog stop it (docs/app.md §Filters).
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
  /**
   * `pointerdown`, not `click`: it fires before focus moves, so the trigger's own press is
   * recognised as inside the anchor and left to `toggle`. On `click` the sequence is focusout →
   * close → click → reopen, and the trigger stops being able to shut the panel it opened.
   */
  function onpointerdown(e: PointerEvent) {
    if (!anchor?.contains(e.target as Node | null)) open = false;
  }
  let panel = $state<HTMLElement | null>(null);
  let anchor = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!open) return;
    document.addEventListener('pointerdown', onpointerdown, true);
    return () => document.removeEventListener('pointerdown', onpointerdown, true);
  });

  /**
   * The fleet's own ends. A bound before the first release keeps every dated shoe and drops the
   * undated ones, and a bound after the last empties the table — neither is a comparison anyone
   * opened this panel to make, and both are reachable only in the two edge years. Every year
   * between them offers all twelve.
   */
  const disabled = (month: number) =>
    (year === minYear && month < monthOf(min)) || (year === maxYear && month > monthOf(max));
</script>

<div class="anchor" bind:this={anchor}>
  <button type="button" class="trigger" bind:this={trigger} onclick={toggle}
          aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? PANEL_ID : undefined}
          aria-label="Released after, {label}">
    <span>{label}</span>
    <span class="caret" aria-hidden="true">▾</span>
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
      <!-- A radiogroup, so the twelve months are one tab stop and the arrows move between them:
           `roving` is the same action the four filter radiogroups use (docs/app.md §Filters). -->
      <div class="grid" role="radiogroup" aria-label="Month" use:roving>
        {#each MONTHS as name, i (name)}
          {@const month = i + 1}
          <button type="button" role="radio" aria-label={name} disabled={disabled(month)}
                  aria-checked={value === `${year}-${String(month).padStart(2, '0')}-01`}
                  onclick={() => choose(month)}>{name.slice(0, 3)}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .anchor { position: relative; display: block; }
  .trigger {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s2); width: 100%;
    padding: var(--s2); border: 1px solid var(--border); border-radius: var(--r-sm);
    background: var(--surface); color: var(--text); font: inherit; cursor: pointer; text-align: left;
  }
  .trigger:hover { border-color: var(--accent); }
  .caret { color: var(--text-dim); font-size: var(--t-xs); }
  /* Absolute inside the sidebar, not portalled to `<body>` like the Add-filter dialog: this panel
     is 240px inside a 260px column so it never reaches the table, and the section it hangs from
     sits near the top of the sidebar's scroll content, so it is never clipped
     (docs/app.md §Stacking order). 20 matches HelpPopover — both only have to clear their siblings. */
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
  .grid button {
    padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
    background: none; color: var(--text); font: inherit; font-size: var(--t-sm); cursor: pointer;
  }
  .grid button:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-dim); }
  .grid button[aria-checked='true'] { background: var(--accent); color: var(--surface); }
  .grid button:disabled { color: var(--text-dim); opacity: 0.4; cursor: default; }
</style>
