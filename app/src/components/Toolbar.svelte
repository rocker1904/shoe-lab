<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Zone } from '../lib/lineage';
  import { PRESETS } from '../lib/presets';
  import { roving } from '../lib/roving';
  import { SCORE_DEFS } from '../lib/score-defs';
  import HelpPopover from './HelpPopover.svelte';
  import ZoneToggle from './ZoneToggle.svelte';

  let { zone, onzone, selected, onstory, showFilters, onfilters, columns,
        stability, onstability, showGroups = true }: {
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
    /** False while the setup strip is still asking both questions in words: the strip hands over to
     *  the bar rather than sharing the screen with it, or the four stories are on screen twice
     *  (docs/app.md §Presets). The actions stay either way — they are the bar's own. */
    showGroups?: boolean;
  } = $props();

  // `All` leads so the group reads as everything → narrow to a story, and it is the same state a
  // `Clear` button used to produce, named for what you get (docs/app.md §Presets).
  const STORIES = [{ id: 'all', label: 'All' }, ...PRESETS.map((p) => ({ id: p.id, label: p.label }))];

  /** Derived from the definitions that declare a stable variant rather than written out, so a
   *  fourth story reaches this copy without an edit here. */
  const STABLE_STORIES = PRESETS
    .filter((p) => SCORE_DEFS.some((d) => d.id === p.id && d.stable)).map((p) => p.label);
  const listed = (xs: string[]) =>
    xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

  const SCORE_LABEL = 'the story scores';
  /**
   * What the scores read and what they deliberately do not — the things a runner would otherwise
   * have to infer from the table. **Which terms each story reads is deliberately not here**: that
   * is `score-defs.ts`'s to own and the breakdown panel's to show, and a second copy would drift
   * from both. No maths either: docs/app.md §The story scores owns that.
   */
  const SCORE_HELP = 'Each story ranks on lab measurements chosen for that kind of run — expand a '
    + 'row to see which, and what each one contributed. Price and release date are deliberately '
    + 'left out of every score, so the value call stays yours. A shoe missing any measurement a '
    + 'story reads is not scored at all rather than scored zero, and sorts last. The scale is fixed '
    + 'to a dated snapshot of the fleet, so scores stay comparable over time and a future '
    + `shoe can read above 100. Stability reaches ${listed(STABLE_STORIES)} only: race shoes are `
    + 'uniformly tall and narrow, so there is no stable racer to surface.';
</script>

<div class="toolbar" data-testid="toolbar">
  {#if showGroups}
    <div class="zone-wrap"><ZoneToggle {zone} onchange={onzone} /></div>
    <span class="sep" aria-hidden="true"></span>
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
  {/if}
  <div class="stability">
    <input id="stability-pref" type="checkbox" checked={stability}
           onchange={(e) => onstability(e.currentTarget.checked)} />
    <!-- The label is explicit rather than wrapping, because the help sits beside it: a button
         inside a label is a click on the label, so opening the help would toggle the preference it
         explains. -->
    <div class="pref">
      <label for="stability-pref">Stability matters to me</label>
      <HelpPopover label={SCORE_LABEL} body={SCORE_HELP} />
    </div>
    <!-- Says what the switch adds and nothing more: the width term is a ratio precisely so that
         opting in does not select heavy shoes, so there is no cost to warn about
         (docs/app.md §The story scores). -->
    <small>Adds midsole width and heel counter stiffness to the {listed(STABLE_STORIES)} scores.</small>
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
  /* A grid so the note sits under the label rather than beside the box: it explains the checkbox
     rather than standing beside it as a peer, and inline the control measures 538px against the
     389px it takes stacked. */
  .stability { display: grid; grid-template-columns: auto 1fr; align-items: center;
               gap: 0 var(--s2); font-size: var(--t-sm); }
  /* The `?` rides with the label rather than taking a grid track of its own: the note below spans
     the same track, so a third column would be sized by the note and strand the `?` at its end. */
  .pref { display: flex; align-items: center; gap: var(--s2); }
  .stability label { cursor: pointer; }
  .stability small { grid-column: 2; font-size: var(--t-xs); color: var(--text-dim); }
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
    /* Its own line below the stories: at this tier line one is the zone group plus the actions, and
       the 389px control does not fit beside them — leaving it to wrap on its own put the actions on
       a third line and left the void this tier exists to eliminate (docs/app.md §Presets). */
    .stability { order: 3; flex-basis: 100%; }
  }
  /* Below 800px the bar is chrome above the first shoe on the screen with the least room for it, so
     it pays for its own rows: the vertical padding halves and the row gap with it. The groups keep
     every control and only the air between them narrows (docs/app.md §Presets). */
  @media (max-width: 800px) {
    .toolbar { padding: var(--s1) var(--s3); gap: var(--s1) var(--s3); }
    .filters-toggle { display: inline-block; }
    /* The two segmented groups share a row here. They ask one question each and are read together,
       and at 390px they need 133px and 202px against the 366px this padding leaves — so the row that
       used to hold the zone group alone, with the actions floated off to its right, holds both. */
    .pace-wrap { order: 0; flex-basis: auto; }
    .actions { order: 1; }
    .stability { order: 2; }
  }
  /* Last of the three, because every tier below 880px is narrower than the one before and the later
     rule is the one that wins. 360px is the binding width, not 375: it is the usual Android one
     (docs/app.md §Presets). */
  @media (max-width: 560px) {
    /* The two groups share a row from 800px down, so the story pills stop stretching: filling a line
       was right while this group owned one, and beside the zone group it just takes the row. Their
       own padding is what buys the fit — the pair need 366px at `--s3` a pill against the 344px this
       padding leaves at 360px, and 334px at `--s2`.
       The `:global` reaches the column picker's summary, which is the bar's own line budget rather
       than the picker's. */
    .s { padding-inline: var(--s2); }
    .toolbar { padding: var(--s1) var(--s2); column-gap: var(--s2); }
    .actions { gap: var(--s2); }
    .filters-toggle, .actions :global(summary) { padding-inline: var(--s2); }
  }
</style>
