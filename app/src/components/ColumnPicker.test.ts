import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ColumnPicker from './ColumnPicker.svelte';
import { TESTS } from '../lib/test-fixtures';

describe('ColumnPicker', () => {
  it('toggles columns on and off via checkboxes', async () => {
    const onchange = vi.fn();
    render(ColumnPicker, { props: { tests: TESTS, groups: { '3': 'Cushioning' }, columns: ['score'], onchange } });
    await fireEvent.click(screen.getByRole('checkbox', { name: /Heel stack/ }));
    expect(onchange).toHaveBeenLastCalledWith(['score', 'heel-stack']);
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Score' }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });
  it('groups numeric tests and excludes option-typed ones', () => {
    render(ColumnPicker, { props: { tests: TESTS, groups: { '3': 'Cushioning' }, columns: [], onchange: vi.fn() } });
    expect(screen.getByText('Cushioning')).toBeInTheDocument();
    expect(screen.queryByText('Tongue gusset')).not.toBeInTheDocument();
  });
  it('files ungrouped numeric tests under Other and reflects the selected count', () => {
    render(ColumnPicker, { props: { tests: TESTS, groups: { '3': 'Cushioning' }, columns: ['score', 'weight'], onchange: vi.fn() } });
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText(/Columns \(2\)/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Weight/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Plate' })).not.toBeChecked();
  });
});
