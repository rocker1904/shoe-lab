<script lang="ts">
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { isCategorical } from '../lib/categorical';
  import { coverageOf } from '../lib/coverage';
  import { indexTests, isoYearsAgo, numericValue } from '../lib/dataset';
  import { startOfMonth } from '../lib/release-date';
  import { type RangeBound } from '../lib/filters';
  import { CURATED_RANGE_KEYS, metricEntries, type ResolvedMetric, type Zone } from '../lib/lineage';
  import { stableBrandCounts, stableFacetCounts } from '../lib/population';
  import { excludedBy } from '../lib/relax';
  import { roving } from '../lib/roving';
  import type { ViewState } from '../lib/urlstate';
  import AddFilterDialog, { type AddFilterOption } from './AddFilterDialog.svelte';
  import BrandFilter from './BrandFilter.svelte';
  import DirectionLegend from './DirectionLegend.svelte';
  import DiscontinuedFilter from './DiscontinuedFilter.svelte';
  import FeaturesFilter from './FeaturesFilter.svelte';
  import MetricRow from './MetricRow.svelte';
  import MonthPicker from './MonthPicker.svelte';
  import PlateFilter from './PlateFilter.svelte';
  import RangeFilter from './RangeFilter.svelte';

  let { data, view, onchange, population }: {
    data: ShoesFile; view: ViewState; onchange: (v: ViewState) => void;
    /** Coverage denominator: the shoes left by the non-range filters (docs/app.md §Coverage). */
    population: Shoe[];
  } = $props();

  const idx = $derived(indexTests(data.tests));
  const ZONE_LABEL: Record<Zone, string> = { forefoot: 'Forefoot', heel: 'Heel' };

  /** The bound each quick chip sets, resolved ONCE so the value a chip writes and the value its
   *  mark compares against are the same string. Computed at click time they were two reads of the
   *  clock, and a chip could set a bound it then failed to look selected for. */
  const QUICK_BOUNDS = [1, 2, 3].map((years) => ({ years, iso: startOfMonth(isoYearsAgo(new Date(), years)) }));

  /** `score` and `msrpGbp` are shoe fields, not catalogue tests, so `metricEntries` cannot emit
   *  them — and leaving them out would take the price filter with them (docs/app.md §Filters). */
  const FIELD_METRICS: ResolvedMetric[] = [
    { kind: 'single', key: 'msrpGbp', label: 'Price', units: '£', groupId: null },
    { kind: 'single', key: 'score', label: 'RunRepeat Score', units: '', groupId: null },
  ];
  const entries = $derived([...metricEntries(data.tests), ...FIELD_METRICS]);
  const keysOf = (e: ResolvedMetric): string[] =>
    e.kind === 'single' ? [e.key] : e.kind === 'pair' ? [e.current.key, e.retired.key] : e.parts.map((p) => p.key);
  const byKey = $derived(new Map(entries.flatMap((e) => keysOf(e).map((k) => [k, e] as const))));

  const held = (key: string) => key in view.filters.ranges || view.rows.includes(key);
  const chosenKey = (e: ResolvedMetric): string => {
    if (e.kind === 'single') return e.key;
    if (e.kind === 'colocated') return e.parts[0]!.key;
    const explicit = view.generations[e.current.key];
    if (explicit) return explicit;
    // A hand-written URL can carry a lone range on the retired generation; presenting the pair as
    // switched to it is what keeps that filter visible and clearable.
    return held(e.retired.key) && !held(e.current.key) ? e.retired.key : e.current.key;
  };
  /** **Every** part of a zone pair gets a row, always: the sidebar must not change shape with the
   *  zone (docs/app.md §Filters). A superseded pair still offers one generation at a time. */
  const rowKeysOf = (e: ResolvedMetric): string[] =>
    e.kind === 'colocated' ? e.parts.map((p) => p.key) : [chosenKey(e)];

  const curated = $derived.by(() => {
    const out: ResolvedMetric[] = [];
    for (const k of CURATED_RANGE_KEYS) {
      const e = byKey.get(k);
      if (e && !out.includes(e)) out.push(e);
    }
    return out;
  });
  // A hand-added row, or a non-curated key already bounded by a link, needs a row of its own or its
  // filter could never be cleared. Curated first, so the order above is what the runner sees.
  const extras = $derived.by(() => {
    const out: ResolvedMetric[] = [];
    for (const k of [...view.rows, ...Object.keys(view.filters.ranges)]) {
      const e = byKey.get(k);
      if (e && !curated.includes(e) && !out.includes(e)) out.push(e);
    }
    return out;
  });
  const shown = $derived([...curated, ...extras]);

  /** Heading **and** zone: two rows both called "Forefoot" would share an accessible name. */
  const nameFor = (e: ResolvedMetric, key: string): string => {
    if (e.kind === 'single') return e.units ? `${e.label} (${e.units})` : e.label;
    if (e.kind === 'pair') return `${e.label} — ${(key === e.current.key ? e.current : e.retired).generation}`;
    const p = e.parts.find((x) => x.key === key)!;
    if (p.zone) return `${e.label} — ${ZONE_LABEL[p.zone]}`;
    return p.units ? `${p.label} (${p.units})` : p.label;
  };
  /**
   * A colocated entry renders two controls under one heading, so each needs its zone on screen.
   * Without it the coverage rows above read as labels for the controls below and name the wrong
   * one — the accessible name is right, so it misleads sighted users only.
   */
  const legendFor = (e: ResolvedMetric, key: string): string => {
    if (e.kind !== 'colocated') return '';
    const p = e.parts.find((x) => x.key === key)!;
    return p.zone ? ZONE_LABEL[p.zone] : p.label;
  };

  const pctOf = (key: string) => Math.round(coverageOf(population, key, idx).fraction * 100);
  /**
   * Lab test 52 and the `msrpGbp` field are the same resolved price (docs/app.md §Resolved price),
   * so offering the test as well would add a second, identically-labelled Price row that ANDs with
   * the curated one — two controls a user cannot tell apart.
   */
  const ALIASED_BY_A_FIELD = new Set(['price']);
  /** Coverage is deliberately absent here: it is a full pass over the population per option, and
   *  this list is rebuilt on every view update while the dialog it feeds is mounted only when the
   *  runner opens it. The figures are resolved at the call site below, where they are rendered
   *  (docs/app.md §What a drag may recompute). */
  const addable = $derived(entries.flatMap((e) => {
    const rows = shown.includes(e) ? rowKeysOf(e) : [];
    return (e.kind === 'colocated' ? e.parts.map((p) => p.key) : [chosenKey(e)])
      .filter((k) => !rows.includes(k) && !ALIASED_BY_A_FIELD.has(k))
      .map((k) => ({ key: k, label: nameFor(e, k), groupId: e.groupId }));
  }));
  const withCoverage = (): AddFilterOption[] => addable.map((o) => ({ ...o, coverage: pctOf(o.key) }));
  let adding = $state(false);

  /**
   * The picker offers only months the fleet actually spans. Derived from the loaded shoes rather
   * than frozen: this is an affordance, not a score constant, so
   * docs/decisions.md §Frozen scores and live thresholds does not apply — the brand list and every
   * histogram beside it are derived the same way. The fallback covers a fleet with no dated shoe at
   * all: a whole year, both ends, because collapsing min onto max would disable eleven months and
   * both steppers and leave a picker that offers only January.
   */
  const fleetRange = $derived.by(() => {
    const dated = data.shoes.map((s) => s.releasedAt).filter((d): d is string => !!d).sort();
    const year = new Date().getFullYear();
    return { min: dated[0] ?? `${year}-01-01`, max: dated.at(-1) ?? `${year}-12-01` };
  });

  /** The readings themselves: the row trims its own axis to p2–p98 and snaps a drag to values that
   *  exist, neither of which bucket counts can supply (docs/app.md §Filters). */
  const valuesFor = (key: string) =>
    data.shoes.map((s) => numericValue(s, key, idx)).filter((v): v is number => v !== undefined);
  /**
   * Over the whole fleet under the live filter set, never over `population`: the question is how
   * many shoes come back if this bound goes, and `population` has already had the other bounds
   * applied to it. Undefined on an open row, where there is nothing to relax (docs/app.md §Filters).
   */
  const excludedFor = (key: string): number | undefined => {
    const b = view.filters.ranges[key];
    if (!b || (b.min === undefined && b.max === undefined)) return undefined;
    return excludedBy(data.shoes, view.filters, key, idx);
  };
  /** A figure per brand over a population a range cannot move, so the map is read through a reader
   *  that holds its identity while one does (docs/app.md §What a drag may recompute). What the
   *  three counting decisions are, and why none of them is safe to simplify, is `population.ts`. */
  const readBrandCounts = stableBrandCounts();
  const brandCounts = $derived(readBrandCounts(data.shoes, view.filters, idx));
  /** The facets the catalogue describes, by the same rule that decides which of these can be a
   *  column: an upstream categorical test arrives with a control the way it arrives with a cell.
   *  `isCategorical` is that rule and the shared door — `categoricalEntries` is the picker's
   *  projection of it (`{key,label,groupId}`), not the rule itself, which is why this filters the
   *  tests directly rather than calling it. */
  const featureTests = $derived(data.tests.filter((t) => isCategorical(t)));
  /** One reader per facet, made once and kept: each figure is a walk of the population, and a reader
   *  rebuilt per render would hold nothing and re-walk on every frame of a drag
   *  (docs/app.md §What a drag may recompute). `recompute-budget.test.ts` is what holds this, not
   *  review: rebuilding the reader per call takes the fleet passes per bound change from 3 to 5 and
   *  fails its bound, so this map is asserted rather than merely intended.
   *
   *  A plain function where `brandCounts` is a `$derived`, which is deliberate: this is per-slug and
   *  lazy, and a `$derived` cannot be either without a map of deriveds. What makes it fresh is that
   *  `patch` hands the child a structuredCloned view, so `selections` changes identity on every view
   *  change and the template calls this again — load-bearing, and stated here because it is the only
   *  place it is written. */
  const facetReaders = new Map<string, ReturnType<typeof stableFacetCounts>>();
  function countsFor(slug: string): Map<string, number> {
    let read = facetReaders.get(slug);
    if (!read) {
      read = stableFacetCounts(slug);
      facetReaders.set(slug, read);
    }
    return read(data.shoes, view.filters, idx);
  }

  function patch(mutate: (v: ViewState) => void) {
    const next: ViewState = structuredClone($state.snapshot(view)) as ViewState;
    mutate(next);
    onchange(next);
  }
  function setRange(key: string, b: RangeBound) {
    patch((v) => {
      const next: RangeBound = {};
      if (b.min !== undefined) next.min = b.min;
      if (b.max !== undefined) next.max = b.max;
      // Clearing always deletes the key. Leaving `{}` behind would mean `isDefaultView` never
      // returned true again and the entry band could never re-open; the row survives because it is
      // listed in `view.rows`, not because a hollow key props it up (docs/app.md §Filters).
      if (next.min === undefined && next.max === undefined) delete v.filters.ranges[key];
      else v.filters.ranges[key] = next;
    });
  }
  // Anything not curated is removable, rather than only what is in `rows`. A row can also be on
  // screen because it is a half of a zone pair, and gating Remove on `rows` would leave such a row
  // with clearing as its only exit — which is clear-means-remove, the conflation this surface
  // deleted (docs/app.md §Filters).
  const removable = (key: string) => !CURATED_RANGE_KEYS.includes(key);
  function removeRow(key: string) {
    patch((v) => {
      v.rows = v.rows.filter((k) => k !== key);
      delete v.filters.ranges[key];
    });
  }
  function addRow(key: string) {
    patch((v) => { if (!v.rows.includes(key)) v.rows.push(key); });
  }
  function choose(e: ResolvedMetric, key: string) {
    if (e.kind !== 'pair') return;
    patch((v) => {
      const sibling = key === e.current.key ? e.retired.key : e.current.key;
      if (key === e.current.key) delete v.generations[e.current.key];
      else v.generations[e.current.key] = key;
      // Selecting one generation releases the other. Readings are not comparable across a
      // supersession, so the bound is dropped rather than carried over (docs/app.md §URL encoding).
      delete v.filters.ranges[sibling];
      v.columns = v.columns.filter((c) => c !== sibling);
      // A hand-added pair follows its row across the switch; a curated one renders regardless.
      v.rows = v.rows.map((k) => (k === sibling ? key : k));
    });
  }
</script>

<aside>
  <section>
    <h3>Search</h3>
    <!-- `.trim()` decides, but the untrimmed value is what is stored: a query with no non-whitespace
         character selects nothing, so it is the empty query and must not reach the URL or storage
         (docs/app.md §Filters) — while trimming what is *kept* would delete the space between two
         words the moment it was typed. -->
    <input class="search" type="search" placeholder="Search shoes…" aria-label="Search"
           value={view.filters.search ?? ''}
           oninput={(e) => patch((v) => { v.filters.search = e.currentTarget.value.trim() ? e.currentTarget.value : undefined; })} />
  </section>

  <section>
    <h3>Released after</h3>
    <!-- Month, not date: the dataset is month-precision at best, so a day picker would offer a
         bound the data cannot honour. Built rather than native, because Firefox and WebKit
         implement none of `input type="month"` and rendered it as a bare text box
         (docs/app.md §Released after is month-granular). -->
    <MonthPicker value={view.filters.releasedAfter} min={fleetRange.min} max={fleetRange.max}
                 onchange={(iso) => patch((v) => { v.filters.releasedAfter = iso; })} />
    <!-- `radiogroup`, because the four are exclusive and each names a whole state of one bound
         rather than a thing to switch on: `Any` IS the unset state, so it lights when nothing is
         bound (docs/app.md §Released after is month-granular). A view the month picker put outside
         all four marks none, which a radiogroup is allowed to do — same shape as the toolbar's
         nullable marks. -->
    <div class="chips" role="radiogroup" aria-label="Released after, quick bounds" use:roving>
      <!-- The only way to unset a date the chips set: a chip that sets one cannot also clear it. -->
      <button type="button" role="radio" aria-checked={view.filters.releasedAfter === undefined}
              class:on={view.filters.releasedAfter === undefined} data-label="Any"
              onclick={() => patch((v) => { v.filters.releasedAfter = undefined; })}>Any</button>
      {#each QUICK_BOUNDS as q (q.years)}
        <button type="button" role="radio" aria-checked={view.filters.releasedAfter === q.iso}
                class:on={view.filters.releasedAfter === q.iso} data-label="{q.years}y"
                onclick={() => patch((v) => { v.filters.releasedAfter = q.iso; })}>{q.years}y</button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Plate</h3>
    <PlateFilter value={view.filters.plate} onchange={(p) => patch((v) => { v.filters.plate = p; })} />
  </section>

  <section>
    <h3>Brand</h3>
    <BrandFilter counts={brandCounts} selected={view.filters.brands ?? []}
                 onchange={(brands) => patch((v) => { v.filters.brands = brands.length ? brands : undefined; })} />
  </section>

  <section>
    <h3>Discontinued</h3>
    <DiscontinuedFilter value={view.filters.discontinued} onchange={(d) => patch((v) => { v.filters.discontinued = d; })} />
  </section>

  <section>
    <h3>Features</h3>
    <FeaturesFilter tests={featureTests} selections={view.filters.categorical} {countsFor}
                    onchange={(slug, values) => patch((v) => {
                      // An empty selection deletes its key, the ranges rule and for the ranges
                      // reason: a leftover `[]` keeps `isDefaultView` false forever and All unlit
                      // (docs/app.md §Filters).
                      if (values?.length) v.filters.categorical[slug] = values;
                      else delete v.filters.categorical[slug];
                    })} />
  </section>

  <!-- The rows are a section like the six above, and the heading is what makes them one: without it
       every `MetricRow` `h4` follows `Features` with no `h3` between, so a heading outline reads
       every measurement as a facet of that section. The word is not chosen here: the Add-filter
       dialog, which is how a row arrives, already calls them metrics to the runner's face, and
       taking its noun rather than coining a second one is docs/policies.md §Vocabulary. The foot
       stays OUTSIDE: its two buttons act on the whole surface, not on the measurements
       (docs/app.md §Filters). -->
  <section>
    <h3>Metrics</h3>
    <!-- At the head of the run of rows it explains, and NOT at the top of the sidebar: the sections
         above carry no direction mark, so a legend over them would read as a claim about
         Search and Brand. It is the one legend of the three that cannot sit outside its scrollport —
         the sidebar IS the scrollport — so it scrolls with the rows rather than above them; what
         makes that survivable here is that these rows state their own units where the pickers' do
         not (docs/app.md §Table presentation). -->
    <DirectionLegend />

    {#each shown as e (keysOf(e)[0])}
      <section class="metric">
        <MetricRow metric={e} chosen={chosenKey(e)} onchoose={(k) => choose(e, k)}
                   coverage={(k) => coverageOf(population, k, idx)}
                   bounded={(k) => k in view.filters.ranges} />
        {#each rowKeysOf(e) as key (key)}
          <RangeFilter label={legendFor(e, key)} units="" name={nameFor(e, key)} values={valuesFor(key)}
                       bound={view.filters.ranges[key] ?? {}} onchange={(b) => setRange(key, b)}
                       excluded={excludedFor(key)}
                       onremove={removable(key) ? () => removeRow(key) : undefined} />
        {/each}
      </section>
    {/each}
  </section>

  <!-- One row, because they are the sidebar's two whole-surface actions and a column of two lone
       buttons reads as two unrelated afterthoughts. Add leads: it grows the surface, and Clear
       empties it. -->
  <div class="foot">
    <!-- Choosing among forty-odd metrics is a different task from tuning three, so it gets a dialog
         with room for grouping, search and coverage bars (docs/app.md §Filters). -->
    {#if addable.length}
      <button type="button" class="add" onclick={() => (adding = true)}>Add filter</button>
    {/if}
    <!-- Named for what it does, and the qualifier is the point: the toolbar has no Clear — `All` is
         what returns the whole view to this runner's baseline (docs/app.md §The toolbar) — while
         this one touches the filters and nothing else. -->
    <button type="button" class="reset" onclick={() => patch((v) => { v.filters = { ranges: {}, categorical: {} }; v.generations = {}; v.rows = []; })}>Clear filters</button>
  </div>
  {#if adding}
    <AddFilterDialog options={withCoverage()} groups={data.groups}
                     onchoose={(k) => { adding = false; addRow(k); }}
                     onclose={() => (adding = false)} />
  {/if}
</aside>

<style>
  /* `--s4` LESS the room the scrollport around this now reserves for the focus ring (`.scrollport`
     in `app.css`), so the controls keep the 16px inset they have always had while the port owns the
     outer 4px of it. Written as the arithmetic rather than as 12px, because the two halves are one
     measurement and a literal here drifts the moment the ring's spread does (docs/app.md §Theming). */
  aside { padding: calc(var(--s4) - var(--ring-room)); display: flex; flex-direction: column; gap: var(--s3); }
  /* One half of the sidebar's deliberate heading pair: these `h3`s are uppercase micro-labels
     naming a SECTION — Search, Brand, Plate — and they set at the same size and tracking as the
     setup strip's group labels, because they do the same job. The sentence-case `h4`s under them
     are drawn by the components that own them (docs/app.md §Filters). */
  h3 { font-size: var(--t-xs); font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
       color: var(--text-dim); margin: 0 0 var(--s2); }
  /* `--t-sm` stated rather than left to the UA: `input[type=search]` is 13.33px in Blink and Gecko
     and 16px in WebKit, so this box was a fifth of a size bigger in Safari than every other field
     beside it. The touch tier then pays 16px for the reason `RangeFilter.svelte` states and
     docs/app.md §Filters owns — and this is the box `openFilters()` hands focus to, so it is the
     one the rule was written for. */
  .search { padding: var(--s2); border: 1px solid var(--border); border-radius: var(--r-sm);
            background: var(--surface); color: var(--text); width: 100%; box-sizing: border-box;
            font-size: var(--t-sm); }
  @media (hover: none) {
    .search { font-size: 16px; }
  }
  .chips { display: flex; gap: var(--s1); margin-top: var(--s1); }
  /* A column for the same reason the toolbar's pills are one: the width reservation below sits
     under the label rather than beside it. */
  .chips button { display: inline-flex; flex-direction: column; align-items: center;
                  padding: var(--s1) var(--s2); border: 1px solid var(--border);
                  border-radius: var(--r-full); background: var(--surface); color: var(--text-dim);
                  cursor: pointer; }
  /* The segmented family's selected state, on the shape these chips already had: `--accent-solid`
     filled and inked with `--on-accent`, which is the one job that token exists for
     (docs/app.md §Theming). The border goes to the fill so a chosen chip is one colour rather than
     a filled pill wearing a grey outline. */
  .chips button.on { background: var(--accent-solid); border-color: var(--accent-solid);
                     color: var(--on-accent); font-weight: 600; }
  /* The same reservation the toolbar's pills carry, and here it is what keeps four chips in a row
     from shuffling sideways as the choice moves along them (docs/app.md §The toolbar). */
  .chips button::after { content: attr(data-label); font-weight: 600; height: 0; overflow: hidden;
                         visibility: hidden; pointer-events: none; }
  /* The rows used to be children of the flex `aside` and took their 12px from its `gap`. Wrapped in
     a section so the heading scopes them, they are outside that gap, so each row states the same
     12px as its own top margin — which also leaves the heading paying only its own `margin-bottom`,
     the 8px every other section's `h3` pays above its first control. */
  .metric { display: flex; flex-direction: column; gap: var(--s1); margin-top: var(--s3); }
  /* Wrapping, not shrinking: the drawer is 88vw at 360px and the pair measure their labels, so a
     no-wrap row would overflow the sidebar's own scrollport rather than take a second line. */
  .foot { display: flex; flex-wrap: wrap; gap: var(--s2); margin-top: var(--s1); }
  /* The app's secondary-button treatment, the same one the masthead's actions and the drawer toggle
     carry (docs/app.md §Theming). These two were the only buttons in the app still rendering as bare
     UA controls, which read as unfinished beside the styled ones around them. */
  .reset, .add { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
                 background: var(--surface); color: var(--text); border-radius: var(--r-sm);
                 font: inherit; font-size: var(--t-sm); }
  .reset:hover, .add:hover { background: var(--accent-dim); }
</style>
