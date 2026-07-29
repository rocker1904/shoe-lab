import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Toolbar from './Toolbar.svelte';

const counts = new Map([['all', 450], ['easy', 150], ['tempo', 54], ['race', 39]]);
const props = {
  strike: 'heel' as const, onstrike: vi.fn(), selected: 'all' as string | null, counts,
  onstory: vi.fn(), showFilters: false, onfilters: vi.fn(),
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

  it('reports the story that was picked, All included', async () => {
    const onstory = vi.fn();
    render(Toolbar, { props: { ...props, selected: 'easy', onstory } });
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(onstory).toHaveBeenCalledWith('all');
  });

  // The words are on the group, not on a lede beside it: two unexplained pills need a name for a
  // screen reader, and the setup strip carries the visible wording (docs/app.md §Presets).
  it('names the strike group without printing a lede', () => {
    render(Toolbar, { props: { ...props } });
    expect(screen.getByRole('radiogroup', { name: 'Measurements from' })).toBeInTheDocument();
    expect(screen.queryByText('I land on my')).toBeNull();
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
