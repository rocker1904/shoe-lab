import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../Page.svelte';
import SetupStrip from './SetupStrip.svelte';
import { VIEW_STORAGE_KEY } from '../lib/persist';
import { FLEET, TESTS } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
const counts = new Map([['all', 450], ['easy', 150], ['tempo', 54], ['race', 39]]);
const props = {
  counts, strike: 'heel' as const, selected: null as string | null,
  onstrike: vi.fn(), onstory: vi.fn(),
};

describe('SetupStrip', () => {
  it('asks both questions once, as six cards', () => {
    render(SetupStrip, { props: { ...props } });
    const names = screen.getAllByRole('button').filter((b) => b.classList.contains('card'))
      .map((b) => b.querySelector('.name')?.textContent);
    expect(names).toEqual(['Heel', 'Forefoot', 'All', 'Easy', 'Tempo', 'Race']);
  });

  // Strike does not change how many shoes exist, so a count there would be four copies of the
  // same number; the slot stays, empty, so the cards are the same height.
  it('counts the stories and not the strikes', () => {
    render(SetupStrip, { props: { ...props } });
    expect(screen.getByRole('button', { name: /Easy/ })).toHaveTextContent('150');
    expect(screen.getByRole('button', { name: /^Heel/ })).not.toHaveTextContent(/\d/);
  });

  it('describes each story in a line, which the toolbar has no room for', () => {
    render(SetupStrip, { props: { ...props } });
    expect(screen.getByRole('button', { name: /Easy/ })).toHaveTextContent('Cushioned, no carbon, affordable');
    expect(screen.getByRole('button', { name: /All/ })).toHaveTextContent('Everything in the catalogue');
  });

  // Neither label makes a claim about the person: "I land on my heel" tells a curious browser they
  // are being mislabelled, where these describe what the control does (docs/app.md §Presets).
  it('labels the groups by what they do, not by who the runner is', () => {
    render(SetupStrip, { props: { ...props } });
    expect(screen.getByText('Use measurements from the')).toBeInTheDocument();
    expect(screen.getByText('Built for')).toBeInTheDocument();
    expect(screen.queryByText(/I land on/)).toBeNull();
  });

  it('reports the card that was picked', async () => {
    const onstrike = vi.fn();
    const onstory = vi.fn();
    render(SetupStrip, { props: { ...props, onstrike, onstory } });
    await fireEvent.click(screen.getByRole('button', { name: /^Forefoot/ }));
    expect(onstrike).toHaveBeenCalledWith('forefoot');
    await fireEvent.click(screen.getByRole('button', { name: /Race/ }));
    expect(onstory).toHaveBeenCalledWith('race');
  });

  it('marks the chosen strike and the chosen story, and nothing else', () => {
    render(SetupStrip, { props: { ...props, selected: 'tempo' } });
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.querySelector('.name')?.textContent))
      .toEqual(['Heel', 'Tempo']);
  });

  it('explains a group in a popover rather than a tooltip, and hands focus back on Escape', async () => {
    render(SetupStrip, { props: { ...props } });
    const help = screen.getByRole('button', { name: /About Use measurements from the/ });
    help.focus();
    await fireEvent.click(help);
    const pop = screen.getByRole('dialog', { name: 'Use measurements from the' });
    expect(pop).toHaveTextContent(/measured twice/);
    expect(pop).toHaveTextContent(/either is fine/);

    await fireEvent.keyDown(pop, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(help).toHaveFocus();
  });

  it('carries no title attribute — a tooltip is the mechanism this replaces', () => {
    render(SetupStrip, { props: { ...props } });
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveAttribute('title');
  });
});

describe('Page setup strip', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  it('shows on a bare first arrival', () => {
    render(Page, { props: { data } });
    expect(screen.getByTestId('setup-strip')).toBeInTheDocument();
  });

  it('stays hidden when a link carries filters', () => {
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.queryByTestId('setup-strip')).toBeNull();
  });

  it('stays hidden when a stored view is restored', () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.queryByTestId('setup-strip')).toBeNull();
  });

  it('survives a strike change, which is the other half of the same question', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getAllByRole('button', { name: /^Forefoot/ })[0]!);
    expect(screen.getByTestId('setup-strip')).toBeInTheDocument();
  });

  it('collapses for good once a story is chosen', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    // The collapse is a height transition, so the node outlives the click by its duration.
    await waitFor(() => expect(screen.queryByTestId('setup-strip')).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(screen.queryByTestId('setup-strip')).toBeNull();   // does not return
  });
});
