import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Toolbar from './Toolbar.svelte';
import type { Side } from '../lib/lineage';

const counts = new Map([['all', 450], ['easy', 150], ['tempo', 54], ['race', 39]]);
const props = {
  side: 'heel' as Side | null, onside: vi.fn(), selected: 'all' as string | null, counts,
  onstory: vi.fn(), showFilters: false, onfilters: vi.fn(),
  stability: false, onstability: vi.fn(),
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

  it('shows a live count on each story', () => {
    render(Toolbar, { props: { ...props, counts: new Map([['easy', 150]]) } });
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('marks exactly the selected story, and nothing when the view is hand-edited', () => {
    const { unmount } = render(Toolbar, { props: { ...props, selected: 'tempo' } });
    expect(screen.getAllByRole('radio', { checked: true }).map((r) => r.textContent?.trim().split(/\s/)[0]))
      .toEqual(['Heel', 'Tempo']);
    unmount();
    render(Toolbar, { props: { ...props, selected: null } });
    expect(screen.queryAllByRole('radio', { name: /All|Easy|Tempo|Race/, checked: true })).toHaveLength(0);
  });

  it('marks neither side when the view commits to none', () => {
    render(Toolbar, { props: { ...props, side: null } });
    expect(screen.getByRole('radio', { name: /Heel/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Forefoot/ })).not.toBeChecked();
  });

  // A regression guard rather than a red-first test: `roving` already falls back to the first
  // radio when nothing is checked. It is here because a nullable mark makes "nothing checked"
  // reachable for the first time, so a later refactor assuming a checked radio would break
  // keyboard access silently.
  it('keeps one tab stop even with nothing selected', () => {
    render(Toolbar, { props: { ...props, side: null } });
    const sides = screen.getAllByRole('radio', { name: /Heel|Forefoot/ });
    expect(sides.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('reports the story that was picked, All included', async () => {
    const onstory = vi.fn();
    render(Toolbar, { props: { ...props, selected: 'easy', onstory } });
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(onstory).toHaveBeenCalledWith('all');
  });

  // The words are on the group, not on a lede beside it: two unexplained pills need a name for a
  // screen reader, and the setup strip carries the visible wording (docs/app.md §Presets).
  it('names the side group without printing a lede', () => {
    render(Toolbar, { props: { ...props } });
    expect(screen.getByRole('radiogroup', { name: 'Measurements from' })).toBeInTheDocument();
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

  it('picks the other side with an arrow key', async () => {
    const onside = vi.fn();
    render(Toolbar, { props: { ...props, onside } });
    const heel = screen.getByRole('radio', { name: 'Heel' });
    heel.focus();
    await fireEvent.keyDown(heel, { key: 'ArrowRight' });
    expect(onside).toHaveBeenCalledWith('forefoot');
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
  it('offers a stability preference and reports the change', async () => {
    let got: boolean | undefined;
    render(Toolbar, { props: { ...props, stability: false, onstability: (v: boolean) => { got = v; } } });
    const box = screen.getByRole('checkbox', { name: /stability/i });
    expect((box as HTMLInputElement).checked).toBe(false);
    await fireEvent.click(box);
    expect(got).toBe(true);
  });

  it('says what the preference adds, and makes no claim about weight', () => {
    // The width term is a ratio so that stability does not select heavy shoes, so a weight warning
    // here would be false (docs/app.md §The Easy score).
    render(Toolbar, { props: { ...props } });
    expect(screen.getByText(/adds midsole width and heel counter stiffness/i)).toBeInTheDocument();
    expect(screen.queryByText(/heavier/i)).not.toBeInTheDocument();
  });
});
