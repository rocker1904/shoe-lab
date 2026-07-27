<script lang="ts">
  import type { Shoe } from '../../../shared/types.js';
  // {@html} below is confined to the two build-time-sanitised fields; every other field is untrusted
  // scrape text and must stay plain interpolation (docs/app.md §Sanitised-HTML boundary).
  let { shoe }: { shoe: Shoe } = $props();

  // Every reference names a shoe RunRepeat also reviewed, so the link target always exists
  // there; shoe-lab has no per-shoe page of its own to link to (docs/app.md §Model lineage).
  const reviewUrl = (slug: string) => `https://runrepeat.com/uk/${slug}`;
  const lineage = $derived([
    { label: 'Replaced', ref: shoe.previousVersion },
    { label: 'Superseded by', ref: shoe.nextVersion },
    // Only worth showing when it is not just the direct successor said twice
    { label: 'Newest in line', ref: shoe.latestVersion?.slug === shoe.nextVersion?.slug ? null : shoe.latestVersion },
  ].filter((l) => l.ref));
  const LANGUAGE_NAMES: Record<string, string> = { es: 'Spanish' };
</script>

<div class="detail">
  {#if shoe.details}
    <div class="cols">
      {#if shoe.imageUrl}<img src={shoe.imageUrl} alt={shoe.name} loading="lazy" />{/if}
      <div>
        {#if shoe.reviewLanguage}
          <p class="note">RunRepeat published this review in {LANGUAGE_NAMES[shoe.reviewLanguage] ?? shoe.reviewLanguage}.</p>
        {/if}
        {#if shoe.details.intro}<p class="intro">{shoe.details.intro}</p>{/if}
        <!-- Keyed by index, not by value: 85 of 450 shoes repeat a pro and 27 repeat a con, and a
             duplicate key is a runtime error. These lists are positional and hold no per-item
             state, so the index is the honest key. Do not "improve" this to `(p)`. -->
        <div class="proscons">
          <ul class="pros">{#each shoe.details.pros as p, i (i)}<li>{p}</li>{/each}</ul>
          <ul class="cons">{#each shoe.details.cons as c, i (i)}<li>{c}</li>{/each}</ul>
        </div>
        <!-- The only two {@html} sinks in the app. Both fields are sanitised at build time by the
             allowlist in scraper/src/sanitize.ts; adding a third is a security decision, not a
             formatting one (docs/app.md §Sanitised-HTML boundary). -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {#if shoe.details.whoShouldBuy}<h4>Who should buy</h4><div>{@html shoe.details.whoShouldBuy}</div>{/if}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {#if shoe.details.whoShouldNotBuy}<h4>Who should NOT buy</h4><div>{@html shoe.details.whoShouldNotBuy}</div>{/if}
        {#if shoe.details.features.length}
          <div class="tags">{#each shoe.details.features as f, i (i)}<span class="tag">{f}</span>{/each}</div>
        {/if}
        <!-- `?? {}` covers the deploy lag: the bundle and shoes.json are fetched separately, so a
             new build can briefly meet a cached dataset written before the field existed. -->
        {#each Object.entries(shoe.facts ?? {}) as [name, values] (name)}
          <div class="fact"><span class="fact-name">{name.replace(/-/g, ' ')}</span>{#each values as v (v.slug)}<span class="tag">{v.text}</span>{/each}</div>
        {/each}
      </div>
    </div>
  {:else}
    <p class="missing">Details not yet crawled for this shoe.</p>
  {/if}
  {#if lineage.length}
    <ul class="lineage">
      {#each lineage as { label, ref } (label)}
        <li>{label}: <a href={reviewUrl(ref!.slug)} rel="noopener" target="_blank">{ref!.name}</a></li>
      {/each}
    </ul>
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
  .fact { margin-top: 0.4rem; display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: baseline; }
  .fact-name { font-size: 0.75rem; text-transform: capitalize; color: var(--text-dim); min-width: 7rem; }
  .note { font-size: 0.8rem; color: var(--text-dim); border-left: 2px solid var(--border); padding-left: 0.5rem; }
  .lineage { margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-dim); list-style: none; padding: 0; }
  .tag { font-size: 0.75rem; padding: 0.1rem 0.5rem; border: 1px solid var(--border); border-radius: 999px; color: var(--text-dim); }
  a { display: inline-block; margin-top: 0.75rem; color: var(--accent); }
  .missing { color: var(--text-dim); }
  /* Stripping embedded videos at sanitise time leaves empty paragraphs behind; collapse them. */
  .detail :global(p:empty) { display: none; }
  .detail :global(p) { margin: 0.4rem 0; }
</style>
