import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BrandFilter from './BrandFilter.svelte';

const counts = new Map([['ASICS', 40], ['Brand', 0], ['Nike', 12]]);

describe('BrandFilter', () => {
  it('keeps a zero brand in the list, greyed and still clickable', () => {
    render(BrandFilter, { props: { counts, selected: [], onchange: vi.fn() } });
    // The list must not reflow under the cursor, and a 0 is an answer.
    expect(screen.getByLabelText(/Brand \(0\)/)).toBeEnabled();
  });
  it('narrows a fifty-brand list with a search box', async () => {
    render(BrandFilter, { props: { counts, selected: [], onchange: vi.fn() } });
    await fireEvent.input(screen.getByLabelText('Search brands'), { target: { value: 'ni' } });
    expect(screen.getByLabelText(/Nike/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/ASICS/)).toBeNull();
  });
  it('says so rather than showing an empty box when the search matches nothing', async () => {
    render(BrandFilter, { props: { counts, selected: [], onchange: vi.fn() } });
    await fireEvent.input(screen.getByLabelText('Search brands'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No brands match/)).toBeInTheDocument();
  });
  it('toggles a brand on and off', async () => {
    const onchange = vi.fn();
    render(BrandFilter, { props: { counts, selected: ['Nike'], onchange } });
    await fireEvent.click(screen.getByLabelText(/Nike/));
    expect(onchange).toHaveBeenCalledWith([]);
  });
});
