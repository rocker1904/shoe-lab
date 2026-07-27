import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MetricRow from './MetricRow.svelte';
import type { Coverage } from '../lib/coverage';
import { metricEntries } from '../lib/lineage';
import { labTest } from '../lib/test-fixtures';

const cov = (fraction: number): Coverage => ({ n: Math.round(fraction * 100), total: 100, fraction });
const flat = (fraction: number) => () => cov(fraction);
const undated = () => null;

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
const colocated = metricEntries([
  labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', chartLabel: 'Energy return', secondaryTestIds: [66] }),
  labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', primaryTestId: 65 }),
])[0]!;

function setup(metric: typeof single, over: { chosen?: string; coverage?: (k: string) => Coverage; oldest?: (k: string) => string | null } = {}) {
  const onchoose = vi.fn();
  render(MetricRow, {
    props: {
      metric,
      coverage: over.coverage ?? flat(0.8),
      oldest: over.oldest ?? undated,
      chosen: over.chosen ?? 'heel-stack',
      onchoose,
    },
  });
  return onchoose;
}

describe('MetricRow single', () => {
  it('renders label, units and coverage percentage', () => {
    setup(single, { coverage: flat(0.83) });
    expect(screen.getByRole('heading', { name: /Heel stack/ })).toBeInTheDocument();
    expect(screen.getByText(/mm/)).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
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
  it('gives the two generations different accessible names even when name and units match', () => {
    setup(yearless, { chosen: 'toebox-width-widest-part' });
    const [a, b] = screen.getAllByRole('radio');
    const names = [a!.getAttribute('aria-label'), b!.getAttribute('aria-label')];
    expect(names[0]).toBeTruthy();
    expect(names[1]).toBeTruthy();
    expect(names[0]).not.toBe(names[1]);
  });
  it('shows each generation its own coverage', () => {
    setup(pair, {
      chosen: 'midsole-softness-22',
      coverage: (k) => cov(k === 'midsole-softness-22' ? 0.51 : 0.83),
    });
    expect(screen.getByText('51%')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
  });
});

describe('MetricRow sparse warning', () => {
  it('warns below the threshold and stays quiet at or above it', () => {
    setup(single, { coverage: flat(0.49) });
    expect(screen.getByRole('status')).toBeInTheDocument();
    screen.getByRole('status').remove();

    setup(single, { coverage: flat(0.5) });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('names a new method as the cause when the readings are shallow', () => {
    const recent = new Date();
    recent.setUTCFullYear(recent.getUTCFullYear() - 1);
    setup(single, { coverage: flat(0.2), oldest: () => recent.toISOString().slice(0, 10) });
    expect(screen.getByRole('status')).toHaveTextContent(/new/i);
  });
  it('does not blame novelty when the method has been running for years', () => {
    setup(single, { coverage: flat(0.2), oldest: () => '2017-11-01' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/20%/);
    expect(status).not.toHaveTextContent(/new/i);
  });
  it('warns about the chosen generation, not the other one', () => {
    setup(pair, {
      chosen: 'midsole-softness',
      coverage: (k) => cov(k === 'midsole-softness' ? 0.83 : 0.09),
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('MetricRow colocated', () => {
  it('renders one heading and each part as its own control', () => {
    const onchoose = setup(colocated, { chosen: 'energy-return-heel' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading')).toHaveAccessibleName(/Energy return/);
    const parts = screen.getAllByRole('button');
    expect(parts.map((b) => b.getAttribute('aria-label')))
      .toEqual(['Energy return, Energy return heel', 'Energy return, Energy return forefoot']);
    return fireEvent.click(parts[1]!).then(() => {
      expect(onchoose).toHaveBeenCalledWith('energy-return-forefoot');
    });
  });
});
