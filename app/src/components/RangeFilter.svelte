<script lang="ts">
  import type { Histogram } from '../lib/stats';
  import type { RangeBound } from '../lib/filters';

  let { label, units, hist, bound, onchange }: {
    label: string; units: string; hist: Histogram | null; bound: RangeBound;
    onchange: (b: RangeBound) => void;
  } = $props();

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

<fieldset class="range">
  <legend>{label}{units ? ` (${units})` : ''}</legend>
  {#if hist}
    <svg viewBox="0 0 {hist.counts.length * 4} 24" preserveAspectRatio="none" aria-hidden="true">
      {#each hist.counts as c, i}
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
  </div>
</fieldset>

<style>
  .range { border: none; padding: 0; margin: 0 0 1rem; }
  legend { font-size: 0.8rem; color: var(--text-dim); padding: 0; margin-bottom: 0.25rem; }
  svg { width: 100%; height: 24px; display: block; margin-bottom: 0.25rem; }
  .bounds { display: flex; align-items: center; gap: 0.35rem; }
  input { width: 5rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 0.2rem 0.4rem; }
</style>
