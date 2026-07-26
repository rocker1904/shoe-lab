<script lang="ts">
  import type { Theme } from '../lib/theme';

  let { total, visible, builtAt, theme, onexport, ontheme }: {
    total: number; visible: number; builtAt: string; theme: Theme;
    onexport: () => void; ontheme: () => void;
  } = $props();
  const updated = $derived(builtAt.slice(0, 10));
  const ICON: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' };
</script>

<header>
  <h1>Shoe Lab</h1>
  <span class="count">{visible} of {total} shoes</span>
  <span class="spacer"></span>
  <span class="meta">updated {updated} · data from
    <a href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">RunRepeat</a></span>
  <button type="button" onclick={onexport}>Export CSV</button>
  <button type="button" onclick={ontheme} aria-label="Toggle theme (currently {theme})"
          title="Theme: {theme}">{ICON[theme]}</button>
</header>

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 5; }
  h1 { font-size: 1.1rem; margin: 0; }
  .count { color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .spacer { flex: 1; }
  .meta { font-size: 0.8rem; color: var(--text-dim); }
  .meta a { color: var(--accent); }
  button { padding: 0.3rem 0.8rem; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; }
  button:hover { background: var(--accent-dim); }
  @media (max-width: 800px) {
    header { flex-wrap: wrap; gap: 0.5rem 0.75rem; }
    .meta { order: 1; flex-basis: 100%; }
  }
</style>
