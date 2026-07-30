<script lang="ts" module>
  /** SVG `<pattern>` is referenced by id, and ten range rows share one document. */
  let nextHatch = 0;
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { clampPct, snapToValue, trimmedAxis } from '../lib/axis';
  import type { RangeBound } from '../lib/filters';
  import { histogram } from '../lib/stats';

  let { label, units, values, bound, onchange, name, excluded, onremove }: {
    label: string; units: string;
    /** The readings themselves, not a histogram: the axis is trimmed to p2–p98 and the drag snaps
     *  to values that exist, and neither can be recovered from bucket counts (docs/app.md §Filters). */
    values: number[];
    bound: RangeBound;
    onchange: (b: RangeBound) => void;
    /** Accessible name for callers that title the row above the fieldset instead of in its legend. */
    name?: string;
    /** How many shoes would return if this one bound were cleared, everything else kept. Absent on
     *  an unbounded row, where there is nothing to relax (docs/app.md §Filters). */
    excluded?: number;
    /** Present only on a hand-added row. Clearing a value and removing a row are different
     *  actions, so they are different controls (docs/app.md §Filters). */
    onremove?: () => void;
  } = $props();

  const BINS = 24;
  /** Percent of the plot each overflow bin takes, and only on the side that has one. */
  const OVERFLOW_W = 6;
  /** A 44px target is a fifth of a 222px plot each way; past this gap they would overlap and the
   *  wrong grip would answer (docs/app.md §Filters). */
  const HIT_PX = 44;

  const hatchId = `hatch-${nextHatch++}`;
  const bounded = $derived(bound.min !== undefined || bound.max !== undefined);

  const axis = $derived(trimmedAxis(values));
  const plot = $derived(axis ? histogram(values, BINS, { min: axis.lo, max: axis.hi }) : null);
  const stops = $derived(axis
    ? [...new Set(values.filter((v) => v >= axis.lo && v <= axis.hi))].sort((a, b) => a - b)
    : []);
  const extent = $derived(values.length ? { min: Math.min(...values), max: Math.max(...values) } : null);
  // Only the side that actually overflowed gives up room, so a metric with no outliers keeps the
  // whole width for its axis.
  const x0 = $derived(axis && axis.under > 0 ? OVERFLOW_W : 0);
  const x1 = $derived(100 - (axis && axis.over > 0 ? OVERFLOW_W : 0));
  const scale = $derived(Math.max(1, ...(plot?.counts ?? [1]), axis?.under ?? 0, axis?.over ?? 0));

  /** Value → drawn position. Clamped, never the other way round: a typed bound outside the axis
   *  keeps its value and draws at the edge (docs/app.md §Filters). */
  const pos = (v: number): number =>
    axis ? x0 + (clampPct(v, axis.lo, axis.hi) * (x1 - x0)) / 100 : 0;
  const barActive = (i: number): boolean => {
    if (!plot) return false;
    const lo = plot.min + ((plot.max - plot.min) * i) / BINS;
    const hi = plot.min + ((plot.max - plot.min) * (i + 1)) / BINS;
    return (bound.min === undefined || hi >= bound.min) && (bound.max === undefined || lo <= bound.max);
  };

  function update(part: 'min' | 'max', raw: string) {
    const n = raw === '' ? undefined : Number(raw);
    onchange({ ...bound, [part]: n !== undefined && Number.isFinite(n) ? n : undefined });
  }

  let plotEl = $state<HTMLDivElement>();
  let dragging: 'min' | 'max' | null = null;

  function valueAt(clientX: number): number {
    const a = axis!;
    const r = plotEl!.getBoundingClientRect();
    const pct = r.width === 0 ? 0 : ((clientX - r.left) / r.width) * 100;
    const t = Math.min(1, Math.max(0, (pct - x0) / (x1 - x0)));
    return a.lo + t * (a.hi - a.lo);
  }

  function move(e: MouseEvent) {
    if (!dragging || !axis) return;
    const snapped = snapToValue(valueAt(e.clientX), stops);
    if (dragging === 'min') {
      // Dragging clamps against the other grip; only typing may cross the bounds.
      const v = bound.max !== undefined ? Math.min(snapped, bound.max) : snapped;
      onchange({ ...bound, min: v <= axis.lo ? undefined : v });
    } else {
      const v = bound.min !== undefined ? Math.max(snapped, bound.min) : snapped;
      onchange({ ...bound, max: v >= axis.hi ? undefined : v });
    }
  }
  function release() {
    dragging = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', release);
  }
  function grab(e: MouseEvent) {
    if (!axis || !plotEl) return;
    const r = plotEl.getBoundingClientRect();
    const px = (p: number) => (p / 100) * r.width;
    const x = e.clientX - r.left;
    const minX = px(pos(bound.min ?? axis.lo));
    const maxX = px(pos(bound.max ?? axis.hi));
    // Half the gap once the grips are within 88px, so the touch fix cannot become a touch bug.
    const reach = Math.min(HIT_PX, Math.max(8, Math.abs(maxX - minX) / 2));
    const dMin = Math.abs(x - minX);
    const dMax = Math.abs(x - maxX);
    if (dMin > reach && dMax > reach) return;
    e.preventDefault();
    dragging = dMin <= dMax ? 'min' : 'max';
    move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
  }
  onDestroy(release);
</script>

<fieldset class="range" aria-label={name}>
  {#if label}<legend class:on={bounded}>{label}{units ? ` (${units})` : ''}</legend>{/if}
  {#if axis && plot}
    <!-- No `tabindex`: a plot that could take focus would be a 50th tab stop carrying nothing, and
         the grips are revealed from the row so tabbing into either number field shows them
         (docs/app.md §Filters). -->
    <div class="plot" bind:this={plotEl} onpointerdown={grab}>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={hatchId} width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="2" stroke="var(--hist-dim)" stroke-width="0.8" />
          </pattern>
        </defs>
        <!-- The trimmed readings are drawn, not dropped: an axis that silently loses shoes is a
             chart that lies about its fleet. -->
        {#if axis.under > 0}
          <rect class="overflow" x="0" width={OVERFLOW_W * 0.7} y={24 - (axis.under / scale) * 24}
                height={(axis.under / scale) * 24} fill="url(#{hatchId})" />
        {/if}
        {#each plot.counts as c, i (i)}
          {@const w = (x1 - x0) / BINS}
          <rect class="bin" x={x0 + i * w} width={w * 0.85} y={24 - (c / scale) * 24}
                height={(c / scale) * 24} fill={barActive(i) ? 'var(--accent)' : 'var(--hist-dim)'} />
        {/each}
        {#if axis.over > 0}
          <rect class="overflow" x={100 - OVERFLOW_W * 0.7} width={OVERFLOW_W * 0.7}
                y={24 - (axis.over / scale) * 24} height={(axis.over / scale) * 24} fill="url(#{hatchId})" />
        {/if}
      </svg>
      <!-- An edge is state and a grip is affordance, so they have different visibility rules: a set
           bound is always drawn, the grips are revealed by the row. -->
      {#if bound.min !== undefined}<span class="edge" style:left="{pos(bound.min)}%"></span>{/if}
      {#if bound.max !== undefined}<span class="edge" style:left="{pos(bound.max)}%"></span>{/if}
      <span class="handle min" style:left="{pos(bound.min ?? axis.lo)}%" aria-hidden="true"></span>
      <span class="handle max" style:left="{pos(bound.max ?? axis.hi)}%" aria-hidden="true"></span>
    </div>
  {/if}
  <div class="bounds">
    <!-- Named for the metric, not "min" and "max": ten of these rows sit in the sidebar at once and
         a fieldset's label is not read with the field inside it, so twenty controls announced as
         one of two words (docs/app.md §Filters). -->
    <input type="number" aria-label="{name ?? ''} minimum" placeholder={extent ? String(extent.min) : 'min'}
           value={bound.min ?? ''} oninput={(e) => update('min', e.currentTarget.value)} />
    <span>–</span>
    <input type="number" aria-label="{name ?? ''} maximum" placeholder={extent ? String(extent.max) : 'max'}
           value={bound.max ?? ''} oninput={(e) => update('max', e.currentTarget.value)} />
    <!-- An icon, with the row's name on the label: ten rows spelling out "Clear" is most of the
         sidebar's width, and two buttons both called "Clear" would be indistinguishable to anyone
         not looking at the screen. -->
    {#if bounded}
      <button type="button" class="act icon" aria-label="Clear {name}" onclick={() => onchange({})}>✕</button>
    {/if}
    {#if onremove}
      <button type="button" class="act" aria-label="Remove {name}" onclick={onremove}>Remove</button>
    {/if}
    <!-- Beside the control that acts on it, with no ranking and no recommendation: which bound is
         the relaxable one is the runner's call, and a budget is usually the least relaxable thing
         in the set. `0 excluded` still shows, because its absence would read as unbounded. -->
    {#if bounded && excluded !== undefined}
      <span class="excluded">{excluded} excluded</span>
    {/if}
  </div>
</fieldset>

<style>
  .range { border: none; padding: 0; margin: 0 0 var(--s4); }
  legend.on { color: var(--text); font-weight: 700; }
  legend { font-size: var(--t-sm); color: var(--text-dim); padding: 0; margin-bottom: var(--s1); }
  /* `touch-action: none`, or a drag on a phone scrolls the drawer instead of moving the bound. */
  .plot { position: relative; height: 24px; margin-bottom: var(--s1); touch-action: none; cursor: ew-resize; }
  svg { width: 100%; height: 24px; display: block; }
  .edge { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: var(--accent); }
  .handle { position: absolute; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px;
            border-radius: var(--r-full); background: var(--accent); border: 2px solid var(--surface);
            box-sizing: content-box; opacity: 0; transition: opacity 120ms; }
  /* Hung off the row, not the plot: tabbing into either number field reveals the grips, which is
     what connects the two input modes (docs/app.md §Filters). */
  .range:hover .handle, .range:focus-within .handle { opacity: 1; }
  /* Hover never fires on touch, and the sidebar is a drawer at those widths where resting
     tidiness matters less than knowing the control exists. */
  @media (hover: none) { .handle { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .handle { transition: none; } }
  .bounds { display: flex; align-items: center; gap: var(--s1); flex-wrap: wrap; }
  input { width: 5rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--r-sm); padding: var(--s1) var(--s2); }
  .act { padding: var(--s1) var(--s2); font-size: var(--t-xs); cursor: pointer; background: none; color: var(--text-dim); border: 1px solid var(--border); border-radius: var(--r-sm); }
  .act:hover { color: var(--text); border-color: var(--accent); }
  .icon { line-height: 1; padding: var(--s1); }
  .excluded { font-size: var(--t-xs); color: var(--text-dim); font-variant-numeric: tabular-nums; }
</style>
