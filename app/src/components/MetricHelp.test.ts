import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import MetricHelp from './MetricHelp.svelte';

beforeAll(() => {
  HTMLElement.prototype.showPopover ??= function () { this.dataset['popoverOpen'] = ''; };
  HTMLElement.prototype.hidePopover ??= function () { delete this.dataset['popoverOpen']; };
});

afterEach(() => vi.useRealTimers());

const renderHelp = (metricKey = 'heel-stack', label = 'Stack') => {
  render(MetricHelp, { props: { metricKey, label } });
  return screen.queryByRole('button', { name: `Help for ${label}` });
};

describe('MetricHelp', () => {
  it('renders no trigger or gap for an unknown future metric', () => {
    expect(renderHelp('future-test', 'Future test')).not.toBeInTheDocument();
  });

  it('previews on hover and focus, then dismisses an unpinned preview on departure', async () => {
    vi.useFakeTimers();
    const trigger = renderHelp()!;
    await fireEvent.pointerEnter(trigger);
    expect(screen.getByRole('note', { name: 'Stack metric help' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.pointerLeave(trigger);
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    trigger.focus();
    expect(await screen.findByRole('note', { name: 'Stack metric help' })).toBeInTheDocument();
  });

  it('pins on click, survives pointer departure and toggles shut', async () => {
    vi.useFakeTimers();
    const trigger = renderHelp()!;
    await fireEvent.click(trigger);
    await fireEvent.pointerLeave(trigger);
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.getByRole('note')).toBeInTheDocument();
    await fireEvent.click(trigger);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('replaces another open help panel', async () => {
    render(MetricHelp, { props: { metricKey: 'heel-stack', label: 'Stack' } });
    render(MetricHelp, { props: { metricKey: 'weight', label: 'Weight' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Help for Stack' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Help for Weight' }));
    expect(screen.queryByRole('note', { name: 'Stack metric help' })).not.toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Weight metric help' })).toBeInTheDocument();
  });

  it('dismisses on an outside press', async () => {
    const trigger = renderHelp()!;
    await fireEvent.click(trigger);
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('keeps the source in the boundary and returns focus on Escape', async () => {
    const trigger = renderHelp()!;
    await fireEvent.click(trigger);
    const source = screen.getByRole('link', { name: /RunRepeat method/ });
    const ancestorEscape = vi.fn();
    document.addEventListener('keydown', ancestorEscape);
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener');
    source.focus();
    await fireEvent.keyDown(source, { key: 'Escape' });
    document.removeEventListener('keydown', ancestorEscape);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(ancestorEscape).not.toHaveBeenCalled();
  });

  it('states direction literally and does not invent a Score source', async () => {
    const trigger = renderHelp('score', 'RunRepeat Score')!;
    await fireEvent.click(trigger);
    expect(screen.getByText('Higher readings are better.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
