<script lang="ts">
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { percentileMap } from '../lib/stats';
  import type { ViewState } from '../lib/urlstate';
  import DetailPanel from './DetailPanel.svelte';

  let { shoes, data, view, onchange }: {
    shoes: Shoe[]; data: ShoesFile; view: ViewState; onchange: (v: ViewState) => void;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  let expanded = $state<string | null>(null);

  const headerFor = (key: string): string => {
    if (key === 'releasedAt') return 'Released';
    if (key === 'score') return 'Score';
    if (key === 'msrpGbp') return 'Price £';
    if (key === 'plate') return 'Plate';
    return idx.bySlug.get(key)?.name ?? key;
  };
  const percentiles = $derived(new Map(view.columns.map((c) => [c, percentileMap(shoes, c, idx)])));

  function setSort(key: string) {
    const next = structuredClone($state.snapshot(view)) as ViewState;
    next.sort = view.sort.key === key && view.sort.dir === 'desc' ? { key, dir: 'asc' } : { key, dir: 'desc' };
    onchange(next);
  }
  function cellText(s: Shoe, col: string): string {
    // A false `preciseReleaseDate` means only the year is real (docs/scraping.md §Release-year supplement).
    if (col === 'releasedAt') return s.releasedAt ? (s.preciseReleaseDate ? s.releasedAt : s.releasedAt.slice(0, 4)) : '—';
    if (col === 'plate') return s.plate === 'none' ? '—' : s.plate === 'carbon' ? 'Carbon' : 'Non-carbon plate';
    // msrpGbp goes through numericValue so the cell shows the same resolved price the
    // filter and the sort use (docs/app.md §Resolved price).
    const v = col === 'score' ? s.score : numericValue(s, col, idx);
    return v === null || v === undefined ? '—' : displayNumber(v);
  }
  function toggle(slug: string) {
    expanded = expanded === slug ? null : slug;
  }
  function onRowKey(e: KeyboardEvent, slug: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle(slug);
  }
</script>

<table>
  <thead>
    <tr>
      <th class="name">Shoe</th>
      {#each view.columns as col (col)}
        <th aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
          <button type="button" onclick={() => setSort(col)}>
            {headerFor(col)}{#if view.sort.key === col}{view.sort.dir === 'asc' ? ' ▲' : ' ▼'}{/if}
          </button>
        </th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each shoes as s (s.slug)}
      <tr class="shoe" class:discontinued={s.discontinued} tabindex="0" aria-expanded={expanded === s.slug}
          onclick={() => toggle(s.slug)} onkeydown={(e) => onRowKey(e, s.slug)}>
        <td class="name">
          {#if s.imageUrl}<img src={s.imageUrl} alt="" loading="lazy" />{/if}
          <div><strong>{s.name}</strong>{#if s.discontinued}<span class="disc-tag">discontinued</span>{/if}<br /><small>{s.brand ?? ''}</small></div>
        </td>
        {#each view.columns as col (col)}
          {@const p = percentiles.get(col)?.get(s.slug)}
          <td class="num" style:--p={p ?? 0} class:tinted={p !== undefined}>{cellText(s, col)}</td>
        {/each}
      </tr>
      {#if expanded === s.slug}
        <tr class="expand"><td colspan={1 + view.columns.length}><DetailPanel shoe={s} /></td></tr>
      {/if}
    {/each}
  </tbody>
</table>

<style>
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th { text-align: left; border-bottom: 2px solid var(--border); padding: 0.4rem 0.5rem; white-space: nowrap; }
  th button { background: none; border: none; color: var(--text); font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
  td { border-bottom: 1px solid var(--border); padding: 0.4rem 0.5rem; }
  tr.shoe { cursor: pointer; }
  /* A background *image* layers over the cell's background colour, so hovering a tinted cell
     dims it rather than replacing the percentile tint with a flat wash. */
  tr.shoe:hover td { background-image: linear-gradient(var(--hover-wash), var(--hover-wash)); }
  tr.shoe:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  td.name { display: flex; gap: 0.6rem; align-items: center; min-width: 14rem; }
  td.name img { width: 40px; height: 27px; object-fit: cover; border-radius: 4px; }
  /* Squared so only the leaders read as tinted (docs/app.md §Theming). */
  td.num.tinted { background-color: color-mix(in oklab, var(--accent) calc(var(--p) * var(--p) * var(--tint-strength)), transparent); }
  .disc-tag { margin-left: 0.4rem; font-size: 0.7rem; color: var(--bad); border: 1px solid var(--bad); border-radius: 999px; padding: 0 0.35rem; }
  small { color: var(--text-dim); }
</style>
