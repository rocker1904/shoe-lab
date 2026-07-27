<script lang="ts">
  import { isSparse, type Coverage } from '../lib/coverage';
  import { ageMonths } from '../lib/dataset';
  import type { ResolvedMetric } from '../lib/lineage';

  /** Deep enough that novelty stops being the explanation and rarity starts (docs/app.md §Coverage). */
  const YOUNG_METHOD_MONTHS = 24;

  let { metric, coverage, oldest, chosen, onchoose }: {
    metric: ResolvedMetric;
    coverage: (key: string) => Coverage;
    oldest: (key: string) => string | null;
    chosen: string;
    onchoose: (key: string) => void;
  } = $props();

  const generations = $derived(metric.kind === 'pair' ? [metric.current, metric.retired] : []);
  /** The key the warning speaks about: a pair warns about the generation in use, never the other one. */
  const active = $derived(metric.kind === 'pair' ? chosen : metric.kind === 'single' ? metric.key : null);
  const warning = $derived.by(() => {
    if (active === null) return null;
    const c = coverage(active);
    if (!isSparse(c)) return null;
    const months = ageMonths(oldest(active), new Date());
    const pct = `${Math.round(c.fraction * 100)}%`;
    return months !== null && months < YOUNG_METHOD_MONTHS
      ? `Only ${pct} of these shoes have this reading — the method is new.`
      : `Only ${pct} of these shoes have this reading — it is rarely run.`;
  });
  const pct = (key: string) => `${Math.round(coverage(key).fraction * 100)}%`;
  const width = (key: string) => `${Math.round(coverage(key).fraction * 100)}%`;
</script>

<div class="metric">
  <h4>{metric.label}{metric.kind === 'single' && metric.units ? ` (${metric.units})` : ''}</h4>

  {#if metric.kind === 'pair'}
    <div class="gens" role="radiogroup" aria-label={metric.label}>
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
    <div class="parts">
      {#each metric.parts as p (p.key)}
        <button type="button" aria-label="{metric.label}, {p.label}" onclick={() => onchoose(p.key)}>
          <span class="gen">{p.label}{p.units ? ` (${p.units})` : ''}</span>
          <span class="bar"><span class="fill" style:width={width(p.key)}></span></span>
          <span class="pct">{pct(p.key)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="solo">
      <span class="bar"><span class="fill" style:width={width(metric.key)}></span></span>
      <span class="pct">{pct(metric.key)}</span>
    </div>
  {/if}

  {#if warning}
    <!-- Text, never colour alone: the warning is the whole point of the row when it fires. -->
    <p class="warn" role="status">{warning}</p>
  {/if}
</div>

<style>
  .metric { display: flex; flex-direction: column; gap: 0.25rem; }
  h4 { font-size: 0.8rem; color: var(--text-dim); margin: 0; font-weight: 600; }
  .gens, .parts { display: flex; flex-direction: column; gap: 0.15rem; }
  button { display: grid; grid-template-columns: 1fr 3rem 2.2rem; align-items: center; gap: 0.4rem; width: 100%;
           padding: 0.15rem 0.3rem; border: 1px solid transparent; border-radius: 4px;
           background: none; color: var(--text-dim); cursor: pointer; font-size: 0.78rem; text-align: left; }
  button.on { border-color: var(--accent); color: var(--text); font-weight: 600; }
  .solo { display: grid; grid-template-columns: 1fr 2.2rem; align-items: center; gap: 0.4rem; padding: 0 0.3rem; }
  .bar { display: block; height: 6px; border-radius: 3px; background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: 0.72rem; color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
  .warn { margin: 0; font-size: 0.75rem; color: var(--text-dim); }
</style>
