import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SegmentedControl from './SegmentedControl.svelte';

const options = [
  { value: 'any', label: 'Any' },
  { value: 'hide', label: 'Hide', accessibleLabel: 'Hide discontinued' },
  { value: 'only', label: 'Only', disabled: true },
] as const;

describe('SegmentedControl', () => {
  it('renders a named radio group with stable hooks and the selected option', () => {
    const { container } = render(SegmentedControl, {
      props: { mode: 'radio', options, value: 'hide', onchange: vi.fn(), ariaLabel: 'Availability' },
    });
    const group = screen.getByRole('radiogroup', { name: 'Availability' });
    expect(group).toHaveAttribute('data-segmented-control');
    expect(screen.getByRole('radio', { name: 'Hide discontinued' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Only' })).toBeDisabled();
    expect([...container.querySelectorAll('[data-segment]')].map((segment) => segment.getAttribute('data-segment')))
      .toEqual(['any', 'hide', 'only']);
  });

  it('uses a labelled-by name without replacing the visible option labels', () => {
    const { container } = render(SegmentedControl, {
      props: { mode: 'radio', options, value: 'any', onchange: vi.fn(), ariaLabelledby: 'choice-name' },
    });
    const name = document.createElement('span');
    name.id = 'choice-name';
    name.textContent = 'Choice';
    container.prepend(name);
    expect(screen.getByRole('radiogroup', { name: 'Choice' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Any' })).toHaveTextContent('Any');
  });

  it('reports a radio press by value and reserves every label at selected weight', async () => {
    const onchange = vi.fn();
    const { container } = render(SegmentedControl, {
      props: { mode: 'radio', options, value: 'any', onchange, ariaLabel: 'Availability' },
    });
    await fireEvent.click(screen.getByRole('radio', { name: 'Hide discontinued' }));
    expect(onchange).toHaveBeenCalledWith('hide');
    for (const segment of container.querySelectorAll<HTMLElement>('[data-segment]')) {
      expect(segment.dataset['label']).toBe(segment.textContent);
    }
  });

  it('keeps one tab stop, activates on arrows, supports Home and End, and skips disabled options', async () => {
    const onchange = vi.fn();
    render(SegmentedControl, {
      props: { mode: 'radio', options, value: null, onchange, ariaLabel: 'Availability' },
    });
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    radios[0]!.focus();
    await fireEvent.keyDown(radios[0]!, { key: 'End' });
    expect(radios[1]).toHaveFocus();
    expect(onchange).toHaveBeenLastCalledWith('hide');
    await fireEvent.keyDown(radios[1]!, { key: 'Home' });
    expect(radios[0]).toHaveFocus();
    expect(onchange).toHaveBeenLastCalledWith('any');
  });

  it('renders a toggle with the same hooks and reports the next pressed state', async () => {
    const onchange = vi.fn();
    const { container } = render(SegmentedControl, {
      props: {
        mode: 'toggle', label: 'Stability', accessibleLabel: 'Stability shoes', pressed: false,
        onchange, scale: 'toolbar',
      },
    });
    const button = screen.getByRole('button', { name: 'Stability shoes' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('data-segment');
    expect(button).toHaveAttribute('data-label', 'Stability');
    expect(container.querySelector('[data-segmented-control]')).toBeInTheDocument();
    await fireEvent.click(button);
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('exposes typography scale and fill as independent modifiers', () => {
    const { container } = render(SegmentedControl, {
      props: {
        mode: 'radio', options, value: 'any', onchange: vi.fn(), ariaLabel: 'Availability',
        scale: 'toolbar', fill: true,
      },
    });
    const track = container.querySelector('[data-segmented-control]');
    expect(track).toHaveClass('toolbar', 'fill');
  });
});
