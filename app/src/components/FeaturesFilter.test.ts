import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { LabTest } from '../../../shared/types.js';
import { labTest } from '../lib/test-fixtures';
import FeaturesFilter from './FeaturesFilter.svelte';

const gusset = labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option', groupId: '3',
  options: [
    { value: 'both-sides-semi', name: 'Both sides (semi)' }, { value: 'none', name: 'None' },
    { value: 'bootie', name: 'Bootie' },
  ] });
const insole = labTest({ id: 41, slug: 'removable-insole', name: 'Removable insole', type: 'bool', groupId: '3' });
const TESTS: LabTest[] = [gusset, insole];

/** What `stableFacetCounts` hands over: declared values, plus any stale or undeclared one. */
const COUNTS: Record<string, Map<string, number>> = {
  'tongue-gusset-type': new Map([['both-sides-semi', 12], ['none', 0], ['bootie', 3]]),
  'removable-insole': new Map([['true', 9], ['false', 4]]),
};
const countsFor = (slug: string) => COUNTS[slug] ?? new Map<string, number>();

function mount(selections: Record<string, string[]> = {}, onchange = vi.fn()) {
  const r = render(FeaturesFilter, { props: { tests: TESTS, selections, countsFor, onchange } });
  return { ...r, onchange };
}

const rowText = (container: HTMLElement) =>
  [...container.querySelectorAll('li')].map((li) => li.textContent?.trim());

describe('FeaturesFilter', () => {
  it('is one collapsed section named for what it holds', () => {
    const { container } = mount();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details).toHaveAttribute('aria-label', 'Features');
    expect(screen.getByText('Any feature')).toBeInTheDocument();
  });

  it('counts every selected value in the summary, a bool among them', () => {
    mount({ 'tongue-gusset-type': ['both-sides-semi', 'none'], 'removable-insole': ['true'] });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('draws an option facet in display order, none sunk, with its counts', () => {
    const { container } = mount();
    expect(rowText(container)).toEqual(['Both sides (semi) (12)', 'Bootie (3)', 'None (0)']);
  });

  it('keeps a zero row greyed and still clickable, so the list cannot reflow', () => {
    mount();
    expect(screen.getByLabelText(/None \(0\)/)).toBeEnabled();
  });

  it('gives a value the catalogue no longer declares a row, from the counts map', () => {
    const stale = new Map([['both-sides-semi', 12], ['none', 0], ['sock-like', 0]]);
    const { container } = render(FeaturesFilter, { props: {
      tests: [gusset], selections: { 'tongue-gusset-type': ['sock-like'] },
      countsFor: () => stale, onchange: vi.fn(),
    } });
    // Declared rows first in their own order, the stale one after, labelled as itself.
    expect(rowText(container)).toEqual(['Both sides (semi) (12)', 'Bootie (0)', 'None (0)', 'sock-like (0)']);
  });

  it('emits in display order whatever order the values were clicked', async () => {
    const { onchange } = mount({ 'tongue-gusset-type': ['none'] });
    await fireEvent.click(screen.getByLabelText(/Both sides \(semi\)/));
    // Clicked second, emitted first: the URL then reads the same whoever clicked what first.
    expect(onchange).toHaveBeenCalledWith('tongue-gusset-type', ['both-sides-semi', 'none']);
  });

  it('deletes the key when the last value is unticked', async () => {
    const { onchange } = mount({ 'tongue-gusset-type': ['none'] });
    await fireEvent.click(screen.getByLabelText(/None \(0\)/));
    expect(onchange).toHaveBeenCalledWith('tongue-gusset-type', undefined);
  });

  it('offers a bool as three exclusive states rather than two checkboxes', () => {
    mount({ 'removable-insole': ['true'] });
    const group = screen.getByRole('radiogroup', { name: 'Removable insole' });
    expect([...group.querySelectorAll('[role=radio]')].map((b) => b.getAttribute('aria-checked')))
      .toEqual(['false', 'true', 'false']);
  });

  it('emits one value or none from a tri-state, never both', async () => {
    const { onchange } = mount({ 'removable-insole': ['true'] });
    for (const name of ['Yes', 'No', 'Any']) {
      await fireEvent.click(screen.getByRole('radio', { name }));
    }
    expect(onchange.mock.calls.map(([, v]) => v)).toEqual([['true'], ['false'], undefined]);
    // The invariant, stated over every call: a link carrying both loses the filter at the far end,
    // because `parseView` refuses a state no tri-state can show (docs/app.md §URL encoding).
    for (const [, values] of onchange.mock.calls) {
      expect(values === undefined || values.length === 1).toBe(true);
    }
  });

  it('shows Any for a stored selection no tri-state could display', () => {
    mount({ 'removable-insole': ['true', 'false'] });
    expect(screen.getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
  });

  it('names each facet group with the noun the rest of the app uses', () => {
    mount();
    expect(screen.getByRole('group', { name: 'Gusset' })).toBeInTheDocument();
  });

  it('adds no text input, so the drawer\'s iOS zoom guard still enumerates them all', () => {
    const { container } = mount();
    expect(container.querySelectorAll('input:not([type=checkbox])')).toHaveLength(0);
  });
});
