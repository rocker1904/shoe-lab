<script lang="ts">
  let { phrase }: {
    /** `release date, newest first` — the words `lib/ordering.ts` owns. Rendered only when the
     *  caller has decided no header can carry the caret, so this component never asks. */
    phrase: string;
  } = $props();
</script>

<!-- Its own line, beside the receipt rather than inside it: the receipt owns what the FILTERS did
     and its wording answers "how many", while this answers "in what order" and does not move when a
     bound does (docs/app.md §The header names the catalogue, the receipt owns the count). Not a
     live region either — a sort a runner presses is announced where every other action is, and one
     that arrived in a link has nothing to announce, because nothing changed while they read.
     docs/app.md §The ordering is stated when no header can carry it -->
<p class="ordering" data-testid="ordering-note">Sorted by <strong>{phrase}</strong></p>

<style>
  /* The receipt's own size and colour, sitting under it: two dim lines of the same kind read as one
     band of small print about the table below, where a second treatment would read as a warning.
     It takes the receipt's bottom margin and gives it none of its own. */
  .ordering { margin: calc(-1 * var(--s2)) 0 var(--s2); padding: 0 var(--s1);
              font-size: var(--t-sm); color: var(--text-dim); }
  strong { color: var(--text); font-weight: 600; }
</style>
