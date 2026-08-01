import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Toolbar from './Toolbar.svelte';
import type { Zone } from '../lib/lineage';

const props = {
  zone: 'heel' as Zone | null, onzone: vi.fn(), selected: 'all' as string | null,
  onstory: vi.fn(), showFilters: false, onfilters: vi.fn(),
  stability: false, onstability: vi.fn(), onabout: vi.fn(),
};

describe('Toolbar', () => {
  it('offers All first, then the three stories', () => {
    render(Toolbar, { props: { ...props } });
    const radios = screen.getAllByRole('radio', { name: /All|Easy|Tempo|Race/ });
    expect(radios.map((r) => r.textContent?.trim().split(/\s/)[0])).toEqual(['All', 'Easy', 'Tempo', 'Race']);
  });

  it('has no Clear button — All is what returns you to the baseline', () => {
    render(Toolbar, { props: { ...props } });
    expect(screen.queryByRole('button', { name: /^Clear$/ })).toBeNull();
  });

  // A scored story's count is the size of its pool rather than of a shortlist, so the number
  // promised a filtering that no longer happens (docs/app.md §The toolbar).
  it('names the stories without counting them', () => {
    render(Toolbar, { props: { ...props } });
    for (const r of screen.getAllByRole('radio')) expect(r.textContent).not.toMatch(/\d/);
  });

  it('marks exactly the selected story, and nothing when the view is hand-edited', () => {
    const { unmount } = render(Toolbar, { props: { ...props, selected: 'tempo' } });
    expect(screen.getAllByRole('radio', { checked: true }).map((r) => r.textContent?.trim().split(/\s/)[0]))
      .toEqual(['Heel', 'Tempo']);
    unmount();
    render(Toolbar, { props: { ...props, selected: null } });
    expect(screen.queryAllByRole('radio', { name: /All|Easy|Tempo|Race/, checked: true })).toHaveLength(0);
  });

  it('marks neither zone when the view commits to none', () => {
    render(Toolbar, { props: { ...props, zone: null } });
    expect(screen.getByRole('radio', { name: /Heel/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Forefoot/ })).not.toBeChecked();
  });

  // A regression guard rather than a red-first test: `roving` already falls back to the first
  // radio when nothing is checked. It is here because a nullable mark makes "nothing checked"
  // reachable for the first time, so a later refactor assuming a checked radio would break
  // keyboard access silently.
  it('keeps one tab stop even with nothing selected', () => {
    render(Toolbar, { props: { ...props, zone: null } });
    const zones = screen.getAllByRole('radio', { name: /Heel|Forefoot/ });
    expect(zones.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('reports the story that was picked, All included', async () => {
    const onstory = vi.fn();
    render(Toolbar, { props: { ...props, selected: 'easy', onstory } });
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(onstory).toHaveBeenCalledWith('all');
  });

  // The words are on the group, not on a lede beside it: two unexplained pills need a name for a
  // screen reader, and the setup strip carries the visible wording (docs/app.md §Presets).
  it('names the zone group without printing a lede', () => {
    render(Toolbar, { props: { ...props } });
    expect(screen.getByRole('radiogroup', { name: 'Measured at' })).toBeInTheDocument();
    expect(screen.queryByText('I land on my')).toBeNull();
  });

  // The role promises arrow-key selection and one tab stop; both groups here ignored it, and the
  // roving action is what makes the promise true (docs/app.md §Filters).
  it('is one tab stop per group, not one per radio', () => {
    render(Toolbar, { props: { ...props, selected: 'tempo' } });
    const stops = screen.getAllByRole('radio').filter((r) => r.tabIndex === 0);
    expect(stops.map((r) => r.textContent?.trim().split(/\s/)[0])).toEqual(['Heel', 'Tempo']);
  });

  it('picks the next story with an arrow key', async () => {
    const onstory = vi.fn();
    render(Toolbar, { props: { ...props, selected: 'all', onstory } });
    const all = screen.getByRole('radio', { name: /All/ });
    all.focus();
    await fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(onstory).toHaveBeenCalledWith('easy');
  });

  it('picks the other zone with an arrow key', async () => {
    const onzone = vi.fn();
    render(Toolbar, { props: { ...props, onzone } });
    const heel = screen.getByRole('radio', { name: 'Heel' });
    heel.focus();
    await fireEvent.keyDown(heel, { key: 'ArrowRight' });
    expect(onzone).toHaveBeenCalledWith('forefoot');
  });

  // The strip asks both questions in words on a first arrival, so a bar that drew them at the same
  // time put the four stories on screen twice; it hands over rather than doubling up
  // (docs/app.md §Presets).
  it('draws only its actions while the setup strip still holds the questions', () => {
    render(Toolbar, { props: { ...props, showGroups: false } });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  // The whole-row rule on the preference is written against the two groups — with them gone it left
  // the actions alone on a row with the bar's left half empty, which is the phone's landing screen.
  // jsdom has no layout, so the marker is what is asserted here; `smoke.spec.ts` measures the rows.
  it('marks itself group-less so the preference stops claiming a row of its own', async () => {
    const { container, rerender } = render(Toolbar, { props: { ...props, showGroups: false } });
    expect(container.querySelector('.toolbar')).toHaveClass('no-groups');
    await rerender({ ...props, showGroups: true });
    expect(container.querySelector('.toolbar')).not.toHaveClass('no-groups');
  });

  it('offers the way in before the controls that open panels', async () => {
    const onabout = vi.fn();
    const { container } = render(Toolbar, { props: { ...props, onabout } });
    const about = screen.getByRole('button', { name: 'About' });
    // First of the group, not merely present: it is the one a reader might need before they know
    // what Filters and Columns are for.
    expect(container.querySelector('.actions')!.firstElementChild).toBe(about);
    await fireEvent.click(about);
    expect(onabout).toHaveBeenCalled();
  });

  // It explains the table rather than acting on it, so it is present on the landing screen too —
  // which is the one screen where a reader does not yet know what any of this is.
  it('offers About while the setup strip still holds the questions', () => {
    render(Toolbar, { props: { ...props, showGroups: false } });
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
  });

  it('carries the Filters toggle and its expanded state', async () => {
    const onfilters = vi.fn();
    render(Toolbar, { props: { ...props, onfilters } });
    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(toggle);
    expect(onfilters).toHaveBeenCalled();
  });
});

describe('Toolbar stability preference', () => {
  // A pill in the same family as the two groups it stands with, rather than a checkbox left among
  // them. `aria-pressed` is what makes a toggle button say which state it is in.
  it('is a toggle pill that reports the change', async () => {
    let got: boolean | undefined;
    render(Toolbar, { props: { ...props, stability: false, onstability: (v: boolean) => { got = v; } } });
    const pill = screen.getByRole('button', { name: 'Stability' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    await fireEvent.click(pill);
    expect(got).toBe(true);
  });

  it('shows the preference as pressed when it is on', () => {
    render(Toolbar, { props: { ...props, stability: true } });
    expect(screen.getByRole('button', { name: 'Stability' })).toHaveAttribute('aria-pressed', 'true');
  });

  // The caption and the `?` are gone: their words are the About panel's, and a second copy would
  // drift from it. The bar is 21px shorter for the `?` alone and a whole row for the caption.
  it('carries no checkbox, no caption and no help popover', () => {
    render(Toolbar, { props: { ...props } });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/adds midsole width/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^About the/ })).toBeNull();
  });

  // It stands with the zone and story groups, not with the controls that open panels.
  it('sits on the setup row with the groups, not among the actions', () => {
    const { container } = render(Toolbar, { props: { ...props } });
    expect(container.querySelector('.setup .pill')).not.toBeNull();
    expect(container.querySelector('.actions .pill')).toBeNull();
  });
});
