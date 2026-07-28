import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EntryBand, { TABLE_ANCHOR_ID } from './EntryBand.svelte';
import { PRESETS } from '../lib/presets';

const counts = new Map([['easy', 150], ['tempo', 19], ['race', 39]]);

/**
 * jsdom implements no layout, so `scrollIntoView` does not exist on an element and calling it
 * throws. Plant the anchor Page.svelte would render, with a stub, rather than guarding the call
 * site — the same approach Page.test.ts takes to `URL.createObjectURL`.
 */
function anchorTable() {
  const el = document.createElement('div');
  el.id = TABLE_ANCHOR_ID;
  el.tabIndex = -1;
  const scrollIntoView = vi.fn();
  el.scrollIntoView = scrollIntoView;
  document.body.append(el);
  return { el, scrollIntoView };
}

afterEach(() => document.getElementById(TABLE_ANCHOR_ID)?.remove());

const props = { counts, total: 450, selected: null as string | null };

describe('EntryBand', () => {
  it('offers every story with its name and live count, and no description line', () => {
    render(EntryBand, { props: { ...props, onapply: vi.fn() } });
    for (const p of PRESETS) {
      const card = screen.getByRole('button', { name: new RegExp(p.label) });
      expect(card).toHaveTextContent(p.label);
      expect(card).toHaveTextContent(String(counts.get(p.id)));
      // the sentence stays on the type and reaches the reader as a tooltip, not as a line of prose
      expect(card).not.toHaveTextContent(p.describe);
      expect(card).toHaveAttribute('title', p.describe);
    }
  });
  it('marks the selected story, and only that one', () => {
    render(EntryBand, { props: { ...props, selected: 'tempo', onapply: vi.fn() } });
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Tempo/ })).toHaveAttribute('aria-pressed', 'true');
  });
  it('marks nothing when no story describes the view', () => {
    render(EntryBand, { props: { ...props, onapply: vi.fn() } });
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });
  it('applies the story that was clicked', async () => {
    const onapply = vi.fn();
    render(EntryBand, { props: { ...props, onapply } });
    await fireEvent.click(screen.getByRole('button', { name: /Tempo/ }));
    expect(onapply).toHaveBeenCalledExactlyOnceWith('tempo');
  });
  it('shows a story that currently returns nothing rather than hiding it', () => {
    render(EntryBand, { props: { ...props, counts: new Map([['tempo', 0]]), onapply: vi.fn() } });
    expect(screen.getByRole('button', { name: /Tempo/ })).toHaveTextContent('0 shoes');
  });
  it('offers the escape hatch without anything to open first', () => {
    render(EntryBand, { props: { ...props, onapply: vi.fn() } });
    expect(screen.getByRole('button', { name: /Browse all 450 shoes/ })).toBeVisible();
  });
  it('Browse all moves the reader to the table and applies nothing', async () => {
    // Inert by design: the default view already shows every shoe, and the band's visibility is
    // derived from view state, so there is nothing here to change (docs/app.md §Presets).
    const { el, scrollIntoView } = anchorTable();
    const onapply = vi.fn();
    render(EntryBand, { props: { ...props, onapply } });
    await fireEvent.click(screen.getByRole('button', { name: /Browse all/ }));
    expect(onapply).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(el);
  });
  it('survives the table anchor not being there', async () => {
    render(EntryBand, { props: { ...props, onapply: vi.fn() } });
    await expect(fireEvent.click(screen.getByRole('button', { name: /Browse all/ }))).resolves.not.toThrow();
  });
});
