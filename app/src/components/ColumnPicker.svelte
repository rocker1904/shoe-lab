<script lang="ts">
  import type { LabTest, Shoe } from '../../../shared/types.js';
  import { categoricalEntries } from '../lib/categorical';
  import { coverageOf } from '../lib/coverage';
  import type { TestIndex } from '../lib/dataset';
  import DirectionLegend from './DirectionLegend.svelte';
  import { directionOf, DIRECTION_ARROW } from '../lib/direction';
  import { dismissOnFocusLeave, dismissOnOutsidePress } from '../lib/dismiss';
  import { ICON_PATHS } from './icons';
  import { columnLabel } from '../lib/labels';
  import { DERIVED_ZONE_PAIRS, metricEntries, type ResolvedMetric } from '../lib/lineage';

  let { tests, groups, columns, onchange, population, idx, generations }: {
    tests: LabTest[]; groups: Record<string, string>; columns: string[];
    onchange: (cols: string[]) => void;
    /** Coverage denominator, matching the sidebar's (docs/app.md §Coverage). */
    population: Shoe[]; idx: TestIndex;
    generations: Record<string, string>;
  } = $props();

  /** The story scores sit with the shoe fields rather than among the metrics: they have no
   *  catalogue test, so `metricEntries` never offers them and `coverageOf` would read 0% — and
   *  without a home here the column a story sets could never be unticked. Derived from the pairs
   *  that declare them and labelled through `columnLabel`, so a further story needs no edit here
   *  and the picker cannot call a column something the header does not. */
  const SCORE_ENTRIES: [string, string][] = DERIVED_ZONE_PAIRS.flatMap((p) =>
    ([p.heel, p.forefoot] as const).map((key) => [key, columnLabel(key, undefined)] as [string, string]));
  const FIXED: [string, string][] = [['releasedAt', 'Release date'], ...SCORE_ENTRIES,
    ['score', 'RunRepeat Score'], ['msrpGbp', 'Price'], ['plate', 'Plate']];

  interface Offer { key: string; label: string; retired: boolean }
  // A pair offers whichever generation is chosen and never both; a colocated metric offers both
  // halves, which is what keeps them independently sortable (docs/app.md §Columns and sorting).
  const offersOf = (e: ResolvedMetric): Offer[] => {
    if (e.kind === 'single') return [{ key: e.key, label: e.label, retired: e.retired }];
    if (e.kind === 'pair') {
      const g = generations[e.current.key] === e.retired.key ? e.retired : e.current;
      return [{ key: g.key, label: `${e.label} (${g.generation})`, retired: g.retired }];
    }
    return e.parts.map((p) => ({ key: p.key, label: p.label, retired: p.retired }));
  };
  const grouped = $derived.by(() => {
    const m = new Map<string, Offer[]>();
    // Categorical tests are choosable columns but never rangeable, so they are offered here and
    // deliberately not through `metricEntries`, which the filter dialog also reads
    // (docs/app.md §Categorical columns).
    for (const e of [...metricEntries(tests), ...categoricalEntries(tests).map((c) => ({
      kind: 'single' as const, key: c.key, label: c.label, units: '', groupId: c.groupId, retired: c.retired,
    }))]) {
      const g = (e.groupId && groups[e.groupId]) || 'Other';
      m.set(g, [...(m.get(g) ?? []), ...offersOf(e)]);
    }
    return [...m.entries()];
  });
  const pct = (key: string) => Math.round(coverageOf(population, key, idx).fraction * 100);
  function toggle(key: string) {
    onchange(columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key]);
  }

  /**
   * `<details>` is the whole control — the summary is the trigger and the browser owns the toggle —
   * so `open` is bound rather than driven, and everything below only ever closes it. A native
   * `<details>` stays open until its summary is clicked again: neither an outside press nor Escape
   * dismisses one in any engine, measured in all three, so both are ours to add
   * (docs/app.md §Every floating panel dismisses the same way).
   *
   * The binding earns its keep twice. A closed `<details>` still renders its children, so the
   * coverage bars below were being recomputed on every view update — forty-odd full passes over the
   * population, twice each, for a panel nobody could see. One pass is cheap; sixty times a second
   * during a drag is not (docs/app.md §What a drag may recompute). The rows themselves stay
   * mounted: they hold the checked state and cost nothing to keep.
   */
  let open = $state(false);
  let details = $state<HTMLDetailsElement | null>(null);
  let summary = $state<HTMLElement | null>(null);

  /**
   * The element as well as the binding, and that is not belt and braces. `open` mirrors the
   * `<details>` through the `toggle` event, which the browser queues as a **task** rather than
   * firing with the summary's activation — so for one task after the panel opens, the mirror still
   * reads false while the panel is on screen. Assigning only the mirror there is not a state
   * *change*, so Svelte writes nothing and the dismissal is silently dropped: measured in Chromium
   * as an Escape immediately after opening doing nothing at all.
   */
  function shut() {
    if (details) details.open = false;
    open = false;
  }

  $effect(() => {
    if (!open) return;
    // Guarded on the whole `<details>`, so the summary is INSIDE for both dismissals: its press is
    // left to the browser's own toggle rather than closing and immediately reopening the panel, and
    // Escape's hand-back of focus to it is not a departure. `lib/dismiss.ts` owns the rest.
    const stops = [dismissOnOutsidePress(() => details, shut), dismissOnFocusLeave(() => details, shut)];
    return () => stops.forEach((s) => s());
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Deliberately NOT stopped, unlike the month picker's: that panel is a real descendant of the
    // filter drawer and one Escape would shut both, where this one lives in the pinned chrome and
    // has no ancestor listening (docs/app.md §Filters). The add-filter dialog leaves it alone for
    // the same reason from the other direction — it renders into `<body>`.
    shut();
    // Back to the summary, or focus lands on `<body>` and a keyboard user loses the toolbar.
    summary?.focus();
  }
</script>

<!-- The key handler is on the whole control rather than the panel: a `<details>` puts focus on its
     summary when it opens, and that is outside the panel it just revealed. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<details class="picker" bind:open bind:this={details} onkeydown={onkeydown}>
  <!-- The count rides in a badge so the label stops changing width as columns are ticked.
       `aria-label` rather than a visually-hidden span: the word is swapped for a glyph below 800px
       and the accessible name must not change with the viewport, so the count belongs in it — the
       badge is the only remaining indication of what the control holds
       (docs/app.md §Where the utilities live). -->
  <summary bind:this={summary} aria-label="Columns, {columns.length} shown">
    <span class="word">Columns</span>
    <svg class="glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={ICON_PATHS.columnsBox} stroke="currentColor" stroke-width="1.3" />
      <path d={ICON_PATHS.columnsBars} stroke="currentColor" stroke-width="1.3" />
    </svg>
    <span class="count-badge">{columns.length}</span>
    <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </summary>
  <div class="panel">
    <!-- OUTSIDE the scrollport, which is what `.list` below is for: inside it the legend scrolled
         away with the first few rows and every glyph under it stopped meaning anything.
         `DirectionLegend.svelte` owns the words (docs/app.md §Table presentation). -->
    <DirectionLegend />
    <div class="list scrollport">
    {#each FIXED as [key, label] (key)}
      <label>
        <input type="checkbox" checked={columns.includes(key)} onchange={() => toggle(key)} />
        <span class="name">{label}</span>
        <span class="dir" aria-hidden="true">{DIRECTION_ARROW[directionOf(key)]}</span>
      </label>
    {/each}
    {#each grouped as [group, offers] (group)}
      <h4>{group}</h4>
      {#each offers as o (o.key)}
        <label>
          <input type="checkbox" checked={columns.includes(o.key)} onchange={() => toggle(o.key)} />
          <span class="name">{o.label}</span>
          <span class="dir" aria-hidden="true">{DIRECTION_ARROW[directionOf(o.key)]}</span>
          {#if open}
            {@const p = pct(o.key)}
            <span class="bar"><span class="fill" style:width="{p}%"></span></span>
            <span class="pct">{p}%</span>
          {/if}
        </label>
      {/each}
    {/each}
    </div>
  </div>
</details>

<style>
  .picker { position: relative; }
  /* Sized and filled like the `Filters` button it stands beside on the toolbar: `summary` inherits
     the document's 16px rather than the bar's `--t-sm`, and an unpainted control shows `--chrome`
     where its neighbour shows `--surface` — two controls that do the same kind of job reading as
     two kinds of control (docs/app.md §The toolbar). */
  summary { cursor: pointer; padding: var(--s1) var(--s3); border: 1px solid var(--border);
            border-radius: var(--r-sm); white-space: nowrap; list-style: none;
            font-size: var(--t-sm); background: var(--surface);
            display: inline-flex; align-items: center; gap: var(--s2); }
  summary::-webkit-details-marker { display: none; }
  /* `--border-soft`, not `--bg`: the fill has to separate from the control it sits in, and `--bg`
     against the summary's `--surface` is a step the eye does not resolve — the number then reads as
     part of the label rather than as a count. `--text-dim` on this track is the reason
     `wash.test.ts` asserts that pair (docs/app.md §Theming). */
  .count-badge { font-family: var(--font-mono); font-size: var(--t-xs); line-height: 1;
                 padding: 2px var(--s1); border-radius: var(--r-sm);
                 background: var(--border-soft); color: var(--text-dim); }
  /* The badge is what survives the word: the count is the only thing on this control that changes,
     and it is why the label was given a badge rather than a growing string in the first place. The
     picker owns its own tightening below 800px rather than the toolbar reaching in with a
     `:global` (docs/app.md §Where the utilities live). */
  .glyph { display: none; }
  @media (max-width: 800px) {
    .word, .chev { display: none; }
    .glyph { display: inline-flex; }
    summary { padding-inline: var(--s2); }
  }
  .panel { position: absolute; right: 0; z-index: 10; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s3) var(--s4); display: flex; flex-direction: column; gap: var(--s2); min-width: 20rem; box-shadow: var(--shadow-dialog); }
  /* The 20rem is CONTENT — no `box-sizing` here — so the panel measures 354px, and anchored
     `right: 0` under a toolbar that leaves it 352px at 360px it put its left hairline and both left
     corners off the screen. The 4px a side comes out of the PADDING, and only on the phone: making
     the panel border-box instead takes it to 320px at EVERY width, which wraps the direction legend
     onto a second line on a 1440px desktop where nothing was wrong. 346px at 360px, so 6px of air;
     untouched at 401px and above (docs/app.md §Stacking order). */
  @media (max-width: 400px) { .panel { padding-inline: var(--s3); } }
  /* The trigger stops being the anchor below 800px, because there it is no longer at the end of a
     row: the actions band takes the whole width and the utilities are pushed past it, so the
     summary sits MID-BAR and a panel hung off its right edge starts 166px off the left of the
     screen — every checkbox off screen at every width the drawer exists at, which is how a control
     that passes `toBeVisible` shipped unusable. Dropping the containing block hands the panel to
     `.chrome`, which spans the bar, and `--s2` restores the trailing inset the toolbar's own
     padding used to supply: the geometry the panel had when the trigger was the last thing on the
     row. AFTER the base rule rather than inside the block above, because a media query carries no
     extra specificity and `right: 0` below it would win (docs/app.md §Stacking order). */
  @media (max-width: 800px) {
    .picker { position: static; }
    /* `width` as well as the anchor, and it is the same 20rem of content the base rule asks for:
       shrink-to-fit is measured against the CONTAINING BLOCK, so handing the panel to a bar-wide
       one let it take its max-content 405px at 700px and go flush to the left edge at 360px. Stated
       explicitly, the panel keeps the size the design sets and only its anchor moves. */
    .panel { right: var(--s2); width: 20rem; }
  }
  /* Where the 20rem simply cannot fit: 346px of panel needs 354px of screen, so below that the
     panel spans the bar instead and the direction legend takes a second line. That is the one band
     the design trades the legend away in, and it is traded for the checkboxes being on screen at
     all. 360px rather than 354 because 360 is the width the legend's one-line bound is stated at
     (docs/app.md §Stacking order). `min-width: 0` is what lets the left/right pair size the box —
     a min-width is applied last and the 20rem would otherwise win. */
  @media (max-width: 359.98px) { .panel { left: var(--s2); width: auto; min-width: 0; } }
  /* `.scrollport` in `app.css` pays the ring's room; the negative margin gives that room back to
     the panel's own padding, so the rows sit exactly where they did (docs/app.md §Theming).
     The INLINE-END pair is the scrollbar's, and it is a different fact. This list always overflows
     — forty-odd metrics against a 22rem cap — and the coverage figure is the right-most thing in
     every row, so it ended flush with the port's content edge with 4px of ring room between it and
     the bar: read as touching where the bar takes layout, and painted UNDER it where the bar is an
     overlay, which is Firefox's default on Linux; both measured at 4px.
     `--s3` is one classic bar on the engines this project measures on (12px, GTK Firefox), and it
     is given straight back as margin, so the ROW keeps the width it had in both regimes — measured
     identical at 308px classic and 320px overlay before and after — and only the bar moves, out of
     the figures and into the panel's own padding. */
  .list { max-height: 22rem; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s1);
          margin-inline: calc(-1 * var(--ring-room)); padding-inline-end: var(--s3);
          margin-inline-end: calc(-1 * var(--s3)); }
  h4 { margin: var(--s2) 0 var(--s1); font-size: var(--t-xs); color: var(--text-dim); text-transform: uppercase; }
  label { font-size: var(--t-sm); display: grid; grid-template-columns: auto 1fr auto 3rem 2.2rem; align-items: center; gap: var(--s2); }
  .dir { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-dim); width: 1ch; text-align: center; }
  /* Track and fill must be DIFFERENT neutrals, or the bar is a featureless pill: --hist-dim is the
     mark, --border-soft the groove it sits in. The fill is a flat mark and the track is the surface
     it sits on, so the pair is held to the same 3:1 as the histogram — 3.12:1 light and 3.22:1
     dark, asserted in wash.test.ts. The old --hist-dim managed 2.70:1 here, which is why the token
     was retuned rather than only the track changed. Neutral rather than accent because accent means
     "you selected this" in a CONTROL, and a picker row is a control. Where a bar encodes MAGNITUDE
     it is a data mark and keeps the accent — the score breakdown's share bar does
     (docs/app.md §Theming). */
  .bar { display: block; height: 6px; border-radius: var(--r-full); background: var(--border-soft); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--hist-dim); }
  .pct { font-size: var(--t-xs); color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
</style>
