<script lang="ts" module>
  export interface MetricGuideEntry {
    key: string;
    label: string;
  }

  export interface MetricGuideSection {
    group: string | null;
    entries: MetricGuideEntry[];
  }

  let nextId = 0;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    metricHelpOf,
    metricInterpretation,
    type MetricHelpFact,
  } from '../lib/metric-help';

  let { sections, onback }: {
    sections: MetricGuideSection[];
    onback: () => void;
  } = $props();

  interface GuideEntry extends MetricGuideEntry {
    fact: MetricHelpFact;
    panelId: string;
  }

  const owner = ++nextId;
  let query = $state('');
  let expandedKey = $state<string | null>(null);
  let heading = $state<HTMLHeadingElement | null>(null);
  const availableSections = $derived.by(() => {
    const available: { group: string | null; entries: GuideEntry[] }[] = [];
    for (const [sectionIndex, section] of sections.entries()) {
      const entries: GuideEntry[] = [];
      for (const [entryIndex, entry] of section.entries.entries()) {
        const fact = metricHelpOf(entry.key);
        if (fact) {
          entries.push({
            ...entry,
            fact,
            panelId: `metric-guide-${owner}-${sectionIndex}-${entryIndex}`,
          });
        }
      }
      if (entries.length > 0) available.push({ group: section.group, entries });
    }
    return available;
  });
  const allEntries = $derived(availableSections.flatMap((section) => section.entries));
  const needle = $derived(query.trim().toLowerCase());
  const matches = $derived(
    needle === ''
      ? allEntries
      : allEntries.filter((entry) => entry.label.toLowerCase().includes(needle)),
  );

  $effect(() => {
    if (expandedKey !== null && !matches.some((entry) => entry.key === expandedKey)) {
      expandedKey = null;
    }
  });

  onMount(() => heading?.focus());

  function toggle(key: string) {
    expandedKey = expandedKey === key ? null : key;
  }
</script>

{#snippet row(entry: GuideEntry)}
  {@const expanded = expandedKey === entry.key}
  <div class="entry">
    <button class="disclosure" type="button" aria-expanded={expanded}
            aria-controls={expanded ? entry.panelId : undefined}
            onclick={() => toggle(entry.key)}>
      <span>{entry.label}</span>
      <svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none"
           aria-hidden="true">
        <path d="M3 2l3 3-3 3" stroke="currentColor" stroke-width="1.4"
              stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    {#if expanded}
      <div class="explanation" id={entry.panelId}>
        <p>{entry.fact.text}</p>
        <p class="interpretation">{metricInterpretation(entry.key)}</p>
        {#if entry.fact.source}
          <a href={entry.fact.source.href} target="_blank" rel="noopener" tabindex="0">
            {entry.fact.source.label} ↗
          </a>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="guide">
  <div class="head">
    <button class="back" type="button" onclick={onback}>Back</button>
    <h3 bind:this={heading} tabindex="-1">Metric guide</h3>
  </div>
  <input class="search" type="search" aria-label="Search metrics"
         placeholder="Search metrics…" bind:value={query} />
  <div class="results scrollport">
    {#if needle !== ''}
      {#each matches as entry (entry.key)}
        {@render row(entry)}
      {/each}
      {#if matches.length === 0}
        <p class="none">No metrics match “{query}”.</p>
      {/if}
    {:else}
      {#each availableSections as section, index (`${section.group ?? ''}-${index}`)}
        {#if section.group !== null}<h4>{section.group}</h4>{/if}
        {#each section.entries as entry (entry.key)}
          {@render row(entry)}
        {/each}
      {/each}
    {/if}
  </div>
</div>

<style>
  .guide { min-height: 0; display: flex; flex: 1; flex-direction: column; gap: var(--s2); }
  .head { display: flex; align-items: center; gap: var(--s2); }
  h3 { margin: 0; font-size: var(--t-md); }
  h4 { margin: var(--s2) 0 var(--s1); color: var(--text-dim); font-size: var(--t-xs);
       text-transform: uppercase; }
  .back { flex: none; padding: var(--s1) var(--s2); border: 1px solid var(--border);
          border-radius: var(--r-sm); background: var(--surface); color: var(--text);
          font-size: var(--t-sm); cursor: pointer; }
  .back:hover { border-color: var(--accent); background: var(--accent-dim); }
  .search { box-sizing: border-box; width: 100%; padding: var(--s2); border: 1px solid var(--border);
            border-radius: var(--r-sm); background: var(--bg); color: var(--text);
            font-size: var(--t-sm); }
  .results { min-height: 0; overflow-y: auto; display: flex; flex: 1; flex-direction: column;
             margin-inline: calc(-1 * var(--ring-room)); padding-inline-end: var(--s3);
             margin-inline-end: calc(-1 * var(--s3)); }
  .entry { border-bottom: 1px solid var(--border-soft); }
  .disclosure { width: 100%; padding: var(--s2); border: 0; background: transparent;
                color: var(--text); display: flex; align-items: center; justify-content: space-between;
                gap: var(--s2); font-size: var(--t-sm); text-align: left; cursor: pointer; }
  .disclosure:hover { background: var(--accent-dim); }
  .chevron { flex: none; color: var(--text-dim); transition: transform 120ms ease; }
  .disclosure[aria-expanded="true"] .chevron { transform: rotate(90deg); }
  .explanation { padding: 0 var(--s2) var(--s3); font-size: var(--t-sm); line-height: 1.4; }
  .explanation p { margin: 0 0 var(--s2); }
  .interpretation { color: var(--text-dim); }
  .explanation a { color: var(--accent); }
  .none { margin: var(--s3) var(--s2); color: var(--text-dim); font-size: var(--t-sm); }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
  @media (hover: none) { .search { font-size: 16px; } }
</style>
