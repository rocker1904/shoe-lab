<script lang="ts">
  import type { LabTest } from '../../../shared/types.js';
  import { BOOL_LABELS, facetLabel, facetValues } from '../lib/categorical';
  import { chipLabel } from '../lib/labels';
  import { roving } from '../lib/roving';

  let { tests, selections, countsFor, onchange }: {
    tests: LabTest[];
    selections: Record<string, string[]>;
    countsFor: (slug: string) => Map<string, number>;
    onchange: (slug: string, values: string[] | undefined) => void;
  } = $props();

  // Counted over the facets on screen rather than over the whole record, so the summary reports
  // what this section is doing and nothing else. It sums raw lengths where `triOf` below refuses to
  // display a bool holding both values, so a record `parseView` cannot produce — `['true','false']`
  // — would read "2 selected" with nothing lit. The asymmetry is deliberate: the summary is a count
  // of what is held, and the tri-state is a picture of what can be shown.
  const selectedCount = $derived(tests.reduce((n, t) => n + (selections[t.slug]?.length ?? 0), 0));

  /**
   * The declared choices in display order, then whatever else the counts map carries — a value the
   * catalogue has dropped but a link still selects, or one the data holds and the catalogue does not
   * declare yet. Neither has a row of its own in `facetValues` by design, and the map is the only
   * place that knows they exist.
   */
  function rowsOf(test: LabTest) {
    const counts = countsFor(test.slug);
    const declared = facetValues(test);
    const known = new Set(declared.map((d) => d.value));
    const extra = [...counts.keys()].filter((v) => !known.has(v))
      .map((value) => ({ value, label: facetLabel(test, value) }));
    return [...declared, ...extra].map((r) => ({ ...r, n: counts.get(r.value) ?? 0 }));
  }

  function toggle(test: LabTest, value: string) {
    const held = selections[test.slug] ?? [];
    const next = held.includes(value) ? held.filter((v) => v !== value) : [...held, value];
    // Emitted in the order the rows are drawn, never the order they were clicked, so one selection
    // has one spelling in the address whoever built it (docs/app.md §URL encoding). A value with no
    // row — which the counts map should make impossible — is kept rather than silently dropped.
    const order = rowsOf(test).map((r) => r.value);
    const ordered = [...order.filter((v) => next.includes(v)), ...next.filter((v) => !order.includes(v))];
    // An empty selection deletes the key: a leftover `[]` would keep `isDefaultView` false forever
    // and never let `All` light again (docs/app.md §Filters).
    onchange(test.slug, ordered.length ? ordered : undefined);
  }

  /**
   * Three states and only three. Emitting is by construction — `undefined`, or a one-value array
   * built here — because `serializeView` would happily write a selection holding both values that
   * `parseView` then refuses, which is a link that loses its filter on arrival with nothing said.
   */
  const TRI = [
    { v: undefined, label: 'Any' },
    { v: 'true', label: BOOL_LABELS['true'] },
    { v: 'false', label: BOOL_LABELS['false'] },
  ] as const;

  /** Anything a tri-state cannot display reads as Any, rather than lighting one half of it. */
  function triOf(slug: string): 'true' | 'false' | undefined {
    const held = selections[slug] ?? [];
    return held.length === 1 && (held[0] === 'true' || held[0] === 'false') ? held[0] : undefined;
  }
</script>

<!-- `details` maps to role=group, so it needs a name of its own or it joins the sidebar's range
     groups as an unnamed one — Brand's shape, and the marker is drawn for Brand's reason. -->
<details aria-label="Features">
  <summary>{selectedCount ? `${selectedCount} selected` : 'Any feature'}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </summary>
  {#each tests as test (test.slug)}
    {@const noun = chipLabel(test.slug, test)}
    <!-- Each group is named by its own heading rather than by a second copy of the noun,
         `DisplayMenu`'s pattern. The one axis these ids can collide on is the facet — `Page.svelte`
         renders the sidebar once and makes it a drawer with a class, not with a second copy — so
         the slug that keys the test keys the id (docs/app.md §Filters). -->
    {#if test.type === 'bool'}
      <div class="facet">
        <h4 class="head" id="facet-{test.slug}">{noun}</h4>
        <!-- Buttons rather than native radios, exactly as `DiscontinuedFilter` argues: two rendered
             copies of the sidebar must not join one document-wide group by sharing a `name`. -->
        <div class="tri" role="radiogroup" aria-labelledby="facet-{test.slug}" use:roving>
          {#each TRI as o (o.label)}
            <button type="button" role="radio" aria-checked={triOf(test.slug) === o.v}
                    class:on={triOf(test.slug) === o.v}
                    onclick={() => onchange(test.slug, o.v === undefined ? undefined : [o.v])}>{o.label}</button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="facet" role="group" aria-labelledby="facet-{test.slug}">
        <h4 class="head" id="facet-{test.slug}">{noun}</h4>
        <!-- No search box and no scroll box: seven rows and four, read rather than scrolled. -->
        <ul>
          {#each rowsOf(test) as row (row.value)}
            <!-- A value at zero stays, greyed and still clickable: the list must not reflow under
                 the cursor, and a 0 is an answer (docs/app.md §Filters). -->
            <li class:empty={row.n === 0}>
              <label><input type="checkbox" checked={(selections[test.slug] ?? []).includes(row.value)}
                            onchange={() => toggle(test, row.value)} /> {row.label} ({row.n})</label>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/each}
</details>

<style>
  summary { cursor: pointer; font-size: var(--t-sm); color: var(--text-dim); list-style: none;
            display: inline-flex; align-items: center; gap: var(--s2); }
  summary::-webkit-details-marker { display: none; }
  .facet { margin-top: var(--s2); }
  /* Quieter than the sidebar's uppercase micro-labels, which belong to the section rather than to
     the facets inside it: sentence case, dim and small, so the heading above still leads. Every
     property the UA sets on an `h4` is restated here, size and weight and margin alike — the face
     is the sidebar's and must not move with the element (docs/app.md §Filters). */
  .head { margin: 0 0 var(--s1); font-size: var(--t-xs); font-weight: 600; color: var(--text-dim); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { font-size: var(--t-sm); padding: 0.1rem 0; }
  li.empty { color: var(--text-dim); }
  /* `overflow: visible`, not hidden: the focus ring is a box-shadow (docs/app.md §Theming). */
  .tri { display: flex; background: var(--bg); border: 1px solid var(--border);
         border-radius: var(--r-md); padding: 2px; gap: 2px; overflow: visible; }
  .tri button { flex: 1; padding: var(--s1); border: none; border-radius: var(--r-sm);
                background: none; color: var(--text-dim); cursor: pointer; font-size: var(--t-xs); }
  /* `--accent-solid` carrying `--on-accent`, like the toolbar's pill (docs/app.md §Theming). */
  .tri button.on { background: var(--accent-solid); color: var(--on-accent); font-weight: 600; }
</style>
