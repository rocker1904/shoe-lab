import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import RangeFilter from './RangeFilter.svelte';
import { histogram } from '../lib/stats';

const hist = histogram([30, 35, 39, 40]);
const props = { label: 'Heel stack', units: 'mm', hist, onchange: vi.fn() };

it('highlights only the histogram bars inside the bound', () => {
  const { container } = render(RangeFilter, { props: { ...props, bound: { min: 38 } } });
  const fills = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
  expect(fills[0]).toBe('var(--hist-dim)');
  expect(fills.at(-1)).toBe('var(--accent)');
});

it('highlights every bar when the bound is open', () => {
  const { container } = render(RangeFilter, { props: { ...props, bound: {} } });
  const fills = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
  expect(new Set(fills)).toEqual(new Set(['var(--accent)']));
});

it('renders bounds without a histogram when the data cannot form one', () => {
  const { container, getByLabelText } = render(RangeFilter, { props: { ...props, hist: null, bound: {} } });
  expect(container.querySelector('svg')).toBeNull();
  expect(getByLabelText('min')).toHaveAttribute('placeholder', 'min');
});

it('empties both bounds in one action, and names the clear control after its row', async () => {
  const onchange = vi.fn();
  const { getByRole } = render(RangeFilter, {
    props: { ...props, onchange, name: 'Stack — Heel', bound: { min: 36, max: 45 } },
  });
  const clear = getByRole('button', { name: 'Clear Stack — Heel' });
  // An icon, because ten of these rows spelling out "Clear" is most of the sidebar's width; the
  // accessible name still says which row it belongs to (docs/app.md §Filters).
  expect(clear.textContent?.trim()).toBe('\u2715');
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
