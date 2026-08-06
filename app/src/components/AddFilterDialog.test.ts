import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AddFilterDialog, { type AddFilterOption } from './AddFilterDialog.svelte';

const options = [
  { key: 'heel-stack', label: 'Stack — Heel', groupId: '3', coverage: 80, retired: false, lifecycleNamed: false },
  { key: 'stiffness', label: 'Stiffness (N)', groupId: null, coverage: 12, retired: false, lifecycleNamed: false },
];
const groups = { '3': 'Cushioning' };

function setup(over: Partial<{
  options: AddFilterOption[]; groups: Record<string, string>;
  onchoose: (k: string) => void; onclose: () => void;
}> = {}) {
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
    expect(screen.getByRole('button', { name: /^Add filter: Stack — Heel/ })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    // the constraint the `select` could not meet: an `option` cannot contain a bar
    const bars = [...dialog.querySelectorAll('.fill')].map((b) => b.getAttribute('style'));
    expect(bars).toEqual(['width: 80%;', 'width: 12%;']);
  });
  it('narrows the list from the text filter', async () => {
    setup();
    await fireEvent.input(screen.getByLabelText('Filter metrics'), { target: { value: 'stiff' } });
    expect(screen.getByRole('button', { name: /^Add filter: Stiffness \(N\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add filter: Stack — Heel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cushioning' })).not.toBeInTheDocument();
  });
  it('marks a retired option visibly and in the existing action name', () => {
    setup({ options: [
      { key: 'outsole-hardness', label: 'Outsole hardness', groupId: null, coverage: 80, retired: true,
        lifecycleNamed: false },
    ] });
    expect(screen.getByText('Not used on newer shoes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Add filter:/ })).toHaveAccessibleName(
      'Add filter: Outsole hardness, retired. Not used on newer shoes. 80% measured');
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('does not speak retirement twice when a formal lifecycle label already says it', () => {
    setup({ options: [
      { key: 'midsole-softness', label: 'Midsole softness — retired method', groupId: '3', coverage: 0,
        retired: true, lifecycleNamed: true },
    ] });
    expect(screen.getByRole('button', { name: /^Add filter:/ })).toHaveAccessibleName(
      'Add filter: Midsole softness — retired method. Not used on newer shoes. 0% measured');
  });
  it('searches retired status and its visible consequence without matching an unretired option', async () => {
    setup({ options: [
      { key: 'outsole-hardness', label: 'Outsole hardness', groupId: null, coverage: 80, retired: true,
        lifecycleNamed: false },
      { key: 'future-test', label: 'Future test', groupId: null, coverage: 5, retired: false,
        lifecycleNamed: false },
    ] });
    const search = screen.getByLabelText('Filter metrics');
    for (const query of ['retired', 'not used on newer shoes']) {
      await fireEvent.input(search, { target: { value: query } });
      expect(screen.getByRole('button', { name: /Add filter: Outsole hardness/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add filter: Future test/ })).toBeNull();
    }
  });
  /**
   * The same sentence the brand list one control away already renders, in the same form and the
   * same place. A zero match here collapsed the dialog to its legend and its Close button, which
   * reads as a control that has stopped responding — and it is the *commonest* way in, because the
   * dialog offers only the metrics not already in the sidebar, so a query like "stack" matches
   * nothing (docs/app.md §Filters).
   */
  it('says so rather than showing an empty box when the search matches nothing', async () => {
    setup();
    await fireEvent.input(screen.getByLabelText('Filter metrics'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No metrics match/)).toHaveTextContent('zzzz');
  });
  it('takes the message away again once something matches', async () => {
    setup();
    const box = screen.getByLabelText('Filter metrics');
    await fireEvent.input(box, { target: { value: 'zzzz' } });
    await fireEvent.input(box, { target: { value: 'stiff' } });
    expect(screen.queryByText(/No metrics match/)).toBeNull();
  });
  it('reports the metric that was chosen', async () => {
    const { onchoose } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /^Add filter: Stiffness \(N\)/ }));
    expect(onchoose).toHaveBeenCalledExactlyOnceWith('stiffness');
  });

  it('keeps add and help as sibling actions, with help isolated from selection', async () => {
    const { onchoose, onclose } = setup();
    const add = screen.getByRole('button', { name: /^Add filter: Stack — Heel/ });
    const help = screen.getByRole('button', { name: 'Help for Stack — Heel' });
    expect(add.contains(help)).toBe(false);
    expect(add.parentElement).toBe(help.closest('.offer'));
    await fireEvent.click(help);
    expect(screen.getByRole('note', { name: 'Stack — Heel metric help' })).toBeInTheDocument();
    expect(onchoose).not.toHaveBeenCalled();
    expect(onclose).not.toHaveBeenCalled();
  });

  it('adds no focus stop for a retired status line', () => {
    setup({ options: [
      { key: 'outsole-hardness', label: 'Outsole hardness', groupId: null, coverage: 80, retired: true,
        lifecycleNamed: false },
    ] });
    const offer = screen.getByText('Not used on newer shoes').closest('.offer') as HTMLElement;
    expect(within(offer).getAllByRole('button')).toHaveLength(2);
  });

  it('lets Escape close help without closing its owning dialog', async () => {
    const { onclose } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'Help for Stack — Heel' }));
    const source = screen.getByRole('link', { name: /RunRepeat method/ });
    source.focus();
    await fireEvent.keyDown(source, { key: 'Escape' });
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onclose).not.toHaveBeenCalled();
  });

  it('keeps an unknown option addable without a help target or empty gap', () => {
    setup({ options: [{ key: 'future-test', label: 'Future test', groupId: null, coverage: 0, retired: false,
      lifecycleNamed: false }] });
    expect(screen.getByRole('button', { name: /^Add filter: Future test/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help for Future test' })).toBeNull();
    expect(document.querySelector('.offer')?.children).toHaveLength(5);
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
