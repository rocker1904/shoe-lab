import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ColumnPicker from './ColumnPicker.svelte';
import { indexTests } from '../lib/dataset';
import { EASY } from '../lib/score-defs';
import { FLEET, TESTS, labTest } from '../lib/test-fixtures';

const idx = indexTests(TESTS);
const base = { tests: TESTS, groups: { '3': 'Cushioning' }, population: FLEET, idx, generations: {} };

describe('ColumnPicker', () => {
  it('toggles columns on and off via checkboxes', async () => {
    const onchange = vi.fn();
    render(ColumnPicker, { props: { ...base, columns: ['score'], onchange } });
    await fireEvent.click(screen.getByRole('checkbox', { name: /Heel stack/ }));
    expect(onchange).toHaveBeenLastCalledWith(['score', 'heel-stack']);
    await fireEvent.click(screen.getByRole('checkbox', { name: /^RunRepeat Score/ }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });
  it('groups numeric tests and offers categorical ones alongside them', () => {
    render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    expect(screen.getByText('Cushioning')).toBeInTheDocument();
    // Choosable as a column, though never rangeable (docs/app.md §Categorical columns).
    expect(screen.getByRole('checkbox', { name: /Tongue gusset/ })).toBeInTheDocument();
  });
  // The catalogue's `plate` test and the shoe field name one column, and the field already has a
  // fixed offer, so the categorical pass must not add a second.
  it('offers plate once, from the fixed fields rather than the catalogue', () => {
    render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    expect(screen.getAllByRole('checkbox', { name: /Plate/ })).toHaveLength(1);
  });
  it('files ungrouped numeric tests under Other and reflects the selected count', () => {
    render(ColumnPicker, { props: { ...base, columns: ['score', 'weight'], onchange: vi.fn() } });
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText(/Columns \(2\)/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Weight/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Plate' })).not.toBeChecked();
  });
});

describe('ColumnPicker metric entries', () => {
  it('offers a superseded pair once, as its current generation', () => {
    render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    const softness = screen.getAllByRole('checkbox', { name: /Midsole softness/ });
    expect(softness).toHaveLength(1);
    expect(softness[0]).toHaveAccessibleName(/2022 method/);
  });
  it('offers the retired generation once it is the chosen one', () => {
    render(ColumnPicker, {
      props: { ...base, columns: [], onchange: vi.fn(), generations: { 'midsole-softness-22': 'midsole-softness' } },
    });
    const softness = screen.getAllByRole('checkbox', { name: /Midsole softness/ });
    expect(softness).toHaveLength(1);
    expect(softness[0]).toHaveAccessibleName(/original/);
  });
  it('files a colocated half under its primary group and keeps it separately selectable', async () => {
    const tests = [
      // the fixture's #65 gains the forefoot half it has in the real catalogue
      ...TESTS.map((t) => (t.id === 65 ? { ...t, chartLabel: 'Energy return', secondaryTestIds: [66] } : t)),
      labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', groupId: null, primaryTestId: 65 }),
    ];
    const onchange = vi.fn();
    render(ColumnPicker, { props: { ...base, tests, idx: indexTests(tests), columns: [], onchange } });
    const cushioning = screen.getByText('Cushioning').parentElement!;
    expect(cushioning.textContent).toContain('Energy return forefoot');
    await fireEvent.click(screen.getByRole('checkbox', { name: /Energy return forefoot/ }));
    expect(onchange).toHaveBeenLastCalledWith(['energy-return-forefoot']);
  });
  it('names each test with its coverage against the population', () => {
    render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    // four of the five fixture shoes carry a heel-stack reading
    expect(screen.getByRole('checkbox', { name: /Heel stack/ })).toHaveAccessibleName(/80%/);
  });
});

describe('ColumnPicker and the Easy score', () => {
  it('offers a tickable score column per zone, each naming its own', () => {
    render(ColumnPicker, { props: { ...base, columns: [EASY.keys.heel], onchange: vi.fn() } });
    expect(screen.getByRole('checkbox', { name: /easy heel score/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /easy forefoot score/i })).not.toBeChecked();
  });
});

it('states what the direction marks mean, once, above the list', () => {
  render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
  expect(screen.getByText(/higher is better/)).toBeInTheDocument();
  expect(screen.getByText(/lower is better/)).toBeInTheDocument();
});

it('marks direction on the fixed columns too, where price lives', () => {
  // `msrpGbp` and `score` are shoe fields rendered by their own loop rather than by `grouped`, and
  // price is the column whose better end a runner most wants stated (docs/app.md §Table presentation).
  const { container } = render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
  const dirs = [...container.querySelectorAll('label')]
    .filter((l) => /Price/.test(l.textContent ?? ''))
    .map((l) => l.querySelector('.dir')?.textContent);
  expect(dirs).toEqual(['↓']);
});
