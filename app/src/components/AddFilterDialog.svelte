<script lang="ts">
  import { onMount } from 'svelte';
  import DirectionLegend from './DirectionLegend.svelte';
  import { directionOf, DIRECTION_ARROW } from '../lib/direction';

  export interface AddFilterOption { key: string; label: string; groupId: string | null; coverage: number }

  let { options, groups, onchoose, onclose }: {
    options: AddFilterOption[]; groups: Record<string, string>;
    onchoose: (key: string) => void; onclose: () => void;
  } = $props();

  let query = $state('');
  let panel: HTMLElement;
  let search: HTMLInputElement;

  const grouped = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const m = new Map<string, AddFilterOption[]>();
    for (const o of options) {
      if (q && !o.label.toLowerCase().includes(q)) continue;
      const g = (o.groupId && groups[o.groupId]) || 'Other';
      m.set(g, [...(m.get(g) ?? []), o]);
    }
    return [...m.entries()];
  });

  /**
   * The sidebar this dialog is written inside is `position: sticky`, and a sticky element creates a
   * stacking context whatever its z-index — so `z-index: 20` below was being measured against the
   * sidebar's own children, not the page, and the pinned chrome and the table's sticky header both
   * painted over the open dialog. Moving the node to `<body>` is what makes the number mean what it
   * says (docs/app.md §Stacking order). It runs before the focus call below, because `appendChild` on a
   * subtree containing the active element drops the focus it is about to hand out.
   */
  function toBody(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  // Built from a positioned element rather than `<dialog>`: jsdom implements neither `showModal`
  // nor the top layer, and the focus handling below is the part that has to be right anyway.
  onMount(() => {
    const opener = document.activeElement as HTMLElement | null;
    search.focus();
    return () => opener?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // No `stopPropagation` here, unlike the pickers that stay inside the sidebar: this node lives
      // in `<body>` (docs/app.md §Stacking order), so the drawer's key handler is not on its bubble
      // path at all and there is no second dismissal to suppress.
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    // `aria-modal` tells a screen reader the rest of the page is inert; without a trap, Tab walks
    // straight out of it and the promise is a lie. Nothing here is in the top layer, so the
    // browser will not do this for us.
    const focusable = [...panel.querySelectorAll<HTMLElement>('input, button')].filter((el) => !el.hasAttribute('disabled'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<!-- PROVISIONAL, pending the decision recorded in BACKLOG.md: the dimming is on trial, the outside
     click is not. Dropping it is this element, the `.scrim` rules below and the test that names
     `add-filter-scrim` — nothing else reads any of the three, and `onclose` is the dialog's own
     prop. Something must still dismiss on an outside press if this goes: every other floating
     surface does (docs/app.md §Filters).
     Moved to `<body>` on its own, not nested in the panel: it has to sit UNDER the dialog and over
     the drawer, and a child of the dialog could only ever paint above it. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" data-testid="add-filter-scrim" onclick={onclose} use:toBody></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="Add filter" onkeydown={onkeydown}
     bind:this={panel} use:toBody>
  <input class="q" type="search" aria-label="Filter metrics" placeholder="Search metrics…"
         bind:value={query} bind:this={search} />
  <!-- Above the scrollport below, so it cannot scroll away from the glyphs it explains.
       `DirectionLegend.svelte` owns the words (docs/app.md §Table presentation). -->
  <DirectionLegend />
  <div class="list scrollport">
    {#each grouped as [group, offers] (group)}
      <h4>{group}</h4>
      {#each offers as o (o.key)}
        <button type="button" onclick={() => onchoose(o.key)}>
          <span class="name">{o.label}</span>
          <span class="dir" aria-hidden="true">{DIRECTION_ARROW[directionOf(o.key)]}</span>
          <!-- A bar, which is what the `select` this replaced could never hold (docs/app.md §Filters). -->
          <span class="bar"><span class="fill" style:width="{o.coverage}%"></span></span>
          <span class="pct">{o.coverage}%</span>
        </button>
      {/each}
    {/each}
  </div>
  <!-- The same sentence, the same place and the same tone as `BrandFilter`'s, which is one control
       away in the sidebar this dialog opens from: an empty list here collapsed the dialog to its
       legend and its Close button, which reads as a control that has stopped responding. Not a live
       region, for the same reason that one is not — the announcement policy is one question for the
       whole app rather than a decision this box makes for itself (docs/app.md §Filters). -->
  {#if grouped.length === 0}<p class="none">No metrics match “{query}”.</p>{/if}
  <button type="button" class="close" onclick={onclose}>Close</button>
</div>

<style>
  /* 35 puts it over the filter drawer's 30, which is the layer it opens from below 800px, and under
     the skip link's 40. Moving the node to `<body>` is what makes these numbers comparable at all:
     inside the sticky sidebar they were measured against that sidebar's children
     (docs/app.md §Stacking order). */
  /* `border-box`, and it is load-bearing rather than tidiness: `92vw` is meant to be the whole
     dialog, leaving 4% of the screen each side. Measured in content-box the 16px padding and 1px
     border each side land on top of it, so the box came out 34px WIDER than the viewport fraction
     asked for — 365px inside a 360px screen, clipping its own border and both left corners off the
     edge at every phone width (393px at 390px, 379px at 375px). There is no global reset here; the
     components that size against their container set this themselves. */
  .dialog {
    position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 35;
    box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--s2); width: min(28rem, 92vw); max-height: 80vh;
    padding: var(--s4); background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-dialog);
  }
  /* `--t-sm` stated rather than left to the UA: `input[type=search]` is 13.33px in Blink and Gecko
     and 16px in WebKit, so an undeclared box is a fifth of a size bigger in Safari than anywhere
     else. The touch tier then pays 16px for the reason `RangeFilter.svelte` states and
     docs/app.md §Filters owns — the dialog opens from the drawer, so it is one of the four. */
  .q { padding: var(--s2); border: 1px solid var(--border); border-radius: var(--r-sm);
       background: var(--surface); color: var(--text); font-size: var(--t-sm); }
  @media (hover: none) {
    .q { font-size: 16px; }
  }
  /* `overflow-y: auto` computes `overflow-x` to `auto` as well, so this is a scrollport on both
     axes and a row flush against its edge has its outside ring cropped: `.scrollport` in `app.css`
     is where the room is reserved, for this list and the three others (docs/app.md §Theming). The
     negative inline margin gives that room back to the dialog's own padding, so the rows sit
     exactly where they did; the block room is left to stand, where it reads as part of the gap. */
  .list { overflow-y: auto; display: flex; flex-direction: column; gap: var(--s1);
          margin-inline: calc(-1 * var(--ring-room)); }
  h4 { margin: var(--s2) 0 var(--s1); font-size: var(--t-xs); color: var(--text-dim); text-transform: uppercase; }
  /* Separated, and the same rule and the same margin as the column picker's: the three clauses are
     one sentence and read as three headings without them. */
  .dir { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-dim); width: 1ch; text-align: center; }
  .list button { display: grid; grid-template-columns: 1fr auto 4rem 2.4rem; align-items: center; gap: var(--s2);
                 padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
                 background: none; color: var(--text); cursor: pointer; font: inherit; font-size: var(--t-sm); text-align: left; }
  .list button:hover { border-color: var(--accent); background: var(--accent-dim); }
  /* Track and fill must be DIFFERENT neutrals, or the bar is a featureless pill: --hist-dim is the
     mark, --border-soft the groove it sits in. Neutral rather than accent because accent means
     "you selected this" in a CONTROL, and a dialog row is a control (docs/app.md §Theming). */
  .bar { display: block; height: 6px; border-radius: var(--r-full); background: var(--border-soft); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--hist-dim); }
  .pct { font-size: var(--t-xs); color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
  /* `margin: 0`, where `BrandFilter`'s carries one: the dialog is a flex column with its own gap,
     so a top margin here would double the space the sentence sits in. */
  .none { margin: 0; font-size: var(--t-xs); color: var(--text-dim); }
  /* The app's secondary-button treatment, as the masthead's actions and the sidebar's pair carry it
     (docs/app.md §Theming) — a bare UA button was the one unstyled control left in this dialog. */
  .close { align-self: flex-end; padding: var(--s1) var(--s3); cursor: pointer;
           border: 1px solid var(--border); background: var(--surface); color: var(--text);
           border-radius: var(--r-sm); font: inherit; font-size: var(--t-sm); }
  .close:hover { background: var(--accent-dim); }
  /* PROVISIONAL with the element it paints — these four rules are the whole of it, and nothing
     above depends on them (BACKLOG.md).
     32: under the dialog's 35 and over the drawer's 30, which is the layer it opens from below
     800px (docs/app.md §Stacking order). Rendered at every width — unlike the drawer's scrim, this
     dialog is modal on the desktop too. */
  .scrim { position: fixed; inset: 0; z-index: 32; background: var(--scrim); }
  @media (prefers-reduced-motion: no-preference) {
    .scrim { animation: fade 200ms ease-out; }
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
