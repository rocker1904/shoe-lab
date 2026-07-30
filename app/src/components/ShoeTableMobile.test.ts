import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ShoeTableMobile from './ShoeTableMobile.svelte';
import { defaultView, type ViewState } from '../lib/urlstate';
import { FLEET, TESTS } from '../lib/test-fixtures';
import type { Shoe, ShoesFile } from '../../../shared/types.js';

// A test whose real name is one `labels.ts` shortens, so the mobile header can be shown to use the
// short one rather than the catalogue name.
const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(over: { shoes?: Shoe[]; view?: Partial<ViewState>; scores?: Map<string, number> } = {}) {
  const onchange = vi.fn();
  const view = { ...defaultView(), ...over.view };
  view.columns = over.view?.columns ?? ['releasedAt', 'score', 'heel-stack', 'plate'];
  const rendered = render(ShoeTableMobile, { props: { shoes: over.shoes ?? FLEET, data, view, onchange,
    scores: over.scores ?? new Map() } });
  return Object.assign(onchange, { rendered });
}

describe('ShoeTableMobile', () => {
  it('puts the shoe name on its own row with the year and the plate', () => {
    setup();
    const strip = screen.getByText('cushy').closest('tr')!;
    expect(strip.textContent).toContain('2025-06-01');
    expect(screen.getByText('racer').closest('tr')!.textContent).toContain('Carbon');
  });

  it('renders only numeric columns as values', () => {
    setup();
    expect(screen.queryByRole('columnheader', { name: /Released/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Plate/ })).toBeNull();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2); // score and heel stack
  });

  it('heads a column with its short label rather than the catalogue name', () => {
    setup({ view: { columns: ['outsole-durability'] } });
    expect(screen.getByRole('columnheader', { name: /Outsole wear/ })).toBeInTheDocument();
    expect(screen.getByText('mm ↓')).toBeInTheDocument();
  });

  it('sorts from a header, and flips an already-descending column', async () => {
    const onchange = setup({ view: { sort: { key: 'heel-stack', dir: 'desc' } } });
    await fireEvent.click(screen.getByRole('columnheader', { name: /Heel stack/ }).querySelector('button')!);
    expect(onchange.mock.lastCall![0].sort).toEqual({ key: 'heel-stack', dir: 'asc' });
  });

  it('expands a card into the detail panel, and more than one at a time', async () => {
    setup();
    const cards = screen.getAllByRole('row').filter((r) => r.classList.contains('shoe'));
    await fireEvent.click(cards[0]!);
    await fireEvent.click(cards[1]!);
    expect(screen.getAllByText(/Full review on RunRepeat/)).toHaveLength(2);
    expect(cards[0]!.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.keyDown(cards[0]!, { key: 'Enter' });
    expect(cards[0]!.getAttribute('aria-expanded')).toBe('false');
  });

  // The panel exists only while the card is open, and an IDREF naming a node that is not in the
  // document is an unresolvable reference rather than a promise of one.
  it('points the expanded card at the panel it opened, and at nothing while it is closed', async () => {
    setup();
    const card = screen.getAllByRole('row').find((r) => r.classList.contains('shoe'))!;
    expect(card).not.toHaveAttribute('aria-controls');
    await fireEvent.click(card);
    const panelId = card.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });

  it('insets the percentile wash as a chip rather than filling the cell', () => {
    const { container } = setup().rendered;
    const chip = container.querySelector('tr.values .chip')!;
    expect(chip.getAttribute('style')).toContain('--p:');
    expect(chip.className).toContain('blue'); // score — higher is better
  });

  it('missing values render as em dash', () => {
    setup({ shoes: [FLEET[4]!], view: { columns: ['heel-stack'] } });
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
