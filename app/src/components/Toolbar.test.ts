import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
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
  it('offers a stability preference and reports the change', async () => {
    let got: boolean | undefined;
    render(Toolbar, { props: { ...props, stability: false, onstability: (v: boolean) => { got = v; } } });
    const box = screen.getByRole('checkbox', { name: /stability/i });
    expect((box as HTMLInputElement).checked).toBe(false);
    await fireEvent.click(box);
    expect(got).toBe(true);
  });

  // The runner meets the score at the one control that changes it, so the explanation lives there —
  // in the same popover the setup strip uses, not a second mechanism (docs/app.md §The toolbar).
  it('explains what the score reads, and what it deliberately does not', async () => {
    render(Toolbar, { props: { ...props } });
    const help = screen.getByRole('button', { name: 'About the story scores' });
    help.focus();
    await fireEvent.click(help);
    const pop = screen.getByRole('dialog', { name: 'the story scores' });
    // Which terms each story reads is deliberately absent: `score-defs.ts` owns that and the
    // breakdown panel shows it, so a copy here would be a second home for one fact — and it would
    // have to name three stories' terms at once on a control that is on screen for all of them.
    expect(pop).toHaveTextContent(/expand a row/i);
    expect(pop).not.toHaveTextContent(/outsole durability/i);
    // The three things a runner would otherwise have to infer from the table.
    expect(pop).toHaveTextContent(/price/i);
    expect(pop).toHaveTextContent(/not scored/i);
    // That the scale is pinned to a snapshot, not which snapshot: the date would be a second home
    // for the `data/` commit `score-defs.ts` names, and the two drifted apart once already.
    expect(pop).toHaveTextContent(/fixed to a dated snapshot/i);
    expect(pop).toHaveTextContent(/above 100/i);

    await fireEvent.keyDown(pop, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(help).toHaveFocus();
  });

  /**
   * The popover dismisses on a press outside it, like every other floating surface
   * (docs/app.md §Filters) — and unlike Escape and its own Close button, it does **not** pull focus
   * back to the `?`: the reader has just pressed something else, and that is where they are going.
   */
  it('dismisses the help on a press outside it, without stealing focus back', async () => {
    render(Toolbar, { props: { ...props } });
    const help = screen.getByRole('button', { name: 'About the story scores' });
    await fireEvent.click(help);
    expect(screen.getByRole('dialog', { name: 'the story scores' })).toBeInTheDocument();

    // A press inside is not an outside press — including on the trigger, which would otherwise
    // close the panel here and reopen it on the click that follows.
    screen.getByRole('dialog').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    help.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await tick();
    expect(screen.queryByRole('dialog')).not.toBeNull();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(help).not.toHaveFocus();
  });

  // A button inside the label would be a click on the label, so opening the help would toggle the
  // preference it is there to explain.
  it('opens the help without touching the preference', async () => {
    const onstability = vi.fn();
    render(Toolbar, { props: { ...props, onstability } });
    await fireEvent.click(screen.getByRole('button', { name: 'About the story scores' }));
    expect(onstability).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /stability/i })).not.toBeChecked();
  });

  it('says what the preference adds, and makes no claim about weight', () => {
    // The width term is a ratio so that stability does not select heavy shoes, so a weight warning
    // here would be false (docs/app.md §The story scores).
    render(Toolbar, { props: { ...props } });
    expect(screen.getByText(/adds midsole width and heel counter stiffness/i)).toBeInTheDocument();
    expect(screen.queryByText(/heavier/i)).not.toBeInTheDocument();
  });

  // Every string here is on screen whichever story is selected, so an Easy-specific one reads as a
  // caption about a score that is not on the table, attached to a control that does nothing.
  it('names the stories the preference reaches, and says why Race is not one', async () => {
    render(Toolbar, { props: { ...props } });
    const caption = screen.getByText(/adds midsole width and heel counter stiffness/i);
    // Derived from the definitions that declare a stable variant, so a fourth story needs no edit.
    expect(caption).toHaveTextContent(/Easy and Tempo/);
    expect(caption).not.toHaveTextContent(/Race/);
    const help = screen.getByRole('button', { name: 'About the story scores' });
    await fireEvent.click(help);
    const pop = screen.getByRole('dialog', { name: 'the story scores' });
    expect(pop).toHaveTextContent(/Easy and Tempo/);
    expect(pop).toHaveTextContent(/race shoes/i);
  });
});
