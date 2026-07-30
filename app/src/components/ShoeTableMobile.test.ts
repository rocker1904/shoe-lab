import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ShoeTableMobile from './ShoeTableMobile.svelte';
import { defaultView, type ViewState } from '../lib/urlstate';
import { FLEET, TESTS, labTest, shoe } from '../lib/test-fixtures';
import type { ScoreColumns } from '../lib/score';
import type { LabTest, Shoe, ShoesFile } from '../../../shared/types.js';

// A test whose real name is one `labels.ts` shortens, so the mobile header can be shown to use the
// short one rather than the catalogue name.
const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(over: { shoes?: Shoe[]; view?: Partial<ViewState>; scores?: ScoreColumns; tests?: LabTest[] } = {}) {
  const onchange = vi.fn();
  const view = { ...defaultView(), ...over.view };
  view.columns = over.view?.columns ?? ['releasedAt', 'score', 'heel-stack', 'plate'];
  const rendered = render(ShoeTableMobile, {
    props: { shoes: over.shoes ?? FLEET, data: over.tests ? { ...data, tests: over.tests } : data,
      view, onchange, scores: over.scores ?? new Map(), stability: false } });
  return Object.assign(onchange, { rendered });
}

describe('ShoeTableMobile', () => {
  it('puts the shoe name on its own row with the release month and the plate', () => {
    setup();
    const strip = screen.getByText('cushy').closest('tr')!;
    expect(strip.textContent).toContain('June 2025');
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

describe('ShoeTableMobile categorical columns', () => {
  it('puts a categorical reading on the name line, not the numeric value row', () => {
    setup({ view: { columns: ['tongue-gusset-type', 'heel-stack'] },
            shoes: [shoe({ slug: 'gusseted', values: { '39': 'both-sides-semi', '6': 40 } })] });
    const strip = screen.getByText('gusseted').closest('tr')!;
    expect(strip.textContent).toContain('Both sides (semi)');
  });

  // The value alone names no column: "Both sides (semi)" could be almost any reading, where
  // "Finger loop" describes itself. One rule for both, since which is which is a judgement.
  it('names the column an option reading answers', () => {
    setup({ view: { columns: ['tongue-gusset-type'] },
            shoes: [shoe({ slug: 'gusseted', values: { '39': 'both-sides-semi' } })] });
    expect(screen.getByText('gusseted').closest('tr')!.textContent).toContain('Gusset: Both sides (semi)');
  });

  it('says a true bool as the feature it names, with no yes', () => {
    setup({ view: { columns: ['removable-insole'] },
            shoes: [shoe({ slug: 'insoled', values: { '41': true } })] });
    const strip = screen.getByText('insoled').closest('tr')!;
    expect(strip.textContent).toContain('Removable insole');
    expect(strip.textContent).not.toContain('Yes');
  });

  // The desktop cell still prints None and No against an em dash for unread; this line is prose,
  // and "None · None · No" tells the reader nothing they came for.
  it('drops a reading that says the shoe has none of the thing', () => {
    setup({ view: { columns: ['tongue-gusset-type', 'heel-tab', 'removable-insole'] },
            shoes: [shoe({ slug: 'plain', values: { '39': 'none', '40': 'none', '41': false } })] });
    expect(screen.getByText('plain').closest('tr')!.querySelectorAll('.meta')).toHaveLength(0);
  });
  it('contributes nothing for a shoe with no reading', () => {
    setup({ view: { columns: ['tongue-gusset-type'] }, shoes: [shoe({ slug: 'bare', values: {} })] });
    expect(screen.getByText('bare').closest('tr')!.textContent).not.toContain('undefined');
  });

  // Keying the strip by its own text threw `each_key_duplicate` and blanked the whole app rather
  // than the row. Today's labels make two chips reading alike unreachable, so the catalogue here is
  // bespoke: the invariant is that the *column* is the key, and it must outlive the label rules
  // that currently happen to keep the texts apart (docs/app.md §Categorical columns).
  it('renders both readings when two categorical columns say exactly the same thing', () => {
    const twins = ['trim-a', 'trim-b'].map((slug, i) => labTest({
      id: 900 + i, slug, name: 'Trim', type: 'option', options: [{ value: 'x', name: 'X' }] }));
    setup({ tests: [...TESTS, ...twins], view: { columns: ['trim-a', 'trim-b'] },
            shoes: [shoe({ slug: 'twinned', values: { '900': 'x', '901': 'x' } })] });
    const strip = screen.getByText('twinned').closest('tr')!;
    expect([...strip.querySelectorAll('.meta')].map((e) => e.textContent)).toEqual(['Trim: X', 'Trim: X']);
  });

  it('keeps the plate field on the name line for a shoe carrying the catalogue plate reading', () => {
    setup({ view: { columns: ['plate', 'removable-insole'] },
            shoes: [shoe({ slug: 'plated', plate: 'plated-other', values: { '69': true, '41': true } })] });
    const strip = screen.getByText('plated').closest('tr')!;
    expect(strip.textContent).toContain('Non-carbon plate');
    expect(strip.querySelectorAll('.meta')).toHaveLength(2); // the plate label and one Yes, not two
  });
});
