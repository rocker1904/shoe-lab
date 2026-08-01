import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DisplayMenu from './DisplayMenu.svelte';
import { DISPLAY_DEFAULTS, resolveWash, type DisplayPrefs } from '../lib/wash';

function mount(prefs: Partial<DisplayPrefs> = {}, onchange = vi.fn()) {
  const p = { ...DISPLAY_DEFAULTS, ...prefs };
  const r = render(DisplayMenu, {
    props: { prefs: p, resolved: resolveWash(p), onchange, theme: 'auto' as const,
             ontheme: vi.fn(), worded: true },
  });
  return { ...r, onchange, prefs: p };
}
const openPanel = async () => fireEvent.click(screen.getByRole('button', { name: 'Display' }));

describe('the Display control', () => {
  it('opens and closes from its own trigger', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Display' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Display settings' })).toBeNull();

    await fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Display settings' })).toBeInTheDocument();

    await fireEvent.click(trigger);
    expect(screen.queryByRole('group', { name: 'Display settings' })).toBeNull();
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Display' });
    trigger.focus();
    await fireEvent.click(trigger);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Display settings' })).toBeNull();
    // Or focus lands on `<body>` and a keyboard user has lost the bar.
    expect(trigger).toHaveFocus();
  });

  it('closes on a press outside itself and leaves one inside alone', async () => {
    mount();
    await openPanel();
    await fireEvent.pointerDown(screen.getByLabelText('Strength'));
    expect(screen.getByRole('group', { name: 'Display settings' })).toBeInTheDocument();
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group', { name: 'Display settings' })).toBeNull();
  });
});

describe('the panel', () => {
  /** Sam will read these off the screen to choose new defaults, so every one of them is visible. */
  it('shows the number beside every slider', async () => {
    mount({ betterHue: 145, betterChroma: 0.12, strength: 0.5, curve: 2.4, floor: 0.2 });
    await openPanel();
    const text = screen.getByRole('group', { name: 'Display settings' }).textContent!;
    for (const shown of ['145°', '0.120', '0.50', '2.40', 'p 0.20']) {
      expect(text, `${shown} is not on screen`).toContain(shown);
    }
  });

  it('hands back every default in one press', async () => {
    const { onchange } = mount({ betterHue: 10, baseOn: true, strength: 0.2, curve: 3 });
    await openPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onchange).toHaveBeenCalledWith(DISPLAY_DEFAULTS);
  });

  it('reports a slider move as one whole preference state', async () => {
    const { onchange } = mount();
    await openPanel();
    await fireEvent.input(screen.getByLabelText('Hue'), { target: { value: '30' } });
    expect(onchange).toHaveBeenCalledWith({ ...DISPLAY_DEFAULTS, betterHue: 30 });
  });

  /**
   * The floor says where the ramp starts and there is no bare end to start from once every cell is
   * tinted. Disabled and dashed rather than removed: a control that vanishes reads as a bug
   * (docs/app.md §The display preferences).
   */
  it('disables the floor where it can change nothing, and offers the base colour where it can', async () => {
    const { unmount } = mount();
    await openPanel();
    expect(screen.getByLabelText('Starts at')).toBeEnabled();
    expect(screen.getAllByLabelText('Hue')).toHaveLength(1);
    unmount();

    mount({ baseOn: true });
    await openPanel();
    expect(screen.getByLabelText('Starts at')).toBeDisabled();
    // The base's own hue and vividness arrive with it, and nothing else does.
    expect(screen.getAllByLabelText('Hue')).toHaveLength(2);
  });

  it('names the theme whose ink bound the strength, and only when one did', async () => {
    const { unmount } = mount();
    await openPanel();
    expect(screen.queryByText(/Capped at/)).toBeNull();
    unmount();

    // A vivid red: the light theme's near-black ink is what gives way first (wash.test.ts).
    mount({ betterHue: 29, betterChroma: 0.37, strength: 1 });
    await openPanel();
    expect(screen.getByText(/Capped at/).textContent).toMatch(/light theme's ink binds first/);
  });

  it('says when only hue is left to carry the ordering', async () => {
    const { unmount } = mount();
    await openPanel();
    expect(screen.queryByText(/only hue says which is better/)).toBeNull();
    unmount();

    mount({ baseOn: true, baseHue: 29, betterHue: 145 });
    await openPanel();
    expect(screen.getByText(/only hue says which is better/)).toBeInTheDocument();
  });

  /**
   * The F4 exemption, made enforceable: a grip emits sixty changes a second, so nothing in here may
   * be a live region (docs/app.md §The display preferences).
   */
  it('announces nothing at all', async () => {
    mount({ betterHue: 29, betterChroma: 0.37, strength: 1, baseOn: true });
    await openPanel();
    const panel = screen.getByRole('group', { name: 'Display settings' });
    expect(panel.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(0);
  });
});
