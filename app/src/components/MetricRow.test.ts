import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MetricRow from './MetricRow.svelte';
import type { Coverage } from '../lib/coverage';
import { metricEntries } from '../lib/lineage';
import { labTest } from '../lib/test-fixtures';

const cov = (fraction: number): Coverage => ({ n: Math.round(fraction * 100), total: 100, fraction });
const flat = (fraction: number) => () => cov(fraction);

const single = metricEntries([labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm' })])[0]!;
const pair = metricEntries([
  labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', updateId: 70 }),
  labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', previousId: 11 }),
])[0]!;
// The pair whose slugs carry no year and whose name and units match on both zones: the label is the
// only thing that can tell the two generations apart.
const yearless = metricEntries([
  labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', updateId: 55 }),
  labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', previousId: 27 }),
])[0]!;
// A declared zone pair: forefoot first, under the declared heading (docs/app.md §Columns and sorting).
const colocated = metricEntries([
  labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', chartLabel: 'Energy return', secondaryTestIds: [66] }),
  labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', primaryTestId: 65 }),
])[0]!;
// Dremel dent depth in mm, so lower is the more durable shoe — the metric the sidebar was silent
// about while the phone header renames it `Outsole wear` for exactly that reason.
const lower = metricEntries([labTest({ id: 4, slug: 'outsole-durability', name: 'Outsole durability', units: 'mm' })])[0]!;

function setup(metric: typeof single, over: {
  chosen?: string; helpKey?: string; coverage?: (k: string) => Coverage; bounded?: (k: string) => boolean;
} = {}) {
  const onchoose = vi.fn();
  const chosen = over.chosen ?? 'heel-stack';
  render(MetricRow, {
    props: {
      metric,
      coverage: over.coverage ?? flat(0.8),
      chosen,
      helpKey: over.helpKey ?? chosen,
      bounded: over.bounded ?? (() => false),
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

describe('MetricRow help', () => {
  it('puts one factual trigger beside a known metric heading', () => {
    setup(single);
    expect(screen.getByRole('button', { name: 'Help for Heel stack' })).toBeInTheDocument();
  });

  it('follows the selected generation and its changed method', async () => {
    setup(pair, { chosen: 'midsole-softness-22' });
    await fireEvent.click(screen.getByRole('button', { name: 'Help for Midsole softness' }));
    expect(screen.getByRole('note')).toHaveTextContent('Asker C');

    cleanup();
    setup(pair, { chosen: 'midsole-softness' });
    await fireEvent.click(screen.getByRole('button', { name: 'Help for Midsole softness' }));
    expect(screen.getByRole('note')).toHaveTextContent('Shore A');
  });

  it('uses one shared trigger for a heel/forefoot family', () => {
    setup(colocated, { chosen: 'energy-return-heel', helpKey: 'energy-return-forefoot' });
    expect(screen.getAllByRole('button', { name: 'Help for Energy return' })).toHaveLength(1);
  });

  it('keeps an unknown future metric visible without reserving help', () => {
    const future = metricEntries([labTest({ id: 999, slug: 'future-test', name: 'Future test' })])[0]!;
    setup(future, { chosen: 'future-test' });
    expect(screen.getByRole('heading', { name: 'Future test' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help for Future test' })).toBeNull();
  });
});

describe('MetricRow pair', () => {
  it('renders one heading and two generation controls, current selected by default', () => {
    setup(pair, { chosen: 'midsole-softness-22' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('data-segmented-control');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios.every((radio) => radio.hasAttribute('data-segment'))).toBe(true);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAccessibleName(/2022 · current/);
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
    expect(screen.getByText('51 / 100 measured')).toBeInTheDocument();
    expect(screen.getByText('83 / 100 measured')).toBeInTheDocument();
  });
});

// The sidebar is where a runner types a bound, and it was the one surface carrying no direction at
// all — while the phone header renamed `Outsole durability` to `Outsole wear` to say the same thing
// (docs/app.md §Table presentation).
describe('MetricRow direction', () => {
  it('marks a lower-is-better metric with the pickers own glyph', () => {
    setup(lower);
    expect(screen.getByRole('heading', { name: /Outsole durability/ }).textContent).toContain('↓');
  });
  it('marks a higher-is-better metric', () => {
    setup(colocated, { chosen: 'energy-return-heel' });
    expect(screen.getByRole('heading').textContent).toContain('↑');
  });
  it('leaves a neutral metric unmarked, so a new upstream test is never mis-marked', () => {
    setup(single);
    expect(screen.getByRole('heading').textContent).not.toMatch(/[↑↓]/);
  });
  // The legend carries the meaning once; restating it per row would make every row twice as long
  // to hear, which is the call the two pickers already made (docs/app.md §Table presentation).
  it('keeps the glyph out of the accessible name', () => {
    setup(lower);
    expect(screen.getByRole('heading', { name: /Outsole durability/ })).toHaveAccessibleName('Outsole durability (mm)');
  });
  // Both halves of a declared pair are read in one test run and share a direction, so the mark
  // belongs to the metric rather than to whichever half is chosen.
  it('takes a pair mark from the chosen generation', () => {
    setup(pair, { chosen: 'midsole-softness-22' });
    expect(screen.getByRole('heading').textContent).not.toMatch(/[↑↓]/);
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
  // The halves are named once, by each RangeFilter's own legend. Naming them here too was the
  // duplication that made a zone pair look like a control it is not (docs/app.md §Coverage).
  it('renders the heading alone — the halves are named by their own range rows', () => {
    setup(colocated, { chosen: 'energy-return-heel' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading')).toHaveAccessibleName(/Energy return/);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Forefoot')).toBeNull();
    expect(screen.queryByText('Heel')).toBeNull();
  });
});


describe('MetricRow coverage is one vocabulary', () => {
  it('never renders a percentage or a bar in any shape', () => {
    for (const metric of [single, pair, colocated]) {
      const { container } = render(MetricRow, {
        props: { metric, coverage: flat(0.8), chosen: 'heel-stack', helpKey: 'heel-stack',
                 bounded: () => false, onchoose: vi.fn() },
      });
      expect(container.textContent).not.toMatch(/\d+%/);
      expect(container.querySelector('.bar')).toBeNull();
      expect(container.querySelector('.rule')).toBeNull();
      cleanup();
    }
  });

  // Both halves of a declared zone pair are measured in the same run, so a figure per half is
  // duplication (docs/app.md §Coverage).
  it('gives a zone pair one coverage figure, not one per half', () => {
    setup(colocated, { coverage: flat(0.84) });
    expect(screen.getAllByText('84 / 100 measured')).toHaveLength(1);
  });

  it('says nothing at all when a zone pair is fully covered', () => {
    setup(colocated, { coverage: flat(1) });
    expect(screen.queryByText(/measured/)).toBeNull();
  });
});

describe('MetricRow marks what is filtering', () => {
  it('does not mark a half as in use — that was the zone, not the filter', () => {
    setup(colocated);
    expect(screen.queryByText(/in use/)).toBeNull();
  });

  it('bolds the heading when any of its rows carries a bound', () => {
    setup(single, { bounded: (k) => k === 'heel-stack' });
    expect(screen.getByRole('heading', { level: 4 })).toHaveClass('on');
  });

  it('leaves the heading unbolded when nothing is bounded', () => {
    setup(single, { bounded: () => false });
    expect(screen.getByRole('heading', { level: 4 })).not.toHaveClass('on');
  });

  it('bolds a zone pair heading when either half is bounded', () => {
    setup(colocated, { bounded: (k) => k === 'energy-return-heel' });
    expect(screen.getByRole('heading', { level: 4 })).toHaveClass('on');
  });

  it('bolds the chosen generation when its row is bounded', () => {
    setup(pair, { chosen: 'midsole-softness-22', bounded: (k) => k === 'midsole-softness-22' });
    expect(screen.getByRole('radio', { checked: true })).toHaveClass('filtering');
  });
});
