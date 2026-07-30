<script lang="ts">
  let { shown, total, outsideBounds, hiddenMissing, undatedHidden, showingMissing, onshowmissing }: {
    shown: number; total: number; outsideBounds: number; hiddenMissing: number; undatedHidden: number;
    showingMissing: boolean; onshowmissing: () => void;
  } = $props();
</script>

<!-- Always present: an absent receipt would have to be read as "nothing hidden", which is a guess.
     `total` is the population the range filters were applied to, so the three counts sum to it. -->
<p class="receipt" data-testid="receipt" aria-live="polite">
  Showing <strong>{shown}</strong> of the {total} shoes left by your other filters ·
  {outsideBounds} outside your bounds ·
  {#if undatedHidden > 0}
    <!-- Absence, not a failed bound: these shoes have no release date at all, so a date filter
         cannot show them to qualify. Said out loud rather than folded into the total. -->
    {undatedHidden} {undatedHidden === 1 ? 'shoe has' : 'shoes have'} no release date and cannot pass your date filter ·
  {/if}
  {#if showingMissing}
    shoes with no data for the active filters are included
    <button type="button" onclick={onshowmissing}>hide them again</button>
  {:else}
    <!-- `hiddenMissing` over-counts against "would otherwise be visible", and this copy is written
         to stay true of it rather than of that (docs/app.md §Filters). -->
    {hiddenMissing} {hiddenMissing === 1 ? 'shoe has' : 'shoes have'} no data for the active filters
    {#if hiddenMissing > 0}
      <button type="button" onclick={onshowmissing}>show them anyway</button>
    {/if}
  {/if}
</p>

<style>
  .receipt { margin: 0 0 var(--s2); padding: var(--s2) var(--s1); font-size: var(--t-sm); color: var(--text-dim); }
  strong { color: var(--text); }
  button { padding: 0; border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
</style>
