import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Receipt from './Receipt.svelte';

const base = { shown: 38, total: 42, outsideBounds: 3, hiddenMissing: 1, showingMissing: false };

function setup(over: Partial<typeof base> = {}) {
  const onshowmissing = vi.fn();
  render(Receipt, { props: { ...base, ...over, onshowmissing } });
  return onshowmissing;
}

describe('Receipt', () => {
  it('renders all four numbers', () => {
    setup();
    const line = screen.getByTestId('receipt');
    expect(line).toHaveTextContent('38');
    expect(line).toHaveTextContent('42');
    expect(line).toHaveTextContent('3 outside your bounds');
    expect(line).toHaveTextContent('1 shoe has no data for the active filters');
  });
  it('renders even when nothing is hidden, so its absence never needs interpreting', () => {
    setup({ shown: 42, outsideBounds: 0, hiddenMissing: 0 });
    const line = screen.getByTestId('receipt');
    expect(line).toHaveTextContent('0 outside your bounds');
    expect(line).toHaveTextContent('0 shoes have no data for the active filters');
  });
  it('offers the escape only when something is hidden for missing data', async () => {
    setup({ hiddenMissing: 0 });
    expect(screen.queryByRole('button', { name: /show them anyway/i })).not.toBeInTheDocument();

    const onshowmissing = setup({ hiddenMissing: 4 });
    await fireEvent.click(screen.getByRole('button', { name: /show them anyway/i }));
    expect(onshowmissing).toHaveBeenCalled();
  });
  it('pluralises at exactly one', () => {
    setup({ hiddenMissing: 1 });
    expect(screen.getByTestId('receipt')).toHaveTextContent('1 shoe has no data');
    screen.getByTestId('receipt').remove();
    setup({ hiddenMissing: 2 });
    expect(screen.getByTestId('receipt')).toHaveTextContent('2 shoes have no data');
  });
  it('says missing-data shoes are included once they are, and offers the way back', async () => {
    const onshowmissing = setup({ showingMissing: true, hiddenMissing: 0 });
    expect(screen.getByTestId('receipt')).toHaveTextContent(/included/);
    expect(screen.queryByRole('button', { name: /show them anyway/i })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /hide them again/i }));
    expect(onshowmissing).toHaveBeenCalled();
  });
  it('never claims the hidden shoes would otherwise match', () => {
    setup({ hiddenMissing: 7 });
    expect(screen.getByTestId('receipt')).not.toHaveTextContent(/would otherwise/i);
    expect(screen.getByTestId('receipt')).toHaveTextContent('7 shoes have no data for the active filters');
  });
});
