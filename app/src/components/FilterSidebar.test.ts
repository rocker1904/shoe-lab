import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FilterSidebar from './FilterSidebar.svelte';
import { defaultView } from '../lib/urlstate';
import { FLEET, TESTS } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';

const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(view = defaultView()) {
  const onchange = vi.fn();
  render(FilterSidebar, { props: { data, view, onchange, hiddenMissing: 0 } });
  return onchange;
}

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
    const min = screen.getAllByLabelText('min')[0]!;
    await fireEvent.input(min, { target: { value: '36' } });
    expect(onchange).toHaveBeenCalled();
    const v = onchange.mock.lastCall![0];
    expect(v.filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('emits plate selection', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'Carbon' }));
    expect(onchange.mock.lastCall![0].filters.plate).toBe('carbon');
  });
  it('brand list shows counts and toggles', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByLabelText(/Other \(1\)/));
    expect(onchange.mock.lastCall![0].filters.brands).toEqual(['Other']);
  });
  it('released-after chips set the date', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByRole('button', { name: '2y' }));
    const after = onchange.mock.lastCall![0].filters.releasedAfter;
    expect(after).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('shows the missing-data note and resets', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange, hiddenMissing: 3 } });
    expect(screen.getByText(/3 shoes have no data for the active filters/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
  });
});

const extraTest = { id: 99, slug: 'stiffness', name: 'Stiffness', type: 'float', units: 'N', groupId: null } as const;
const dataPlus: ShoesFile = { ...data, tests: [...TESTS, extraTest] };

describe('FilterSidebar filter set management', () => {
  it('offers only numeric tests in the Add filter select and adds the chosen one', async () => {
    const onchange = vi.fn();
    render(FilterSidebar, { props: { data: dataPlus, view: defaultView(), onchange, hiddenMissing: 0 } });
    const select = screen.getByLabelText('Add filter');
    // curated keys and the option-typed test are both absent
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Add filter…', 'Stiffness']);

    await fireEvent.change(select, { target: { value: 'stiffness' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({ stiffness: {} });
  });

  it('renders an already-active non-curated filter and stops offering it', () => {
    const view = defaultView();
    view.filters.ranges['stiffness'] = { min: 5 };
    render(FilterSidebar, { props: { data: dataPlus, view, onchange: vi.fn(), hiddenMissing: 0 } });
    expect(screen.getByText(/Stiffness/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Add filter')).not.toBeInTheDocument();
  });

  it('preserves sibling filters and leaves the view prop unmutated', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.search = 'racer';
    view.filters.brands = ['Brand'];
    view.filters.ranges['energy-return-heel'] = { max: 80 };
    render(FilterSidebar, { props: { data, view, onchange, hiddenMissing: 0 } });

    await fireEvent.input(screen.getAllByLabelText('min')[0]!, { target: { value: '36' } });
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
    const view = defaultView();
    view.filters.ranges['stiffness'] = { min: 5 };
    render(FilterSidebar, { props: { data: dataPlus, view, onchange, hiddenMissing: 0 } });

    await fireEvent.input(screen.getAllByLabelText('min').at(-1)!, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({ stiffness: {} });
  });

  it('drops a curated range from state when its bounds are cleared', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange, hiddenMissing: 0 } });

    await fireEvent.input(screen.getAllByLabelText('min')[0]!, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
  });
});
