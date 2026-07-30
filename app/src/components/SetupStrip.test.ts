import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../Page.svelte';
import SetupStrip from './SetupStrip.svelte';
import { VIEW_STORAGE_KEY } from '../lib/persist';
import { FLEET, TESTS } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';
import type { Side } from '../lib/lineage';

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
const props = {
  side: 'heel' as Side | null, selected: null as string | null,
  onside: vi.fn(), onstory: vi.fn(),
};

describe('SetupStrip', () => {
  it('asks both questions once, as six cards', () => {
    render(SetupStrip, { props: { ...props } });
    const names = screen.getAllByRole('button').filter((b) => b.classList.contains('card'))
      .map((b) => b.querySelector('.name')?.textContent);
    expect(names).toEqual(['Heel', 'Forefoot', 'All', 'Easy', 'Tempo', 'Race']);
  });

  // A scored story's count is its pool rather than a shortlist, so no card carries one
  // (docs/app.md §The toolbar).
  it('counts nothing, on either kind of card', () => {
    render(SetupStrip, { props: { ...props } });
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveTextContent(/\d/);
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
    const onside = vi.fn();
    const onstory = vi.fn();
    render(SetupStrip, { props: { ...props, onside, onstory } });
    await fireEvent.click(screen.getByRole('button', { name: /^Forefoot/ }));
    expect(onside).toHaveBeenCalledWith('forefoot');
    await fireEvent.click(screen.getByRole('button', { name: /Race/ }));
    expect(onstory).toHaveBeenCalledWith('race');
  });

  it('marks the chosen side and the chosen story, and nothing else', () => {
    render(SetupStrip, { props: { ...props, selected: 'tempo' } });
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.querySelector('.name')?.textContent))
      .toEqual(['Heel', 'Tempo']);
  });

  // Anchored regexes, matching the file's own convention: the card carries a reserved count span
  // as well as its name.
  it('presses neither card when the view commits to no side', () => {
    render(SetupStrip, { props: { ...props, side: null } });
    for (const name of [/^Heel/, /^Forefoot/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
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

  it('survives a side change, which is the other half of the same question', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getAllByRole('button', { name: /^Forefoot/ })[0]!);
    expect(screen.getByTestId('setup-strip')).toBeInTheDocument();
  });

  it('collapses for good once a story is chosen', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    // The collapse is a height transition, so the node outlives the click by its duration.
    await waitFor(() => expect(screen.queryByTestId('setup-strip')).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(screen.queryByTestId('setup-strip')).toBeNull();   // does not return
  });
});
