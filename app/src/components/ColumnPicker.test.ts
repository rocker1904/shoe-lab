import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ColumnPicker from './ColumnPicker.svelte';
import { coverageOf } from '../lib/coverage';
import { indexTests } from '../lib/dataset';
import { metricHelpOf } from '../lib/metric-help';
import { EASY } from '../lib/score-defs';
import { FLEET, TESTS, labTest } from '../lib/test-fixtures';
import type { Shoe } from '../../../shared/types.js';

vi.mock('../lib/coverage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/coverage')>();
  return { ...actual, coverageOf: vi.fn(actual.coverageOf) };
});

const idx = indexTests(TESTS);
const base = {
  tests: TESTS, groups: { '3': 'Cushioning' }, population: FLEET, idx,
  generations: {}, ranges: {}, rows: [],
};
type PickerProps = ComponentProps<typeof ColumnPicker>;

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
};

const press = (target: EventTarget) =>
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

async function renderGuide(overrides: Partial<PickerProps> = {}) {
  const props: PickerProps = { ...base, columns: [], onchange: vi.fn(), ...overrides };
  const rendered = render(ColumnPicker, { props });
  const details = rendered.container.querySelector('details')!;
  const summary = rendered.container.querySelector('summary')!;
  await fireEvent.click(summary);
  await settle();
  expect(details.open).toBe(true);
  await fireEvent.click(screen.getByRole('button', { name: 'Metric guide' }));
  await tick();
  return { ...rendered, details, summary, props };
}

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
    // The label is fixed-width now and the count rides in a badge beside it, so it is no longer a
    // direct text node of the summary and `getNodeText` cannot see the pair as one string.
    const summary = screen.getByText('Columns').closest('summary')!;
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Weight/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Plate' })).not.toBeChecked();
  });
});

describe('ColumnPicker metric entries', () => {
  it('offers a superseded pair once, as its current generation', () => {
    render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    const softness = screen.getAllByRole('checkbox', { name: /Midsole softness/ });
    expect(softness).toHaveLength(1);
    expect(softness[0]).toHaveAccessibleName('Midsole softness (2022 · current)');
  });
  it('offers the retired generation once it is the chosen one', () => {
    render(ColumnPicker, {
      props: { ...base, columns: [], onchange: vi.fn(), generations: { 'midsole-softness-22': 'midsole-softness' } },
    });
    const softness = screen.getAllByRole('checkbox', { name: /Midsole softness/ });
    expect(softness).toHaveLength(1);
    expect(softness[0]).toHaveAccessibleName('Midsole softness (retired method)');
    expect(softness[0]).not.toHaveAccessibleName(/retired method.*retired/i);
  });
  it('offers and unticks the retired generation inferred from its lone column', async () => {
    const onchange = vi.fn();
    render(ColumnPicker, {
      props: { ...base, columns: ['midsole-softness'], onchange },
    });
    const softness = screen.getByRole('checkbox', { name: 'Midsole softness (retired method)' });
    expect(softness).toBeChecked();
    await fireEvent.click(softness);
    expect(onchange).toHaveBeenCalledExactlyOnceWith([]);
  });
  it('appends retirement once to an unpaired numeric offer', () => {
    render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    expect(screen.getByRole('checkbox', { name: 'Outsole hardness (retired)' })).toBeInTheDocument();
  });
  it('appends retirement to a categorical catalogue offer', () => {
    const retiredCategorical = labTest({
      id: 101, slug: 'retired-category', name: 'Retired category', type: 'option', methodStatus: 'retired',
      options: [{ value: 'one', name: 'One' }],
    });
    const tests = [...TESTS, retiredCategorical];
    render(ColumnPicker, { props: {
      ...base, tests, idx: indexTests(tests), columns: [], onchange: vi.fn(),
    } });
    expect(screen.getByRole('checkbox', { name: 'Retired category (retired)' })).toBeInTheDocument();
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
  it('names each uniformly retired colocated part with its own coverage and sole focus stop', async () => {
    const tests = TESTS.map((test) => test.id === 65 || test.id === 66
      ? { ...test, methodStatus: 'retired' as const }
      : test);
    const population: Shoe[] = [
      { ...FLEET[0]!, values: { '65': 70, '66': 55 } },
      { ...FLEET[1]!, values: { '65': 75 } },
    ];
    const { container } = render(ColumnPicker, { props: {
      ...base, tests, population, idx: indexTests(tests), columns: [], onchange: vi.fn(),
    } });
    await fireEvent.click(container.querySelector('summary')!);
    await new Promise((resolve) => setTimeout(resolve));

    const heel = screen.getByRole('checkbox', {
      name: 'Energy return (heel) (retired) 100%',
    });
    const forefoot = screen.getByRole('checkbox', {
      name: 'Energy return forefoot (retired) 50%',
    });
    const focusStops = (checkbox: HTMLElement) => checkbox.closest('label')!
      .querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    expect([...focusStops(heel)]).toEqual([heel]);
    expect([...focusStops(forefoot)]).toEqual([forefoot]);
  });
  // Opened first, because the figures are resolved for an open panel only: each is a full pass over
  // the population, and a closed picker recomputing forty of them on every view update is what made
  // a dragged grip drop frames (docs/app.md §What a drag may recompute).
  it('names each test with its coverage against the population, once opened', async () => {
    const { container } = render(ColumnPicker, { props: { ...base, columns: [], onchange: vi.fn() } });
    expect(screen.getByRole('checkbox', { name: /Heel stack/ })).not.toHaveAccessibleName(/%/);
    await fireEvent.click(container.querySelector('summary')!);
    // jsdom queues the `toggle` event as a task rather than firing it inline, and `bind:open` is
    // what that event feeds.
    await new Promise((resolve) => setTimeout(resolve));
    // four of the five fixture shoes carry a heel-stack reading
    expect(screen.getByRole('checkbox', { name: /Heel stack/ })).toHaveAccessibleName(/80%/);
  });
});

describe('ColumnPicker metric guide', () => {
  it('adds one guide entry without changing checklist rows, then mounts only the guide', async () => {
    const { container } = render(ColumnPicker, {
      props: { ...base, columns: [], onchange: vi.fn() },
    });
    const labels = [...container.querySelectorAll('.list label')];

    expect(screen.getAllByRole('button', { name: 'Metric guide' })).toHaveLength(1);
    for (const label of labels) {
      expect(label.querySelectorAll('input, button, a[href], [tabindex]')).toHaveLength(1);
      expect(label.querySelector('input[type="checkbox"]')).not.toBeNull();
    }

    await fireEvent.click(container.querySelector('summary')!);
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Metric guide' }));
    await tick();
    expect(container.querySelector('.list')).toBeNull();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Metric guide' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search metrics' })).toBeInTheDocument();
  });

  it('derives fixed and grouped guide rows from only offers with registry facts', async () => {
    const future = labTest({ id: 101, slug: 'future-test', name: 'Future test', groupId: '3' });
    const tests = [...TESTS, future];
    const { container } = render(ColumnPicker, {
      props: {
        ...base,
        tests,
        idx: indexTests(tests),
        columns: [],
        onchange: vi.fn(),
      },
    });
    expect(screen.getByRole('checkbox', { name: /Future test/ })).toBeInTheDocument();

    await fireEvent.click(container.querySelector('summary')!);
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Metric guide' }));
    await tick();

    expect(screen.getByRole('button', { name: 'RunRepeat Score' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Price' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release date' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Easy .* score/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tongue gusset' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Future test' })).not.toBeInTheDocument();
    expect([...container.querySelectorAll('.results h4')].map((heading) => heading.textContent))
      .toEqual(['Cushioning', 'Other']);
  });

  it.each([
    {
      source: 'the current default',
      overrides: {} as Partial<PickerProps>,
      key: 'midsole-softness-22',
      label: 'Midsole softness (2022 · current)',
    },
    {
      source: 'the explicit generation choice',
      overrides: { generations: { 'midsole-softness-22': 'midsole-softness' } },
      key: 'midsole-softness',
      label: 'Midsole softness (retired method)',
    },
    {
      source: 'a retired-generation range',
      overrides: { ranges: { 'midsole-softness': { min: 20 } } },
      key: 'midsole-softness',
      label: 'Midsole softness (retired method)',
    },
    {
      source: 'a retired-generation open row',
      overrides: { rows: ['midsole-softness'] },
      key: 'midsole-softness',
      label: 'Midsole softness (retired method)',
    },
    {
      source: 'a retired-generation column',
      overrides: { columns: ['midsole-softness'] },
      key: 'midsole-softness',
      label: 'Midsole softness (retired method)',
    },
  ])('keeps $source label, key and fact together', async ({
    overrides,
    key,
    label,
  }) => {
    const { props } = await renderGuide(overrides);

    await fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText(metricHelpOf(key)!.text)).toBeInTheDocument();
    const other = key === 'midsole-softness' ? '2022 · current' : 'retired method';
    expect(screen.queryByRole('button', { name: new RegExp(other) })).not.toBeInTheDocument();
    expect(props.onchange).not.toHaveBeenCalled();
  });

  it('restores checklist scroll and guide-entry focus on Back without changing columns', async () => {
    const onchange = vi.fn();
    const { container } = render(ColumnPicker, {
      props: { ...base, columns: ['score'], onchange },
    });
    await fireEvent.click(container.querySelector('summary')!);
    await settle();
    const list = container.querySelector<HTMLElement>('.list')!;
    list.scrollTop = 137;
    await fireEvent.click(screen.getByRole('button', { name: 'Metric guide' }));
    await tick();
    expect(container.querySelector('.list')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await tick();

    const restored = container.querySelector<HTMLElement>('.list')!;
    expect(restored.scrollTop).toBe(137);
    expect(screen.getByRole('button', { name: 'Metric guide' })).toHaveFocus();
    expect(screen.getByRole('checkbox', { name: /^RunRepeat Score/ })).toBeChecked();
    expect(onchange).not.toHaveBeenCalled();
  });

  it.each(['summary', 'Escape', 'outside press', 'focus leave'])(
    'resets guide mode after %s dismissal',
    async (way) => {
      const { details, summary } = await renderGuide();
      await fireEvent.input(screen.getByRole('searchbox', { name: 'Search metrics' }), {
        target: { value: 'stack' },
      });

      if (way === 'summary') await fireEvent.click(summary);
      else if (way === 'Escape') await fireEvent.keyDown(details, { key: 'Escape' });
      else if (way === 'outside press') press(document.body);
      else await fireEvent.focusOut(screen.getByRole('heading', { name: 'Metric guide' }), {
        relatedTarget: document.body,
      });
      await settle();
      expect(details.open).toBe(false);

      await fireEvent.click(summary);
      await settle();
      expect(details.open).toBe(true);
      expect(screen.queryByRole('searchbox', { name: 'Search metrics' })).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Heel stack/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Metric guide' })).toBeInTheDocument();
    },
  );

  it('does not resolve or render checklist coverage while the guide is mounted', async () => {
    const coverage = vi.mocked(coverageOf);
    coverage.mockClear();
    const rendered = await renderGuide();
    const callsBeforeGuideUpdate = coverage.mock.calls.length;
    expect(callsBeforeGuideUpdate).toBeGreaterThan(0);
    expect(rendered.container.querySelector('.list')).toBeNull();
    expect(rendered.container.querySelectorAll('.bar, .pct')).toHaveLength(0);

    await rendered.rerender({ ...rendered.props, population: [...FLEET] });
    await tick();
    expect(coverage).toHaveBeenCalledTimes(callsBeforeGuideUpdate);
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

/**
 * A native `<details>` stays open until its own summary is clicked again — no engine dismisses one
 * on an outside press or on Escape — so both are ours, and they are the same two every other
 * floating surface in the app answers
 * (docs/app.md §Every floating panel dismisses the same way).
 */
describe('ColumnPicker dismissal', () => {
  const pointerListeners = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([type]) => type === 'pointerdown').length;
  /**
   * A macrotask, not `tick()`. The browser queues `toggle` as a task rather than firing it
   * synchronously with the summary's activation, and `bind:open` is what listens for it — so a
   * microtask flush lands *between* the element opening and the binding hearing about it, and every
   * assertion below would read a state one event behind the DOM.
   */
  async function setup() {
    const { container, unmount } = render(ColumnPicker, {
      props: { ...base, columns: ['score'], onchange: vi.fn() },
    });
    const details = container.querySelector('details')!;
    const summary = container.querySelector('summary')!;
    // jsdom implements the summary's activation behaviour, so this is the real toggle path.
    await fireEvent.click(summary);
    await settle();
    expect(details.open).toBe(true);
    return { container, details, summary, unmount };
  }

  it('closes on a press outside the picker', async () => {
    const { details } = await setup();
    press(document.body);
    await settle();
    expect(details.open).toBe(false);
  });

  it('stays open for a press inside it, including on a checkbox row', async () => {
    const { details } = await setup();
    press(screen.getByRole('checkbox', { name: /Heel stack/ }));
    press(details.querySelector('.panel')!);
    await settle();
    expect(details.open).toBe(true);
  });

  // The trigger is inside the box the listener guards, so its press is left to the browser's own
  // toggle: closing it here as well would shut and reopen the panel on one click.
  it('still toggles from the summary, without closing and reopening', async () => {
    const { details, summary } = await setup();
    await fireEvent.click(summary);
    await settle();
    expect(details.open).toBe(false);
    await fireEvent.click(summary);
    await settle();
    expect(details.open).toBe(true);
  });

  it('closes on Escape and hands focus back to the summary', async () => {
    const { details, summary } = await setup();
    summary.focus();
    await fireEvent.keyDown(details, { key: 'Escape' });
    await settle();
    expect(details.open).toBe(false);
    expect(summary).toHaveFocus();
  });

  /**
   * The window between the summary's activation and the `toggle` the browser queues after it: the
   * panel is on screen while the binding still reads closed, so a dismissal that assigns only the
   * binding is not a state change and is dropped in silence. Nothing here waits for that task, on
   * purpose — measured in Chromium as an Escape straight after opening doing nothing at all.
   */
  it('closes on an Escape pressed before the toggle event lands', async () => {
    const { container } = render(ColumnPicker, {
      props: { ...base, columns: ['score'], onchange: vi.fn() },
    });
    const details = container.querySelector('details')!;
    await fireEvent.click(container.querySelector('summary')!);
    expect(details.open).toBe(true);
    await fireEvent.keyDown(details, { key: 'Escape' });
    expect(details.open).toBe(false);
  });

  // The listener belongs to the open panel, not to the document: it goes on when the panel opens
  // and comes off when it closes and when the component is destroyed.
  it('holds a document listener only while it is open', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { summary, unmount } = await setup();
    // The BALANCE, not a count: both halves of the policy listen for a press — the outside-press
    // half to dismiss on it, the focus half to stay out of the focus move it causes — so a literal
    // here would make this test a hostage to how many `lib/dismiss.ts` happens to install.
    const perOpen = pointerListeners(add);
    expect(perOpen).toBeGreaterThan(0);
    expect(pointerListeners(remove)).toBe(0);

    await fireEvent.click(summary);
    await settle();
    expect(pointerListeners(remove)).toBe(perOpen);

    await fireEvent.click(summary);
    await settle();
    expect(pointerListeners(add)).toBe(perOpen * 2);
    unmount();
    await settle();
    expect(pointerListeners(remove)).toBe(perOpen * 2);
    add.mockRestore();
    remove.mockRestore();
  });
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
