import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MetricRow from './MetricRow.svelte';
import type { Coverage } from '../lib/coverage';
import { metricEntries, type Side } from '../lib/lineage';
import { labTest } from '../lib/test-fixtures';

const cov = (fraction: number): Coverage => ({ n: Math.round(fraction * 100), total: 100, fraction });
const flat = (fraction: number) => () => cov(fraction);

const single = metricEntries([labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm' })])[0]!;
const pair = metricEntries([
  labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', updateId: 70 }),
  labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', previousId: 11 }),
])[0]!;
// The pair whose slugs carry no year and whose name and units match on both sides: the label is the
// only thing that can tell the two generations apart.
const yearless = metricEntries([
  labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', updateId: 55 }),
  labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', previousId: 27 }),
])[0]!;
// A declared side pair: forefoot first, under the declared heading (docs/app.md §Columns and sorting).
const colocated = metricEntries([
  labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', chartLabel: 'Energy return', secondaryTestIds: [66] }),
  labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', primaryTestId: 65 }),
])[0]!;

function setup(metric: typeof single, over: {
  chosen?: string; coverage?: (k: string) => Coverage; strike?: Side;
} = {}) {
  const onchoose = vi.fn();
  render(MetricRow, {
    props: {
      metric,
      coverage: over.coverage ?? flat(0.8),
      chosen: over.chosen ?? 'heel-stack',
      strike: over.strike ?? 'heel',
      onchoose,
    },
  });
  return onchoose;
}

describe('MetricRow single', () => {
  it('renders label and units', () => {
    setup(single, { coverage: flat(0.83) });
    expect(screen.getByRole('heading', { name: /Heel stack/ })).toBeInTheDocument();
    expect(screen.getByText(/mm/)).toBeInTheDocument();
  });
  // "83% of an unstated pool" is the complaint; both numbers on screen state the denominator.
  it('states the pool rather than a bare percentage on a single metric', () => {
    setup(single, { coverage: () => ({ n: 4, total: 5, fraction: 0.8 }) });
    expect(screen.getByText('4 / 5 measured')).toBeInTheDocument();
    expect(screen.queryByText('80%')).toBeNull();
  });
  it('says nothing at all when every shoe has a reading', () => {
    setup(single, { coverage: () => ({ n: 5, total: 5, fraction: 1 }) });
    expect(screen.queryByText(/measured/)).toBeNull();
  });
});

describe('MetricRow pair', () => {
  it('renders one heading and two generation controls, current selected by default', () => {
    setup(pair, { chosen: 'midsole-softness-22' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAccessibleName(/2022 method/);
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });
  it('reports the retired generation when it is chosen', async () => {
    const onchoose = setup(pair, { chosen: 'midsole-softness-22' });
    await fireEvent.click(screen.getAllByRole('radio')[1]!);
    expect(onchoose).toHaveBeenCalledWith('midsole-softness');
  });
  // A column of two radios: Down is the natural key, and only one of them may be a tab stop.
  it('switches generation from the keyboard, as one tab stop', async () => {
    const onchoose = setup(pair, { chosen: 'midsole-softness-22' });
    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0]!.focus();
    await fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' });
    expect(onchoose).toHaveBeenCalledWith('midsole-softness');
  });
  it('gives the two generations different accessible names even when name and units match', () => {
    setup(yearless, { chosen: 'toebox-width-widest-part' });
    const [a, b] = screen.getAllByRole('radio');
    const names = [a!.getAttribute('aria-label'), b!.getAttribute('aria-label')];
    expect(names[0]).toBeTruthy();
    expect(names[1]).toBeTruthy();
    expect(names[0]).not.toBe(names[1]);
  });
  // Two or more numbers per section have nowhere to go on a single heading line, so a pair keeps
  // a figure per generation and a colocated metric one per part.
  it('shows each generation its own coverage', () => {
    setup(pair, {
      chosen: 'midsole-softness-22',
      coverage: (k) => cov(k === 'midsole-softness-22' ? 0.51 : 0.83),
    });
    expect(screen.getByText('51%')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
  });
});

describe('MetricRow warnings', () => {
  // The classifier behind it was wrong: coverage is era-shaped, so a retired metric with years of
  // near-total readings was labelled "rarely run" (docs/app.md §Coverage).
  it('no longer warns about sparse metrics', () => {
    setup(single, { coverage: flat(0.2) });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/rarely run|method is new/)).toBeNull();
  });
});

describe('MetricRow colocated', () => {
  // Coverage rows, not controls: every part renders always, so a button here could only ever write
  // an empty range key — invisible in the sidebar, and enough to collapse the entry band.
  it('renders one heading and both halves as coverage rows, forefoot first', () => {
    setup(colocated, { chosen: 'energy-return-heel', strike: 'heel' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading')).toHaveAccessibleName(/Energy return/);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Forefoot')).toBeInTheDocument();
    expect(screen.getByText('Heel · in use')).toBeInTheDocument();
  });
  it('moves the in-use marker with the strike, without hiding the other half', () => {
    setup(colocated, { chosen: 'energy-return-heel', strike: 'forefoot' });
    expect(screen.getByText('Forefoot · in use')).toBeInTheDocument();
    expect(screen.getByText('Heel')).toBeInTheDocument();
  });
});
