<script lang="ts">
  import { isSparse, type Coverage } from '../lib/coverage';
  import { ageMonths } from '../lib/dataset';
  import type { ResolvedMetric, Side } from '../lib/lineage';

  /** Deep enough that novelty stops being the explanation and rarity starts (docs/app.md §Coverage). */
  const YOUNG_METHOD_MONTHS = 24;
  const SIDE_LABEL: Record<Side, string> = { forefoot: 'Forefoot', heel: 'Heel' };

  let { metric, coverage, oldest, chosen, onchoose, strike }: {
    metric: ResolvedMetric;
    coverage: (key: string) => Coverage;
    oldest: (key: string) => string | null;
    chosen: string;
    onchoose: (key: string) => void;
    /** Which half of a side pair the stories use. It marks; it never hides or disables the other,
     *  which stays filterable on its own (docs/app.md §Columns and sorting). */
    strike: Side;
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
  /** A declared half reads as its side alone; the fieldset below carries heading and side both. */
  const partLabel = (p: { label: string; units: string; side: Side | null }) =>
    (p.side ? SIDE_LABEL[p.side] : p.label)
    + (p.units ? ` (${p.units})` : '')
    + (p.side === strike ? ' · in use' : '');
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
  .metric { display: flex; flex-direction: column; gap: var(--s1); }
  h4 { font-size: var(--t-sm); color: var(--text-dim); margin: 0; font-weight: 600; }
  .gens, .parts { display: flex; flex-direction: column; gap: var(--s1); }
  button, .part { display: grid; grid-template-columns: 1fr 3rem 2.2rem; align-items: center; gap: var(--s2); width: 100%;
           padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
           background: none; color: var(--text-dim); font-size: var(--t-xs); text-align: left; }
  button { cursor: pointer; }
  button.on { border-color: var(--accent); color: var(--text); font-weight: 600; }
  .part.on { color: var(--text); font-weight: 600; }
  .solo { display: grid; grid-template-columns: 1fr 2.2rem; align-items: center; gap: var(--s2); padding: 0 var(--s1); }
  .bar { display: block; height: 6px; border-radius: var(--r-full); background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: var(--t-xs); color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
  .warn { margin: 0; font-size: var(--t-xs); color: var(--text-dim); }
</style>
