import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FilterSidebar from './FilterSidebar.svelte';
import { indexTests, isoYearsAgo } from '../lib/dataset';
import { applyPreset, PRESETS } from '../lib/presets';
import { projectSide } from '../lib/side';
import { defaultView, parseView, sameValue } from '../lib/urlstate';
import { FLEET, TESTS, labTest } from '../lib/test-fixtures';
import type { Side } from '../lib/lineage';
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

/** Scoped to its own row: side pairs put several range groups on screen, so an index would drift.
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
  it('released-after chips set a UTC cut-off that does not shift with the time of day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T02:00:00Z'));
    try {
      const onchange = setup();
      await fireEvent.click(screen.getByRole('button', { name: '2y' }));
      expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe(isoYearsAgo(new Date(), 2));
      expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe('2024-07-28');
    } finally {
      vi.useRealTimers();
    }
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

  it('emits the released-after date, and undefined once cleared', async () => {
    const onchange = setup();
    const date = screen.getByLabelText('Released after');

    await fireEvent.input(date, { target: { value: '2024-03-01' } });
    expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe('2024-03-01');

    await fireEvent.input(date, { target: { value: '' } });
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
    expect(screen.getByRole('radio', { name: 'Any' })).toBeChecked();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only discontinued' }));
    expect(onchange.mock.lastCall![0].filters.discontinued).toBe('only');

    const chosen = defaultView();
    chosen.filters.discontinued = 'hide';
    const off = vi.fn();
    render(FilterSidebar, { props: { data, view: chosen, onchange: off, population: FLEET } });
    expect(screen.getAllByRole('radio', { name: 'Hide discontinued' }).at(-1)!).toBeChecked();
    await fireEvent.click(screen.getAllByRole('radio', { name: 'Any' }).at(-1)!);
    expect(off.mock.lastCall![0].filters.discontinued).toBeUndefined();
    expect(off.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });
});

const extraTest = labTest({ id: 99, slug: 'stiffness', name: 'Stiffness', units: 'N' });
const dataPlus: ShoesFile = { ...data, tests: [...TESTS, extraTest] };

describe('FilterSidebar filter set management', () => {
  it('offers only what is not already on screen, and adds the chosen one', async () => {
    const onchange = vi.fn();
    const { container } = render(FilterSidebar, { props: { data: dataPlus, view: defaultView(), onchange, population: FLEET } });
    await open(within(container).getByRole('button', { name: 'Add filter' }));
    // curated keys, the option-typed test and both retired generations are all absent; the two
    // outsole tests and the heel counter are the uncurated metrics the Easy score reads
    expect(within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.textContent?.trim().split(/\s+/)[0]))
      .toEqual(['Outsole', 'Outsole', 'Heel', 'Stiffness', 'RunRepeat', 'Close']);

    // a row, not a hollow range key: the two are different state, and only the row survives a clear
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Stiffness/ }));
    expect(onchange.mock.lastCall![0].rows).toEqual(['stiffness']);
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(container).getByRole('button', { name: 'Add filter' })).toHaveFocus();
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
      search: 'racer', brands: ['Brand'],
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
    await fireEvent.click(screen.getByRole('button', { name: 'Any' }));
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
  it('renders a superseded pair once, as one heading with two generations', () => {
    setup();
    expect(screen.getAllByRole('heading', { name: /^Midsole softness/ })).toHaveLength(1);
    const gens = screen.getAllByRole('radio', { name: /Midsole softness/ });
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
    view.filters.ranges['midsole-softness-22'] = { min: 30 };
    view.columns = ['midsole-softness-22', 'score'];
    const { container } = render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.click(within(container).getAllByRole('radio', { name: /Midsole softness/ })[1]!);
    const next = onchange.mock.lastCall![0];
    expect(next.generations).toEqual({ 'midsole-softness-22': 'midsole-softness' });
    // no hollow key left behind to prop the row up: the pair is curated, so it renders regardless
    expect(next.filters.ranges).toEqual({});
    expect(next.columns).toEqual(['score']);
    const after = render(FilterSidebar, { props: { data, view: next, onchange: vi.fn(), population: FLEET } });
    expect(within(after.container).getByRole('group', { name: /Midsole softness — original/ })).toBeInTheDocument();
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
    view.generations['midsole-softness-22'] = 'midsole-softness';
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByRole('group', { name: /Midsole softness — original/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Midsole softness — 2022 method/ })).not.toBeInTheDocument();
  });
});

/**
 * The literal expected sequences, written out rather than derived from the exported list — deriving
 * them would assert that a constant equals itself. Every fixed section carries a heading so its
 * position is asserted too, and the group names carry heading *and* side so no two collide.
 */
const HEADINGS = [
  'Search', 'Released after', 'Plate', 'Brand', 'Discontinued',
  'Price (£)', 'Stack', 'Energy return', 'Weight (g)', 'Midsole softness',
  'Shock absorption', 'Midsole width', 'Width / Fit',
];
const GROUPS = [
  'Plate', 'Brand',
  'Price (£)',
  'Stack — Forefoot', 'Stack — Heel',
  'Energy return — Forefoot', 'Energy return — Heel',
  'Weight (g)',
  'Midsole softness — 2022 method',
  'Shock absorption — Forefoot', 'Shock absorption — Heel',
  'Midsole width — Forefoot', 'Midsole width — Heel',
  'Width / Fit — current method',
];

const orderOf = (container: HTMLElement) => ({
  headings: within(container).getAllByRole('heading').map((h) => h.textContent),
  groups: within(container).getAllByRole('group').map((g) => g.getAttribute('aria-label')),
});

describe('FilterSidebar order', () => {
  it('renders one fixed order, identical across every strike and story', () => {
    // The cross product is the only place the order can break: a story under forefoot is what would
    // otherwise introduce a row the heel renders did not have.
    for (const strike of ['heel', 'forefoot'] as Side[]) {
      for (const view of [projectSide(defaultView(), strike), ...PRESETS.map((p) => applyPreset(p.id, strike, false))]) {
        const { container } = render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
        expect(orderOf(container).headings, `${strike} ${JSON.stringify(view.sort)}`).toEqual(HEADINGS);
        expect(orderOf(container).groups, `${strike} ${JSON.stringify(view.sort)}`).toEqual(GROUPS);
      }
    }
  });
  it('renders both halves of a side pair under one heading, forefoot first', () => {
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
