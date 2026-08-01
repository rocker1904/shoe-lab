<!-- The script block takes no props and exists only so `svelte-check` types this module: without a
     `lang="ts"` script, every importer is told the component implicitly has type `any`. -->
<script lang="ts"></script>

<!-- One legend, then a bare glyph per row: the arrow left the table header, and with no units beside
     it a lone ↑ says nothing (docs/app.md §Table presentation). Three surfaces render the same three
     clauses — the column picker, the add-filter dialog and the sidebar — so the words and the
     separators live here rather than being spelled three times and drifting.
     The caller places it, and where it can it places it OUTSIDE its list's scrollport: inside one,
     the legend scrolls away with the first few rows and every glyph under it stops meaning
     anything. -->
<p class="legend">
  <span><b>↑</b> higher is better</span>
  <span><b>↓</b> lower is better</span>
  <span>no mark — neutral</span>
</p>

<style>
  /* Separated, because the three clauses are one sentence and read as three headings without them. */
  .legend { display: flex; flex-wrap: wrap; gap: var(--s2); margin: 0; font-size: var(--t-xs); color: var(--text-dim); }
  .legend span + span::before { content: '·'; margin-right: var(--s2); }
  .legend b { font-family: var(--font-mono); font-weight: 400; color: var(--text); }
</style>
