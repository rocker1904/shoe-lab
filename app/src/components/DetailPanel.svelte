<script lang="ts">
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, reviewUrl } from '../lib/dataset';
  import { columnLabel } from '../lib/labels';
  import { zoneOfKey } from '../lib/lineage';
  import { contributions, type Reading, type TermKey } from '../lib/score';
  import { defForKey } from '../lib/score-defs';
  // {@html} below is confined to the two build-time-sanitised fields; every other field is untrusted
  // scrape text and must stay plain interpolation (docs/app.md §Sanitised-HTML boundary).
  let { shoe, data, columns, stability }: {
    shoe: Shoe; data: ShoesFile;
    /** The view's columns, not a zone: the panel breaks down each score column that is on screen,
     *  so panel and column can never disagree about which half either is about
     *  (docs/app.md §The story scores). */
    columns: string[];
    /** Applies to both zones alike — it decides how many terms there are, not which half. */
    stability: boolean;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  const TERM_LABEL: Record<TermKey, string> = {
    shockAbsorption: 'Shock absorption', outsoleDurability: 'Outsole durability',
    energyReturn: 'Energy return', weight: 'Weight', midsoleWidth: 'Midsole width / stack',
    heelCounter: 'Heel counter stiffness',
  };
  // Driven off the columns rather than off the zones: with three stories on screen a zone appears
  // three times, so the column is the only key that is unique. `zoneOfKey` rather than a
  // `-heel` suffix test — inferring a zone from a slug is what `lineage.ts` exists to refuse.
  const breakdowns = $derived(columns.flatMap((key) => {
    const def = defForKey(key);
    const zone = zoneOfKey(key);
    return def && zone
      // The column's own header text, so the two are named by one function rather than two.
      ? [{ key, label: columnLabel(key, undefined), terms: contributions(def, shoe, zone, stability, idx) }]
      : [];
  }));
  // A ratio shows what it was divided from: 206 of 283 shoes saturate the outsole term, so the
  // mapped 1.0 alone says nothing about which reading put them there
  // (docs/app.md §The story scores).
  const readingText = (r: Reading) => (r.over
    ? `${displayNumber(r.value)} = ${displayNumber(r.over[0])} / ${displayNumber(r.over[1])}`
    : displayNumber(r.value));

  const lineage = $derived([
    { label: 'Replaced', ref: shoe.previousVersion },
    { label: 'Superseded by', ref: shoe.nextVersion },
    // Only worth showing when it is not just the direct successor said twice
    { label: 'Newest in line', ref: shoe.latestVersion?.slug === shoe.nextVersion?.slug ? null : shoe.latestVersion },
  ].filter((l) => l.ref));
  const LANGUAGE_NAMES: Record<string, string> = { es: 'Spanish' };
</script>

<div class="detail">
  <!-- `has-bd` gates the widest tier's explicit placement. In the default `All` view no score column
       is on screen, so there is no breakdown to stand beside the image — and a grid area with
       nothing in it is not empty space, it is a hole: the panel's right half went blank while the
       image and facts were held to 6 of 12 columns. Without one, the tier below is the right
       layout and this class is what lets it through (docs/app.md §The story scores). -->
  <div class="grid" class:has-bd={breakdowns.length > 0}>
    <div class="a-img">
      {#if shoe.details && shoe.imageUrl}<img src={shoe.imageUrl} alt={shoe.name} loading="lazy" />{/if}
    </div>
    <div class="a-facts">
      {#if shoe.details}
        {#if shoe.details.features.length}
          <div class="tags">{#each shoe.details.features as f, i (i)}<span class="tag">{f}</span>{/each}</div>
        {/if}
      {/if}
      <!-- `?? {}` covers the deploy lag: the bundle and shoes.json are fetched separately, so a
           new build can briefly meet a cached dataset written before the field existed. -->
      {#each Object.entries(shoe.facts ?? {}) as [name, values] (name)}
        <div class="fact"><span class="fact-name">{name.replace(/-/g, ' ')}</span>{#each values as v (v.slug)}<span class="tag">{v.text}</span>{/each}</div>
      {/each}
      {#if shoe.reviewLanguage}
        <p class="note">RunRepeat published this review in {LANGUAGE_NAMES[shoe.reviewLanguage] ?? shoe.reviewLanguage}.</p>
      {/if}
    </div>
    <div class="a-body">
      {#if shoe.details}
        {#if shoe.details.intro}<p class="intro">{shoe.details.intro}</p>{/if}
        <!-- Keyed by index, not by value: 85 of 450 shoes repeat a pro and 27 repeat a con, and a
             duplicate key is a runtime error. These lists are positional and hold no per-item
             state, so the index is the honest key. Do not "improve" this to `(p)`. -->
        <div class="a-lists">
          <div class="proscons">
            <ul class="pros">{#each shoe.details.pros as p, i (i)}<li>{p}</li>{/each}</ul>
            <ul class="cons">{#each shoe.details.cons as c, i (i)}<li>{c}</li>{/each}</ul>
          </div>
        </div>
        <div class="a-prose">
          <!-- The only two {@html} sinks in the app. Both fields are sanitised at build time by the
               allowlist in scraper/src/sanitize.ts; adding a third is a security decision, not a
               formatting one (docs/app.md §Sanitised-HTML boundary). -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {#if shoe.details.whoShouldBuy}<h4>Who should buy</h4><div>{@html shoe.details.whoShouldBuy}</div>{/if}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {#if shoe.details.whoShouldNotBuy}<h4>Who should NOT buy</h4><div>{@html shoe.details.whoShouldNotBuy}</div>{/if}
          {#if lineage.length}
            <ul class="lineage">
              {#each lineage as { label, ref } (label)}
                <li>{label}: <a href={reviewUrl(ref!.slug)} rel="noopener" target="_blank">{ref!.name}</a></li>
              {/each}
            </ul>
          {/if}
          <a href={shoe.url} rel="noopener" target="_blank">Full review on RunRepeat →</a>
        </div>
      {:else}
        <p class="intro missing">Details not yet crawled for this shoe.</p>
        <div class="a-lists"></div>
        <div class="a-prose">
          {#if lineage.length}
            <ul class="lineage">
              {#each lineage as { label, ref } (label)}
                <li>{label}: <a href={reviewUrl(ref!.slug)} rel="noopener" target="_blank">{ref!.name}</a></li>
              {/each}
            </ul>
          {/if}
          <a href={shoe.url} rel="noopener" target="_blank">Full review on RunRepeat →</a>
        </div>
      {/if}
    </div>
    <!-- One per score column on screen, and the block itself is absent without one: the panel
         explains what the table is showing rather than a zone of its own
         (docs/app.md §The story scores). -->
    {#if breakdowns.length}
    <div class="a-bd">
      {#each breakdowns as b (b.key)}
        <section class="score-breakdown">
          <h4>{b.label}</h4>
          {#if b.terms === null}
            <p class="missing">Not scored — this shoe is missing at least one measurement the score needs.</p>
          {:else}
            {@const total = b.terms.reduce((sum, r) => sum + r.weighted, 0)}
            <div class="card">
              <div class="scroll">
                <table>
                  <thead><tr><th>Term</th><th>Reading</th><th>Mapped</th><th>Contribution</th><th>Share</th></tr></thead>
                  <tbody>
                    {#each b.terms as r (r.key)}
                      <tr>
                        <td>{TERM_LABEL[r.key]}</td>
                        <td class="raw">{readingText(r.raw)}</td>
                        <td>{displayNumber(r.term)}</td>
                        <td>{displayNumber(r.weighted)}</td>
                        <td>
                          <!-- The number is the accessible value; the bar is decoration beside it. -->
                          <span class="sharecell"><span class="sharebar" aria-hidden="true"><i style:width="{Math.round((r.weighted / total) * 100)}%"></i></span>{Math.round((r.weighted / total) * 100)}%</span>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        </section>
      {/each}
    </div>
    {/if}
  </div>
</div>

<style>
  /* A container, not a viewport reader: this panel's width is the TABLE's, which is not the
     screen's — the sidebar takes 260px and past six columns the table is wider than the viewport.
     A media query is wrong on both counts (docs/app.md §Columns and sorting).
     A recessed well, not another raised surface: an open row belongs to the row above it rather
     than floating over the table, which is the elevation rule the phone rendering follows too. */
  /* The padding is on the INNER box, and that placement is load-bearing: `container-type:
     inline-size` resolves against this element's CONTENT box, so padding here makes the container
     narrower than the panel it is supposed to be measuring. With 16px each side a 1440px viewport
     gave a 1098px container and the 1120px tier below could never fire at any window size — the
     table would have to be wider than the screen to reach it. */
  .detail { background: var(--well); border-top: 1px solid var(--border);
            container-type: inline-size; }
  .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--s4) var(--s5);
          align-items: start; padding: var(--s5) var(--s4); }
  .a-img, .a-facts, .a-body, .a-bd { grid-column: span 12; }
  /* The summary and the two columns beneath it are ONE box, so they share a right edge at every
     width, and the prose measure falls out of the box rather than being set separately. */
  .a-body { max-width: 430px; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s4) var(--s6); }
  .a-body .intro { grid-column: 1 / -1; }

  @container (min-width: 700px) {
    .a-img { grid-column: span 4; }
    .a-facts { grid-column: span 8; }
    .a-body { max-width: 800px; grid-template-columns: minmax(0, 20rem) minmax(0, 1fr); }
  }
  /* `a-bd` is LAST in the DOM and pulled up by explicit placement here, which is what makes it fall
     to the bottom when the space is not there, with no `order` juggling.
     Gated on `has-bd`, because this placement only makes sense when something occupies columns 7-12:
     the default `All` view carries no score column, and the ungated rule left the panel's right half
     blank while squeezing the image and facts into half the grid. With no breakdown the tier above
     is the correct layout, and the image and facts take the width instead. */
  /* The image keeps its FOUR tracks across this boundary. It had three, so the widest tier gave it
     less room than the tier below and widening the window past 1120px of container shrank the photo
     from its full 280px to 257px — a track taken away as the container grew, which is the one thing
     a tier change may not do (docs/app.md §The expanded row). The column comes out of the
     breakdown, which is a five-column table of short figures and the only block here with any to
     spare; the facts keep their three. */
  @container (min-width: 1120px) {
    .has-bd .a-img   { grid-area: 1 / 1 / 2 / 5; }
    .has-bd .a-facts { grid-area: 1 / 5 / 2 / 8; }
    .has-bd .a-bd    { grid-area: 1 / 8 / 2 / 13; }
    .has-bd .a-body  { grid-area: 2 / 1 / 3 / 13; }
  }
  /* aspect-ratio, so the box is the right height BEFORE the image loads and the panel does not
     shift the rows under it; `contain` keeps a non-conforming shot undistorted inside it. Neither
     is decoration — dropping the ratio reintroduces a reflow inside an already-open row, which is
     the one place a jump is most obvious. 280px, not larger: every source image is 720×480, so 280
     CSS is well inside the sharp limit on a 2× display (360 is the ceiling) while leaving the facts
     beside it room. */
  img { width: 100%; max-width: 280px; height: auto; aspect-ratio: 3 / 2; object-fit: contain;
        display: block; border-radius: var(--r-md); background: var(--surface); }
  /* Dim ink alone marks this as the reviewer's voice. The self-hosted Inter Tight ships an upright
     axis only, so `font-style: italic` here buys a browser-synthesised oblique — a sheared upright
     rather than a cut — and self-hosting exists so the type is the same face everywhere
     (docs/app.md §Theming). */
  .intro { color: var(--text-dim); }
  /* Pros then cons, in ONE column at every width. `.a-lists` sits in `.a-body`'s 20rem track, so
     splitting it in two left each list about 18 characters a line — narrower than the phone shows
     them, on the widest screen there is. Stacked they get the whole track. */
  .proscons { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s4); }
  /* The default 40px indent is sized for decimal markers; these are a single `+` or `−` and the
     characters it costs come straight out of a line that is already the narrowest on the panel. */
  .proscons ul { padding-left: var(--s5); }
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
  .score-breakdown + .score-breakdown { margin-top: var(--s4); }
  /* The wrapper the markup adds, so the heading sits on the well and the figures sit on a surface. */
  .score-breakdown .card { background: var(--surface); border: 1px solid var(--border);
                           border-radius: var(--r-md); padding: var(--s3) var(--s3); }
  /* Its own scrollport: five columns of readings measure 417px — 424px with stability opted in —
     against the 285px a 375px phone leaves the panel, and the page must not go sideways for it
     (docs/app.md §The story scores). On an INNER box, so the section heading stays put while the
     figures scroll — on `.score-breakdown` itself the heading scrolled away from the figures it
     names. Safe here, unlike on `.content`, which must stay unscrolled or the table header rides
     off with the page.
     No `min-width`: the block carried one asserting 380px under a comment claiming 354px, and both
     were under the table's own min-content, so the declaration decided nothing. The term names and
     the nowrap readings set the width, and the scrollport is what handles it. */
  .score-breakdown .scroll { overflow-x: auto; }
  .score-breakdown table { width: 100%; border-collapse: collapse; }
  .score-breakdown th, .score-breakdown td { text-align: right; padding: var(--s1) var(--s3) var(--s1) 0; }
  .score-breakdown td { font-family: var(--font-mono); font-size: var(--t-xs);
                        font-variant-numeric: tabular-nums; }
  .score-breakdown td:first-child { font-family: var(--font-ui); text-align: left; font-size: var(--t-sm); }
  .score-breakdown th:first-child { text-align: left; }
  .score-breakdown th { color: var(--text-dim); font-weight: 400; font-size: var(--t-xs); }
  /* Dim, so `3.33 = 3 / 0.9` reads as working rather than as a value. A ratio and its two readings
     are also one expression; wrapping mid-division reads as two numbers. */
  .score-breakdown td.raw { color: var(--text-dim); white-space: nowrap; }
  .sharecell { display: flex; align-items: center; gap: var(--s1); justify-content: flex-end; }
  .sharebar { display: block; width: 3rem; height: 6px; border-radius: var(--r-full);
              background: var(--border-soft); overflow: hidden; }
  /* Accent, unlike the pickers' coverage bars: accent means "you selected this" in a CONTROL, and
     this is a DATA MARK, where it encodes magnitude. The picker's bars are neutral because their
     row is a control (docs/app.md §Theming). */
  .sharebar i { display: block; height: 100%; background: var(--accent); }
  /* Stripping embedded videos at sanitise time leaves empty paragraphs behind; collapse them. */
  .detail :global(p:empty) { display: none; }
  .detail :global(p) { margin: var(--s2) 0; }
</style>
