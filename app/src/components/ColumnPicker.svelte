<script lang="ts">
  import type { LabTest, Shoe } from '../../../shared/types.js';
  import { categoricalEntries } from '../lib/categorical';
  import { coverageOf } from '../lib/coverage';
  import type { TestIndex } from '../lib/dataset';
  import { directionOf, DIRECTION_ARROW } from '../lib/direction';
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

  interface Offer { key: string; label: string }
  // A pair offers whichever generation is chosen and never both; a colocated metric offers both
  // halves, which is what keeps them independently sortable (docs/app.md §Columns and sorting).
  const offersOf = (e: ResolvedMetric): Offer[] => {
    if (e.kind === 'single') return [{ key: e.key, label: e.label }];
    if (e.kind === 'pair') {
      const g = generations[e.current.key] === e.retired.key ? e.retired : e.current;
      return [{ key: g.key, label: `${e.label} (${g.generation})` }];
    }
    return e.parts.map((p) => ({ key: p.key, label: p.label }));
  };
  const grouped = $derived.by(() => {
    const m = new Map<string, Offer[]>();
    // Categorical tests are choosable columns but never rangeable, so they are offered here and
    // deliberately not through `metricEntries`, which the filter dialog also reads
    // (docs/app.md §Categorical columns).
    for (const e of [...metricEntries(tests), ...categoricalEntries(tests).map((c) => ({ kind: 'single' as const, key: c.key, label: c.label, units: '', groupId: c.groupId }))]) {
      const g = (e.groupId && groups[e.groupId]) || 'Other';
      m.set(g, [...(m.get(g) ?? []), ...offersOf(e)]);
    }
    return [...m.entries()];
  });
  const pct = (key: string) => Math.round(coverageOf(population, key, idx).fraction * 100);
  function toggle(key: string) {
    onchange(columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key]);
  }
</script>

<details class="picker">
  <summary>Columns ({columns.length})</summary>
  <div class="panel">
    <!-- One legend, then a bare glyph per row: the arrow left the table header, and with no units
         beside it a lone ↑ says nothing (docs/app.md §Table presentation). -->
    <p class="legend">
      <span><b>↑</b> higher is better</span>
      <span><b>↓</b> lower is better</span>
      <span>no mark — neutral</span>
    </p>
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
          <span class="bar"><span class="fill" style:width="{pct(o.key)}%"></span></span>
          <span class="pct">{pct(o.key)}%</span>
        </label>
      {/each}
    {/each}
  </div>
</details>

<style>
  .picker { position: relative; }
  summary { cursor: pointer; padding: var(--s1) var(--s3); border: 1px solid var(--border); border-radius: var(--r-sm); white-space: nowrap; }
  .panel { position: absolute; right: 0; z-index: 10; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s3) var(--s4); max-height: 22rem; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s1); min-width: 20rem; box-shadow: var(--shadow-dialog); }
  h4 { margin: var(--s2) 0 var(--s1); font-size: var(--t-xs); color: var(--text-dim); text-transform: uppercase; }
  label { font-size: var(--t-sm); display: grid; grid-template-columns: auto 1fr auto 3rem 2.2rem; align-items: center; gap: var(--s2); }
  .legend { display: flex; gap: var(--s3); margin: 0 0 var(--s2); font-size: var(--t-xs); color: var(--text-dim); }
  .legend b { font-family: var(--font-mono); font-weight: 400; color: var(--text); }
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
