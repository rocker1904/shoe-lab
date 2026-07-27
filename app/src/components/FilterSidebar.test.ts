import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FilterSidebar from './FilterSidebar.svelte';
import { isoYearsAgo } from '../lib/dataset';
import { defaultView } from '../lib/urlstate';
import { FLEET, TESTS, labTest } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';

const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(view = defaultView()) {
  const onchange = vi.fn();
  render(FilterSidebar, { props: { data, view, onchange } });
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
  it('released-after chips set the same UTC cut-off the presets use', async () => {
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
    render(FilterSidebar, { props: { data, view, onchange } });
    await fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
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

  it('emits hide-discontinued as true, and undefined once unchecked', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByLabelText('Hide discontinued'));
    expect(onchange.mock.lastCall![0].filters.hideDiscontinued).toBe(true);

    const checked = defaultView();
    checked.filters.hideDiscontinued = true;
    const off = vi.fn();
    render(FilterSidebar, { props: { data, view: checked, onchange: off } });
    await fireEvent.click(screen.getAllByLabelText('Hide discontinued').at(-1)!);
    expect(off.mock.lastCall![0].filters.hideDiscontinued).toBeUndefined();
    expect(off.mock.lastCall![0].filters).toEqual(defaultView().filters);
  });
});

const extraTest = labTest({ id: 99, slug: 'stiffness', name: 'Stiffness', units: 'N' });
const dataPlus: ShoesFile = { ...data, tests: [...TESTS, extraTest] };

describe('FilterSidebar filter set management', () => {
  it('offers only numeric tests in the Add filter select and adds the chosen one', async () => {
    const onchange = vi.fn();
    render(FilterSidebar, { props: { data: dataPlus, view: defaultView(), onchange } });
    const select = screen.getByLabelText('Add filter');
    // curated keys and the option-typed test are both absent
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value')))
      .toEqual(['', 'midsole-softness', 'toebox-width-at-the-widest-part', 'stiffness']);
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toContain('Stiffness');

    await fireEvent.change(select, { target: { value: 'stiffness' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({ stiffness: {} });
  });

  it('renders an already-active non-curated filter and stops offering it', () => {
    const view = defaultView();
    view.filters.ranges['stiffness'] = { min: 5 };
    render(FilterSidebar, { props: { data: dataPlus, view, onchange: vi.fn() } });
    expect(screen.getByText(/Stiffness/)).toBeInTheDocument();
    expect([...screen.getByLabelText('Add filter').querySelectorAll('option')].map((o) => o.getAttribute('value')))
      .not.toContain('stiffness');
  });

  it('preserves sibling filters and leaves the view prop unmutated', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.search = 'racer';
    view.filters.brands = ['Brand'];
    view.filters.ranges['energy-return-heel'] = { max: 80 };
    render(FilterSidebar, { props: { data, view, onchange } });

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
    render(FilterSidebar, { props: { data: dataPlus, view, onchange } });

    await fireEvent.input(screen.getAllByLabelText('min').at(-1)!, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({ stiffness: {} });
  });

  it('drops a curated range from state when its bounds are cleared', async () => {
    const onchange = vi.fn();
    const view = defaultView();
    view.filters.ranges['heel-stack'] = { min: 36 };
    render(FilterSidebar, { props: { data, view, onchange } });

    await fireEvent.input(screen.getAllByLabelText('min')[0]!, { target: { value: '' } });
    expect(onchange.mock.lastCall![0].filters.ranges).toEqual({});
  });
});
