<script lang="ts">
  import type { Coverage } from '../lib/coverage';
  import type { ResolvedMetric } from '../lib/lineage';
  import { roving } from '../lib/roving';

  let { metric, coverage, chosen, onchoose, bounded }: {
    metric: ResolvedMetric;
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
  /** The heading follows any row of the metric that is filtering, whichever half or generation. */
  const active = $derived(
    metric.kind === 'single' ? bounded(metric.key)
    : metric.kind === 'colocated' ? metric.parts.some((p) => bounded(p.key))
    : bounded(chosen));
</script>

<div class="metric">
  <div class="head">
    <h4 class:on={active}>{metric.label}{metric.kind === 'single' && metric.units ? ` (${metric.units})` : ''}</h4>
    {#if headCoverage}<span class="cov">{headCoverage}</span>{/if}
  </div>

  {#if metric.kind === 'pair'}
    <div class="gens" role="radiogroup" aria-label={metric.label} use:roving>
      {#each generations as g (g.key)}
        <button type="button" role="radio" aria-checked={chosen === g.key} aria-label="{metric.label}, {g.generation}"
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
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s2); }
  h4 { font-size: var(--t-sm); color: var(--text-dim); margin: 0; font-weight: 600; }
  h4.on { color: var(--text); font-weight: 700; }
  .cov { font-size: var(--t-xs); color: var(--text-dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .gens { display: flex; flex-direction: column; gap: var(--s1); }
  button { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--s2); width: 100%;
           padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
           background: none; color: var(--text-dim); font-size: var(--t-xs); text-align: left; cursor: pointer; }
  button.on { border-color: var(--accent); color: var(--text); }
  button.on .gen { font-weight: 600; }
  button.filtering .gen { font-weight: 700; }
</style>
