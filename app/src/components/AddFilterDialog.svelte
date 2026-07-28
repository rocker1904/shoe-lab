<script lang="ts">
  import { onMount } from 'svelte';

  export interface AddFilterOption { key: string; label: string; groupId: string | null; coverage: number }

  let { options, groups, onchoose, onclose }: {
    options: AddFilterOption[]; groups: Record<string, string>;
    onchoose: (key: string) => void; onclose: () => void;
  } = $props();

  let query = $state('');
  let search: HTMLInputElement;

  const grouped = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const m = new Map<string, AddFilterOption[]>();
    for (const o of options) {
      if (q && !o.label.toLowerCase().includes(q)) continue;
      const g = (o.groupId && groups[o.groupId]) || 'Other';
      m.set(g, [...(m.get(g) ?? []), o]);
    }
    return [...m.entries()];
  });

  // Built from a positioned element rather than `<dialog>`: jsdom implements neither `showModal`
  // nor the top layer, and the focus handling below is the part that has to be right anyway.
  onMount(() => {
    const opener = document.activeElement as HTMLElement | null;
    search.focus();
    return () => opener?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Under 800px the sidebar is itself a drawer, so one Escape must not dismiss both.
    e.stopPropagation();
    onclose();
  }
</script>

<div class="dialog" role="dialog" aria-modal="true" aria-label="Add filter" onkeydown={onkeydown}>
  <input class="q" type="search" aria-label="Filter metrics" placeholder="Search metrics…"
         bind:value={query} bind:this={search} />
  <div class="list">
    {#each grouped as [group, offers] (group)}
      <h4>{group}</h4>
      {#each offers as o (o.key)}
        <button type="button" onclick={() => onchoose(o.key)}>
          <span class="name">{o.label}</span>
          <!-- A bar, which is what the `select` this replaced could never hold (docs/app.md §Coverage). -->
          <span class="bar"><span class="fill" style:width="{o.coverage}%"></span></span>
          <span class="pct">{o.coverage}%</span>
        </button>
      {/each}
    {/each}
  </div>
  <button type="button" class="close" onclick={onclose}>Close</button>
</div>

<style>
  .dialog {
    position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 20;
    display: flex; flex-direction: column; gap: 0.5rem; width: min(28rem, 92vw); max-height: 80vh;
    padding: 1rem; background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 32px rgb(0 0 0 / 0.3);
  }
  .q { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
  .list { overflow-y: auto; display: flex; flex-direction: column; gap: 0.15rem; }
  h4 { margin: 0.5rem 0 0.15rem; font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; }
  .list button { display: grid; grid-template-columns: 1fr 4rem 2.4rem; align-items: center; gap: 0.5rem;
                 padding: 0.25rem 0.35rem; border: 1px solid transparent; border-radius: 4px;
                 background: none; color: var(--text); cursor: pointer; font: inherit; font-size: 0.85rem; text-align: left; }
  .list button:hover { border-color: var(--accent); background: var(--accent-dim); }
  .bar { display: block; height: 6px; border-radius: 3px; background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: 0.72rem; color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
  .close { align-self: flex-end; padding: 0.3rem 0.8rem; cursor: pointer; }
</style>
