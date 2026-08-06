import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
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
  const press = (target: EventTarget) =>
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  const pointerListeners = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([type]) => type === 'pointerdown').length;
  /**
   * A macrotask, not `tick()`. The browser queues `toggle` as a task rather than firing it
   * synchronously with the summary's activation, and `bind:open` is what listens for it — so a
   * microtask flush lands *between* the element opening and the binding hearing about it, and every
   * assertion below would read a state one event behind the DOM.
   */
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await tick();
  };

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
