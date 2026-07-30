<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Side } from '../lib/lineage';
  import { PRESETS } from '../lib/presets';
  import { roving } from '../lib/roving';
  import SideToggle from './SideToggle.svelte';

  let { side, onside, selected, counts, onstory, showFilters, onfilters, columns,
        stability, onstability, showGroups = true }: {
    /** Derived in `Page.svelte`, never stored: null while the view names both halves or neither
     *  (docs/app.md §Presets). */
    side: Side | null; onside: (s: Side) => void;
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
    /** A property of the runner rather than of the search, so it lives on the bar, which persists,
     *  rather than on the strip, which collapses for good on the first story click
     *  (docs/app.md §Presets). */
    stability: boolean; onstability: (v: boolean) => void;
    /** False while the setup strip is still asking both questions in words: the strip hands over to
     *  the bar rather than sharing the screen with it, or the four stories are on screen twice
     *  (docs/app.md §Presets). The actions stay either way — they are the bar's own. */
    showGroups?: boolean;
  } = $props();

  // `All` leads so the group reads as everything → narrow to a story, and it is the same state a
  // `Clear` button used to produce, named for what you get (docs/app.md §Presets).
  const STORIES = [{ id: 'all', label: 'All' }, ...PRESETS.map((p) => ({ id: p.id, label: p.label }))];
</script>

<div class="toolbar" data-testid="toolbar">
  {#if showGroups}
    <div class="side-wrap"><SideToggle {side} onchange={onside} /></div>
    <span class="sep" aria-hidden="true"></span>
    <div class="pace-wrap">
      <span class="seg" role="radiogroup" aria-label="Built for" use:roving>
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
  {/if}
  <label class="stability">
    <input type="checkbox" checked={stability} onchange={(e) => onstability(e.currentTarget.checked)} />
    <span>Stability matters to me</span>
    <!-- Says what the switch adds and nothing more: the width term is a ratio precisely so that
         opting in does not select heavy shoes, so there is no cost to warn about
         (docs/app.md §The Easy score). -->
    <small>Adds midsole width and heel counter stiffness to the Easy score.</small>
  </label>
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
  /* A grid so the note sits under the label rather than beside the box: it explains the checkbox
     rather than standing beside it as a peer, and inline the control measures 538px against the
     389px it takes stacked. */
  .stability { display: grid; grid-template-columns: auto 1fr; align-items: center;
               gap: 0 var(--s2); font-size: var(--t-sm); cursor: pointer; }
  .stability small { grid-column: 2; font-size: var(--t-xs); color: var(--text-dim); }
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
    /* Its own line below the stories: at this tier line one is the side group plus the actions, and
       the 389px control does not fit beside them — leaving it to wrap on its own put the actions on
       a third line and left the void this tier exists to eliminate (docs/app.md §Presets). */
    .stability { order: 3; flex-basis: 100%; }
  }
  @media (max-width: 800px) {
    .toolbar { padding: var(--s2) var(--s3); }
    .filters-toggle { display: inline-block; }
  }
  /* On the wrapper, never the segment: on the segment the bordered pill container stretches the
     full width with its pills clustered at the left. Last of the three, because every tier below
     880px is narrower than the one before and the later rule is the one that wins. */
  @media (max-width: 560px) {
    /* `border-box`, or the 1px pill border puts the segment 2px past the line it is filling. */
    .pace-wrap .seg { width: 100%; box-sizing: border-box; }
    .pace-wrap .s { flex: 1; justify-content: center; }
    /* Line one is the side group plus actions, and at 360px — the usual Android width, and the binding one
       (docs/app.md §Presets) — the two need 345px against the 336px this padding left
       them, so the actions dropped to a line of their own and left a void beside the side group. The
       gaps and the buttons' own padding are what pay for it; the `:global` reaches the column
       picker's summary, which is the bar's own line budget rather than the picker's. */
    .toolbar { padding: var(--s2); column-gap: var(--s2); }
    .actions { gap: var(--s2); }
    .filters-toggle, .actions :global(summary) { padding-inline: var(--s2); }
  }
</style>
