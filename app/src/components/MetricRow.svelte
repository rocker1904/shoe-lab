<script lang="ts">
  import type { Coverage } from '../lib/coverage';
  import { directionOf, DIRECTION_ARROW } from '../lib/direction';
  import type { ResolvedMetric } from '../lib/lineage';
  import { roving } from '../lib/roving';
  import MetricHelp from './MetricHelp.svelte';

  let { metric, helpKey, coverage, chosen, onchoose, bounded }: {
    metric: ResolvedMetric;
    helpKey: string;
    coverage: (key: string) => Coverage;
    chosen: string;
    onchoose: (key: string) => void;
    /** Whether that key currently carries a bound. Emphasis marks what is filtering, which is a
     *  fact about the view; the old "· in use" marked the zone, which is a preset's business
     *  (docs/app.md §Coverage). */
    bounded: (key: string) => boolean;
  } = $props();

  const generations = $derived(metric.kind === 'pair' ? [metric.current, metric.retired] : []);
  /** Every coverage figure in the sidebar reads the same way, and says nothing at full coverage. */
  const measured = (key: string): string | null => {
    const c = coverage(key);
    return c.total > 0 && c.n < c.total ? `${c.n} / ${c.total} measured` : null;
  };
  /**
   * One figure for the whole metric, except a superseded pair. Both halves of a declared zone pair
   * are read in the same test run, so a figure per half is duplication — asserted against the
   * dataset by coverage.test.ts. Two generations genuinely differ, often hugely, and that
   * difference is what the choice is made on, so those carry their own (docs/app.md §Coverage).
   */
  const headCoverage = $derived(
    metric.kind === 'single' ? measured(metric.key)
    : metric.kind === 'colocated' ? measured(metric.parts[0]!.key)
    : null);
  /**
   * The metric's own direction, marked where the bound is typed. The sidebar was the one surface
   * carrying none, while the phone header renames `Outsole durability` to `Outsole wear` to say
   * exactly this — two surfaces of one app disagreeing about which end is better
   * (docs/app.md §Table presentation).
   *
   * One key answers for the whole row: both halves of a declared zone pair are the same test run
   * and share a direction, and a superseded pair is one measurement remethoded. The chosen
   * generation rather than the current one, so a view switched to the retired half is still read
   * from the key it is showing.
   */
  const dirKey = $derived(
    metric.kind === 'single' ? metric.key
    : metric.kind === 'colocated' ? metric.parts[0]!.key
    : chosen);
  /** The heading follows any row of the metric that is filtering, whichever half or generation. */
  const active = $derived(
    metric.kind === 'single' ? bounded(metric.key)
    : metric.kind === 'colocated' ? metric.parts.some((p) => bounded(p.key))
    : bounded(chosen));
</script>

<div class="metric">
  <div class="head">
    <!-- The glyph sits INSIDE the heading, glued to the name it qualifies rather than pushed to the
         far end of a `space-between` row where the coverage figure is. `aria-hidden`, like both
         pickers' — the legend above states the meaning once, and restating it per row would make
         every row twice as long to hear (docs/app.md §Table presentation). -->
    <div class="title">
      <h4 class:on={active}>{metric.label}{metric.kind === 'single' && metric.units ? ` (${metric.units})` : ''}<span
        class="dir" aria-hidden="true">{DIRECTION_ARROW[directionOf(dirKey)]}</span></h4>
      <MetricHelp metricKey={helpKey} label={metric.label} />
    </div>
    {#if headCoverage}<span class="cov">{headCoverage}</span>{/if}
  </div>

  {#if metric.kind === 'pair'}
    <div class="gens" role="radiogroup" aria-label={metric.label} data-segmented-control use:roving>
      {#each generations as g (g.key)}
        <button type="button" role="radio" aria-checked={chosen === g.key} aria-label="{metric.label}, {g.generation}"
                data-segment={g.key}
                class:on={chosen === g.key} class:filtering={chosen === g.key && bounded(g.key)}
                onclick={() => onchoose(g.key)}>
          <span class="gen">{g.generation}{g.units ? ` (${g.units})` : ''}</span>
          <span class="cov">{measured(g.key) ?? ''}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .metric { display: flex; flex-direction: column; gap: var(--s1); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); }
  .title { display: flex; align-items: center; gap: var(--s1); min-width: 0; }
  h4 { font-size: var(--t-sm); color: var(--text-dim); margin: 0; font-weight: 600; }
  h4.on { color: var(--text); font-weight: 700; }
  /* The same mono glyph the two pickers draw, at the same size and dimmed the same way — a
     direction mark that read differently on three surfaces would be three marks. Empty for a
     neutral metric, so the margin goes with it rather than leaving a gap after the name. */
  .dir:not(:empty) { margin-left: var(--s1); font-family: var(--font-mono); font-weight: 400;
                     color: var(--text-dim); }
  .cov { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-dim);
         font-variant-numeric: tabular-nums; white-space: nowrap; }
  .gens { display: flex; flex-direction: column; gap: var(--s1); }
  button { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--s2); width: 100%;
           box-sizing: border-box; min-width: 24px; min-height: 24px;
           padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
           background: none; color: var(--text-dim); font-size: var(--t-xs); text-align: left; cursor: pointer; }
  button.on { border-color: var(--accent); color: var(--text); }
  button.on .gen { font-weight: 600; }
  button.filtering .gen { font-weight: 700; }
  @media (hover: none) {
    button { min-height: 32px; }
  }
</style>
