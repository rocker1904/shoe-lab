import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MonthPicker from './MonthPicker.svelte';

/** The fleet's real span at the time of writing: 2015-02 to 2026-08, edges included. */
const RANGE = { min: '2015-02-01', max: '2026-08-01' };

function setup(over: { value?: string; onchange?: (v: string | undefined) => void } = {}) {
  const onchange = over.onchange ?? vi.fn();
  render(MonthPicker, { props: { ...RANGE, value: over.value, onchange } });
  return { onchange, trigger: screen.getByRole('button', { name: /Released after/ }) };
}

const open = async (trigger: HTMLElement) => {
  trigger.focus();
  await fireEvent.click(trigger);
};

describe('MonthPicker', () => {
  it('names the bound on its trigger, and says so when there is none', () => {
    expect(setup({ value: '2024-07-01' }).trigger).toHaveTextContent('July 2024');
    screen.getByRole('button', { name: /Released after/ }).remove();
    expect(setup().trigger).toHaveTextContent('Any month');
  });

  it('opens on the bound\'s own year', async () => {
    const { trigger } = setup({ value: '2022-03-01' });
    await open(trigger);
    expect(screen.getByTestId('picker-year')).toHaveTextContent('2022');
  });

  /** With no bound there is no year to show, and the newest shoes are the ones a runner is
   *  filtering towards — so the fleet's latest year is the least surprising place to land. */
  it('opens on the fleet\'s latest year when nothing is bound', async () => {
    const { trigger } = setup();
    await open(trigger);
    expect(screen.getByTestId('picker-year')).toHaveTextContent('2026');
  });

  it('emits the first of the chosen month and closes', async () => {
    const { trigger, onchange } = setup({ value: '2024-07-01' });
    await open(trigger);
    await fireEvent.click(screen.getByRole('gridcell', { name: 'March' }));
    expect(onchange).toHaveBeenCalledExactlyOnceWith('2024-03-01');
    expect(screen.queryByRole('gridcell', { name: 'March' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('steps the year and clamps at both ends of the fleet', async () => {
    const { trigger } = setup({ value: '2016-01-01' });
    await open(trigger);
    const back = screen.getByRole('button', { name: 'Previous year' });
    await fireEvent.click(back);
    expect(screen.getByTestId('picker-year')).toHaveTextContent('2015');
    expect(back).toBeDisabled();                       // 2015 is the earliest the fleet has

    const forward = screen.getByRole('button', { name: 'Next year' });
    for (let i = 0; i < 12; i++) await fireEvent.click(forward);
    expect(screen.getByTestId('picker-year')).toHaveTextContent('2026');
    expect(forward).toBeDisabled();
  });

  /** The fleet starts in February 2015 and ends in August 2026, so the months outside it would
   *  set a bound no shoe can sit on either side of. Only the two edge years are affected. */
  it('disables the months outside the fleet in the edge years', async () => {
    const { trigger } = setup({ value: '2015-06-01' });
    await open(trigger);
    expect(screen.getByRole('gridcell', { name: 'January' })).toBeDisabled();
    expect(screen.getByRole('gridcell', { name: 'February' })).toBeEnabled();

    for (let i = 0; i < 11; i++) await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
    expect(screen.getByTestId('picker-year')).toHaveTextContent('2026');
    expect(screen.getByRole('gridcell', { name: 'August' })).toBeEnabled();
    expect(screen.getByRole('gridcell', { name: 'September' })).toBeDisabled();
  });

  it('marks the bound month, and marks nothing in a year that does not hold it', async () => {
    const { trigger } = setup({ value: '2024-07-01' });
    await open(trigger);
    expect(screen.getByRole('gridcell', { name: 'July' })).toHaveAttribute('aria-selected', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(screen.getByRole('gridcell', { name: 'July' })).toHaveAttribute('aria-selected', 'false');
  });

  /**
   * The grid is a `grid`, not a `radiogroup`, and the difference is the whole point: a radiogroup
   * promises selection follows focus, so every arrow press committed a bound and shut the panel —
   * one keystroke was a filter. Here the arrows only move.
   */
  describe('arrow keys browse rather than commit', () => {
    const cell = (name: string) => screen.getByRole('gridcell', { name });
    const arrow = (from: HTMLElement, key: string) => {
      from.focus();
      return fireEvent.keyDown(from, { key });
    };

    it('moves along a row and down a row without emitting anything', async () => {
      const { trigger, onchange } = setup({ value: '2024-03-01' });
      await open(trigger);
      await arrow(cell('March'), 'ArrowRight');
      expect(document.activeElement).toBe(cell('April'));
      await arrow(cell('April'), 'ArrowDown');
      expect(document.activeElement).toBe(cell('August'));   // four columns
      await arrow(cell('August'), 'ArrowUp');
      expect(document.activeElement).toBe(cell('April'));
      expect(onchange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('jumps to either end of the year on Home and End', async () => {
      const { trigger } = setup({ value: '2024-06-01' });
      await open(trigger);
      await arrow(cell('June'), 'Home');
      expect(document.activeElement).toBe(cell('January'));
      await arrow(cell('January'), 'End');
      expect(document.activeElement).toBe(cell('December'));
    });

    it('steps over a month the fleet never reached', async () => {
      const { trigger } = setup({ value: '2026-08-01' });   // fleet ends 2026-08
      await open(trigger);
      await arrow(cell('August'), 'ArrowRight');
      expect(cell('September')).toBeDisabled();
      expect(document.activeElement).toBe(cell('August'));  // nothing enabled after it
    });

    it('keeps the grid a single tab stop, on the month the bound names', async () => {
      const { trigger } = setup({ value: '2024-03-01' });
      await open(trigger);
      expect(cell('March').tabIndex).toBe(0);
      expect(cell('April').tabIndex).toBe(-1);
    });

    /** Most years hold no bound, and a grid whose only candidate tab stop is a month that is not in
     *  it — or is disabled — is a grid no keyboard can enter at all. */
    const stops = () => screen.getAllByRole('gridcell').filter((c) => c.tabIndex === 0);

    it('still has exactly one tab stop in a year that holds no bound', async () => {
      const { trigger } = setup({ value: '2024-03-01' });
      await open(trigger);
      await fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
      expect(stops()).toHaveLength(1);
      expect(stops()[0]).toBe(cell('January'));
    });

    it('never puts the tab stop on a month the fleet never reached', async () => {
      const { trigger } = setup({ value: '2015-06-01' });   // fleet starts 2015-02
      await open(trigger);
      await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
      expect(cell('January')).toBeDisabled();
      expect(stops()).toHaveLength(1);
      expect(stops()[0]!).not.toBeDisabled();
    });
  });

  it('closes on Escape and hands focus back, without emitting', async () => {
    const { trigger, onchange } = setup({ value: '2024-07-01' });
    await open(trigger);
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onchange).not.toHaveBeenCalled();
  });

  it('toggles shut from its own trigger', async () => {
    const { trigger } = setup();
    await open(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
