<script lang="ts">
  import { onMount } from 'svelte';

  export interface AddFilterOption { key: string; label: string; groupId: string | null; coverage: number }

  let { options, groups, onchoose, onclose }: {
    options: AddFilterOption[]; groups: Record<string, string>;
    onchoose: (key: string) => void; onclose: () => void;
  } = $props();

  let query = $state('');
  let panel: HTMLElement;
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
    if (e.key === 'Escape') {
      // Under 800px the sidebar is itself a drawer, so one Escape must not dismiss both.
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    // `aria-modal` tells a screen reader the rest of the page is inert; without a trap, Tab walks
    // straight out of it and the promise is a lie. Nothing here is in the top layer, so the
    // browser will not do this for us.
    const focusable = [...panel.querySelectorAll<HTMLElement>('input, button')].filter((el) => !el.hasAttribute('disabled'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<div class="dialog" role="dialog" aria-modal="true" aria-label="Add filter" onkeydown={onkeydown} bind:this={panel}>
  <input class="q" type="search" aria-label="Filter metrics" placeholder="Search metrics…"
         bind:value={query} bind:this={search} />
  <div class="list">
    {#each grouped as [group, offers] (group)}
      <h4>{group}</h4>
      {#each offers as o (o.key)}
        <button type="button" onclick={() => onchoose(o.key)}>
          <span class="name">{o.label}</span>
          <!-- A bar, which is what the `select` this replaced could never hold (docs/app.md §Filters). -->
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
    display: flex; flex-direction: column; gap: var(--s2); width: min(28rem, 92vw); max-height: 80vh;
    padding: var(--s4); background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-dialog);
  }
  .q { padding: var(--s2); border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--text); }
  .list { overflow-y: auto; display: flex; flex-direction: column; gap: var(--s1); }
  h4 { margin: var(--s2) 0 var(--s1); font-size: var(--t-xs); color: var(--text-dim); text-transform: uppercase; }
  .list button { display: grid; grid-template-columns: 1fr 4rem 2.4rem; align-items: center; gap: var(--s2);
                 padding: var(--s1); border: 1px solid transparent; border-radius: var(--r-sm);
                 background: none; color: var(--text); cursor: pointer; font: inherit; font-size: var(--t-sm); text-align: left; }
  .list button:hover { border-color: var(--accent); background: var(--accent-dim); }
  .bar { display: block; height: 6px; border-radius: var(--r-full); background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: var(--t-xs); color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
  .close { align-self: flex-end; padding: var(--s1) var(--s3); cursor: pointer; }
</style>
