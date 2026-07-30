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
    await fireEvent.click(screen.getByRole('radio', { name: 'March' }));
    expect(onchange).toHaveBeenCalledExactlyOnceWith('2024-03-01');
    expect(screen.queryByRole('radio', { name: 'March' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('radio', { name: 'January' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'February' })).toBeEnabled();

    for (let i = 0; i < 11; i++) await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
    expect(screen.getByTestId('picker-year')).toHaveTextContent('2026');
    expect(screen.getByRole('radio', { name: 'August' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'September' })).toBeDisabled();
  });

  it('marks the bound month, and marks nothing in a year that does not hold it', async () => {
    const { trigger } = setup({ value: '2024-07-01' });
    await open(trigger);
    expect(screen.getByRole('radio', { name: 'July' })).toHaveAttribute('aria-checked', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(screen.getByRole('radio', { name: 'July' })).toHaveAttribute('aria-checked', 'false');
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
