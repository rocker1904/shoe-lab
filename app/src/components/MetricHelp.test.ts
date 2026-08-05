import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
    const firstTrigger = screen.getByRole('button', { name: 'Help for Stack' });
    await fireEvent.click(firstTrigger);
    screen.getByRole('link', { name: /RunRepeat method/ }).focus();
    await fireEvent.pointerEnter(screen.getByRole('button', { name: 'Help for Weight' }));
    expect(screen.queryByRole('note', { name: 'Stack metric help' })).not.toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Weight metric help' })).toBeInTheDocument();
    expect(firstTrigger, 'replacement must not drop the old source link to body').toHaveFocus();
  });

  it('dismisses on an outside press', async () => {
    const trigger = renderHelp()!;
    await fireEvent.click(trigger);
    screen.getByRole('link').focus();
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(trigger, 'a non-focusing outside press still needs a landing pad').toHaveFocus();
  });

  it('repositions when content-driven layout moves its trigger', async () => {
    const trigger = renderHelp()!;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 100, 20, 20));
    await fireEvent.click(trigger);
    const panel = screen.getByRole('note');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 80));
    const changedContent = document.createElement('i');
    document.body.append(changedContent);
    await waitFor(() => expect(panel).toHaveStyle({ left: '8px' }));

    vi.mocked(trigger.getBoundingClientRect).mockReturnValue(new DOMRect(200, 100, 20, 20));
    changedContent.textContent = 'moved';
    await waitFor(() => expect(panel).toHaveStyle({ left: '160px' }));
    changedContent.remove();
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
