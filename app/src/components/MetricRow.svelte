<script lang="ts">
  import type { Coverage } from '../lib/coverage';
  import type { ResolvedMetric, Side } from '../lib/lineage';
  import { roving } from '../lib/roving';

  const SIDE_LABEL: Record<Side, string> = { forefoot: 'Forefoot', heel: 'Heel' };

  let { metric, coverage, chosen, onchoose, strike }: {
    metric: ResolvedMetric;
    coverage: (key: string) => Coverage;
    chosen: string;
    onchoose: (key: string) => void;
    /** Which half of a side pair the stories use. It marks; it never hides or disables the other,
     *  which stays filterable on its own (docs/app.md §Columns and sorting). */
    strike: Side;
  } = $props();

  const generations = $derived(metric.kind === 'pair' ? [metric.current, metric.retired] : []);
  /**
   * Counts, not a percentage, and only on the single-metric shape: "83%" of an unstated pool is
   * the complaint, and both numbers on screen state the denominator instead of assuming it. A pair
   * renders a figure per generation and a colocated metric one per part — two or more numbers with
   * nowhere to go on one heading line — so those keep their per-row percentages
   * (docs/app.md §Coverage). Silent at complete coverage, which is most rows on a default view.
   */
  const soloCoverage = $derived.by(() => {
    if (metric.kind !== 'single') return null;
    const c = coverage(metric.key);
    return c.total > 0 && c.n < c.total ? `${c.n} / ${c.total} measured` : null;
  });
  const pct = (key: string) => `${Math.round(coverage(key).fraction * 100)}%`;
  const width = (key: string) => `${Math.round(coverage(key).fraction * 100)}%`;
  /** A declared half reads as its side alone; the fieldset below carries heading and side both. */
  const partLabel = (p: { label: string; units: string; side: Side | null }) =>
    (p.side ? SIDE_LABEL[p.side] : p.label)
    + (p.units ? ` (${p.units})` : '')
    + (p.side === strike ? ' · in use' : '');
</script>

<div class="metric">
  <div class="head">
    <h4>{metric.label}{metric.kind === 'single' && metric.units ? ` (${metric.units})` : ''}</h4>
    {#if soloCoverage}<span class="cov">{soloCoverage}</span>{/if}
  </div>

  {#if metric.kind === 'pair'}
    <div class="gens" role="radiogroup" aria-label={metric.label} use:roving>
      {#each generations as g (g.key)}
        <button type="button" role="radio" aria-checked={chosen === g.key} aria-label="{metric.label}, {g.generation}"
                class:on={chosen === g.key} onclick={() => onchoose(g.key)}>
          <span class="gen">{g.generation}{g.units ? ` (${g.units})` : ''}</span>
          <span class="bar"><span class="fill" style:width={width(g.key)}></span></span>
          <span class="pct">{pct(g.key)}</span>
        </button>
      {/each}
    </div>
  {:else if metric.kind === 'colocated'}
    <!-- Coverage rows, not controls. Every part renders always, so a button here could only ever
         write an empty range key — invisible in the sidebar, and enough to collapse the entry
         band (docs/app.md §Filters). -->
    <div class="parts">
      {#each metric.parts as p (p.key)}
        <div class="part" class:on={p.side === strike}>
          <span class="gen">{partLabel(p)}</span>
          <span class="bar"><span class="fill" style:width={width(p.key)}></span></span>
          <span class="pct">{pct(p.key)}</span>
        </div>
      {/each}
    </div>
  {:else}
    <!-- The bar becomes a rule under the heading: the figure moved onto the heading line, so the
         bar has no row of its own left to sit in. -->
    <span class="rule"><span class="fill" style:width={width(metric.key)}></span></span>
  {/if}
</div>

<style>
  .metric { display: flex; flex-direction: column; gap: var(--s1); }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s2); }
  h4 { font-size: var(--t-sm); color: var(--text-dim); margin: 0; font-weight: 600; }
  .cov { font-size: var(--t-xs); color: var(--text-dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .gens, .parts { display: flex; flex-direction: column; gap: var(--s1); }
  button, .part { display: grid; grid-template-columns: 1fr 3rem 2.2rem; align-items: center; gap: var(--s2); width: 100%;
           padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
           background: none; color: var(--text-dim); font-size: var(--t-xs); text-align: left; }
  button { cursor: pointer; }
  button.on { border-color: var(--accent); color: var(--text); font-weight: 600; }
  .part.on { color: var(--text); font-weight: 600; }
  .rule { display: block; height: 2px; background: var(--hist-dim); overflow: hidden; }
  .bar { display: block; height: 6px; border-radius: var(--r-full); background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: var(--t-xs); color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
</style>
