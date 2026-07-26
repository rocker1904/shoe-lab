import { render } from '@testing-library/svelte';
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
