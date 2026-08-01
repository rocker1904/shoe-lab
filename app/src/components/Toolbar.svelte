<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Zone } from '../lib/lineage';
  import { PRESETS } from '../lib/presets';
  import { roving } from '../lib/roving';
  import { ICON_PATHS } from './icons';
  import ZoneToggle from './ZoneToggle.svelte';

  let { zone, onzone, selected, onstory, showFilters, onfilters, columns, utilities,
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
    /** Written once in `Page.svelte` and handed to exactly one host: this one below 800px, the
     *  masthead above it (docs/app.md §Where the utilities live). */
    utilities?: Snippet;
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

<div class="toolbar" data-testid="toolbar">
  <!-- `{#if}` OUTSIDE the wrapper, not inside it: below 800px `.setup` is a full-width flex line, so
       an empty one on the landing screen is a second row charging the bar's row gap for nothing.
       Same rule as the utilities host below. -->
  {#if showGroups}
    <div class="setup">
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
    </div>
  {/if}
  <div class="actions">
    <!-- First of the pair that opens a panel, because it is the one a reader might need before they
         know what Columns is for. -->
    <button type="button" class="about" onclick={onabout}>About</button>
    <!-- Both forms are rendered and CSS chooses, so the accessible name never changes with the
         viewport (docs/app.md §Where the utilities live). -->
    <button type="button" class="filters-toggle" aria-expanded={showFilters} aria-controls="filter-sidebar"
            onclick={onfilters} aria-label="Filters">
      <span class="word">Filters</span>
      <svg class="glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={ICON_PATHS.filters} stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      </svg>
    </button>
    {@render columns?.()}
    <!-- `{#if}`, not a bare render: an empty span is still a flex item and still takes the row's
         gap, which is exactly what would stop the utilities being flush right. -->
    {#if utilities}<span class="utils-host">{@render utilities()}</span>{/if}
  </div>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3);
             padding: var(--s2) var(--s5); background: var(--chrome);
             border-bottom: 1px solid var(--border); }
  .setup { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
  .actions { display: flex; align-items: center; gap: var(--s3); margin-left: auto; }
  /* What splits the control row into "what opens a panel" on the left and "what you do to a table
     you are happy with" on the right. Without it the five controls bunch at one end and the row's
     slack lands in the wrong place. */
  .actions .utils-host { margin-left: auto; }
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
  /* Unchanged from today and deliberately NOT inside a media block: above 800px the sidebar is
     permanent, so the drawer toggle has nothing to toggle and is hidden by default rather than by a
     query. It is the fifth carrier of the one secondary-button treatment (docs/app.md §Theming). */
  .filters-toggle { display: none; padding: var(--s1) var(--s3); cursor: pointer;
                    border: 1px solid var(--border); background: var(--surface); color: var(--text);
                    border-radius: var(--r-sm); font-size: var(--t-sm); }
  .filters-toggle:hover { background: var(--accent-dim); }
  /* The sixth carrier of the one secondary-button treatment (docs/app.md §Theming). */
  .about { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
           background: var(--surface); color: var(--text); border-radius: var(--r-sm);
           font-size: var(--t-sm); white-space: nowrap; }
  .about:hover { background: var(--accent-dim); }
  .glyph { display: none; }
  /* Below 800px every pixel of chrome is paid before the first shoe, on the screen with the least
     of it: the gutter and the vertical padding halve, and Filters appears because the sidebar is a
     drawer here. 800 rather than 799.98 deliberately — it is the sidebar's own boundary and the two
     must agree, or the drawer toggle shows on a width laid out as a desktop.
     ONE boundary, not two: the design asked for a merged line from 700 to 800 and the shipped
     components do not fit one, so the bands separate for the whole sub-800 range. The ACTIONS lead
     — what acts on the table above what the table is, so the row carrying every word sits nearest
     the table. docs/app.md §The chrome bands owns the widths that moved the boundary. */
  @media (max-width: 800px) {
    .toolbar { padding: var(--s1) var(--s2); gap: var(--s1) var(--s2); }
    .filters-toggle { display: inline-flex; align-items: center; padding-inline: var(--s2); }
    /* Default-hidden glyph revealed by the query, never a `min-width` twin: the pair is exhaustive
       at any width including the fractional ones zoom and Firefox both produce. */
    .word { display: none; }
    .glyph { display: inline-flex; }
    /* The pills' own padding is what buys the fit: at the base `--s3` the setup row is wider than
       the cap below, so it would overflow its own band before any viewport did. */
    .s { padding-inline: var(--s2); }
    .actions { order: -1; flex-basis: 100%; }
    /* `--s1` rather than the base `--s2`, and it is a FIT rule rather than a spacing one: under
       `space-between` the gap is only a floor, so the visible gaps are whatever the row has spare
       and this changes nothing above the binding widths. It changes everything at them, because
       Firefox sets these groups wider than Chromium does and a Chromium-only check would have
       shipped the overflow (docs/app.md §The chrome bands). */
    .setup { flex-basis: 100%; justify-content: space-between; gap: var(--s1);
             max-width: 414px; margin-inline: auto; }
  }

  /* At 430px and below the cap is wider than the row, so it stops meaning anything and the row goes
     flush to both padding edges — which is the property the rebuild exists to restore. 414px is the
     row's own content width at 430px: above that it holds this spacing rather than growing gaps
     that reach 171px by 700px.
     The pills tighten again on the same boundary rather than on one of their own — 360px is the
     binding width, not 375, because it is the usual Android one. ALL of them: the zone group's
     padding lives in `ZoneToggle.svelte`, a scoped style block this rule cannot reach, so the step
     is stated there too and stepping only the pills this file owns leaves the row over at 360px.
     docs/app.md §The chrome bands owns the measurements. */
  @media (max-width: 429.98px) {
    .setup { max-width: none; margin-inline: 0; }
    .s { padding-inline: var(--s1); }
  }
</style>
