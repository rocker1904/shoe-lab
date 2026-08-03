import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FilterSidebar from './FilterSidebar.svelte';
import { indexTests, isoYearsAgo } from '../lib/dataset';
import { startOfMonth } from '../lib/release-date';
import { applyPreset, PRESETS } from '../lib/presets';
import { projectZone } from '../lib/zone';
import { parseView, sameValue } from '../lib/urlstate';
import { defaultView } from '../lib/view';
import { FLEET, TESTS, labTest, shoe } from '../lib/test-fixtures';
import type { Zone } from '../lib/lineage';
import type { ShoesFile } from '../../../shared/types.js';

const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(view = defaultView()) {
  const onchange = vi.fn();
  render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
  return onchange;
}

/** jsdom's synthetic click does not move focus the way a real one does, and the dialog hands focus
 *  back to whatever held it — so the trigger has to actually hold it first. */
const open = (trigger: HTMLElement) => {
  trigger.focus();
  return fireEvent.click(trigger);
};

/**
 * Which section a control belongs to, because two of them now offer one called `Any`: the release
 * chips, whose unset state that is, and the discontinued group. The chips' own comment predicted
 * this — "a second control named Any arriving in this sidebar cannot silently retarget the click" —
 * so every query for either says which section it means. The LAST match, for the tests that render
 * a second sidebar over the first.
 */
const sectionNamed = (heading: string) => within([...document.querySelectorAll('section')]
  .filter((s) => s.querySelector('h3')?.textContent === heading).at(-1)!);

/** Scoped to its own row: zone pairs put several range groups on screen, so an index would drift.
 *  Matched by suffix, because each field is now named for the metric it bounds. */
const boundOf = (name: RegExp, part: 'min' | 'max' = 'min') =>
  within(screen.getAllByRole('group', { name }).at(-1)!)
    .getByLabelText(part === 'min' ? /minimum$/ : /maximum$/);

describe('FilterSidebar', () => {
  it('renders curated range filters that exist in the dataset', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Stack — Heel' })).toBeInTheDocument();
    expect(screen.getByText(/^Weight/)).toBeInTheDocument();
    expect(screen.queryByText(/Tongue gusset/)).not.toBeInTheDocument(); // option type: no slider
  });
  it('emits updated view when a range min changes', async () => {
    const onchange = setup();
    await fireEvent.input(boundOf(/^Stack — Heel/), { target: { value: '36' } });
    expect(onchange).toHaveBeenCalled();
    const v = onchange.mock.lastCall![0];
    expect(v.filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('emits plate selection as a set, and undefined once emptied', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    expect(onchange.mock.lastCall![0].filters.plate).toEqual(['carbon']);

    const view = defaultView();
    view.filters.plate = ['carbon'];
    const off = vi.fn();
    render(FilterSidebar, { props: { data, view, onchange: off, population: FLEET } });
    await fireEvent.click(screen.getAllByRole('checkbox', { name: 'Carbon' }).at(-1)!);
    expect(off.mock.lastCall![0].filters.plate).toBeUndefined();
    expect(off.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });
  // Story selection is a positional value comparison, so a hand-built selection that ordered its
  // members by click would never equal a preset's.
  it('emits plate values in the declared order however they were clicked', async () => {
    const view = defaultView();
    view.filters.plate = ['carbon'];
    const onchange = vi.fn();
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'None' }));
    expect(onchange.mock.lastCall![0].filters.plate).toEqual(['none', 'carbon']);
  });
  it('brand list shows counts and toggles', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByLabelText(/Other \(1\)/));
    expect(onchange.mock.lastCall![0].filters.brands).toEqual(['Other']);
  });
  // The one number in the sidebar that promised something it did not keep: it reduced over the
  // whole fleet while every coverage figure beside it used the filtered population.
  it('counts brands over the filtered population, not the whole fleet', () => {
    const view = defaultView();
    view.filters.discontinued = 'only';
    const onlyDiscontinued = FLEET.filter((s) => s.discontinued);
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: onlyDiscontinued } });
    // `oldie` is the only discontinued fixture shoe and its brand is 'Other', not 'Brand'.
    expect(screen.getByLabelText(/Other \(1\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Brand \(0\)/)).toBeInTheDocument();
  });
  // A facet must not filter itself: brands are OR'd, so counting over a population that already
  // had the brand filter applied would read (0) beside every brand a click would actually find.
  it('does not let a ticked brand zero every other brand', () => {
    const view = defaultView();
    view.filters.brands = ['Other'];
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByLabelText(/^Brand \(4\)/)).toBeInTheDocument();
  });
  /**
   * `parseView` keeps `brands` verbatim on purpose — dropping a name the catalogue no longer holds
   * would silently change what a shared link shows. The cost is that the selection has to be
   * *visible*: `?brands=Nonesuch` used to read "1 selected" with none of the listed brands ticked
   * and the word nowhere in the document, so the only recovery was Clear filters, which discards
   * every other filter the link carried (docs/app.md §Filters).
   */
  it('gives a selected brand the catalogue does not hold a row of its own', () => {
    const view = defaultView();
    view.filters.brands = ['Nonesuch'];
    const onchange = vi.fn();
    render(FilterSidebar, { props: { data, view, onchange, population: [] } });
    const row = screen.getByLabelText(/^Nonesuch \(0\)/);
    expect(row).toBeChecked();
    return fireEvent.click(row).then(() => {
      expect(onchange.mock.lastCall![0].filters.brands).toBeUndefined();
    });
  });
  it('never lists a selected brand twice when the catalogue does hold it', () => {
    const view = defaultView();
    view.filters.brands = ['Brand'];
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getAllByLabelText(/^Brand \(/)).toHaveLength(1);
  });
  it('released-after chips set a UTC cut-off, truncated to the month the data can honour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T02:00:00Z'));
    try {
      const onchange = setup();
      await fireEvent.click(sectionNamed('Released after').getByRole('radio', { name: '2y' }));
      expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe(startOfMonth(isoYearsAgo(new Date(), 2)));
      expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe('2024-07-01');
    } finally {
      vi.useRealTimers();
    }
  });
  /*
   * The chips carry the segmented family's selected state now, so each has to SAY which state of
   * the bound it names — `Any` included, because "no bound" is a state of the filter rather than an
   * absence of one (docs/app.md §Released after is month-granular). A fill with no `aria-checked`
   * behind it is the untrue-claim species: visible to one runner and invisible to the next.
   */
  describe('released-after chips mark the bound they name', () => {
    const chips = (container: HTMLElement) => within([...container.querySelectorAll('section')]
      .find((s) => s.querySelector('h3')?.textContent === 'Released after')!)
      .getAllByRole('radio');
    const marked = (container: HTMLElement) => chips(container)
      .filter((c) => c.getAttribute('aria-checked') === 'true').map((c) => c.textContent?.trim());

    it('lights Any when nothing is bound, because that is the state Any names', () => {
      const { container } = render(FilterSidebar,
        { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
      expect(marked(container)).toEqual(['Any']);
    });

    it('lights the chip whose own bound the view holds', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-28T02:00:00Z'));
      try {
        const view = defaultView();
        view.filters.releasedAfter = startOfMonth(isoYearsAgo(new Date(), 2));
        const { container } = render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
        expect(marked(container)).toEqual(['2y']);
      } finally {
        vi.useRealTimers();
      }
    });

    // The month picker can set a bound no chip names, and a group marking nothing is the same shape
    // the toolbar's own take on a hand-edited view (docs/app.md §The toolbar).
    it('marks nothing for a bound the month picker set between them', () => {
      const view = defaultView();
      view.filters.releasedAfter = '2019-04-01';
      const { container } = render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
      expect(marked(container)).toEqual([]);
      expect(chips(container).filter((c) => c.tabIndex === 0), 'still one tab stop').toHaveLength(1);
    });

    /** The reservation's input: without it a chip is sized by whichever weight it is wearing and
     *  the row shuffles as the choice moves along it (docs/app.md §The toolbar). */
    it('gives every chip its own label to reserve the selected width with', () => {
      const { container } = render(FilterSidebar,
        { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
      for (const c of chips(container)) expect(c.dataset['label']).toBe(c.textContent?.trim());
    });
  });

  it('resets every filter at once', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
    // "Clear filters", not "Clear": the toolbar's Clear returns the whole view to its baseline,
    // and two controls side by side meaning different things is the accretion this rework deletes.
    await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    const next = onchange.mock.lastCall![0];
    expect(next.filters.ranges).toEqual({});
    expect(next.columns).toEqual(view.columns);   // filters only: columns and sort are not its business
  });
  // The count is leave-one-out over the whole fleet under the live filter set, so the sidebar has
  // to hand `RangeFilter` a conditioned number rather than anything the row could work out alone.
  it('tells each bounded row what it is costing, and says nothing on the open ones', () => {
    const view = defaultView();
    view.filters.ranges['weight'] = { max: 250 };
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    // trainer and oldie fail the ceiling; mystery has no weight at all and the bound hides it too.
    expect(within(screen.getByRole('group', { name: /^Weight/ })).getByText('3 excluded')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: /^Stack — Heel/ })).queryByText(/excluded/)).toBeNull();
  });
});

// Every cleared control must round-trip back to the default filter state, not to a falsy stand-in:
// an empty string or a `false` would serialise into the URL and stop the view equalling defaultView().
describe('FilterSidebar text and toggle controls', () => {
  it('emits the search term, and undefined once cleared', async () => {
    const onchange = setup();
    const box = screen.getByLabelText('Search');

    await fireEvent.input(box, { target: { value: 'racer' } });
    expect(onchange.mock.lastCall![0].filters.search).toBe('racer');

    await fireEvent.input(box, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.search).toBeUndefined();
    expect(onchange.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });

  /**
   * A stray space is truthy, is a substring of no shoe name, and reaches the URL and storage
   * through the one write path — so it empties the whole fleet and the next visit opens on that
   * empty table with two invisible characters as its only stated cause. Whitespace *around* a real
   * query is kept verbatim, because trimming as it is typed deletes the space between two words.
   */
  it.each(['  ', '\t', ' \n '])('treats a query of only whitespace (%j) as no query', async (value) => {
    const onchange = setup();
    await fireEvent.input(screen.getByLabelText('Search'), { target: { value } });
    expect(onchange.mock.lastCall![0].filters.search).toBeUndefined();
    expect(onchange.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });
  it('keeps a space inside a query, so two words can be typed', async () => {
    const onchange = setup();
    await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'road ' } });
    expect(onchange.mock.lastCall![0].filters.search).toBe('road ');
  });

  /**
   * Not `input type="month"`: Firefox and WebKit implement none of it and reflect the type back as
   * `text`, so the control was a bare box in both and free text reached `startOfMonth`, which
   * turned "July 2024" into the bound "July 20-01" (docs/app.md §Released after is month-granular).
   */
  it('emits the released-after month as the first of that month, from a picker not a month input', async () => {
    const onchange = setup();
    expect(document.querySelector('input[type="month"]')).toBeNull();

    await open(screen.getByRole('button', { name: /Released after/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    await fireEvent.click(screen.getByRole('gridcell', { name: 'March' }));
    // The picker opens on the newest shoe the fleet has, not on today: reading the clock here made
    // this pass only for as long as the fixture's last release year happened to be the current one.
    const newest = Math.max(...FLEET.map((s) => Number(s.releasedAt?.slice(0, 4) ?? 0)));
    expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe(`${newest - 1}-03-01`);
  });

  it('clears the released-after bound from the Any chip, which is the only control that can', async () => {
    const view = defaultView();
    view.filters.releasedAfter = '2024-03-01';
    const onchange = vi.fn();
    const { container } = render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
    // Scoped to the release section rather than taken by index, so that a second control named
    // "Any" arriving in this sidebar cannot silently retarget the click.
    const section = [...container.querySelectorAll('section')]
      .find((s) => s.querySelector('h3')?.textContent === 'Released after')!;
    await fireEvent.click(within(section).getByRole('radio', { name: 'Any' }));
    expect(onchange.mock.lastCall![0].filters.releasedAfter).toBeUndefined();
    expect(onchange.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });

  it('moves the discontinued choice with an arrow key, from a single tab stop', async () => {
    const onchange = setup();
    const radios = within(screen.getByRole('radiogroup', { name: 'Discontinued' })).getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0]!.focus();
    await fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' });
    expect(onchange.mock.lastCall![0].filters.discontinued).toBe('hide');
  });

  it('emits the discontinued choice, and undefined for Any', async () => {
    const onchange = setup();
    expect(sectionNamed('Discontinued').getByRole('radio', { name: 'Any' })).toBeChecked();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only discontinued' }));
    expect(onchange.mock.lastCall![0].filters.discontinued).toBe('only');

    const chosen = defaultView();
    chosen.filters.discontinued = 'hide';
    const off = vi.fn();
    render(FilterSidebar, { props: { data, view: chosen, onchange: off, population: FLEET } });
    expect(screen.getAllByRole('radio', { name: 'Hide discontinued' }).at(-1)!).toBeChecked();
    await fireEvent.click(sectionNamed('Discontinued').getByRole('radio', { name: 'Any' }));
    expect(off.mock.lastCall![0].filters.discontinued).toBeUndefined();
    expect(off.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });
});

/** The section the catalogue's categorical tests describe, wired to the view the sidebar patches. */
describe('the features section', () => {
  const gusseted = shoe({ slug: 'gusseted', values: { '39': 'both-sides-semi' } });
  const plain = shoe({ slug: 'plain', values: { '39': 'none' } });
  const featureFleet = [gusseted, plain];

  const mountFeatures = (view = defaultView()) => {
    const onchange = vi.fn();
    render(FilterSidebar, { props: {
      data: { ...data, shoes: featureFleet }, view, onchange, population: featureFleet,
    } });
    return onchange;
  };

  it('offers a facet row per declared value, counted over the population', () => {
    mountFeatures();
    const features = sectionNamed('Features');
    expect(features.getByLabelText(/Both sides \(semi\) \(1\)/)).toBeInTheDocument();
    expect(features.getByLabelText(/None \(1\)/)).toBeInTheDocument();
  });

  it('ticks a value through to the view', async () => {
    const onchange = mountFeatures();
    await fireEvent.click(sectionNamed('Features').getByLabelText(/Both sides \(semi\)/));
    expect(onchange.mock.lastCall![0].filters.categorical)
      .toEqual({ 'tongue-gusset-type': ['both-sides-semi'] });
  });

  it('deletes the key when the last value goes, so All can light again', async () => {
    const view = defaultView();
    view.filters.categorical = { 'tongue-gusset-type': ['none'] };
    const onchange = mountFeatures(view);
    await fireEvent.click(sectionNamed('Features').getByLabelText(/None \(1\)/));
    const next = onchange.mock.lastCall![0];
    expect(next.filters.categorical).toEqual({});
    expect(sameValue(next, defaultView())).toBe(true);
  });

  it('counts a facet over the population its own selection does not narrow', async () => {
    const view = defaultView();
    view.filters.categorical = { 'tongue-gusset-type': ['both-sides-semi'] };
    mountFeatures(view);
    // A facet that filtered itself would report the unticked value at zero (docs/app.md §Filters).
    expect(sectionNamed('Features').getByLabelText(/None \(1\)/)).toBeInTheDocument();
  });

  it('moves a mounted tri-state with an arrow key, from a single tab stop', async () => {
    const onchange = mountFeatures();
    const radios = within(screen.getByRole('radiogroup', { name: 'Removable insole' })).getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0]!.focus();
    await fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' });
    expect(onchange.mock.lastCall![0].filters.categorical).toEqual({ 'removable-insole': ['true'] });
  });

  it('clears the feature selection with Clear filters', async () => {
    const view = defaultView();
    view.filters.categorical = { 'tongue-gusset-type': ['none'], 'removable-insole': ['true'] };
    const onchange = mountFeatures(view);
    await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onchange.mock.lastCall![0].filters.categorical).toEqual({});
  });

  it('offers no facet for a test whose slug a shoe field owns', () => {
    mountFeatures();
    // The catalogue's `plate` bool: the column is the derived field, and so is the filter.
    expect(sectionNamed('Features').queryByRole('radiogroup', { name: 'Plate' })).toBeNull();
  });
});

const extraTest = labTest({ id: 99, slug: 'stiffness', name: 'Stiffness', units: 'N' });
const dataPlus: ShoesFile = { ...data, tests: [...TESTS, extraTest] };

describe('FilterSidebar filter set management', () => {
  it('offers only what is not already on screen, and adds the chosen one', async () => {
    const onchange = vi.fn();
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view: defaultView(), onchange, population: FLEET } });
    await open(within(container).getByRole('button', { name: 'Add filter' }));
    // curated keys, the option-typed test and both retired generations are all absent. Midsole
    // softness is offered because it is deliberately not curated — redundant with shock absorption,
    // which is a row already (docs/app.md §Filters) — and heel counter is offered because it is a
    // score term that is not a natural search.
    expect(within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.textContent?.trim().split(/\s+/)[0]))
      .toEqual(['Midsole', 'Outsole', 'Heel', 'Stiffness', 'RunRepeat', 'Close']);

    // a row, not a hollow range key: the two are different state, and only the row survives a clear
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Stiffness/ }));
    expect(onchange.mock.lastCall![0].rows).toEqual(['stiffness']);
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(container).getByRole('button', { name: 'Add filter' })).toHaveFocus();
  });

  /**
   * The sidebar is `position: sticky`, and sticky creates a stacking context whatever its z-index —
   * so a modal left inside it can never rise above the pinned chrome or the table's sticky header,
   * however high its own z-index goes (docs/app.md §Stacking order). Escaping to `<body>` is the fix, and
   * this is the cheap guard on it; smoke.spec.ts measures what a browser actually paints.
   */
  it('renders the dialog outside the sidebar, so nothing caps its stacking', async () => {
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    await open(within(container).getByRole('button', { name: 'Add filter' }));
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
  });

  it('renders an already-active non-curated filter and stops offering it', async () => {
    const view = defaultView();
    view.filters.ranges['stiffness'] = { min: 5 };
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view, onchange: vi.fn(), population: FLEET } });
    expect(within(container).getByRole('group', { name: /^Stiffness/ })).toBeInTheDocument();
    await open(within(container).getByRole('button', { name: 'Add filter' }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Stiffness/ })).not.toBeInTheDocument();
  });

  it('renders a listed row that holds no bound at all', () => {
    const view = defaultView();
    view.rows = ['stiffness'];
    render(FilterSidebar, { props: { data: dataPlus, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByRole('group', { name: /^Stiffness/ })).toBeInTheDocument();
  });

  it('preserves sibling filters and leaves the view prop unmutated', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.search = 'racer';
    view.filters.brands = ['Brand'];
    view.filters.ranges['energy-return-heel'] = { max: 80 };
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.input(boundOf(/^Stack — Heel/), { target: { value: '36' } });
    const next = onchange.mock.lastCall![0];
    expect(next.filters).toEqual({
      search: 'racer', brands: ['Brand'], categorical: {},
      ranges: { 'energy-return-heel': { max: 80 }, 'heel-stack': { min: 36 } },
    });
    expect(next).not.toBe(view);
    expect(view.filters.ranges['heel-stack']).toBeUndefined();
  });

  it('clears a hand-added row without removing it', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.rows = ['stiffness'];
    view.filters.ranges['stiffness'] = { min: 5 };
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view, onchange, population: FLEET } });

    await fireEvent.click(within(container).getByRole('button', { name: /^Clear Stiffness/ }));
    const next = onchange.mock.lastCall![0];
    // the key goes, or the view could never equal the baseline again; the row stays, because it is listed
    expect(next.filters.ranges).toEqual({});
    expect(next.rows).toEqual(['stiffness']);
    const after = render(FilterSidebar, { props: { data: dataPlus, view: next, onchange: vi.fn(), population: FLEET } });
    expect(within(after.container).getByRole('group', { name: /^Stiffness/ })).toBeInTheDocument();
  });

  it('removes a hand-added row, its bound and its non-defaultness together', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.rows = ['stiffness'];
    view.filters.ranges['stiffness'] = { min: 5 };
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view, onchange, population: FLEET } });

    await fireEvent.click(within(container).getByRole('button', { name: /^Remove Stiffness/ }));
    const next = onchange.mock.lastCall![0];
    expect(next.rows).toEqual([]);
    expect(next.filters.ranges['stiffness']).toBeUndefined();
    expect(sameValue(next, defaultView())).toBe(true);
  });

  // A row that arrived by link is shown because it is active; clearing it would delete the key and
  // leave it neither active nor listed, so clear would silently mean remove for exactly those rows.
  it('keeps a link-borne row on screen once it is cleared, and offers to remove it', async () => {
    const onchange = vi.fn();
    const view = parseView('r.stiffness=5~', indexTests(dataPlus.tests));
    expect(view.rows).toEqual(['stiffness']);      // seeded at parse time
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view, onchange, population: FLEET } });

    expect(within(container).getByRole('button', { name: /^Remove Stiffness/ })).toBeInTheDocument();
    await fireEvent.click(within(container).getByRole('button', { name: /^Clear Stiffness/ }));
    const next = onchange.mock.lastCall![0];
    expect(next.filters.ranges['stiffness']).toBeUndefined();
    const after = render(FilterSidebar, { props: { data: dataPlus, view: next, onchange: vi.fn(), population: FLEET } });
    expect(within(after.container).getByRole('group', { name: /^Stiffness/ })).toBeInTheDocument();
  });

  it('clears a curated row in one action, and offers no remove', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 36, max: 45 };
    const { container } = render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
    expect(within(container).queryByRole('button', { name: 'Remove Stack — Heel' })).not.toBeInTheDocument();

    await fireEvent.click(within(container).getByRole('button', { name: 'Clear Stack — Heel' }));
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});   // both bounds, one click
    expect(sameValue(onchange.mock.lastCall![0], defaultView())).toBe(true);
  });

  it('unsets released-after from a chip', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.releasedAfter = '2024-01-01';
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
    await fireEvent.click(sectionNamed('Released after').getByRole('radio', { name: 'Any' }));
    expect(onchange.mock.lastCall![0].filters.releasedAfter).toBeUndefined();
    expect(onchange.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });

  it('drops a curated range from state when its bounds are cleared', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.input(boundOf(/^Stack — Heel/), { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
  });
});

describe('FilterSidebar metric entries', () => {
  // The toebox pair rather than midsole softness: these three want a superseded pair that renders
  // on a default view, and softness is deliberately not curated (docs/app.md §Filters).
  it('renders a superseded pair once, as one heading with two generations', () => {
    setup();
    expect(screen.getAllByRole('heading', { name: /^Width \/ Fit/ })).toHaveLength(1);
    const gens = screen.getAllByRole('radio', { name: /Width \/ Fit/ });
    expect(gens).toHaveLength(2);
    expect(gens[0]).toHaveAttribute('aria-checked', 'true'); // current generation by default
  });
  it('gives no two range groups the same accessible name', () => {
    setup();
    const names = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label') ?? g.textContent ?? '');
    expect(new Set(names).size).toBe(names.length);
  });
  it('keeps the price row, and the score row once it is active', () => {
    setup();
    expect(screen.getByRole('group', { name: /Price/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^RunRepeat Score/ })).not.toBeInTheDocument();

    const view = defaultView();
    view.filters.ranges['score'] = { min: 80 };
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByRole('group', { name: /^RunRepeat Score/ })).toBeInTheDocument();
  });
  it('choosing a generation releases the range and column its sibling held', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['toebox-width-widest-part'] = { min: 30 };
    view.columns = ['toebox-width-widest-part', 'score'];
    const { container } = render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.click(within(container).getAllByRole('radio', { name: /Width \/ Fit/ })[1]!);
    const next = onchange.mock.lastCall![0];
    expect(next.generations).toEqual({ 'toebox-width-widest-part': 'toebox-width-at-the-widest-part' });
    // no hollow key left behind to prop the row up: the pair is curated, so it renders regardless
    expect(next.filters.ranges).toEqual({});
    expect(next.columns).toEqual(['score']);
    const after = render(FilterSidebar, { props: { data, view: next, onchange: vi.fn(), population: FLEET } });
    expect(within(after.container).getByRole('group', { name: /Width \/ Fit — previous method/ })).toBeInTheDocument();
  });
  it('moves a hand-added pair\'s row to the generation it switches to', async () => {
    const pairPlus: ShoesFile = { ...data, tests: [
      ...TESTS.filter((t) => t.id !== 70 && t.id !== 11),
      labTest({ id: 11, slug: 'grip', name: 'Grip', updateId: 70 }),
      labTest({ id: 70, slug: 'grip-22', name: 'Grip', previousId: 11 }),
    ] };
    const view = defaultView();
    view.rows = ['grip-22'];
    const onchange = vi.fn();
    const { container } = render(FilterSidebar, { props: { data: pairPlus, view, onchange, population: FLEET } });
    await fireEvent.click(within(container).getAllByRole('radio', { name: /Grip/ })[1]!);
    expect(onchange.mock.lastCall![0].rows).toEqual(['grip']);
  });
  it('shows the chosen generation rather than the current one once it is chosen', () => {
    const view = defaultView();
    view.generations['toebox-width-widest-part'] = 'toebox-width-at-the-widest-part';
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByRole('group', { name: /Width \/ Fit — previous method/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Width \/ Fit — current method/ })).not.toBeInTheDocument();
  });
});

/**
 * The literal expected sequences, written out rather than derived from the exported list — deriving
 * them would assert that a constant equals itself. Every fixed section carries a heading so its
 * position is asserted too, and the group names carry heading *and* zone so no two collide.
 */
/** The direction glyph rides in the heading text, so this list is also the pin on which sidebar
 *  rows claim a better end and which stay neutral, `Outsole durability (mm)↓` being one that does. */
const HEADINGS = [
  'Search', 'Released after', 'Plate', 'Brand', 'Discontinued', 'Features',
  // Each facet in the section carries a heading of its own, one level under it — the bool's
  // tri-state included, which is a radiogroup rather than one of the groups listed below.
  'Gusset', 'Heel tab', 'Removable insole',
  // The run of rows gets a section of its own, or every measurement below reads as a child of
  // Features (docs/app.md §Filters). The word is the Add-filter dialog's own noun for them.
  'Metrics',
  'Price (£)↓', 'Stack', 'Energy return↑', 'Weight (g)↓',
  'Shock absorption↑', 'Outsole durability (mm)↓', 'Midsole width', 'Width / Fit',
];
const GROUPS = [
  'Plate', 'Brand',
  // A `details` is a group, and each facet inside the section is another.
  'Features', 'Gusset', 'Heel tab',
  'Price (£)',
  'Stack — Forefoot', 'Stack — Heel',
  'Energy return — Forefoot', 'Energy return — Heel',
  'Weight (g)',
  'Shock absorption — Forefoot', 'Shock absorption — Heel',
  'Outsole durability (mm)',
  'Midsole width — Forefoot', 'Midsole width — Heel',
  'Width / Fit — current method',
];

/** However the name is given: a facet group takes it from its own visible heading. */
const nameOf = (el: Element) =>
  el.getAttribute('aria-label')
  ?? el.ownerDocument.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent?.trim()
  ?? null;

const orderOf = (container: HTMLElement) => {
  // Every disclosure opened first, because jsdom does not implement the UA rule that hides a closed
  // one's children: left shut, the facets below `Features` would be asserted here while no engine
  // exposes them at all — the blind spot `app/e2e/features.spec.ts` exists for. Open, this sequence
  // is one a browser answers with too.
  for (const d of container.querySelectorAll('details')) d.open = true;
  return {
    headings: within(container).getAllByRole('heading').map((h) => h.textContent),
    groups: within(container).getAllByRole('group').map(nameOf),
  };
};

describe('FilterSidebar order', () => {
  it('renders one fixed order, identical across every zone and story', () => {
    // The cross product is the only place the order can break: a story under forefoot is what would
    // otherwise introduce a row the heel renders did not have.
    for (const zone of ['heel', 'forefoot'] as Zone[]) {
      for (const view of [projectZone(defaultView(), zone), ...PRESETS.map((p) => applyPreset(p.id, zone, false))]) {
        const { container } = render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
        expect(orderOf(container).headings, `${zone} ${JSON.stringify(view.sort)}`).toEqual(HEADINGS);
        expect(orderOf(container).groups, `${zone} ${JSON.stringify(view.sort)}`).toEqual(GROUPS);
      }
    }
  });
  /**
   * The heading is only honest if it scopes the rows and stops there: the foot's two buttons act on
   * the whole surface rather than on the measurements, so a Metrics section that swallowed them
   * would name them too (docs/app.md §Filters).
   */
  it('scopes the metrics heading to the rows, and not to the whole-surface buttons', () => {
    const { container } = render(FilterSidebar, { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    const metrics = [...container.querySelectorAll('section')]
      .find((s) => s.querySelector('h3')?.textContent === 'Metrics')!;
    expect(metrics.querySelectorAll('section.metric'))
      .toHaveLength(container.querySelectorAll('section.metric').length);
    for (const name of ['Add filter', 'Clear filters']) {
      expect(metrics.contains(within(container).getByRole('button', { name })), name).toBe(false);
    }
  });
  it('renders both halves of a zone pair under one heading, forefoot first', () => {
    const { container } = render(FilterSidebar, { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    expect(within(container).getAllByRole('heading', { name: 'Stack' })).toHaveLength(1);
    expect(orderOf(container).groups.filter((n) => n?.startsWith('Stack')))
      .toEqual(['Stack — Forefoot', 'Stack — Heel']);
  });
  // Emphasis replaced the in-use marker: it reports what is filtering, which is a fact about the
  // view, rather than which half a preset selected (docs/app.md §Coverage).
  it('bolds only the half that carries a bound, and neither when none does', () => {
    const bare = render(FilterSidebar, { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    expect(within(bare.container).queryByText(/· in use/)).not.toBeInTheDocument();
    expect(bare.container.querySelectorAll('legend.on')).toHaveLength(0);

    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 30 };
    const bound = render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    const bold = [...bound.container.querySelectorAll('legend.on')].map((n) => n.textContent?.trim());
    expect(bold).toEqual(['Heel']);
  });
});

// The direction marks the metric rows now carry mean nothing without the one line that reads them,
// and this is the surface a runner types a bound on (docs/app.md §Table presentation).
describe('FilterSidebar direction legend', () => {
  it('carries exactly one direction legend, in the same words the two pickers use', () => {
    const { container } = render(FilterSidebar, { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    const legends = [...container.querySelectorAll('.legend')];
    expect(legends).toHaveLength(1);
    expect(legends[0]!.textContent?.replace(/\s+/g, ' ')).toContain('higher is better');
    expect(legends[0]!.textContent?.replace(/\s+/g, ' ')).toContain('lower is better');
    expect(legends[0]!.textContent?.replace(/\s+/g, ' ')).toContain('neutral');
  });
  // It explains the glyphs below it, so it may not open the sidebar above the controls that carry none.
  it('stands at the head of the metric rows, not above the search box', () => {
    const { container } = render(FilterSidebar, { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    const legend = container.querySelector('.legend')!;
    const firstMetric = container.querySelector('section.metric')!;
    expect(legend.compareDocumentPosition(firstMetric) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const search = container.querySelector('.search')!;
    expect(search.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  // The legend renders no heading and no group, so the `HEADINGS` and `GROUPS` order pins are blind
  // to it: a Features section that drifted BELOW the legend satisfies both. The legend's whole
  // placement argument is that everything above it carries no direction mark, so this is the half of
  // "between Discontinued and the legend" those lists cannot state.
  it('stands below the features section, which carries no direction mark either', () => {
    const { container } = render(FilterSidebar, { props: { data, view: defaultView(), onchange: vi.fn(), population: FLEET } });
    const legend = container.querySelector('.legend')!;
    const features = container.querySelector('details[aria-label="Features"]')!;
    expect(features.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
