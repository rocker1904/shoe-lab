import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FilterSidebar from './FilterSidebar.svelte';
import { isoYearsAgo } from '../lib/dataset';
import { defaultView } from '../lib/urlstate';
import { FLEET, TESTS, labTest } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';

const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(view = defaultView('heel')) {
  const onchange = vi.fn();
  render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
  return onchange;
}

/** Scoped to its own row: side pairs put several range groups on screen, so an index would drift. */
const boundOf = (name: RegExp, part: 'min' | 'max' = 'min') =>
  within(screen.getAllByRole('group', { name }).at(-1)!).getByLabelText(part);

describe('FilterSidebar', () => {
  it('renders curated range filters that exist in the dataset', () => {
    setup();
    // regex matchers: legends render with units, e.g. "Heel stack (mm)"
    expect(screen.getByText(/Heel stack/)).toBeInTheDocument();
    expect(screen.getByText(/^Weight/)).toBeInTheDocument();
    expect(screen.queryByText(/Tongue gusset/)).not.toBeInTheDocument(); // option type: no slider
  });
  it('emits updated view when a range min changes', async () => {
    const onchange = setup();
    await fireEvent.input(boundOf(/^Heel stack/), { target: { value: '36' } });
    expect(onchange).toHaveBeenCalled();
    const v = onchange.mock.lastCall![0];
    expect(v.filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('emits plate selection as a set, and undefined once emptied', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    expect(onchange.mock.lastCall![0].filters.plate).toEqual(['carbon']);

    const view = defaultView('heel');
    view.filters.plate = ['carbon'];
    const off = vi.fn();
    render(FilterSidebar, { props: { data, view, onchange: off, population: FLEET } });
    await fireEvent.click(screen.getAllByRole('checkbox', { name: 'Carbon' }).at(-1)!);
    expect(off.mock.lastCall![0].filters.plate).toBeUndefined();
    expect(off.mock.lastCall![0].filters).toEqual(defaultView('heel').filters);
  });
  // Story selection is a positional value comparison, so a hand-built selection that ordered its
  // members by click would never equal a preset's.
  it('emits plate values in the declared order however they were clicked', async () => {
    const view = defaultView('heel');
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
    const view = defaultView('heel');
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });
    await fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
  });
});

// Every cleared control must round-trip back to the default filter state, not to a falsy stand-in:
// an empty string or a `false` would serialise into the URL and stop the view equalling defaultView('heel').
describe('FilterSidebar text and toggle controls', () => {
  it('emits the search term, and undefined once cleared', async () => {
    const onchange = setup();
    const box = screen.getByLabelText('Search');

    await fireEvent.input(box, { target: { value: 'racer' } });
    expect(onchange.mock.lastCall![0].filters.search).toBe('racer');

    await fireEvent.input(box, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.search).toBeUndefined();
    expect(onchange.mock.lastCall![0].filters).toEqual(defaultView('heel').filters);
  });

  it('emits the released-after date, and undefined once cleared', async () => {
    const onchange = setup();
    const date = screen.getByLabelText('Released after');

    await fireEvent.input(date, { target: { value: '2024-03-01' } });
    expect(onchange.mock.lastCall![0].filters.releasedAfter).toBe('2024-03-01');

    await fireEvent.input(date, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.releasedAfter).toBeUndefined();
    expect(onchange.mock.lastCall![0].filters).toEqual(defaultView('heel').filters);
  });

  it('emits the discontinued choice, and undefined for Any', async () => {
    const onchange = setup();
    expect(screen.getByRole('radio', { name: 'Any' })).toBeChecked();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only discontinued' }));
    expect(onchange.mock.lastCall![0].filters.discontinued).toBe('only');

    const chosen = defaultView('heel');
    chosen.filters.discontinued = 'hide';
    const off = vi.fn();
    render(FilterSidebar, { props: { data, view: chosen, onchange: off, population: FLEET } });
    expect(screen.getAllByRole('radio', { name: 'Hide discontinued' }).at(-1)!).toBeChecked();
    await fireEvent.click(screen.getAllByRole('radio', { name: 'Any' }).at(-1)!);
    expect(off.mock.lastCall![0].filters.discontinued).toBeUndefined();
    expect(off.mock.lastCall![0].filters).toEqual(defaultView('heel').filters);
  });
});

const extraTest = labTest({ id: 99, slug: 'stiffness', name: 'Stiffness', units: 'N' });
const dataPlus: ShoesFile = { ...data, tests: [...TESTS, extraTest] };

describe('FilterSidebar filter set management', () => {
  it('offers only numeric tests in the Add filter select and adds the chosen one', async () => {
    const onchange = vi.fn();
    render(FilterSidebar, { props: { data: dataPlus, view: defaultView('heel'), onchange, population: FLEET } });
    const select = screen.getByLabelText('Add filter');
    // curated keys, the option-typed test and both retired generations are all absent
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value')))
      .toEqual(['', 'energy-return-forefoot', 'stiffness', 'score']);

    await fireEvent.change(select, { target: { value: 'stiffness' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({ stiffness: {} });
  });

  it('renders an already-active non-curated filter and stops offering it', () => {
    const view = defaultView('heel');
    view.filters.ranges['stiffness'] = { min: 5 };
    render(FilterSidebar, { props: { data: dataPlus, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByText(/Stiffness/)).toBeInTheDocument();
    expect([...screen.getByLabelText('Add filter').querySelectorAll('option')].map((o) => o.getAttribute('value')))
      .not.toContain('stiffness');
  });

  it('preserves sibling filters and leaves the view prop unmutated', async () => {
    const onchange = vi.fn();
    const view = defaultView('heel');
    view.filters.search = 'racer';
    view.filters.brands = ['Brand'];
    view.filters.ranges['energy-return-heel'] = { max: 80 };
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.input(boundOf(/^Heel stack/), { target: { value: '36' } });
    const next = onchange.mock.lastCall![0];
    expect(next.filters).toEqual({
      search: 'racer', brands: ['Brand'],
      ranges: { 'energy-return-heel': { max: 80 }, 'heel-stack': { min: 36 } },
    });
    expect(next).not.toBe(view);
    expect(view.filters.ranges['heel-stack']).toBeUndefined();
  });

  it('keeps a cleared non-curated filter so its row survives editing', async () => {
    const onchange = vi.fn();
    const view = defaultView('heel');
    view.filters.ranges['stiffness'] = { min: 5 };
    render(FilterSidebar, { props: { data: dataPlus, view, onchange, population: FLEET } });

    await fireEvent.input(boundOf(/^Stiffness/), { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({ stiffness: {} });
  });

  it('drops a curated range from state when its bounds are cleared', async () => {
    const onchange = vi.fn();
    const view = defaultView('heel');
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.input(boundOf(/^Heel stack/), { target: { value: '' } });
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
    expect(screen.queryByRole('group', { name: /^Score/ })).not.toBeInTheDocument();

    const view = defaultView('heel');
    view.filters.ranges['score'] = { min: 80 };
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByRole('group', { name: /^Score/ })).toBeInTheDocument();
  });
  it('choosing a generation releases the range and column its sibling held', async () => {
    const onchange = vi.fn();
    const view = defaultView('heel');
    view.filters.ranges['midsole-softness-22'] = { min: 30 };
    view.columns = ['midsole-softness-22', 'score'];
    render(FilterSidebar, { props: { data, view, onchange, population: FLEET } });

    await fireEvent.click(screen.getAllByRole('radio', { name: /Midsole softness/ })[1]!);
    const next = onchange.mock.lastCall![0];
    expect(next.generations).toEqual({ 'midsole-softness-22': 'midsole-softness' });
    expect(next.filters.ranges['midsole-softness-22']).toBeUndefined();
    expect(next.columns).toEqual(['score']);
    // the entry keeps a row so the pair does not vanish from the sidebar mid-switch
    expect(next.filters.ranges['midsole-softness']).toEqual({});
  });
  it('shows the chosen generation rather than the current one once it is chosen', () => {
    const view = defaultView('heel');
    view.generations['midsole-softness-22'] = 'midsole-softness';
    render(FilterSidebar, { props: { data, view, onchange: vi.fn(), population: FLEET } });
    expect(screen.getByRole('group', { name: /Midsole softness — original/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Midsole softness — 2022 method/ })).not.toBeInTheDocument();
  });
});
