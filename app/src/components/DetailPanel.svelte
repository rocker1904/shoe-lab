<script lang="ts">
  import type { Shoe } from '../../../shared/types.js';
  // Only `whoShouldBuy`/`whoShouldNotBuy` are sanitised at build time, so they are the only fields rendered
  // with {@html}. Every other field is untrusted scrape text and must stay plain interpolation.
  let { shoe }: { shoe: Shoe } = $props();
</script>

<div class="detail">
  {#if shoe.details}
    <div class="cols">
      {#if shoe.imageUrl}<img src={shoe.imageUrl} alt={shoe.name} loading="lazy" />{/if}
      <div>
        {#if shoe.details.intro}<p class="intro">{shoe.details.intro}</p>{/if}
        <div class="proscons">
          <ul class="pros">{#each shoe.details.pros as p}<li>{p}</li>{/each}</ul>
          <ul class="cons">{#each shoe.details.cons as c}<li>{c}</li>{/each}</ul>
        </div>
        {#if shoe.details.whoShouldBuy}<h4>Who should buy</h4><div>{@html shoe.details.whoShouldBuy}</div>{/if}
        {#if shoe.details.whoShouldNotBuy}<h4>Who should NOT buy</h4><div>{@html shoe.details.whoShouldNotBuy}</div>{/if}
        {#if shoe.details.features.length}
          <div class="tags">{#each shoe.details.features as f}<span class="tag">{f}</span>{/each}</div>
        {/if}
      </div>
    </div>
  {:else}
    <p class="missing">Details not yet crawled for this shoe.</p>
  {/if}
  <a href={shoe.url} rel="noopener" target="_blank">Full review on RunRepeat →</a>
</div>

<style>
  .detail { padding: 1rem 1.5rem; background: var(--surface); border-top: 1px solid var(--border); }
  .cols { display: flex; gap: 1.5rem; align-items: flex-start; }
  img { width: 220px; max-width: 30vw; border-radius: 8px; }
  .intro { font-style: italic; color: var(--text-dim); }
  .proscons { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .pros li::marker { content: '+ '; color: var(--good); }
  .cons li::marker { content: '− '; color: var(--bad); }
  h4 { margin: 0.75rem 0 0.25rem; font-size: 0.85rem; }
  .tags { margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .tag { font-size: 0.75rem; padding: 0.1rem 0.5rem; border: 1px solid var(--border); border-radius: 999px; color: var(--text-dim); }
  a { display: inline-block; margin-top: 0.75rem; color: var(--accent); }
  .missing { color: var(--text-dim); }
  /* Stripping embedded videos at sanitise time leaves empty paragraphs behind; collapse them. */
  .detail :global(p:empty) { display: none; }
  .detail :global(p) { margin: 0.4rem 0; }
</style>
