import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AddFilterDialog from './AddFilterDialog.svelte';

const options = [
  { key: 'heel-stack', label: 'Stack — Heel', groupId: '3', coverage: 80 },
  { key: 'stiffness', label: 'Stiffness (N)', groupId: null, coverage: 12 },
];
const groups = { '3': 'Cushioning' };

function setup(over: Partial<{ onchoose: (k: string) => void; onclose: () => void }> = {}) {
  const onchoose = vi.fn();
  const onclose = vi.fn();
  const rendered = render(AddFilterDialog, { props: { options, groups, onchoose, onclose, ...over } });
  return { onchoose, onclose, rendered };
}

describe('AddFilterDialog', () => {
  it('groups what it offers and shows coverage as a bar, not just a number', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Add filter');
    expect(screen.getByRole('heading', { name: 'Cushioning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stack — Heel/ })).toHaveTextContent('80%');
    // the constraint the `select` could not meet: an `option` cannot contain a bar
    const bars = [...dialog.querySelectorAll('.fill')].map((b) => b.getAttribute('style'));
    expect(bars).toEqual(['width: 80%;', 'width: 12%;']);
  });
  it('narrows the list from the text filter', async () => {
    setup();
    await fireEvent.input(screen.getByLabelText('Filter metrics'), { target: { value: 'stiff' } });
    expect(screen.getByRole('button', { name: /Stiffness/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stack/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cushioning' })).not.toBeInTheDocument();
  });
  it('reports the metric that was chosen', async () => {
    const { onchoose } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /Stiffness/ }));
    expect(onchoose).toHaveBeenCalledExactlyOnceWith('stiffness');
  });
  it('closes on Escape and from its own control', async () => {
    const { onclose } = setup();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledTimes(2);
  });
  it('dismisses from a click outside, through the same path as Escape', async () => {
    const { onclose, rendered } = setup();
    const scrim = screen.getByTestId('add-filter-scrim');
    // A sibling of the dialog rather than an ancestor: it has to paint under it, and it is the
    // only "outside" a modal has (docs/app.md §Filters).
    expect(scrim.parentElement).toBe(document.body);
    expect(scrim.contains(screen.getByRole('dialog'))).toBe(false);
    await fireEvent.click(scrim);
    expect(onclose).toHaveBeenCalledOnce();
    // A click that lands inside the dialog is not an outside click, and must not dismiss it.
    await fireEvent.click(screen.getByLabelText('Filter metrics'));
    expect(onclose).toHaveBeenCalledOnce();
    rendered.unmount();
    expect(screen.queryByTestId('add-filter-scrim')).toBeNull();
  });
  it('takes focus on open and hands it back when it goes away', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const { rendered } = setup();
    expect(document.activeElement).toBe(screen.getByLabelText('Filter metrics'));
    rendered.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
