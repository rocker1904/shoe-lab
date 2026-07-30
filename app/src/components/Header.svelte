<script lang="ts">
  import type { Theme } from '../lib/theme';

  let { total, visible, builtAt, theme, onexport, ontheme }: {
    total: number; visible: number; builtAt: string; theme: Theme;
    onexport: () => void; ontheme: () => void;
  } = $props();
  const updated = $derived(builtAt.slice(0, 10));
  const ICON: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' };

  let copied = $state(false);
  /**
   * The URL *is* the view (docs/app.md §View and URL ownership), so copying the address bar is the
   * whole share feature — a stated project goal that had no affordance at all. The confirmation is
   * its own live region rather than a relabelled button: swapping the label would change the
   * control's accessible name to something you cannot then press.
   */
  async function copyLink() {
    // Absent outside a secure context, and it can reject on a denied permission. Neither is worth
    // an error state — but neither may claim success either, so both leave the region unsaid.
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<header>
  <h1>Shoe Lab</h1>
  <span class="count">{visible} of {total} shoes</span>
  <span class="spacer"></span>
  <span class="meta">updated {updated} · data from
    <a href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">RunRepeat</a></span>
  <button type="button" onclick={copyLink}>Copy link</button>
  <!-- Rendered whether or not there is anything to say: a live region created together with its
       text is not reliably announced, so only the text may arrive late. -->
  <span class="copied" class:said={copied} role="status">{copied ? 'Copied' : ''}</span>
  <button type="button" onclick={onexport}>Export CSV</button>
  <button type="button" onclick={ontheme} aria-label="Toggle theme (currently {theme})"
          title="Theme: {theme}">{ICON[theme]}</button>
</header>

<style>
  /* Not sticky itself: `Page.svelte` pins header and toolbar together as one chrome box, and the
     table's header row offsets against that box's measured height
     (docs/app.md §Columns and sorting). */
  header { --gap-x: var(--s4); display: flex; align-items: center; gap: var(--gap-x); padding: var(--s2) var(--s5); border-bottom: 1px solid var(--border); background: var(--chrome); }
  h1 { font-size: var(--t-xl); margin: 0; }
  .count { color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .spacer { flex: 1; }
  .meta { font-size: var(--t-sm); color: var(--text-dim); }
  .copied { font-size: var(--t-sm); color: var(--good); }
  /* A silent region is still a flex item, so it would carry a gap on each zone and space the header
     differently depending on whether a link had ever been copied. */
  .copied:not(.said) { margin-inline-start: calc(-1 * var(--gap-x)); }
  .meta a { color: var(--accent); }
  button { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: var(--r-sm); }
  button:hover { background: var(--accent-dim); }
  @media (max-width: 800px) {
    header { --gap-x: var(--s3); flex-wrap: wrap; gap: var(--s2) var(--gap-x); }
    .meta { order: 1; flex-basis: 100%; }
  }
</style>
