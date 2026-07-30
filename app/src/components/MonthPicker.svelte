<script lang="ts">
  import { tick } from 'svelte';
  import { monthLabel, startOfMonth } from '../lib/release-date';
  import { roving } from '../lib/roving';

  let { value, min, max, onchange }: {
    /** The live bound, always the first of its month, or undefined for no bound. */
    value: string | undefined;
    /** The fleet's own first and last release dates — the picker offers nothing outside them. */
    min: string; max: string;
    onchange: (iso: string | undefined) => void;
  } = $props();

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

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
  const step = (delta: number) => (year = Math.min(maxYear, Math.max(minYear, year + delta)));

  /** Tabbing out of the panel closes it; a click elsewhere in the sidebar does the same, because
   *  it moves focus off the grid. Guarded on `relatedTarget` so moving *within* the panel does not. */
  function onfocusout(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    // A stepper disables itself on reaching the end of the range, and the browser then drops focus
    // to `<body>` — which arrives here as a null `relatedTarget`. That is the panel losing its own
    // control, not the runner leaving it, and closing on it makes the last year unreachable.
    if (to === null || panel?.contains(to)) return;
    open = false;
  }
  let panel = $state<HTMLElement | null>(null);

  /** A month the fleet has no side of is a bound that cannot change the table. Only the first and
   *  last years are ever partly out; every year between them offers all twelve. */
  const disabled = (month: number) =>
    (year === minYear && month < monthOf(min)) || (year === maxYear && month > monthOf(max));
</script>

<div class="anchor">
  <button type="button" class="trigger" bind:this={trigger} onclick={toggle}
          aria-expanded={open} aria-haspopup="dialog" aria-label="Released after, {label}">
    <span>{label}</span>
    <span class="caret" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <!-- `tabindex="-1"` because Escape is answered here, and a key event only reaches this node
         while focus is inside it. -->
    <div class="panel" role="dialog" tabindex="-1" aria-label="Choose a release month"
         bind:this={panel} onkeydown={onkeydown} onfocusout={onfocusout}>
      <div class="head">
        <button type="button" aria-label="Previous year" disabled={year <= minYear}
                onclick={() => step(-1)}>‹</button>
        <!-- Text, not a heading: the panel is already named, and a second name for the year would
             be read as structure rather than as the state of the grid below it. -->
        <span data-testid="picker-year" aria-live="polite">{year}</span>
        <button type="button" aria-label="Next year" disabled={year >= maxYear}
                onclick={() => step(1)}>›</button>
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
