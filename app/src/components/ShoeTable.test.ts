import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ShoeTable from './ShoeTable.svelte';
import { type ScoreColumns } from '../lib/score';
import { EASY } from '../lib/score-defs';
import { defaultView, type ViewState } from '../lib/urlstate';
import { FLEET, TESTS, shoe } from '../lib/test-fixtures';
import type { Shoe, ShoesFile } from '../../../shared/types.js';

const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(over: { shoes?: Shoe[]; view?: Partial<ViewState>; scores?: ScoreColumns } = {}) {
  const onchange = vi.fn();
  const view = { ...defaultView(), ...over.view };
  view.columns = over.view?.columns ?? ['score', 'heel-stack', 'plate'];
  const rendered = render(ShoeTable, { props: { shoes: over.shoes ?? FLEET, data, view, onchange,
    scores: over.scores ?? new Map(), stability: false } });
  return Object.assign(onchange, { rendered });
}

describe('ShoeTable', () => {
  it('renders a row per shoe and headers for chosen columns', () => {
    setup();
    expect(screen.getAllByRole('row')).toHaveLength(1 + FLEET.length);
    expect(screen.getByRole('columnheader', { name: /Heel stack/ })).toBeInTheDocument();
  });
  it('clicking a header emits sort change, clicking again flips direction', async () => {
    const onchange = setup();
    const th = screen.getByRole('columnheader', { name: /Heel stack/ });
    await fireEvent.click(th.querySelector('button')!);
    expect(onchange.mock.lastCall![0].sort).toEqual({ key: 'heel-stack', dir: 'desc' });
  });
  it('flips an already-descending column to ascending', async () => {
    const onchange = setup({ view: { sort: { key: 'heel-stack', dir: 'desc' } } });
    await fireEvent.click(screen.getByRole('columnheader', { name: /Heel stack/ }).querySelector('button')!);
    expect(onchange.mock.lastCall![0].sort).toEqual({ key: 'heel-stack', dir: 'asc' });
    expect(onchange.mock.lastCall![0].columns).toEqual(['score', 'heel-stack', 'plate']);
  });
  it('marks the sorted column with an indicator and aria-sort', () => {
    setup({ view: { sort: { key: 'heel-stack', dir: 'asc' } } });
    const th = screen.getByRole('columnheader', { name: /Heel stack/ });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(th.textContent).toContain('▲');
  });
  it('row click expands the detail panel', async () => {
    setup();
    const row = screen.getByText('cushy').closest('tr')!;
    await fireEvent.click(row);
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });
  it('expands and collapses a row from the keyboard', async () => {
    setup();
    const row = screen.getByText('cushy').closest('tr')!;
    expect(row).toHaveAttribute('tabindex', '0');
    await fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });
  // `aria-expanded` says a row controls something; without `aria-controls` it never says what. The
  // panel exists only while the row is open, and an IDREF naming a node that is not in the document
  // is an unresolvable reference rather than a promise of one.
  it('points the expanded row at the panel it opened, and at nothing while it is closed', async () => {
    setup();
    const row = screen.getByText('cushy').closest('tr')!;
    expect(row).not.toHaveAttribute('aria-controls');
    await fireEvent.click(row);
    const panelId = row.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });
  it('hides the detail panel when the expanded shoe leaves the list', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByText('cushy').closest('tr')!);
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
    await onchange.rendered.rerender({ shoes: FLEET.filter((s) => s.slug !== 'cushy') });
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });
  it('tints numeric cells by percentile and leaves non-numeric cells untinted', () => {
    const { container } = setup().rendered;
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];
    const heel = cells[2]!; // name, score, heel-stack, plate
    expect(heel.className).toContain('tinted');
    expect(heel.getAttribute('style')).toContain('--p:');
    expect(cells[3]!.className).not.toContain('tinted'); // plate is not numeric
  });
  it('does not print the brand, which every shoe name already starts with', () => {
    setup();
    // Four of the five FLEET shoes carry brand 'Brand', so queryByText would throw on multiples.
    expect(screen.queryAllByText('Brand')).toHaveLength(0);
  });
  it('carries units and a direction arrow in the header', () => {
    setup({ view: { columns: ['weight'] } });
    expect(screen.getByText('g ↓')).toBeInTheDocument();
  });
  it('expands more than one row at a time', async () => {
    setup();
    const rows = screen.getAllByRole('row').filter((r) => r.classList.contains('shoe'));
    await fireEvent.click(rows[0]!);
    await fireEvent.click(rows[1]!);
    expect(rows[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(rows[1]!.getAttribute('aria-expanded')).toBe('true');
  });
  it('washes a directional column blue and a neutral one grey', () => {
    const { container } = setup().rendered;
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];
    expect(cells[1]!.className).toContain('blue'); // score — higher is better
    expect(cells[2]!.className).toContain('grey'); // heel stack — a preference, not a quality
  });
  it('maps each plate value in the plate column', () => {
    setup();
    // index 3 of [name, score, heel-stack, plate] — scoped to the row so the em dash cannot be matched elsewhere
    const plateCell = (name: string) => screen.getByText(name).closest('tr')!.querySelectorAll('td')[3]!;
    expect(plateCell('racer').textContent).toBe('Carbon');
    expect(plateCell('trainer').textContent).toBe('Non-carbon plate');
    expect(plateCell('cushy').textContent).toBe('—');
  });
  // The catalogue's own `plate` test would otherwise answer for the column and render "Yes".
  it('keeps the derived plate label for a shoe carrying the catalogue plate reading', () => {
    setup({ shoes: [shoe({ slug: 'plated', plate: 'plated-other', values: { '69': true } })] });
    expect(screen.getByText('plated').closest('tr')!.querySelectorAll('td')[3]!.textContent)
      .toBe('Non-carbon plate');
  });
  it('missing values render as em dash', () => {
    setup();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
  it('shows a bare year for a listing date and a month for a page date, never the day', () => {
    setup({
      shoes: [
        shoe({ slug: 'yearly', releasedAt: '2024-01-01', releaseDateSource: 'listing' }),
        shoe({ slug: 'exact', releasedAt: '2025-03-14' }),
      ],
      view: { columns: ['releasedAt'] },
    });
    expect(screen.getByText('2024')).toBeInTheDocument();
    // The day is deliberately dropped: only 24 of 450 shoes could ever supply one.
    expect(screen.getByText('March 2025')).toBeInTheDocument();
  });
});

describe('ShoeTable and the Easy score', () => {
  it('renders each score column from its own map, and a dash where it is unscored', () => {
    const view = { ...defaultView(), columns: [EASY.keys.heel, EASY.keys.forefoot] };
    const { container } = render(ShoeTable, {
      props: { shoes: FLEET, data, view,
               scores: new Map([[EASY.keys.heel, new Map([['cushy', 87.412]])],
                                [EASY.keys.forefoot, new Map([['cushy', 71.238]])]]),
               stability: false, onchange: () => {} },
    });
    const cells = [...container.querySelectorAll('tbody tr td')].map((c) => c.textContent?.trim());
    expect(cells).toContain('87.41'); // two decimals, like every other figure
    expect(cells).toContain('71.24');
    expect(cells).toContain('—');
  });
});
