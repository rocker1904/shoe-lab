<script lang="ts" module>
  /**
   * Long enough that a fetch off a warm cache never shows a placeholder at all — the dataset is a
   * 2MB asset served from the same origin, so most loads are far inside this — and short enough
   * that a genuinely slow one does not look broken. A skeleton that flashes for 200ms is worse
   * than the text it replaced (docs/app.md §Decisions).
   */
  export const SKELETON_AFTER_MS = 300;
</script>

<script lang="ts">
  import type { ShoesFile } from '../../shared/types.js';
  import Header from './components/Header.svelte';
  import SetupStrip from './components/SetupStrip.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import { loadShoes } from './lib/data';
  import { isBareArrival } from './lib/arrival';
  import { SIDEBAR_PERMANENT_PX } from './lib/fit';
  import { layoutWidth, observeLayoutWidth } from './lib/layout-width';
  import { DEFAULT_ZONE, defaultColumns } from './lib/urlstate';
  import Page from './Page.svelte';

  /** Derived from the view the table will open on, never written out: the placeholder's job is to
   *  reserve the geometry that replaces it, and a hand-counted number here drifts the first time a
   *  column joins or leaves the default set. The name column has no entry in `defaultColumns`, so
   *  it is the `+ 1` (docs/app.md §Decisions). */
  const skeletonCells = Array.from(
    { length: defaultColumns(DEFAULT_ZONE).length + 1 }, (_, i) => i);

  /** Whether THIS load will draw the setup strip — the same predicate `Page.svelte` opens it on,
   *  so the room reserved and the room used are one answer (docs/app.md §Decisions). */
  const strip = isBareArrival();
  /** The reserve is laid out and invisible, so nothing it renders can be pressed and nothing it
   *  holds means anything. Handlers exist because the components require them. */
  const inert = () => {};

  /**
   * Whether the page this placeholder stands in for will have a permanent sidebar, asked of the
   * LAYOUT width and not of a media query: a classic scrollbar is 12–15px the layout never receives,
   * and reserving the track from a window width put the reservation on the wrong side of the
   * boundary for those pixels (docs/app.md §Filters).
   *
   * The FLOOR is the right constant here where `Page.svelte` asks the fit model: the placeholder
   * draws the DEFAULT columns — it is waiting for the dataset every other set's width is computed
   * from — and the floor is exactly the default view's own boundary. A link carrying wider columns
   * is served a reserve that the loaded page then takes back, which is one frame at the end of a
   * fetch rather than a layout a runner reads.
   */
  let permanent = $state(layoutWidth() >= SIDEBAR_PERMANENT_PX);
  $effect(() => observeLayoutWidth((px) => (permanent = px >= SIDEBAR_PERMANENT_PX)));

  let data = $state<ShoesFile | null>(null);
  let error = $state<string | null>(null);
  let slow = $state(false);

  async function load() {
    error = null;
    const timer = setTimeout(() => (slow = true), SKELETON_AFTER_MS);
    try {
      data = await loadShoes();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
      slow = false;
    }
  }
  load();
</script>

{#if error}
  <div class="error" role="alert">
    <p>Could not load shoe data. {error}</p>
    <button onclick={load}>Retry</button>
  </div>
{:else if data}
  <Page {data} />
{:else if slow}
  <!-- Everything above the table, laid out and made invisible. The placeholder's contract is that
       the table lands where it is standing, and the bands above it are heights no constant can
       state: the chrome steps four times between 1440px and 320px and the setup strip five, and
       both move again with the face. So the room is reserved by the REAL bands, which is the one
       form of the number that cannot drift from the one the page will use. `visibility: hidden`
       keeps the layout while taking the boxes out of the accessibility tree, out of hit-testing and
       out of the tab order; `inert` says the same thing where CSS has not loaded
       (docs/app.md §Decisions). -->
  <div class="reserve" inert>
    <Header />
    <Toolbar zone={DEFAULT_ZONE} onzone={inert} selected={null} onstory={inert}
             showFilters={false} onfilters={inert} drawer={!permanent}
             stability={false} onstability={inert}
             onabout={inert} showGroups={!strip} />
  </div>
  {#if strip}
    <div class="reserve" inert>
      <SetupStrip zone={DEFAULT_ZONE} selected={null} onzone={inert} onstory={inert} onabout={inert} />
    </div>
  {/if}
  <div class="pane" class:track={permanent}>
    <!-- The receipt's own box, one line of it. Its wording counts shoes, so its height is a fact
         about the data the placeholder is waiting for — one line is the floor, and the surplus at a
         width where it wraps is the residual `smoke.spec.ts` bounds. -->
    <div class="receipt-space"></div>
    <!-- Shaped like what is coming — a chrome bar over a stack of rows — rather than a spinner,
         so the layout does not jump when the real thing arrives. -->
    <!-- The track count rides in a custom property so the grid and the cells are one number: written
         twice they drift the moment `defaultColumns` gains an entry. -->
    <div class="skeleton" role="status" aria-label="Loading shoe data"
         style:--skel-cols={skeletonCells.length - 1}>
      <div class="head">
        <div class="h-names">{#each skeletonCells as c (c)}<i></i>{/each}</div>
        <!-- Empty on purpose: the unit line is there to reserve its line box, and a bar in it would
             claim a unit for the name column, which never has one. -->
        <div class="h-units"></div>
      </div>
      {#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
        <div class="row">{#each skeletonCells as c (c)}<i></i>{/each}</div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .error {
    padding: var(--s6);
    text-align: center;
    color: var(--text-dim);
  }
  button {
    padding: var(--s2) var(--s5);
    cursor: pointer;
  }
  /* The same chassis as the table it stands in for: a panel with a hairline, rows separated by
     --border-soft at --s2 padding, and a name column the width of the table's own. A skeleton that
     no longer matches causes the jump it exists to prevent.
     The left margin RESERVES the sidebar track, because the table it replaces is the second cell of
     `Page.svelte`'s two-column layout, not a full-bleed block: without it the placeholder starts at
     x=16 and the table lands at x=276, which is the jump measured. Below `SIDEBAR_PERMANENT_PX` the
     sidebar is a drawer and the track is gone, so the reservation goes with it — the same boundary
     the loaded page lays out on, or the placeholder reserves a column that never arrives
     (docs/app.md §Decisions). The width is read in the script above rather than in a media query
     here, because the loaded page reads the layout width and a media query would answer about the
     window: the two differ by a classic scrollbar (docs/app.md §Filters). `smoke.spec.ts` drives
     the width one pixel below the boundary, so the two cannot part unnoticed. */
  /* Laid out, painted by nothing. It is the height above the table that is being reserved, and the
     bands are what state it. */
  .reserve { visibility: hidden; }
  /* The margins moved here from `.skeleton` when the receipt joined it: both stand in the second
     cell of the layout, so the track is reserved once for the pair rather than twice. */
  .pane { margin: 0 var(--s4); }
  .pane.track { margin-left: calc(var(--sidebar-w) + var(--s4)); }
  /* The receipt's own box — `Receipt.svelte`'s margin, padding and face — with one line of it
     reserved as a line box rather than as a number. */
  .receipt-space { margin: 0 0 var(--s2); padding: var(--s2) var(--s1);
                   font-size: var(--t-sm); min-height: 1lh; }
  .skeleton { container-type: inline-size; background: var(--surface);
              border: 1px solid var(--border); border-radius: var(--r-md);
              box-shadow: var(--shadow-panel); overflow: hidden; }
  /* The band the table's `thead` builds, stated in line boxes of the same two faces rather than as
     a pixel height, so it follows the type scale: 8px of padding, the header name's lines, a 1px
     gap, the mono unit line, 8px of padding and the 2px rule under it. `e2e/smoke.spec.ts` measures
     this band against the real one on both sides of the threshold below, rather than trusting the
     arithmetic. */
  .skeleton .head { padding: var(--s2); border-bottom: 2px solid var(--border);
                    display: flex; flex-direction: column; gap: 1px; }
  .skeleton .head .h-names { display: grid; grid-template-columns: 14rem repeat(var(--skel-cols), minmax(0, 1fr));
                             gap: var(--s3); align-items: end;
                             font-family: var(--font-ui); font-size: var(--t-md); font-weight: 600;
                             min-height: 2lh; }
  /* The header's `2lh` floor (`ShoeTable.svelte`, `.h-name`) is only a floor: a name wraps to a
     third line once its column is short enough, and at the default set `Energy return heel` does so
     while the table track is 1028px or under. The placeholder cannot read that from the labels —
     they arrive in the dataset it is waiting for — so it keys off the one input that does drive it,
     the width of the track the header wraps in, which is this element's own. A container query
     rather than a media query because the relation is to the track, not the viewport: the sidebar
     and the gutters can move without this number meaning something different.
     MEASURED every time it moves, and never adjusted by arithmetic: it is the width at which one
     particular label takes a third line, so it does not travel by the same distance as the width
     that pushed it. It has read 1025px and 956px before this, across two changes to where a figure
     column's sort mark sits. `e2e/smoke.spec.ts` measures the reserve against the real band on both
     sides of it. */
  @container (max-width: 1028px) {
    .skeleton .head .h-names { min-height: 3lh; }
  }
  .skeleton .head .h-units { font-family: var(--font-mono); font-size: var(--t-xs); min-height: 1lh; }
  /* `min-height: 1lh` in the FIGURE face, not a px height: a table row is 8px of padding, one line
     box, and a 1px hairline — and the line box is the mono cells', because JetBrains Mono's metrics
     are a pixel taller than Inter Tight's at this size and the tallest cell sets the row. Reserving
     it this way rather than as a number means the placeholder follows the face and the type scale
     instead of drifting the moment either moves. Measured without it the skeleton row stood 29px
     against the table's 36px, which is exactly the jump this shape exists to prevent
     (docs/app.md §Decisions). */
  .skeleton .row { display: grid; grid-template-columns: 14rem repeat(var(--skel-cols), minmax(0, 1fr)); gap: var(--s3);
                   padding: var(--s2); border-bottom: 1px solid var(--border-soft); align-items: center;
                   font-family: var(--font-mono); font-size: var(--t-md); min-height: 1lh; }
  .skeleton .row:last-child { border-bottom: 0; }
  .skeleton i { display: block; height: 12px; border-radius: var(--r-sm); background: var(--border-soft); }
  /* The pulse is the only thing that says "still working"; without motion the bars must simply
     sit there rather than be replaced by a second, animation-free design. */
  @media (prefers-reduced-motion: no-preference) {
    .skeleton i { animation: pulse 1.4s ease-in-out infinite; }
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
</style>
