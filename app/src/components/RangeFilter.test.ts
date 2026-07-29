import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import RangeFilter from './RangeFilter.svelte';

const props = { label: 'Heel stack', units: 'mm', values: [30, 35, 39, 40], onchange: vi.fn() };
/** Categorical the way price really is — five values holding half the fleet, one outlier at each
 *  end — so snapping has meaningful detents to land on (docs/app.md §Filters). */
const PRICES = [
  60, 100, 120, 130,
  140, 140, 140, 140, 150, 150, 150, 160, 160, 160, 170, 170, 180, 180,
  200, 220, 250, 500,
];

const bins = (root: Element) => [...root.querySelectorAll('rect.bin')].map((r) => r.getAttribute('fill'));
const handle = (root: Element, side: 'min' | 'max') => root.querySelector<HTMLElement>(`.handle.${side}`)!;

/** jsdom has no layout, so the plot has to be told how wide it is before any drag maths can run. */
function widen(plot: Element, width = 200): void {
  vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({ left: 0, width, right: width,
    top: 0, bottom: 24, height: 24, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
}
const at = (type: string, clientX: number) => new MouseEvent(type, { clientX, bubbles: true });

it('highlights only the histogram bars inside the bound', () => {
  const { container } = render(RangeFilter, { props: { ...props, bound: { min: 38 } } });
  const fills = bins(container);
  expect(fills[0]).toBe('var(--hist-dim)');
  expect(fills.at(-1)).toBe('var(--accent)');
});

it('highlights every bar when the bound is open', () => {
  const { container } = render(RangeFilter, { props: { ...props, bound: {} } });
  expect(new Set(bins(container))).toEqual(new Set(['var(--accent)']));
});

it('renders bounds without a histogram when the data cannot form one', () => {
  const { container, getByLabelText } = render(RangeFilter, { props: { ...props, values: [], bound: {} } });
  expect(container.querySelector('svg')).toBeNull();
  expect(getByLabelText('min')).toHaveAttribute('placeholder', 'min');
});

it('trims the drawn axis and hatches what fell outside it', () => {
  // One cheap outlier, one dear one, ninety-eight bunched in between: both ends fall outside
  // p2–p98 and owe an overflow bin rather than a silent drop.
  const values = [40, ...Array.from({ length: 98 }, (_, i) => 140 + (i % 7) * 10), 600];
  const { container } = render(RangeFilter, { props: { ...props, values, bound: {} } });
  expect(container.querySelectorAll('rect.overflow')).toHaveLength(2);
  // A grip at each extreme still draws inside the plot, not over its hatching.
  expect(parseFloat(handle(container, 'min').style.left)).toBeGreaterThan(0);
  expect(parseFloat(handle(container, 'max').style.left)).toBeLessThan(100);
});

it('is not a tab stop, because the number fields are the keyboard path', () => {
  const { container } = render(RangeFilter, { props: { ...props, values: PRICES, bound: {} } });
  expect(container.querySelector<HTMLElement>('.plot')).not.toHaveAttribute('tabindex');
  // Only the single overflow bin PRICES earns: 60 is inside p2, 500 is not inside p98.
  expect(container.querySelectorAll('rect.overflow')).toHaveLength(1);
});

it('keeps a typed value that lies outside the axis, and clamps only where it is drawn', async () => {
  const onchange = vi.fn();
  const typed = render(RangeFilter, { props: { ...props, values: PRICES, bound: {}, onchange } });
  await fireEvent.input(typed.getByLabelText('min'), { target: { value: '400' } });
  expect(onchange).toHaveBeenLastCalledWith(expect.objectContaining({ min: 400 }));
  cleanup();

  // 400 is past p98, so its grip draws exactly where an unbounded maximum draws: the axis end.
  const { container } = render(RangeFilter, { props: { ...props, values: PRICES, bound: { min: 400 } } });
  expect(handle(container, 'min').style.left).toBe(handle(container, 'max').style.left);
});

it('snaps a dragged bound to a value that exists rather than a round number', async () => {
  const onchange = vi.fn();
  const { container } = render(RangeFilter, { props: { ...props, values: PRICES, bound: {}, onchange } });
  const plot = container.querySelector('.plot')!;
  widen(plot);

  await fireEvent(plot, at('pointerdown', 200));            // the max grip, at the right edge
  await fireEvent(window, at('pointermove', 100));
  await fireEvent(window, at('pointerup', 100));

  const dropped = onchange.mock.lastCall![0].max;
  expect(PRICES).toContain(dropped);
});

it('reads a grip left at its extreme as no bound on that side', async () => {
  const onchange = vi.fn();
  const { container } = render(RangeFilter, { props: { ...props, values: PRICES, bound: { max: 150 }, onchange } });
  const plot = container.querySelector('.plot')!;
  widen(plot);

  await fireEvent(plot, at('pointerdown', handleX(container, 'max')));
  await fireEvent(window, at('pointermove', 200));
  await fireEvent(window, at('pointerup', 200));

  expect(onchange.mock.lastCall![0].max).toBeUndefined();
});

it('grabs neither grip from the middle of an unbounded plot', async () => {
  const onchange = vi.fn();
  const { container } = render(RangeFilter, { props: { ...props, values: PRICES, bound: {}, onchange } });
  const plot = container.querySelector('.plot')!;
  widen(plot);
  await fireEvent(plot, at('pointerdown', 100));
  await fireEvent(window, at('pointermove', 120));
  expect(onchange).not.toHaveBeenCalled();
});

it('empties both bounds in one action, and names the clear control after its row', async () => {
  const onchange = vi.fn();
  const { getByRole } = render(RangeFilter, {
    props: { ...props, onchange, name: 'Stack — Heel', bound: { min: 36, max: 45 } },
  });
  const clear = getByRole('button', { name: 'Clear Stack — Heel' });
  // An icon, because ten of these rows spelling out "Clear" is most of the sidebar's width; the
  // accessible name still says which row it belongs to (docs/app.md §Filters).
  expect(clear.textContent?.trim()).toBe('✕');
  await fireEvent.click(clear);
  expect(onchange).toHaveBeenCalledExactlyOnceWith({});
});

it('renders a zero on a bounded row but nothing on an unbounded one', () => {
  // `0 excluded` shows, because "this bound is doing no work" is worth knowing and its absence
  // would be indistinguishable from the unbounded case (docs/app.md §Filters).
  const bounded = render(RangeFilter, { props: { ...props, bound: { max: 100000 }, excluded: 0 } });
  expect(bounded.getByText('0 excluded')).toBeInTheDocument();
  cleanup();
  const open = render(RangeFilter, { props: { ...props, bound: {}, excluded: undefined } });
  expect(open.queryByText(/excluded/)).not.toBeInTheDocument();
});

it('offers nothing to clear on an empty bound, and remove only when it can be removed', () => {
  const empty = render(RangeFilter, { props: { ...props, name: 'Stack — Heel', bound: {} } });
  expect(empty.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument();

  const removable = render(RangeFilter, {
    props: { ...props, name: 'Stiffness', bound: {}, onremove: vi.fn() },
  });
  expect(removable.getByRole('button', { name: 'Remove Stiffness' })).toBeInTheDocument();
});

/** The grip's own pixel position, so a drag starts on it rather than near it. */
function handleX(root: Element, side: 'min' | 'max', width = 200): number {
  return (parseFloat(handle(root, side).style.left) / 100) * width;
}
