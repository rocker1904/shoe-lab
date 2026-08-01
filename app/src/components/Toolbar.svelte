<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Zone } from '../lib/lineage';
  import { PRESETS } from '../lib/presets';
  import { roving } from '../lib/roving';
  import ZoneToggle from './ZoneToggle.svelte';

  let { zone, onzone, selected, onstory, showFilters, onfilters, columns,
        stability, onstability, onabout, showGroups = true }: {
    /** Derived in `Page.svelte`, never stored: null while the view names both halves or neither
     *  (docs/app.md §Presets). */
    zone: Zone | null; onzone: (s: Zone) => void;
    /** Derived in `Page.svelte`, never stored: `'all'` while the view equals this runner's own
     *  baseline, a story id while it equals that story, null once it is neither
     *  (docs/app.md §Presets). */
    selected: string | null;
    onstory: (id: string) => void;
    showFilters: boolean; onfilters: () => void;
    /** The column picker, passed through rather than imported: it needs the whole dataset, which
     *  the toolbar has no other reason to know about. */
    columns?: Snippet;
    /** A property of the runner rather than of the search, so it lives on the bar, which persists,
     *  rather than on the strip, which collapses for good on the first story click
     *  (docs/app.md §Presets). */
    stability: boolean; onstability: (v: boolean) => void;
    /** Opens the panel that explains the table (docs/app.md §The About panel). `Page.svelte` owns
     *  the panel; the bar owns the way in. */
    onabout: () => void;
    /** False while the setup strip is still asking both questions in words: the strip hands over to
     *  the bar rather than sharing the screen with it, or the four stories are on screen twice
     *  (docs/app.md §Presets). The actions stay either way — they are the bar's own. */
    showGroups?: boolean;
  } = $props();

  // `All` leads so the group reads as everything → narrow to a story, and it is the same state a
  // `Clear` button used to produce, named for what you get (docs/app.md §Presets).
  const STORIES = [{ id: 'all', label: 'All' }, ...PRESETS.map((p) => ({ id: p.id, label: p.label }))];
</script>

<div class="toolbar" class:no-groups={!showGroups} data-testid="toolbar">
  <div class="setup">
    {#if showGroups}
      <div class="zone-wrap"><ZoneToggle {zone} onchange={onzone} /></div>
      <div class="pace-wrap">
        <span class="seg" role="radiogroup" aria-label="Built for" use:roving>
          <!-- No count: a scored story's is the size of its pool rather than of a shortlist
               (docs/app.md §The toolbar). -->
          {#each STORIES as s (s.id)}
            <button type="button" role="radio" class="s" aria-checked={selected === s.id}
                    class:on={selected === s.id} onclick={() => onstory(s.id)}>{s.label}</button>
          {/each}
        </span>
      </div>
      <!-- A property of the runner rather than of the search, so it rides the bar rather than the
           strip — but it answers a third question about the same table, so it is drawn as one pill
           in the same family rather than as a checkbox standing among segmented groups. Its words
           are the About panel's now (docs/app.md §The About panel). -->
      <span class="seg one">
        <button type="button" class="s pill" aria-pressed={stability}
                class:on={stability} onclick={() => onstability(!stability)}>Stability</button>
      </span>
    {/if}
  </div>
  <div class="actions">
    <!-- First of the pair that opens a panel, because it is the one a reader might need before they
         know what Columns is for. -->
    <button type="button" class="about" onclick={onabout}>About</button>
    <button type="button" class="filters-toggle" aria-expanded={showFilters} aria-controls="filter-sidebar"
            onclick={onfilters}>Filters</button>
    {@render columns?.()}
  </div>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3);
             padding: var(--s2) var(--s5); background: var(--chrome); border-bottom: 1px solid var(--border); }
  .actions { display: flex; align-items: center; gap: var(--s3); margin-left: auto; }
  /* One control in a track sized for a group: the padding is the group's, so the pill lines up with
     the pills beside it rather than sitting in a tighter box of its own. */
  .seg.one { padding: 2px; }
  /* Transparent until the band ladder gives this box a layout of its own: the wrapper exists so the
     pill has a group to stand in, and a real flex box here locks all three groups into one
     unwrappable row that overflows a 390px screen. `display: contents` leaves them wrapping exactly
     as they do without it. */
  .setup { display: contents; }
  /* `overflow: visible`, not hidden: the focus ring is a box-shadow and a clipped track would
     swallow it (docs/app.md §Theming). */
  .seg { display: inline-flex; background: var(--bg); border: 1px solid var(--border);
         border-radius: var(--r-md); padding: 2px; gap: 2px; overflow: visible; }
  .s { display: inline-flex; align-items: center; gap: var(--s1); padding: var(--s1) var(--s3); border: none;
       border-radius: var(--r-sm); background: none; color: var(--text-dim); cursor: pointer;
       font-size: var(--t-sm); white-space: nowrap; }
  /* `--accent-solid`, not `--accent`: --on-accent on the accent is 3.71:1 in dark. A filled accent
     under --on-accent text is the only kind of site that token exists for (docs/app.md §Theming).
     `--on-accent`, not `#fff`: the pair is one fact and a literal here splits it across files —
     `tokens.test.ts` fails the build on a raw white in a component's style block. */
  .s.on { background: var(--accent-solid); color: var(--on-accent); font-weight: 600; }
  /* Above 800px the sidebar is always on screen, so the drawer toggle has nothing to toggle.
     It is the fifth carrier of the one secondary-button treatment (docs/app.md §Theming) and was
     the only one missing its size and its hover — a control that opens a drawer, giving no feedback
     under the pointer, on the tier where it is the only way to reach the filters at all. */
  .filters-toggle { display: none; padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
                    background: var(--surface); color: var(--text); border-radius: var(--r-sm);
                    font-size: var(--t-sm); }
  .filters-toggle:hover { background: var(--accent-dim); }
  /* The sixth carrier of the one secondary-button treatment (docs/app.md §Theming). */
  .about { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
           background: var(--surface); color: var(--text); border-radius: var(--r-sm);
           font-size: var(--t-sm); white-space: nowrap; }
  .about:hover { background: var(--accent-dim); }
  /* Below 800px the bar is chrome above the first shoe on the screen with the least room for it, so
     it pays for its own rows: the vertical padding halves and the row gap with it. The groups keep
     every control and only the air between them narrows (docs/app.md §Presets). */
  @media (max-width: 800px) {
    .toolbar { padding: var(--s1) var(--s3); gap: var(--s1) var(--s3); }
    .filters-toggle { display: inline-block; }
    /* The two segmented groups share a row from 880px down. They ask one question each and are read
       together, and at 390px they need 133px and 202px against the 366px this padding leaves. */
    .actions { order: 1; }
  }
  /* Last of the three, because every tier below 880px is narrower than the one before and the later
     rule is the one that wins. 609.98px, not 560: at `--s3` a pill the actions stop fitting beside
     the two groups at 601px and the bar takes a third row, which the tighter padding then hands
     back — the same non-monotonic step the 880px boundary must not make either. Engaging the tier
     before that break is what keeps the bar two rows from 800px down to 545px
     (docs/app.md §Presets). */
  @media (max-width: 609.98px) {
    /* The two groups share a row from 880px down, so the story pills stop stretching: beside the
       zone group this group takes the row it is given rather than filling one of its own. Their own
       padding is what buys the fit — the pair need 366px at `--s3` a pill against the 344px this
       padding leaves at 360px, and 334px at `--s2`. 360px is the binding width, not 375: it is the
       usual Android one.
       The `:global` reaches the column picker's summary, which is the bar's own line budget rather
       than the picker's. */
    .s { padding-inline: var(--s2); }
    .toolbar { padding: var(--s1) var(--s2); column-gap: var(--s2); }
    .actions { gap: var(--s2); }
    .filters-toggle, .actions :global(summary) { padding-inline: var(--s2); }
  }
</style>
