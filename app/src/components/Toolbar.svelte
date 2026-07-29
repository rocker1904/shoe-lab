<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Side } from '../lib/lineage';
  import { PRESETS } from '../lib/presets';
  import StrikeToggle from './StrikeToggle.svelte';

  let { strike, onstrike, selected, counts, onstory, showFilters, onfilters, columns }: {
    strike: Side; onstrike: (s: Side) => void;
    /** Derived in `Page.svelte`, never stored: `'all'` while the view equals this runner's own
     *  baseline, a story id while it equals that story, null once it is neither
     *  (docs/app.md §Presets). */
    selected: string | null;
    counts: Map<string, number>;
    onstory: (id: string) => void;
    showFilters: boolean; onfilters: () => void;
    /** The column picker, passed through rather than imported: it needs the whole dataset, which
     *  the toolbar has no other reason to know about. */
    columns?: Snippet;
  } = $props();

  // `All` leads so the group reads as everything → narrow to a story, and it is the same state a
  // `Clear` button used to produce, named for what you get (docs/app.md §Presets).
  const STORIES = [{ id: 'all', label: 'All' }, ...PRESETS.map((p) => ({ id: p.id, label: p.label }))];
</script>

<div class="toolbar" data-testid="toolbar">
  <div class="strike-wrap"><StrikeToggle {strike} onchange={onstrike} /></div>
  <span class="sep" aria-hidden="true"></span>
  <div class="pace-wrap">
    <span class="seg" role="radiogroup" aria-label="Built for">
      {#each STORIES as s (s.id)}
        {@const n = counts.get(s.id)}
        <button type="button" role="radio" class="s" aria-checked={selected === s.id}
                class:on={selected === s.id} onclick={() => onstory(s.id)}>
          {s.label}
          {#if n !== undefined}<span class="n">{n}</span>{/if}
        </button>
      {/each}
    </span>
  </div>
  <div class="actions">
    <button type="button" class="filters-toggle" aria-expanded={showFilters} aria-controls="filter-sidebar"
            onclick={onfilters}>Filters</button>
    {@render columns?.()}
  </div>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3);
             padding: var(--s2) var(--s5); background: var(--chrome); border-bottom: 1px solid var(--border); }
  .sep { width: 1px; align-self: stretch; background: var(--divider); }
  .actions { display: flex; align-items: center; gap: var(--s3); margin-left: auto; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--r-full); overflow: hidden; }
  .s { display: inline-flex; align-items: center; gap: var(--s1); padding: var(--s1) var(--s3); border: none;
       background: none; color: var(--text-dim); cursor: pointer; font-size: var(--t-sm); white-space: nowrap; }
  .s.on { background: var(--accent-dim); color: var(--text); font-weight: 600; }
  .n { font-variant-numeric: tabular-nums; font-size: var(--t-xs); color: var(--text-dim); }
  .s.on .n { color: var(--accent); }
  /* Above 800px the sidebar is always on screen, so the drawer toggle has nothing to toggle. */
  .filters-toggle { display: none; padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
                    background: var(--surface); color: var(--text); border-radius: var(--r-sm); }
  /* 879.98px, not 880px: the tier boundary is "880 and up is one line", and `max-width: 880px`
     matches *at* 880 and splits the toolbar on the width that is supposed to be the wide one. */
  @media (max-width: 879.98px) {
    /* The separator has nothing to separate once the groups stop sharing a line, and would
       otherwise dangle after Forefoot at the end of line one. */
    .sep { display: none; }
    .actions { order: 1; }
    .pace-wrap { order: 2; flex-basis: 100%; }
  }
  /* On the wrapper, never the segment: on the segment the bordered pill container stretches the
     full width with its pills clustered at the left. */
  @media (max-width: 560px) {
    /* `border-box`, or the 1px pill border puts the segment 2px past the line it is filling. */
    .pace-wrap .seg { width: 100%; box-sizing: border-box; }
    .pace-wrap .s { flex: 1; justify-content: center; }
  }
  @media (max-width: 800px) {
    .toolbar { padding: var(--s2) var(--s3); }
    .filters-toggle { display: inline-block; }
  }
</style>
