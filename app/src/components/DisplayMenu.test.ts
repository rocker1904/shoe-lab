import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DisplayMenu from './DisplayMenu.svelte';
import type { Theme } from '../lib/theme';
import { DISPLAY_DEFAULTS, resolveWash, type DisplayPrefs } from '../lib/wash';

/**
 * `open` is a PROP, not this component's own state: the utilities snippet changes host at the
 * chrome boundary, so the component is rebuilt on a crossing and anything it owned locally would go
 * with it (docs/app.md §Where the utilities live). So the harness plays the caller — it says
 * whether the panel is up and records what the component asks for. Open by default, because most of
 * what there is to check here is inside the panel.
 */
function mount(prefs: Partial<DisplayPrefs> = {},
               extra: { open?: boolean; theme?: Theme } = {}) {
  const p = { ...DISPLAY_DEFAULTS, ...prefs };
  const onchange = vi.fn();
  const onopen = vi.fn();
  const ontheme = vi.fn();
  const r = render(DisplayMenu, {
    props: { prefs: p, resolved: resolveWash(p), onchange, theme: 'auto' as Theme,
             ontheme, worded: true, open: true, onopen, ...extra },
  });
  return { ...r, onchange, onopen, ontheme, prefs: p };
}
const panel = () => screen.queryByRole('group', { name: 'Display settings' });

describe('the Display control', () => {
  it('asks its caller to open and to close, and draws whatever it is told', async () => {
    const shut = mount({}, { open: false });
    const trigger = screen.getByRole('button', { name: 'Display' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toBeNull();
    await fireEvent.click(trigger);
    expect(shut.onopen).toHaveBeenCalledWith(true);
    shut.unmount();

    mount();
    const up = screen.getByRole('button', { name: 'Display' });
    expect(up).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toBeInTheDocument();
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const { onopen } = mount();
    const trigger = screen.getByRole('button', { name: 'Display' });
    trigger.focus();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onopen).toHaveBeenCalledWith(false);
    // Or focus lands on `<body>` and a keyboard user has lost the bar.
    expect(trigger).toHaveFocus();
  });

  it('closes on a press outside itself and leaves one inside alone', async () => {
    const { onopen } = mount();
    await fireEvent.pointerDown(screen.getByLabelText('Strength'));
    expect(onopen).not.toHaveBeenCalled();
    await fireEvent.pointerDown(document.body);
    expect(onopen).toHaveBeenCalledWith(false);
  });
});

/**
 * A three-pill segmented group in the app's own language, not a cycle: a cycle makes the runner
 * press twice to reach the third state and never says what the other two are
 * (docs/app.md §Theming).
 */
describe('the theme control', () => {
  const pills = () => screen.getAllByRole('radio');

  it('offers all three states and marks the one in force', () => {
    mount({}, { theme: 'dark' });
    expect(pills().map((p) => p.textContent)).toEqual(['Auto', 'Light', 'Dark']);
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Auto' })).not.toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  });

  it('names the theme it is asked for rather than the next one round', async () => {
    const { ontheme } = mount({}, { theme: 'auto' });
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(ontheme).toHaveBeenCalledWith('dark');
  });

  /** `lib/roving.ts`'s contract, which the role promises: one tab stop, and arrows move AND
   *  activate — the pills are buttons, so the browser does none of it. */
  it('is one tab stop whose arrows move and activate', async () => {
    const { ontheme } = mount({}, { theme: 'auto' });
    expect(pills().map((p) => p.tabIndex)).toEqual([0, -1, -1]);
    pills()[0]!.focus();
    await fireEvent.keyDown(pills()[0]!, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    expect(ontheme).toHaveBeenCalledWith('light');
  });
});

describe('the panel', () => {
  /** Sam will read these off the screen to choose new defaults, so every one of them is visible. */
  it('shows the number beside every slider', () => {
    mount({ primaryHue: 145, primaryChroma: 0.12, strength: 0.5, curve: 2.4, floor: 0.2 });
    const text = panel()!.textContent!;
    for (const shown of ['145°', '0.120', '0.50', '2.40', 'p 0.20']) {
      expect(text, `${shown} is not on screen`).toContain(shown);
    }
  });

  it('hands back every default in one press', async () => {
    const { onchange } = mount({ primaryHue: 10, baseOn: true, strength: 0.2, curve: 3 });
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onchange).toHaveBeenCalledWith(DISPLAY_DEFAULTS);
  });

  it('reports a slider move as one whole preference state', async () => {
    const { onchange } = mount();
    await fireEvent.input(screen.getByLabelText('Hue'), { target: { value: '30' } });
    expect(onchange).toHaveBeenCalledWith({ ...DISPLAY_DEFAULTS, primaryHue: 30 });
  });

  /**
   * The floor says where the ramp starts and there is no bare end to start from once every cell is
   * tinted. Disabled and dashed rather than removed: a control that vanishes reads as a bug
   * (docs/app.md §The display preferences).
   */
  it('disables the floor where it can change nothing, and offers the base colour where it can', () => {
    const { unmount } = mount();
    expect(screen.getByLabelText('Starts at')).toBeEnabled();
    expect(screen.getAllByLabelText('Hue')).toHaveLength(1);
    unmount();

    mount({ baseOn: true });
    expect(screen.getByLabelText('Starts at')).toBeDisabled();
    // The base's own hue and vividness arrive with it, and nothing else does.
    expect(screen.getAllByLabelText('Hue')).toHaveLength(2);
  });

  it('names the theme whose ink bound the strength, and only when one did', () => {
    const { unmount } = mount();
    expect(screen.queryByText(/Capped at/)).toBeNull();
    unmount();

    // A vivid red: the light theme's near-black ink is what gives way first (wash.test.ts).
    mount({ primaryHue: 29, primaryChroma: 0.37, strength: 1 });
    expect(screen.getByText(/Capped at/).textContent).toMatch(/light theme's ink binds first/);
  });

  it('says when only hue is left to carry the ordering', () => {
    const { unmount } = mount();
    expect(screen.queryByText(/only hue says which is better/)).toBeNull();
    unmount();

    mount({ baseOn: true, baseHue: 29, primaryHue: 145 });
    expect(screen.getByText(/only hue says which is better/)).toBeInTheDocument();
  });

  /**
   * The F4 exemption, made enforceable: a grip emits sixty changes a second, so nothing in here may
   * be a live region (docs/app.md §The display preferences).
   */
  it('announces nothing at all', () => {
    mount({ primaryHue: 29, primaryChroma: 0.37, strength: 1, baseOn: true });
    expect(panel()!.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(0);
  });
});
