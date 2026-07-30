<script lang="ts">
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, reviewUrl } from '../lib/dataset';
  import type { Side } from '../lib/lineage';
  import { easyContributions, type EasyTermKey } from '../lib/score';
  // {@html} below is confined to the two build-time-sanitised fields; every other field is untrusted
  // scrape text and must stay plain interpolation (docs/app.md §Sanitised-HTML boundary).
  let { shoe, data, side, stability }: {
    shoe: Shoe; data: ShoesFile;
    /** Passed in rather than derived here: it must be the side the score column was computed with,
     *  and a panel disagreeing with the cell above it would be worse than either answer. */
    side: Side; stability: boolean;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  const TERM_LABEL: Record<EasyTermKey, string> = {
    shockAbsorption: 'Shock absorption', outsoleDurability: 'Outsole durability',
    energyReturn: 'Energy return', midsoleWidth: 'Midsole width / stack',
    heelCounter: 'Heel counter stiffness',
  };
  const terms = $derived(easyContributions(shoe, side, stability, idx));
  const total = $derived(terms?.reduce((sum, r) => sum + r.weighted, 0) ?? 0);

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
  <section class="score-breakdown">
    <h4>Easy score</h4>
    {#if terms === null}
      <p class="missing">Not scored — this shoe is missing at least one measurement the score needs.</p>
    {:else}
      <table>
        <thead><tr><th>Term</th><th>Mapped</th><th>Contribution</th><th>Share</th></tr></thead>
        <tbody>
          {#each terms as r (r.key)}
            <tr>
              <td>{TERM_LABEL[r.key]}</td>
              <td>{displayNumber(r.term)}</td>
              <td>{displayNumber(r.weighted)}</td>
              <td>{Math.round((r.weighted / total) * 100)}%</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
  <a href={shoe.url} rel="noopener" target="_blank">Full review on RunRepeat →</a>
</div>

<style>
  .detail { padding: var(--s4) var(--s5); background: var(--surface); border-top: 1px solid var(--border); }
  .cols { display: flex; gap: var(--s5); align-items: flex-start; }
  /* An aspect ratio, so the box is the right height before the image loads and the panel does not
     shift the rows under it; `contain` keeps a non-conforming shot undistorted inside it. */
  img { width: 220px; max-width: 30vw; aspect-ratio: 3 / 2; object-fit: contain; border-radius: var(--r-md); }
  .intro { font-style: italic; color: var(--text-dim); }
  .proscons { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s4); }
  .pros li::marker { content: '+ '; color: var(--good); }
  .cons li::marker { content: '− '; color: var(--bad); }
  h4 { margin: var(--s3) 0 var(--s1); font-size: var(--t-sm); }
  .tags { margin-top: var(--s3); display: flex; flex-wrap: wrap; gap: var(--s1); }
  .fact { margin-top: var(--s2); display: flex; flex-wrap: wrap; gap: var(--s1); align-items: baseline; }
  .fact-name { font-size: var(--t-xs); text-transform: capitalize; color: var(--text-dim); min-width: 7rem; }
  .note { font-size: var(--t-sm); color: var(--text-dim); border-left: 2px solid var(--border); padding-left: var(--s2); }
  .lineage { margin-top: var(--s3); font-size: var(--t-sm); color: var(--text-dim); list-style: none; padding: 0; }
  .tag { font-size: var(--t-xs); padding: 0.1rem var(--s2); border: 1px solid var(--border); border-radius: var(--r-full); color: var(--text-dim); }
  a { display: inline-block; margin-top: var(--s3); color: var(--accent); }
  .missing { color: var(--text-dim); }
  /* Its own block rather than a column of the details grid: the breakdown is about the view, not
     about the shoe's copy, and it must still be there for a shoe RunRepeat never wrote up. */
  .score-breakdown { margin-top: var(--s4); border-top: 1px solid var(--border); padding-top: var(--s3); }
  .score-breakdown table { border-collapse: collapse; font-size: var(--t-sm); font-variant-numeric: tabular-nums; }
  .score-breakdown th, .score-breakdown td { text-align: right; padding: var(--s1) var(--s3) var(--s1) 0; }
  .score-breakdown th:first-child, .score-breakdown td:first-child { text-align: left; }
  .score-breakdown th { color: var(--text-dim); font-weight: 400; font-size: var(--t-xs); }
  /* Stripping embedded videos at sanitise time leaves empty paragraphs behind; collapse them. */
  .detail :global(p:empty) { display: none; }
  .detail :global(p) { margin: var(--s2) 0; }
  /* Two columns of pros and cons leave about twenty characters a line on a phone. */
  @media (max-width: 699px) {
    .proscons { grid-template-columns: 1fr; }
  }
</style>
