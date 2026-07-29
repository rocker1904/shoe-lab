<script lang="ts">
  import type { Histogram } from '../lib/stats';
  import type { RangeBound } from '../lib/filters';

  let { label, units, hist, bound, onchange, name, onremove }: {
    label: string; units: string; hist: Histogram | null; bound: RangeBound;
    onchange: (b: RangeBound) => void;
    /** Accessible name for callers that title the row above the fieldset instead of in its legend. */
    name?: string;
    /** Present only on a hand-added row. Clearing a value and removing a row are different
     *  actions, so they are different controls (docs/app.md §Filters). */
    onremove?: () => void;
  } = $props();

  const bounded = $derived(bound.min !== undefined || bound.max !== undefined);

  function update(part: 'min' | 'max', raw: string) {
    const n = raw === '' ? undefined : Number(raw);
    onchange({ ...bound, [part]: n !== undefined && Number.isFinite(n) ? n : undefined });
  }
  const barActive = (i: number): boolean => {
    if (!hist) return false;
    const lo = hist.min + ((hist.max - hist.min) * i) / hist.counts.length;
    const hi = hist.min + ((hist.max - hist.min) * (i + 1)) / hist.counts.length;
    return (bound.min === undefined || hi >= bound.min) && (bound.max === undefined || lo <= bound.max);
  };
  const maxCount = $derived(hist ? Math.max(...hist.counts) : 1);
</script>

<fieldset class="range" aria-label={name}>
  {#if label}<legend>{label}{units ? ` (${units})` : ''}</legend>{/if}
  {#if hist}
    <svg viewBox="0 0 {hist.counts.length * 4} 24" preserveAspectRatio="none" aria-hidden="true">
      {#each hist.counts as c, i (i)}
        <rect x={i * 4} y={24 - (c / maxCount) * 24} width="3.4" height={(c / maxCount) * 24}
              fill={barActive(i) ? 'var(--accent)' : 'var(--hist-dim)'} />
      {/each}
    </svg>
  {/if}
  <div class="bounds">
    <input type="number" aria-label="min" placeholder={hist ? String(hist.min) : 'min'}
           value={bound.min ?? ''} oninput={(e) => update('min', e.currentTarget.value)} />
    <span>–</span>
    <input type="number" aria-label="max" placeholder={hist ? String(hist.max) : 'max'}
           value={bound.max ?? ''} oninput={(e) => update('max', e.currentTarget.value)} />
    <!-- Named after the row: several rows share this control, and two buttons called "Clear"
         would be indistinguishable to anyone not looking at the screen. -->
    {#if bounded}
      <button type="button" class="act" aria-label="Clear {name}" onclick={() => onchange({})}>Clear</button>
    {/if}
    {#if onremove}
      <button type="button" class="act" aria-label="Remove {name}" onclick={onremove}>Remove</button>
    {/if}
  </div>
</fieldset>

<style>
  .range { border: none; padding: 0; margin: 0 0 var(--s4); }
  legend { font-size: var(--t-sm); color: var(--text-dim); padding: 0; margin-bottom: var(--s1); }
  svg { width: 100%; height: 24px; display: block; margin-bottom: var(--s1); }
  .bounds { display: flex; align-items: center; gap: var(--s1); flex-wrap: wrap; }
  input { width: 5rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--r-sm); padding: var(--s1) var(--s2); }
  .act { padding: var(--s1) var(--s2); font-size: var(--t-xs); cursor: pointer; background: none; color: var(--text-dim); border: 1px solid var(--border); border-radius: var(--r-sm); }
  .act:hover { color: var(--text); border-color: var(--accent); }
</style>
